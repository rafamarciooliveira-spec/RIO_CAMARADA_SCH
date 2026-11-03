/**
 * Direitos do titular (LGPD art. 18): pedidos, cópia dos dados (portabilidade), resolução
 * pela diretoria e rotina de retenção que anonimiza desligados após o prazo configurado.
 */
import { z } from 'zod';
import { defineOp, fail, registerJobs, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { addMonthsKey, localDateKey } from '../dates.ts';
import type { ChargeDoc, CheckinDoc, MemberDoc, MemberHistoryDoc, MemberPiiDoc, NotificationDoc, PrivacyRequestDoc, TenantSettings } from '../types.ts';
import { anonymizeMember, TERMS_VERSION } from './members.ts';
import { notify, tid } from './helpers.ts';

export const PRIVACY_KINDS = ['acesso', 'correcao', 'portabilidade', 'eliminacao', 'revogacao'] as const;

export const PRIVACY_KIND_LABEL: Record<PrivacyRequestDoc['kind'], string> = {
  acesso: 'Acesso aos dados',
  correcao: 'Correção',
  portabilidade: 'Portabilidade',
  eliminacao: 'Eliminação',
  revogacao: 'Revogação de consentimento',
};

async function ownMember(ctx: OpContext, memberId: string): Promise<MemberDoc> {
  const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), memberId));
  if (!m) fail('not-found', 'Cadastro não encontrado.');
  const own = m!.uid === ctx.actor?.uid || (!!m!.dependentOf && m!.dependentOf === ctx.membership?.memberId);
  if (!own) fail('permission-denied', 'Você só pode tratar dos seus próprios dados.');
  return m!;
}

export const requestPrivacy = defineOp({
  name: 'privacy.request',
  input: zTenant.extend({ memberId: zId, kind: z.enum(PRIVACY_KINDS), details: zText(2000) }),
  auth: 'user',
  tenant: { perm: null },
  rateLimit: { per: 'uid', max: 10, windowSec: 86400 },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ownMember(ctx, input.memberId);
    const open = await ctx.store.query<PrivacyRequestDoc>(P.privacyRequests(t), { where: [['memberId', '==', m.id], ['kind', '==', input.kind]] });
    if (open.some(r => r.data.status === 'aberta' || r.data.status === 'em_analise')) fail('already-exists', 'Já existe um pedido deste tipo em andamento.');
    const id = ctx.store.newId();
    const doc: PrivacyRequestDoc = { id, memberId: m.id, uid: ctx.actor!.uid, kind: input.kind, details: input.details, status: 'aberta', createdAt: ctx.nowIso };
    await ctx.store.set(`${P.privacyRequests(t)}/${id}`, doc as unknown as Record<string, unknown>);
    await ctx.audit('privacy.requested', id, { kind: input.kind });
    return { id };
  },
});

/** Cópia dos dados do próprio titular (JSON). CPF sempre mascarado. */
export const myData = defineOp({
  name: 'privacy.myData',
  input: zTenant.extend({ memberId: zId }),
  auth: 'user',
  tenant: { perm: null },
  rateLimit: { per: 'uid', max: 10, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ownMember(ctx, input.memberId);
    const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, m.id));
    const { cpfEnc: _e, cpfHmac: _h, consents, ...personal } = pii || ({ consents: [] } as unknown as MemberPiiDoc);
    void _e;
    void _h;
    const history = await ctx.store.query<MemberHistoryDoc>(P.memberHistory(t, m.id), { orderBy: [['at', 'asc']], limit: 500 });
    const charges = await ctx.store.query<ChargeDoc>(P.charges(t), { where: [['memberId', '==', m.id]], limit: 2000 });
    const checkins = await ctx.store.query<CheckinDoc>(P.checkins(t), { where: [['memberId', '==', m.id]], limit: 2000 });
    const notifications = m.uid ? await ctx.store.query<NotificationDoc>(P.notifications(t), { where: [['uid', '==', m.uid]], limit: 500 }) : [];
    const requests = await ctx.store.query<PrivacyRequestDoc>(P.privacyRequests(t), { where: [['memberId', '==', m.id]], limit: 100 });
    await ctx.audit('privacy.data_exported', m.id);
    return {
      exportedAt: ctx.nowIso,
      controller: { name: ctx.tenant!.name, slug: ctx.tenant!.slug },
      termsVersion: TERMS_VERSION,
      profile: {
        fullName: m.fullName,
        displayName: m.displayName,
        category: m.categoryName,
        status: m.status,
        membershipNumber: m.membershipNumber || '',
        joinedAt: m.joinedAt || '',
        validUntil: m.validUntil || '',
        groups: m.groups || [],
        custom: m.custom || {},
        isMinor: m.isMinor,
        dependentOf: m.dependentOf || '',
        hasPhoto: !!m.photoPath,
      },
      personal,
      consents: consents || [],
      statusHistory: history.map(h => ({ from: h.data.from, to: h.data.to, reason: h.data.reason || '', at: h.data.at })),
      charges: charges.map(c => ({
        description: c.data.description,
        competence: c.data.competence || '',
        amountCents: c.data.amountCents,
        dueDate: c.data.dueDate,
        status: c.data.status,
        paidAt: c.data.paidAt || '',
        paidAmountCents: c.data.paidAmountCents || 0,
      })),
      checkins: checkins.map(c => ({ result: c.data.result, eventId: c.data.eventId || '', at: c.data.at })),
      notifications: notifications.map(n => ({ title: n.data.title, body: n.data.body, read: n.data.read, createdAt: n.data.createdAt })),
      privacyRequests: requests.map(r => ({ kind: r.data.kind, status: r.data.status, createdAt: r.data.createdAt, resolvedAt: r.data.resolvedAt || '', response: r.data.response || '' })),
    };
  },
});

const RETENTION_NOTE = 'Registros financeiros e atas são mantidos pelo prazo legal, apenas com identificadores.';

export const resolvePrivacy = defineOp({
  name: 'privacy.resolve',
  input: zTenant.extend({ id: zId, status: z.enum(['em_analise', 'concluida', 'negada']), response: zText(2000) }),
  auth: 'user',
  tenant: { perm: ['pii', 'ver'] },
  async run(ctx, input) {
    ctx.require('socios', 'aprovar');
    const t = tid(ctx);
    const path = `${P.privacyRequests(t)}/${input.id}`;
    const r = await ctx.store.get<PrivacyRequestDoc>(path);
    if (!r) fail('not-found', 'Pedido não encontrado.');
    if (r!.status === 'concluida' || r!.status === 'negada') fail('failed-precondition', 'Este pedido já foi encerrado.');
    if (input.status === 'negada' && input.response.length < 10) fail('invalid-argument', 'Explique ao titular o motivo da negativa.');
    let response = input.response;
    let anonymized = false;
    if (input.status === 'concluida' && r!.kind === 'eliminacao') {
      const m = await ctx.store.get<MemberDoc & { anonymizedAt?: string }>(P.member(t, r!.memberId));
      if (m && !m.anonymizedAt) {
        await anonymizeMember.run(ctx, { tenantId: t, memberId: r!.memberId, reason: 'Pedido de eliminação do titular' });
        anonymized = true;
      }
      response = [response, RETENTION_NOTE].filter(Boolean).join(' ');
    }
    if (input.status === 'concluida' && r!.kind === 'revogacao') {
      const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, r!.memberId));
      if (pii) {
        const next = [...(pii.consents || [])];
        for (const purpose of ['imagem', 'comunicacao', 'marketing'] as const) {
          next.push({ purpose, legalBasis: purpose === 'comunicacao' ? 'legitimo_interesse' : 'consentimento', granted: false, termsVersion: TERMS_VERSION, at: ctx.nowIso });
        }
        await ctx.store.update(P.memberPii(t, r!.memberId), { consents: next, updatedAt: ctx.nowIso });
      }
    }
    await ctx.store.update(path, {
      status: input.status,
      response,
      ...(input.status !== 'em_analise' ? { resolvedAt: ctx.nowIso } : {}),
    });
    if (!anonymized) {
      const label = input.status === 'em_analise' ? 'em análise' : input.status === 'concluida' ? 'concluído' : 'negado';
      await notify(ctx, r!.uid, 'Pedido de privacidade', `Seu pedido foi ${label}.`, 'perfil');
    }
    await ctx.audit('privacy.resolved', input.id, { kind: r!.kind, status: input.status, anonymized });
    return { ok: true, anonymized };
  },
});

/** Data (AAAA-MM-DD) em que o sócio foi desligado pela última vez */
async function desligadoDesde(ctx: OpContext, m: MemberDoc & { id: string }): Promise<string> {
  const h = await ctx.store.query<MemberHistoryDoc>(P.memberHistory(tid(ctx), m.id), { where: [['to', '==', 'desligado']], orderBy: [['at', 'desc']], limit: 1 });
  return (h[0]?.data.at || m.updatedAt).slice(0, 10);
}

/** Rotina de retenção: anonimiza desligados há mais de retentionYears.inativos anos */
export async function runRetention(ctx: OpContext): Promise<number> {
  const t = tid(ctx);
  const settings = await ctx.store.get<TenantSettings>(P.settings(t));
  const years = settings?.retentionYears?.inativos;
  if (!years) return 0;
  const today = localDateKey(ctx.now(), ctx.tenant?.timezone);
  const rows = await ctx.store.query<MemberDoc & { anonymizedAt?: string }>(P.members(t), { where: [['status', '==', 'desligado']], limit: 500 });
  let count = 0;
  for (const r of rows) {
    if (r.data.anonymizedAt) continue;
    const since = await desligadoDesde(ctx, { ...r.data, id: r.id });
    if (addMonthsKey(since, years * 12) > today) continue;
    await anonymizeMember.run(ctx, { tenantId: t, memberId: r.id, reason: 'Prazo de retenção encerrado' });
    count++;
  }
  if (count) await ctx.audit('privacy.retention_run', undefined, { anonymized: count });
  return count;
}

registerJobs([
  {
    name: 'retencao_inativos',
    async run(ctx) {
      await runRetention(ctx);
    },
  },
]);

/**
 * Opções do formulário de cadastro (categorias e campos personalizados) para quem não é
 * da diretoria: as configurações completas só a diretoria lê; aqui vai só o necessário.
 */
export const formOptions = defineOp({
  name: 'members.formOptions',
  input: zTenant,
  auth: 'user',
  tenant: { perm: null, allowNonMember: true },
  rateLimit: { per: 'uid', max: 120, windowSec: 3600 },
  async run(ctx) {
    const s = await ctx.store.get<TenantSettings>(P.settings(tid(ctx)));
    return {
      categories: (s?.categories || []).map(c => ({ id: c.id, name: c.name, feeCents: c.feeCents, period: c.period, allowsDependents: c.allowsDependents })),
      customFields: (s?.customFields || []).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options || [], required: f.required, sensitive: f.sensitive })),
      approvalRequired: s?.approvalRequired ?? true,
    };
  },
});

export const privacyOps = [requestPrivacy, myData, resolvePrivacy, formOptions];
