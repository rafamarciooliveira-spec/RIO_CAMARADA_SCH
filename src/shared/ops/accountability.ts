/**
 * Prestação de contas publicada: o servidor calcula os números a partir do livro caixa, congela
 * o resultado e (se pedido) põe um aviso no quadro dos sócios. Quem foi indicado para assinar
 * (tesouraria, presidência, conselho fiscal) confere e assina pela própria conta.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { accountsOpenedAt } from '../finance/reports.ts';
import { accPeriodLabel, buildAccountability, monthsBetween } from '../finance/accountability.ts';
import type { AccountabilityDoc, ChartAccountDoc, CostCenterDoc, FinAccountDoc, LedgerEntryDoc, MembershipDoc, NoticeDoc, PeriodDoc } from '../types.ts';
import { deliverNotice } from './comms.ts';
import { notify, tid } from './helpers.ts';

async function scopedEntries(ctx: OpContext, kind: 'periodo' | 'evento', from: string, cc: CostCenterDoc | null): Promise<LedgerEntryDoc[]> {
  const t = tid(ctx);
  if (kind === 'periodo') {
    const rows = await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['periodKey', '>=', from.slice(0, 7)]], limit: 20000 });
    return rows.map(r => ({ ...r.data, id: r.id }));
  }
  const byCc = await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['costCenterId', '==', cc!.id]], limit: 5000 });
  const byEv = cc!.refId ? await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['eventId', '==', cc!.refId]], limit: 5000 }) : [];
  const seen = new Map<string, LedgerEntryDoc>();
  for (const r of [...byCc, ...byEv]) seen.set(r.id, { ...r.data, id: r.id });
  return [...seen.values()];
}

export const accountabilityPublish = defineOp({
  name: 'accountability.publish',
  input: zTenant.extend({
    kind: z.enum(['periodo', 'evento']),
    from: zDateKey,
    to: zDateKey,
    costCenterId: zId.optional(),
    grouping: z.enum(['lancamento', 'historico', 'plano']),
    title: zText(120).min(3),
    notes: zText(3000).optional(),
    audience: z.enum(['socios', 'diretoria']),
    signers: z.array(z.object({ name: zText(120).min(2), role: zText(80).min(2), uid: z.string().max(128).optional() })).max(6),
    postNotice: z.boolean().default(true),
  }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'editar'] },
  module: 'financeiro',
  idempotent: true,
  rateLimit: { per: 'uid', max: 30, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    if (input.from > input.to) fail('invalid-argument', 'A data inicial precisa ser antes da final.');
    let cc: CostCenterDoc | null = null;
    if (input.kind === 'evento') {
      if (!input.costCenterId) fail('invalid-argument', 'Escolha o evento ou projeto.');
      cc = await ctx.store.get<CostCenterDoc>(`${P.costCenters(t)}/${input.costCenterId}`);
      if (!cc) fail('not-found', 'Centro de custo não encontrado.');
      cc = { ...cc!, id: input.costCenterId! };
    }
    for (const s of input.signers) {
      if (s.uid && !(await ctx.store.get<MembershipDoc>(P.membership(t, s.uid)))) fail('invalid-argument', `${s.name} não tem acesso ao portal para assinar.`);
    }
    const accounts = (await ctx.store.query<FinAccountDoc>(P.accounts(t), { limit: 200 })).map(r => ({ ...r.data, id: r.id }));
    const chart = (await ctx.store.query<ChartAccountDoc>(P.chart(t), { limit: 500 })).map(r => ({ ...r.data, id: r.id }));
    const entries = await scopedEntries(ctx, input.kind, input.from, cc);
    const opened = input.kind === 'periodo' ? accountsOpenedAt(accounts, entries, input.from) : accounts;
    const report = buildAccountability(entries, opened, chart, { kind: input.kind, from: input.from, to: input.to, grouping: input.grouping, ...(cc ? { costCenter: cc } : {}) });
    if (!report.lines.length && !report.transfers.length) fail('failed-precondition', 'Não há lançamentos neste período ou evento.');

    let periodClosed = false;
    if (input.kind === 'periodo') {
      const months = monthsBetween(input.from, input.to);
      const docs = await Promise.all(months.map(k => ctx.store.get<PeriodDoc>(P.period(t, k))));
      periodClosed = docs.every(d => d?.closed);
    }
    const periodLabel = input.kind === 'evento' ? `${cc!.name}` : accPeriodLabel(input.from, input.to);
    const id = ctx.store.newId();
    const doc: AccountabilityDoc = {
      id,
      title: input.title,
      kind: input.kind,
      from: input.from,
      to: input.to,
      periodLabel,
      ...(cc ? { costCenterId: cc.id, costCenterName: cc.name } : {}),
      grouping: input.grouping,
      report,
      ...(input.notes ? { notes: input.notes } : {}),
      audience: input.audience,
      signers: input.signers.map(s => ({ name: s.name, role: s.role, ...(s.uid ? { uid: s.uid } : {}) })),
      signerUids: input.signers.map(s => s.uid).filter((u): u is string => !!u),
      signatures: [],
      status: 'publicado',
      periodClosed,
      publishedAt: ctx.nowIso,
      publishedBy: ctx.actor!.uid,
      publishedByName: await ctx.actorName(),
    };

    let stats = { notified: 0, emailed: 0, push: 0 };
    if (input.postNotice && input.audience === 'socios' && ctx.tenant?.modules?.avisos !== false) {
      const noticeId = ctx.store.newId();
      const result = report.resultCents;
      const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const body =
        input.kind === 'periodo'
          ? `A diretoria publicou a prestação de contas de ${periodLabel}. Entradas ${brl(report.totals.inCents)}, saídas ${brl(report.totals.outCents)} e saldo atual de ${brl(report.closingCents)}. Abra para ver cada lançamento e onde o dinheiro está guardado.`
          : `A diretoria publicou a prestação de contas de ${periodLabel}. Entradas ${brl(report.totals.inCents)}, saídas ${brl(report.totals.outCents)} e ${result >= 0 ? 'resultado positivo' : 'resultado negativo'} de ${brl(Math.abs(result))}.`;
      const notice: NoticeDoc = {
        id: noticeId,
        title: input.title,
        body,
        audience: { all: true, categoryIds: [], groups: [], boardOnly: false },
        pinned: false,
        publishAt: ctx.nowIso,
        channels: ['app', 'push'],
        requireReadConfirmation: false,
        readCount: 0,
        attachments: [],
        link: { label: 'Ver a prestação de contas', to: `prestacao-de-contas/${id}` },
        status: 'publicado',
        createdBy: ctx.actor!.uid,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      };
      await ctx.store.set(P.notice(t, noticeId), notice as unknown as Record<string, unknown>);
      stats = await deliverNotice(ctx, noticeId, notice);
      doc.noticeId = noticeId;
    }
    await ctx.store.set(P.accountability(t, id), doc as unknown as Record<string, unknown>);
    for (const s of doc.signers) {
      if (s.uid && s.uid !== ctx.actor!.uid) await notify(ctx, s.uid, 'Prestação de contas para assinar', `${doc.title}: confira os números e assine.`, `prestacao-de-contas/${id}`);
    }
    await ctx.audit('accountability.published', id, { kind: input.kind, totalCents: report.closingCents, notified: stats.notified });
    return { id, ...stats };
  },
});

/** Quem foi indicado confere e assina pela própria conta (assinatura eletrônica simples) */
export const accountabilitySign = defineOp({
  name: 'accountability.sign',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'financeiro',
  async run(ctx, input) {
    const t = tid(ctx);
    const uid = ctx.actor!.uid;
    const doc = await ctx.store.get<AccountabilityDoc>(P.accountability(t, input.id));
    if (!doc || doc.status !== 'publicado') fail('not-found', 'Prestação de contas não encontrada.');
    const me = doc!.signers.find(s => s.uid === uid);
    if (!me) fail('permission-denied', 'Você não foi indicado para assinar esta prestação de contas.');
    if (doc!.signatures.some(s => s.uid === uid)) return { ok: true, already: true };
    const signatures = [...doc!.signatures, { uid, name: await ctx.actorName(), role: me!.role, at: ctx.nowIso }];
    await ctx.store.update(P.accountability(t, input.id), { signatures });
    await ctx.audit('accountability.signed', input.id, { role: me!.role });
    return { ok: true };
  },
});

/** Retirar (erro de lançamento, por exemplo): fica no histórico da diretoria com o motivo */
export const accountabilityWithdraw = defineOp({
  name: 'accountability.withdraw',
  input: zTenant.extend({ id: zId, reason: zText(300).min(5) }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'editar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const t = tid(ctx);
    const doc = await ctx.store.get<AccountabilityDoc>(P.accountability(t, input.id));
    if (!doc) fail('not-found', 'Prestação de contas não encontrada.');
    if (doc!.status === 'retirado') return { ok: true };
    await ctx.store.update(P.accountability(t, input.id), { status: 'retirado', withdrawnAt: ctx.nowIso, withdrawnReason: input.reason });
    if (doc!.noticeId) await ctx.store.delete(P.notice(t, doc!.noticeId)).catch(() => undefined);
    await ctx.audit('accountability.withdrawn', input.id, {});
    return { ok: true };
  },
});

export const accountabilityOps = [accountabilityPublish, accountabilitySign, accountabilityWithdraw];
