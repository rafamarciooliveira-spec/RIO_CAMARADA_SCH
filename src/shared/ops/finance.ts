/**
 * Financeiro: livro caixa imutável, dupla aprovação, estorno, transferência, fechamento de
 * período, cobranças (avulsas e recorrentes), baixa manual, Pix/boleto pelo provedor,
 * webhook idempotente, importação OFX, conciliação e rotinas diárias de adimplência.
 *
 * Imutabilidade: nenhuma operação apaga ou altera valor, data, conta ou classificação de um
 * lançamento. Correção só por estorno (novo lançamento oposto com reversalOf). O que muda no
 * documento original é apenas a marcação reversedBy e a situação na dupla aprovação.
 */
import { z } from 'zod';
import { defineOp, fail, registerJobs, zCents, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { deleteField, inc, type StoreTx } from '../core/store.ts';
import { buildPixPayload } from '../core/sandboxPayments.ts';
import { P } from '../paths.ts';
import { daysBetweenKeys, formatDate, localDateKey } from '../dates.ts';
import { formatBRL, lateCharges } from '../money.ts';
import { statusFromArrears } from '../memberStatus.ts';
import { parseOfx } from '../ofx.ts';
import { EMAIL_TEMPLATES } from '../templates.ts';
import { chargeOpenCents, nature, signedCents, suggestMatches, TRANSFER_CHART_ID } from '../finance/reports.ts';
import type {
  ChargeDoc,
  ChartAccountDoc,
  FinAccountDoc,
  LedgerEntryDoc,
  MemberDoc,
  MemberPiiDoc,
  MemberStatus,
  PeriodDoc,
  StatementLineDoc,
  TenantSettings,
} from '../types.ts';
import { emptyStats, getSettings, notify, sendTemplateMail, tid } from './helpers.ts';
import { setStatusCore } from './members.ts';
import { birthDateOf, dependentRules, dependentTimeline, familyDependentsCents } from '../dependents.ts';

/** Motivo gravado quando a situação muda pela régua de adimplência (não aparece na portaria) */
export const ARREARS_REASON = 'automatico:inadimplencia';

export function todayKey(ctx: OpContext): string {
  return localDateKey(ctx.now(), ctx.tenant?.timezone);
}

const zPeriodKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'competência no formato AAAA-MM');
const zMethod = z.enum(['pix', 'boleto', 'dinheiro', 'transferencia', 'cartao']);
const zAttachments = z.array(z.string().max(300)).max(10).default([]);

function checkAttachments(ctx: OpContext, list: string[]): void {
  const prefix = `tenants/${tid(ctx)}/attachments/`;
  for (const a of list) if (!a.startsWith(prefix) || a.includes('..')) fail('invalid-argument', 'Anexo fora da pasta da sociedade.');
}

// ---------- Núcleo do livro caixa ----------

export interface NewEntry {
  date: string;
  accountId: string;
  direction: 'entrada' | 'saida';
  amountCents: number;
  chartAccountId: string;
  costCenterId?: string;
  description: string;
  counterparty?: string;
  attachments?: string[];
  chargeId?: string;
  eventId?: string;
  transferId?: string;
  reversalOf?: string;
  status: 'lancado' | 'aguardando_aprovacao';
}

type Effect = Pick<LedgerEntryDoc, 'accountId' | 'direction' | 'amountCents' | 'periodKey'> & Partial<Pick<LedgerEntryDoc, 'transferId' | 'reversalOf' | 'chartAccountId'>>;

async function ensureStatsTx(ctx: OpContext, tx: StoreTx): Promise<boolean> {
  return !!(await tx.get(P.stats(tid(ctx))));
}

/** Efeito no saldo das contas e no painel (só para lançamentos efetivados) */
function writeEffects(ctx: OpContext, tx: StoreTx, list: Effect[], statsExists: boolean): void {
  const t = tid(ctx);
  const month = todayKey(ctx).slice(0, 7);
  const byAccount = new Map<string, number>();
  let balance = 0;
  let monthIn = 0;
  let monthOut = 0;
  for (const e of list) {
    const s = signedCents(e as LedgerEntryDoc);
    byAccount.set(e.accountId, (byAccount.get(e.accountId) || 0) + s);
    balance += s;
    if (e.periodKey === month && !e.transferId && e.chartAccountId !== TRANSFER_CHART_ID) {
      const n = nature(e as LedgerEntryDoc);
      if (n.kind === 'receita') monthIn += n.cents;
      else monthOut += n.cents;
    }
  }
  for (const [acc, delta] of byAccount) if (delta) tx.update(`${P.accounts(t)}/${acc}`, { balanceCents: inc(delta) });
  if (!statsExists) tx.set(P.stats(t), emptyStats(ctx.nowIso) as unknown as Record<string, unknown>);
  tx.update(P.stats(t), {
    'finance.balanceCents': inc(balance),
    'finance.monthInCents': inc(monthIn),
    'finance.monthOutCents': inc(monthOut),
    updatedAt: ctx.nowIso,
  });
}

async function assertPeriodsOpenTx(ctx: OpContext, tx: StoreTx, dates: string[]): Promise<void> {
  const keys = [...new Set(dates.map(d => d.slice(0, 7)))];
  for (const k of keys) {
    const p = await tx.get<PeriodDoc>(P.period(tid(ctx), k));
    if (p?.closed) fail('failed-precondition', `O período ${k.slice(5)}/${k.slice(0, 4)} está fechado. Reabra o período para lançar nele.`);
  }
}

export interface CommitPlan {
  entries: NewEntry[];
  receipt?: boolean;
  write?: (tx: StoreTx, made: { id: string; number: number }[], receiptNumber?: number) => void;
}

/**
 * Grava lançamentos numa transação: número sequencial pelo contador, período aberto, conta
 * ativa, saldo e painel. `plan` faz as leituras extras e devolve o que gravar.
 */
export async function commitEntries(ctx: OpContext, plan: (tx: StoreTx) => Promise<CommitPlan>): Promise<{ made: { id: string; number: number; status: NewEntry['status'] }[]; receiptNumber?: number }> {
  const t = tid(ctx);
  const ids: string[] = [];
  return ctx.store.runTransaction(async tx => {
    const p = await plan(tx);
    if (!p.entries.length) fail('invalid-argument', 'Nenhum lançamento para gravar.');
    const counters = (await tx.get<{ ledgerNumber?: number; receiptNumber?: number }>(P.counters(t))) || {};
    await assertPeriodsOpenTx(ctx, tx, p.entries.map(e => e.date));
    for (const accId of new Set(p.entries.map(e => e.accountId))) {
      const acc = await tx.get<FinAccountDoc>(`${P.accounts(t)}/${accId}`);
      if (!acc) fail('not-found', 'Conta financeira não encontrada.');
      if (acc!.active === false) fail('failed-precondition', `A conta "${acc!.name}" está desativada.`);
    }
    const statsExists = await ensureStatsTx(ctx, tx);

    let n = counters.ledgerNumber || 0;
    const made: { id: string; number: number; status: NewEntry['status'] }[] = [];
    const effects: Effect[] = [];
    for (const e of p.entries) {
      n++;
      const id = ctx.store.newId();
      ids.push(id);
      const doc: LedgerEntryDoc = {
        id,
        number: n,
        date: e.date,
        periodKey: e.date.slice(0, 7),
        accountId: e.accountId,
        direction: e.direction,
        amountCents: e.amountCents,
        chartAccountId: e.chartAccountId,
        ...(e.costCenterId ? { costCenterId: e.costCenterId } : {}),
        description: e.description,
        ...(e.counterparty ? { counterparty: e.counterparty } : {}),
        attachments: e.attachments || [],
        ...(e.chargeId ? { chargeId: e.chargeId } : {}),
        ...(e.eventId ? { eventId: e.eventId } : {}),
        ...(e.transferId ? { transferId: e.transferId } : {}),
        ...(e.reversalOf ? { reversalOf: e.reversalOf } : {}),
        status: e.status,
        approvals: [],
        createdBy: ctx.actor?.uid || 'sistema',
        createdAt: ctx.nowIso,
      };
      tx.set(`${P.ledger(t)}/${id}`, doc as unknown as Record<string, unknown>);
      made.push({ id, number: n, status: e.status });
      if (e.status === 'lancado') effects.push(doc);
    }
    const counterUpdate: Record<string, unknown> = { ledgerNumber: n };
    let receiptNumber: number | undefined;
    if (p.receipt) {
      receiptNumber = (counters.receiptNumber || 0) + 1;
      counterUpdate.receiptNumber = receiptNumber;
    }
    tx.set(P.counters(t), counterUpdate, { merge: true });
    if (effects.length) writeEffects(ctx, tx, effects, statsExists);
    p.write?.(tx, made, receiptNumber);
    return { made, receiptNumber };
  });
}

function needsSecondApproval(settings: TenantSettings, direction: 'entrada' | 'saida', amountCents: number): boolean {
  const limit = settings.doubleApprovalAboveCents || 0;
  return direction === 'saida' && limit > 0 && amountCents > limit;
}

async function getChart(ctx: OpContext, id: string): Promise<ChartAccountDoc> {
  const c = await ctx.store.get<ChartAccountDoc>(`${P.chart(tid(ctx))}/${id}`);
  if (!c) fail('invalid-argument', 'Conta do plano de contas não encontrada.');
  return c!;
}

// ---------- Lançamentos ----------

export const ledgerPost = defineOp({
  name: 'ledger.post',
  input: zTenant.extend({
    date: zDateKey,
    accountId: zId,
    direction: z.enum(['entrada', 'saida']),
    amountCents: zCents.min(1, 'informe um valor maior que zero'),
    chartAccountId: zId,
    costCenterId: zId.optional(),
    description: zText(300).min(2),
    counterparty: zText(150).optional(),
    attachments: zAttachments,
    eventId: zId.optional(),
  }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'criar'] },
  module: 'financeiro',
  idempotent: true,
  async run(ctx, input) {
    const settings = await getSettings(ctx);
    const chart = await getChart(ctx, input.chartAccountId);
    const expected = input.direction === 'entrada' ? 'receita' : 'despesa';
    if (chart.kind !== expected) fail('invalid-argument', `Para ${input.direction === 'entrada' ? 'uma entrada' : 'uma saída'}, escolha uma conta de ${expected}.`);
    checkAttachments(ctx, input.attachments);
    const status = needsSecondApproval(settings, input.direction, input.amountCents) ? 'aguardando_aprovacao' : 'lancado';
    const { made } = await commitEntries(ctx, async () => ({
      entries: [{ ...input, attachments: input.attachments, status }],
    }));
    await ctx.audit('ledger.posted', made[0].id, { number: made[0].number, amountCents: input.amountCents, status });
    return made[0];
  },
});

async function pendingEntry(ctx: OpContext, entryId: string): Promise<LedgerEntryDoc> {
  const e = await ctx.store.get<LedgerEntryDoc>(`${P.ledger(tid(ctx))}/${entryId}`);
  if (!e) fail('not-found', 'Lançamento não encontrado.');
  if (e!.status !== 'aguardando_aprovacao') fail('failed-precondition', 'Este lançamento não está aguardando aprovação.');
  if (e!.createdBy === ctx.actor?.uid) fail('permission-denied', 'A segunda aprovação precisa ser feita por outra pessoa.');
  return e!;
}

export const ledgerApprove = defineOp({
  name: 'ledger.approve',
  input: zTenant.extend({ entryId: zId }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'aprovar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const t = tid(ctx);
    const path = `${P.ledger(t)}/${input.entryId}`;
    await pendingEntry(ctx, input.entryId);
    await ctx.store.runTransaction(async tx => {
      const e = await tx.get<LedgerEntryDoc>(path);
      if (!e || e.status !== 'aguardando_aprovacao') fail('failed-precondition', 'Este lançamento não está aguardando aprovação.');
      await assertPeriodsOpenTx(ctx, tx, [e!.date]);
      const statsExists = await ensureStatsTx(ctx, tx);
      tx.update(path, { status: 'lancado', approvals: [...(e!.approvals || []), { uid: ctx.actor!.uid, at: ctx.nowIso }] });
      writeEffects(ctx, tx, [e!], statsExists);
    });
    await ctx.audit('ledger.approved', input.entryId);
    return { ok: true };
  },
});

export const ledgerReject = defineOp({
  name: 'ledger.reject',
  input: zTenant.extend({ entryId: zId, reason: zText(300).min(3) }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'aprovar'] },
  module: 'financeiro',
  async run(ctx, input) {
    await pendingEntry(ctx, input.entryId);
    await ctx.store.update(`${P.ledger(tid(ctx))}/${input.entryId}`, { status: 'recusado', rejectedReason: input.reason });
    await ctx.audit('ledger.rejected', input.entryId);
    return { ok: true };
  },
});

export const ledgerReverse = defineOp({
  name: 'ledger.reverse',
  input: zTenant.extend({ entryId: zId, reason: zText(300).min(5, 'explique o motivo do estorno'), date: zDateKey.optional() }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'criar'] },
  module: 'financeiro',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const date = input.date || todayKey(ctx);
    const first = await ctx.store.get<LedgerEntryDoc>(`${P.ledger(t)}/${input.entryId}`);
    if (!first) fail('not-found', 'Lançamento não encontrado.');
    // Transferência: estorna as duas pernas juntas para não desequilibrar as contas
    const legIds = first!.transferId
      ? (await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['transferId', '==', first!.transferId]] })).filter(r => !r.data.reversalOf).map(r => r.id)
      : [input.entryId];
    const { made } = await commitEntries(ctx, async tx => {
      const legs: LedgerEntryDoc[] = [];
      for (const id of legIds) {
        const e = await tx.get<LedgerEntryDoc>(`${P.ledger(t)}/${id}`);
        if (!e) fail('not-found', 'Lançamento não encontrado.');
        if (e!.status !== 'lancado') fail('failed-precondition', 'Só lançamentos efetivados podem ser estornados.');
        if (e!.reversedBy) fail('failed-precondition', 'Este lançamento já foi estornado.');
        if (e!.reversalOf) fail('failed-precondition', 'Um estorno não pode ser estornado. Faça um novo lançamento.');
        legs.push({ ...e!, id });
      }
      const charge = legs[0].chargeId ? await tx.get<ChargeDoc>(`${P.charges(t)}/${legs[0].chargeId}`) : null;
      const newTransfer = first!.transferId ? ctx.store.newId() : undefined;
      return {
        entries: legs.map(e => ({
          date,
          accountId: e.accountId,
          direction: e.direction === 'entrada' ? ('saida' as const) : ('entrada' as const),
          amountCents: e.amountCents,
          chartAccountId: e.chartAccountId,
          ...(e.costCenterId ? { costCenterId: e.costCenterId } : {}),
          ...(e.eventId ? { eventId: e.eventId } : {}),
          ...(e.chargeId ? { chargeId: e.chargeId } : {}),
          ...(newTransfer ? { transferId: newTransfer } : {}),
          description: `Estorno do lançamento nº ${e.number}: ${input.reason}`.slice(0, 300),
          reversalOf: e.id,
          status: 'lancado' as const,
        })),
        write: (tx2, mk) => {
          legs.forEach((e, i) => tx2.update(`${P.ledger(t)}/${e.id}`, { reversedBy: mk[i].id }));
          // Estorno de um recebimento reabre a cobrança
          if (charge && charge.ledgerEntryId === legs[0].id) {
            tx2.update(`${P.charges(t)}/${legs[0].chargeId}`, {
              status: charge.dueDate < todayKey(ctx) ? 'vencida' : 'aberta',
              paidAt: deleteField(),
              paidAmountCents: deleteField(),
              lateFeeCents: deleteField(),
              interestCents: deleteField(),
              method: deleteField(),
              ledgerEntryId: deleteField(),
            });
          }
        },
      };
    });
    await ctx.audit('ledger.reversed', input.entryId, { reversal: made[0].id });
    return { ids: made.map(m => m.id), numbers: made.map(m => m.number) };
  },
});

export const ledgerTransfer = defineOp({
  name: 'ledger.transfer',
  input: zTenant.extend({
    fromAccountId: zId,
    toAccountId: zId,
    amountCents: zCents.min(1, 'informe um valor maior que zero'),
    date: zDateKey,
    description: zText(300).min(2),
  }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'criar'] },
  module: 'financeiro',
  idempotent: true,
  async run(ctx, input) {
    if (input.fromAccountId === input.toAccountId) fail('invalid-argument', 'Escolha contas diferentes.');
    const transferId = ctx.store.newId();
    const base = { date: input.date, amountCents: input.amountCents, chartAccountId: TRANSFER_CHART_ID, transferId, status: 'lancado' as const };
    const { made } = await commitEntries(ctx, async () => ({
      entries: [
        { ...base, accountId: input.fromAccountId, direction: 'saida', description: `Transferência enviada: ${input.description}`.slice(0, 300) },
        { ...base, accountId: input.toAccountId, direction: 'entrada', description: `Transferência recebida: ${input.description}`.slice(0, 300) },
      ],
    }));
    await ctx.audit('ledger.transfer', transferId, { amountCents: input.amountCents });
    return { transferId, ids: made.map(m => m.id) };
  },
});

// ---------- Períodos ----------

export const periodsClose = defineOp({
  name: 'periods.close',
  input: zTenant.extend({ periodKey: zPeriodKey }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'aprovar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const t = tid(ctx);
    if (input.periodKey > todayKey(ctx).slice(0, 7)) fail('invalid-argument', 'Não é possível fechar um mês que ainda não começou.');
    const path = P.period(t, input.periodKey);
    const cur = await ctx.store.get<PeriodDoc>(path);
    if (cur?.closed) fail('failed-precondition', 'Este período já está fechado.');
    const rows = await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['periodKey', '==', input.periodKey]] });
    if (rows.some(r => r.data.status === 'aguardando_aprovacao')) fail('failed-precondition', 'Há lançamentos aguardando aprovação neste período. Aprove ou recuse antes de fechar.');
    let inCents = 0;
    let outCents = 0;
    for (const r of rows) {
      if (r.data.status !== 'lancado' || r.data.transferId) continue;
      const n = nature(r.data);
      if (n.kind === 'receita') inCents += n.cents;
      else outCents += n.cents;
    }
    const doc: PeriodDoc = {
      id: input.periodKey,
      closed: true,
      closedAt: ctx.nowIso,
      closedBy: ctx.actor!.uid,
      totals: { inCents, outCents },
      history: [...(cur?.history || []), { action: 'fechado', uid: ctx.actor!.uid, at: ctx.nowIso }],
    };
    await ctx.store.set(path, doc as unknown as Record<string, unknown>);
    await ctx.audit('periods.closed', input.periodKey, { inCents, outCents });
    return { ok: true, totals: doc.totals };
  },
});

export const periodsReopen = defineOp({
  name: 'periods.reopen',
  input: zTenant.extend({ periodKey: zPeriodKey, reason: zText(300).min(5, 'explique o motivo da reabertura') }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'aprovar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const path = P.period(tid(ctx), input.periodKey);
    const cur = await ctx.store.get<PeriodDoc>(path);
    if (!cur?.closed) fail('failed-precondition', 'Este período não está fechado.');
    await ctx.store.update(path, {
      closed: false,
      history: [...(cur!.history || []), { action: 'reaberto', uid: ctx.actor!.uid, at: ctx.nowIso, reason: input.reason }],
    });
    await ctx.audit('periods.reopened', input.periodKey, { motivo: input.reason.slice(0, 200) });
    return { ok: true };
  },
});

// ---------- Cobranças ----------

export function dueThisMonth(period: string, month: number): boolean {
  // Períodos por calendário: trimestral em jan/abr/jul/out, semestral em jan/jul, anual em janeiro
  if (period === 'mensal') return true;
  if (period === 'trimestral') return [1, 4, 7, 10].includes(month);
  if (period === 'semestral') return [1, 7].includes(month);
  if (period === 'anual') return month === 1;
  return false;
}

function dueDateFor(competence: string, day: number): string {
  const [y, m] = competence.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${competence}-${String(Math.min(Math.max(1, day), last)).padStart(2, '0')}`;
}

export const chargesCreate = defineOp({
  name: 'charges.create',
  input: zTenant.extend({
    memberId: zId,
    description: zText(200).min(2),
    amountCents: zCents.min(1, 'informe um valor maior que zero'),
    discountCents: zCents.default(0),
    dueDate: zDateKey,
    competence: zPeriodKey.optional(),
  }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'criar'] },
  module: 'financeiro',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    if (input.discountCents > input.amountCents) fail('invalid-argument', 'O desconto não pode ser maior que o valor.');
    const id = ctx.store.newId();
    const doc: ChargeDoc = {
      id,
      memberId: input.memberId,
      ...(m!.uid ? { memberUid: m!.uid } : {}),
      memberName: m!.fullName,
      description: input.description,
      ...(input.competence ? { competence: input.competence } : {}),
      kind: 'avulsa',
      amountCents: input.amountCents,
      discountCents: input.discountCents,
      dueDate: input.dueDate,
      status: 'aberta',
      reminders: [],
      createdAt: ctx.nowIso,
    };
    await ctx.store.set(`${P.charges(t)}/${id}`, doc as unknown as Record<string, unknown>);
    await notify(ctx, m!.uid, 'Nova cobrança', `${input.description}: vence em ${formatDate(input.dueDate)}.`, 'meu-financeiro');
    await ctx.audit('charges.created', id, { amountCents: input.amountCents });
    return { id };
  },
});

export const chargesGenerateBatch = defineOp({
  name: 'charges.generateBatch',
  input: zTenant.extend({
    competence: zPeriodKey,
    discountCents: zCents.default(0),
    dueDay: z.number().int().min(1).max(31).optional(),
  }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'criar'] },
  module: 'financeiro',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const settings = await getSettings(ctx);
    const month = Number(input.competence.slice(5, 7));
    const dueDate = dueDateFor(input.competence, input.dueDay || settings.dueDay || 10);
    const label = ctx.tenant?.labels?.fee || 'Mensalidade';
    const members = await ctx.store.query<MemberDoc>(P.members(t), { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]] });
    // Dependente nunca recebe cobrança separada: entra na mensalidade do titular, discriminado
    const rules = dependentRules(settings);
    const today = localDateKey(ctx.now(), ctx.tenant?.timezone);
    const depsOf = new Map<string, typeof members>();
    for (const r of members) if (r.data.dependentOf) depsOf.set(r.data.dependentOf, [...(depsOf.get(r.data.dependentOf) || []), r]);
    let created = 0;
    let skipped = 0;
    let totalCents = 0;
    for (const r of members) {
      const m = r.data;
      if (m.dependentOf) continue;
      const cat = settings.categories.find(c => c.id === m.categoryId);
      if (!cat || !dueThisMonth(cat.period === 'isento' ? 'mensal' : cat.period, month)) continue;
      const holderFee = cat.period === 'isento' ? 0 : cat.feeCents;
      const items: { label: string; amountCents: number }[] = [];
      if (holderFee > 0) items.push({ label: `Titular (${cat.name})`, amountCents: holderFee });
      const depFees: number[] = [];
      for (const d of depsOf.get(r.id) || []) {
        let birth = birthDateOf(d.data);
        if (!birth && rules.freeUntilAge > 0) birth = (await ctx.store.get<MemberPiiDoc>(P.memberPii(t, d.id)))?.birthDate || null;
        const dcat = settings.categories.find(c => c.id === d.data.categoryId);
        const fee = dependentTimeline(rules, birth, today, dcat && dcat.period !== 'isento' ? dcat.feeCents : 0).feeNowCents;
        depFees.push(fee);
        if (fee > 0) items.push({ label: `Dependente: ${d.data.displayName}`, amountCents: fee });
      }
      const depTotal = familyDependentsCents(rules, depFees);
      if (depTotal < depFees.reduce((a, b) => a + b, 0)) items.push({ label: 'Teto da família para dependentes', amountCents: depTotal - depFees.reduce((a, b) => a + b, 0) });
      const amount = holderFee + depTotal;
      if (amount <= 0) continue;
      const id = `rec_${input.competence.replace('-', '')}_${r.id}`;
      const path = `${P.charges(t)}/${id}`;
      const discount = Math.min(input.discountCents, amount);
      const made = await ctx.store.runTransaction(async tx => {
        if (await tx.get(path)) return false;
        const doc: ChargeDoc = {
          id,
          memberId: r.id,
          ...(m.uid ? { memberUid: m.uid } : {}),
          memberName: m.fullName,
          description: `${label} ${input.competence.slice(5)}/${input.competence.slice(0, 4)}${depTotal > 0 ? ` (com ${depFees.filter(f => f > 0).length} dependente${depFees.filter(f => f > 0).length > 1 ? 's' : ''})` : ''}`,
          competence: input.competence,
          kind: 'recorrente',
          amountCents: amount,
          discountCents: discount,
          dueDate,
          status: 'aberta',
          reminders: [],
          ...(items.length > 1 || depTotal > 0 ? { items } : {}),
          createdAt: ctx.nowIso,
        };
        tx.create(path, doc as unknown as Record<string, unknown>);
        return true;
      });
      if (made) {
        created++;
        totalCents += amount - discount;
      } else skipped++;
    }
    await ctx.audit('charges.batch_generated', input.competence, { created, skipped, totalCents });
    return { created, skipped, totalCents, dueDate };
  },
});

export const chargesCancel = defineOp({
  name: 'charges.cancel',
  input: zTenant.extend({ chargeId: zId, reason: zText(300).min(5, 'explique o motivo do cancelamento') }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'editar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const path = `${P.charges(tid(ctx))}/${input.chargeId}`;
    const c = await ctx.store.get<ChargeDoc>(path);
    if (!c) fail('not-found', 'Cobrança não encontrada.');
    if (c!.status === 'paga') fail('failed-precondition', 'Cobrança paga não se cancela. Estorne o recebimento no livro caixa.');
    if (c!.status === 'cancelada') fail('failed-precondition', 'Esta cobrança já está cancelada.');
    if (c!.provider?.externalId) await ctx.payments.cancelCharge(c!.provider.externalId).catch(() => undefined);
    await ctx.store.update(path, { status: 'cancelada', cancelReason: input.reason, canceledAt: ctx.nowIso });
    await ctx.audit('charges.canceled', input.chargeId);
    return { ok: true };
  },
});

export interface PayArgs {
  accountId: string;
  method: z.infer<typeof zMethod>;
  paidOn: string;
  paidAmountCents?: number;
  chartAccountId?: string;
  costCenterId?: string;
}

/** Valor devido numa data (valor menos desconto, mais multa e juros pelas regras da sociedade) */
export function amountDueOn(c: Pick<ChargeDoc, 'amountCents' | 'discountCents' | 'dueDate'>, s: Pick<TenantSettings, 'lateFeeBps' | 'interestBpsMonth'>, onKey: string) {
  const base = chargeOpenCents(c);
  const late = lateCharges(base, c.dueDate, onKey, s.lateFeeBps || 0, s.interestBpsMonth || 0);
  return { baseCents: base, ...late, totalCents: base + late.lateFeeCents + late.interestCents };
}

async function memberHasOverdue(ctx: OpContext, memberId: string): Promise<boolean> {
  const today = todayKey(ctx);
  const rows = await ctx.store.query<ChargeDoc>(P.charges(tid(ctx)), { where: [['memberId', '==', memberId]] });
  return rows.some(r => r.data.status === 'vencida' || (r.data.status === 'aberta' && r.data.dueDate < today));
}

async function restoreIfSettled(ctx: OpContext, memberId: string): Promise<void> {
  const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), memberId));
  if (!m) return;
  const byArrears = m.status === 'em_atraso' || (m.status === 'suspenso' && m.statusReason === ARREARS_REASON);
  if (!byArrears) return;
  if (await memberHasOverdue(ctx, memberId)) return;
  await setStatusCore(ctx, memberId, 'ativo', '');
}

export async function payCore(ctx: OpContext, chargeId: string, a: PayArgs): Promise<{ entryId: string; receiptNumber: number; paidAmountCents: number }> {
  const t = tid(ctx);
  const settings = await getSettings(ctx);
  const path = `${P.charges(t)}/${chargeId}`;
  let charge: ChargeDoc | null = null;
  let paid = 0;
  let late = { lateFeeCents: 0, interestCents: 0 };
  const chartId = a.chartAccountId || 'c1_01';
  await getChart(ctx, chartId);
  const res = await commitEntries(ctx, async tx => {
    charge = await tx.get<ChargeDoc>(path);
    if (!charge) fail('not-found', 'Cobrança não encontrada.');
    if (charge!.status === 'paga') fail('failed-precondition', 'Esta cobrança já foi paga.');
    if (charge!.status === 'cancelada') fail('failed-precondition', 'Esta cobrança está cancelada.');
    const due = amountDueOn(charge!, settings, a.paidOn);
    late = { lateFeeCents: due.lateFeeCents, interestCents: due.interestCents };
    paid = a.paidAmountCents ?? due.totalCents;
    if (paid <= 0) fail('invalid-argument', 'Informe o valor pago.');
    return {
      receipt: true,
      entries: [
        {
          date: a.paidOn,
          accountId: a.accountId,
          direction: 'entrada',
          amountCents: paid,
          chartAccountId: chartId,
          ...(a.costCenterId ? { costCenterId: a.costCenterId } : {}),
          description: `Recebimento: ${charge!.description}`.slice(0, 300),
          counterparty: charge!.memberName,
          chargeId,
          status: 'lancado',
        },
      ],
      write: (tx2, made, receiptNumber) => {
        tx2.update(path, {
          status: 'paga',
          paidAt: a.paidOn === todayKey(ctx) ? ctx.nowIso : `${a.paidOn}T12:00:00.000Z`,
          paidAmountCents: paid,
          lateFeeCents: late.lateFeeCents,
          interestCents: late.interestCents,
          method: a.method,
          ledgerEntryId: made[0].id,
          receiptNumber: receiptNumber!,
        });
      },
    };
  });
  const c = charge as unknown as ChargeDoc;
  await restoreIfSettled(ctx, c.memberId);
  const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, c.memberId));
  await sendTemplateMail(
    ctx,
    pii?.email,
    'recibo',
    {
      nome: c.memberName.split(' ')[0],
      numero: String(res.receiptNumber),
      valor: formatBRL(paid),
      descricao: c.description,
      data: formatDate(a.paidOn),
      link: `${ctx.appUrl}/${ctx.tenant?.slug}/meu-financeiro`,
    },
    EMAIL_TEMPLATES.recibo
  ).catch(() => undefined);
  await notify(ctx, c.memberUid, 'Pagamento recebido', `${c.description}: recibo nº ${res.receiptNumber}.`, 'meu-financeiro');
  return { entryId: res.made[0].id, receiptNumber: res.receiptNumber!, paidAmountCents: paid };
}

export const chargesPay = defineOp({
  name: 'charges.pay',
  input: zTenant.extend({
    chargeId: zId,
    accountId: zId,
    method: zMethod,
    paidOn: zDateKey,
    paidAmountCents: zCents.optional(),
    chartAccountId: zId.optional(),
    costCenterId: zId.optional(),
  }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'editar'] },
  module: 'financeiro',
  idempotent: true,
  async run(ctx, input) {
    if (input.paidOn > todayKey(ctx)) fail('invalid-argument', 'A data do pagamento não pode ser no futuro.');
    const r = await payCore(ctx, input.chargeId, input);
    await ctx.audit('charges.paid', input.chargeId, { receipt: r.receiptNumber, amountCents: r.paidAmountCents, manual: true });
    return r;
  },
});

export const chargesCreatePayment = defineOp({
  name: 'charges.createPayment',
  input: zTenant.extend({ chargeId: zId, method: z.enum(['pix', 'boleto']).default('pix') }),
  auth: 'user',
  tenant: { perm: null },
  module: 'financeiro',
  rateLimit: { per: 'uid', max: 30, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const path = `${P.charges(t)}/${input.chargeId}`;
    const c = await ctx.store.get<ChargeDoc>(path);
    if (!c) fail('not-found', 'Cobrança não encontrada.');
    const own = !!c!.memberUid && c!.memberUid === ctx.actor?.uid;
    if (!own) ctx.require('financeiro', 'editar');
    if (c!.status !== 'aberta' && c!.status !== 'vencida') fail('failed-precondition', 'Esta cobrança não está em aberto.');
    const sandbox = ctx.payments.name === 'sandbox';
    const want = input.method;
    if (c!.provider?.externalId && (want === 'pix' ? !!c!.provider.pixCopyPaste : !!c!.provider.boletoLine || !!c!.provider.boletoUrl)) {
      return { ...c!.provider, sandbox };
    }
    const settings = await getSettings(ctx);
    const due = amountDueOn(c!, settings, todayKey(ctx));
    const r = await ctx.payments.createCharge({
      chargeId: c!.id,
      tenantId: t,
      amountCents: due.totalCents,
      dueDate: c!.dueDate,
      description: `${c!.description} (${ctx.tenant?.name || ''})`.slice(0, 140),
      payerName: c!.memberName,
      method: want,
    });
    let pix = r.pixCopyPaste;
    // No sandbox o BR Code usa a chave Pix e o nome da sociedade (fica igual ao que o provedor real faria)
    if (sandbox && settings.pixKey) {
      pix = buildPixPayload({ key: settings.pixKey, name: ctx.tenant?.name || 'SOCIEDADE', city: ctx.tenant?.publicPage?.city || 'BRASIL', amountCents: due.totalCents, txid: r.externalId });
    }
    const provider: NonNullable<ChargeDoc['provider']> = {
      name: ctx.payments.name,
      externalId: r.externalId,
      ...(pix ? { pixCopyPaste: pix } : {}),
      ...(r.boletoUrl ? { boletoUrl: r.boletoUrl } : {}),
      ...(r.boletoLine ? { boletoLine: r.boletoLine } : {}),
    };
    await ctx.store.update(path, { provider });
    await ctx.audit('charges.payment_created', c!.id, { provider: provider.name, method: want });
    return { ...provider, amountCents: due.totalCents, sandbox };
  },
});

async function pickReceivingAccount(ctx: OpContext): Promise<string> {
  const rows = await ctx.store.query<FinAccountDoc>(P.accounts(tid(ctx)));
  const active = rows.filter(r => r.data.active !== false);
  const pick = active.find(r => r.data.type === 'pix') || active.find(r => r.data.type === 'banco') || active[0];
  if (!pick) fail('failed-precondition', 'Nenhuma conta ativa para receber o pagamento.');
  return pick!.id;
}

/** Evento do provedor (webhook). Interna: só o servidor chama, depois de conferir a assinatura. */
export const applyPaymentEvent = defineOp({
  name: 'finance.applyPaymentEvent',
  input: zTenant.extend({
    eventId: z.string().min(1).max(200),
    externalId: z.string().min(1).max(200),
    type: z.enum(['paid', 'canceled', 'overdue']),
    paidAmountCents: zCents.optional(),
    paidAt: z.string().max(40).optional(),
  }),
  auth: 'user',
  tenant: { perm: null },
  internal: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const key = input.eventId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150);
    const evPath = `${P.paymentEvents(t)}/${key}`;
    // Trava de idempotência: o mesmo evento nunca é aplicado duas vezes
    const fresh = await ctx.store
      .runTransaction(async tx => {
        if (await tx.get(evPath)) return false;
        tx.create(evPath, { eventId: input.eventId, externalId: input.externalId, type: input.type, status: 'processando', receivedAt: ctx.nowIso });
        return true;
      })
      .catch(() => false);
    if (!fresh) return { duplicate: true };
    try {
      const rows = await ctx.store.query<ChargeDoc>(P.charges(t), { where: [['provider.externalId', '==', input.externalId]], limit: 1 });
      const row = rows[0];
      let result = 'cobranca_nao_encontrada';
      if (row) {
        const c = row.data;
        if (input.type === 'paid') {
          if (c.status === 'paga') result = 'ja_paga';
          else if (c.status === 'cancelada') result = 'cancelada';
          else {
            const at = input.paidAt && !Number.isNaN(Date.parse(input.paidAt)) ? new Date(input.paidAt) : ctx.now();
            const paidOn = localDateKey(at, ctx.tenant?.timezone);
            await payCore(ctx, row.id, {
              accountId: await pickReceivingAccount(ctx),
              method: c.provider?.boletoLine || c.provider?.boletoUrl ? 'boleto' : 'pix',
              paidOn: paidOn > todayKey(ctx) ? todayKey(ctx) : paidOn,
              ...(input.paidAmountCents ? { paidAmountCents: input.paidAmountCents } : {}),
            });
            result = 'paga';
          }
        } else if (input.type === 'canceled') {
          if (c.status === 'aberta' || c.status === 'vencida') {
            await ctx.store.update(row.path, { status: 'cancelada', cancelReason: 'Cancelada no provedor de pagamento', canceledAt: ctx.nowIso });
            result = 'cancelada';
          } else result = 'ignorado';
        } else if (input.type === 'overdue') {
          if (c.status === 'aberta') {
            await ctx.store.update(row.path, { status: 'vencida' });
            result = 'vencida';
          } else result = 'ignorado';
        }
      }
      await ctx.store.update(evPath, { status: 'aplicado', result, chargeId: row?.id || '', appliedAt: ctx.nowIso });
      await ctx.audit('finance.payment_event', row?.id, { type: input.type, result });
      return { duplicate: false, result };
    } catch (e) {
      // Falhou: libera o evento para o provedor reenviar
      await ctx.store.delete(evPath);
      throw e;
    }
  },
});

// ---------- Extrato e conciliação ----------

export const importStatement = defineOp({
  name: 'finance.importStatement',
  input: zTenant.extend({ accountId: zId, ofx: z.string().min(10).max(3_000_000) }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'editar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const t = tid(ctx);
    const acc = await ctx.store.get<FinAccountDoc>(`${P.accounts(t)}/${input.accountId}`);
    if (!acc) fail('not-found', 'Conta financeira não encontrada.');
    const st = parseOfx(input.ofx);
    if (!st.transactions.length) fail('invalid-argument', 'Não encontramos movimentos neste arquivo. Confira se é um extrato OFX.');
    let imported = 0;
    let duplicates = 0;
    for (const tr of st.transactions.slice(0, 5000)) {
      const raw = `${input.accountId}_${tr.fitId}`.replace(/[^A-Za-z0-9_-]/g, '_');
      const id = raw.length <= 120 ? raw : `h_${(await ctx.crypto.sha256Hex(raw)).slice(0, 40)}`;
      const path = `${P.statementLines(t)}/${id}`;
      if (await ctx.store.get(path)) {
        duplicates++;
        continue;
      }
      const line: StatementLineDoc = { id, accountId: input.accountId, date: tr.date, amountCents: tr.amountCents, memo: tr.memo, fitId: tr.fitId, importedAt: ctx.nowIso };
      await ctx.store.set(path, line as unknown as Record<string, unknown>);
      imported++;
    }
    await ctx.audit('finance.statement_imported', input.accountId, { imported, duplicates });
    return { imported, duplicates, total: st.transactions.length };
  },
});

export const reconcile = defineOp({
  name: 'finance.reconcile',
  input: zTenant.extend({ lineId: zId.optional(), entryId: zId.optional(), unmatch: z.boolean().optional(), autoAccountId: zId.optional() }),
  auth: 'user',
  tenant: { perm: ['financeiro', 'editar'] },
  module: 'financeiro',
  async run(ctx, input) {
    const t = tid(ctx);
    if (input.autoAccountId) {
      const lines = (await ctx.store.query<StatementLineDoc>(P.statementLines(t), { where: [['accountId', '==', input.autoAccountId]] })).map(r => ({ ...r.data, id: r.id }));
      const entries = (await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['accountId', '==', input.autoAccountId]] })).map(r => ({ ...r.data, id: r.id }));
      const sug = suggestMatches(lines, entries);
      // Só casa automaticamente quando a sugestão é única nos dois sentidos
      const usage = new Map<string, number>();
      for (const c of Object.values(sug)) for (const id of c) usage.set(id, (usage.get(id) || 0) + 1);
      let matched = 0;
      for (const [lineId, cands] of Object.entries(sug)) {
        if (cands.length !== 1 || usage.get(cands[0]) !== 1) continue;
        await ctx.store.update(`${P.statementLines(t)}/${lineId}`, { matchedEntryId: cands[0] });
        matched++;
      }
      await ctx.audit('finance.reconciled_auto', input.autoAccountId, { matched });
      return { matched };
    }
    if (!input.lineId) fail('invalid-argument', 'Informe a linha do extrato.');
    const linePath = `${P.statementLines(t)}/${input.lineId}`;
    const line = await ctx.store.get<StatementLineDoc>(linePath);
    if (!line) fail('not-found', 'Linha do extrato não encontrada.');
    if (input.unmatch) {
      await ctx.store.update(linePath, { matchedEntryId: deleteField() });
      await ctx.audit('finance.unreconciled', input.lineId);
      return { matched: 0 };
    }
    if (!input.entryId) fail('invalid-argument', 'Escolha o lançamento.');
    const e = await ctx.store.get<LedgerEntryDoc>(`${P.ledger(t)}/${input.entryId}`);
    if (!e) fail('not-found', 'Lançamento não encontrado.');
    if (e!.status !== 'lancado') fail('failed-precondition', 'Só lançamentos efetivados podem ser conciliados.');
    if (e!.accountId !== line!.accountId) fail('invalid-argument', 'O lançamento é de outra conta.');
    if (signedCents(e!) !== line!.amountCents) fail('invalid-argument', 'O valor do lançamento é diferente do extrato.');
    const other = await ctx.store.query(P.statementLines(t), { where: [['matchedEntryId', '==', input.entryId]], limit: 1 });
    if (other.length && other[0].id !== input.lineId) fail('already-exists', 'Este lançamento já está conciliado com outra linha.');
    await ctx.store.update(linePath, { matchedEntryId: input.entryId });
    await ctx.audit('finance.reconciled', input.lineId, { entry: input.entryId! });
    return { matched: 1 };
  },
});

// ---------- Rotinas diárias ----------

async function hasConsent(ctx: OpContext, pii: MemberPiiDoc | null, purpose: 'comunicacao'): Promise<boolean> {
  const list = (pii?.consents || []).filter(c => c.purpose === purpose).sort((a, b) => (a.at < b.at ? -1 : 1));
  return !!list[list.length - 1]?.granted;
}

export function reminderKind(dueDate: string, today: string): 'd-3' | 'd0' | 'd+5' | null {
  const until = daysBetweenKeys(today, dueDate);
  if (until >= 1 && until <= 3) return 'd-3';
  if (until === 0) return 'd0';
  if (-until >= 5 && -until <= 15) return 'd+5';
  return null;
}

registerJobs([
  {
    name: 'finance.markOverdue',
    async run(ctx) {
      const t = tid(ctx);
      const today = todayKey(ctx);
      const rows = await ctx.store.query<ChargeDoc>(P.charges(t), { where: [['status', '==', 'aberta'], ['dueDate', '<', today]] });
      for (const r of rows) await ctx.store.update(r.path, { status: 'vencida' });
    },
  },
  {
    name: 'finance.memberArrears',
    async run(ctx) {
      const t = tid(ctx);
      const today = todayKey(ctx);
      const settings = await ctx.store.get<TenantSettings>(P.settings(t));
      if (!settings) return;
      const overdue = await ctx.store.query<ChargeDoc>(P.charges(t), { where: [['status', '==', 'vencida']] });
      const oldest = new Map<string, number>();
      for (const r of overdue) {
        const d = daysBetweenKeys(r.data.dueDate, today);
        oldest.set(r.data.memberId, Math.max(oldest.get(r.data.memberId) || 0, d));
      }
      const members = await ctx.store.query<MemberDoc>(P.members(t), { where: [['status', 'in', ['aprovado', 'ativo', 'em_atraso', 'suspenso']]] });
      for (const r of members) {
        const m = r.data;
        // Suspensão decidida pela diretoria (por outro motivo) não é desfeita pela rotina
        if (m.status === 'suspenso' && m.statusReason !== ARREARS_REASON) continue;
        const target: MemberStatus = statusFromArrears(m.status, oldest.get(r.id) || 0, settings.gracePeriodDays, settings.suspendAfterDays);
        if (target === m.status) continue;
        await setStatusCore(ctx, r.id, target, target === 'em_atraso' || target === 'suspenso' ? ARREARS_REASON : '');
      }
    },
  },
  {
    name: 'finance.reminders',
    async run(ctx) {
      const t = tid(ctx);
      const today = todayKey(ctx);
      const rows = await ctx.store.query<ChargeDoc>(P.charges(t), { where: [['status', 'in', ['aberta', 'vencida']]] });
      for (const r of rows) {
        const c = r.data;
        const kind = reminderKind(c.dueDate, today);
        if (!kind || (c.reminders || []).some(x => x.kind === kind)) continue;
        const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, c.memberId));
        if (!(await hasConsent(ctx, pii, 'comunicacao')) || !pii?.email) continue;
        const status = await sendTemplateMail(
          ctx,
          pii.email,
          'lembrete',
          {
            nome: c.memberName.split(' ')[0],
            descricao: c.description,
            valor: formatBRL(chargeOpenCents(c)),
            vencimento: formatDate(c.dueDate),
            link: `${ctx.appUrl}/${ctx.tenant?.slug}/meu-financeiro`,
          },
          EMAIL_TEMPLATES.lembrete
        );
        if (status === 'falhou') continue;
        await ctx.store.update(r.path, { reminders: [...(c.reminders || []), { at: ctx.nowIso, kind }] });
      }
    },
  },
  {
    name: 'finance.stats',
    async run(ctx) {
      const t = tid(ctx);
      const month = todayKey(ctx).slice(0, 7);
      const accounts = await ctx.store.query<FinAccountDoc>(P.accounts(t));
      const entries = await ctx.store.query<LedgerEntryDoc>(P.ledger(t), { where: [['periodKey', '==', month]] });
      const overdue = await ctx.store.query<ChargeDoc>(P.charges(t), { where: [['status', '==', 'vencida']] });
      let monthIn = 0;
      let monthOut = 0;
      for (const r of entries) {
        if (r.data.status !== 'lancado' || r.data.transferId) continue;
        const n = nature(r.data);
        if (n.kind === 'receita') monthIn += n.cents;
        else monthOut += n.cents;
      }
      if (!(await ctx.store.get(P.stats(t)))) await ctx.store.set(P.stats(t), emptyStats(ctx.nowIso) as unknown as Record<string, unknown>);
      await ctx.store.update(P.stats(t), {
        'finance.balanceCents': accounts.reduce((a, r) => a + (r.data.balanceCents || 0), 0),
        'finance.monthInCents': monthIn,
        'finance.monthOutCents': monthOut,
        'finance.overdueCents': overdue.reduce((a, r) => a + chargeOpenCents(r.data), 0),
        'finance.overdueCount': overdue.length,
        updatedAt: ctx.nowIso,
      });
    },
  },
]);

export const financeOps = [
  ledgerPost,
  ledgerApprove,
  ledgerReject,
  ledgerReverse,
  ledgerTransfer,
  periodsClose,
  periodsReopen,
  chargesCreate,
  chargesGenerateBatch,
  chargesCancel,
  chargesPay,
  chargesCreatePayment,
  applyPaymentEvent,
  importStatement,
  reconcile,
];
