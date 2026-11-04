/** Sócios: proposta, cadastro, aprovação, situação, dados pessoais, importação e exportação. */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { cleanCPF, maskCPF, validateCPF } from '../cpf.ts';
import { addMonthsKey, ageOn, birthMonthDay, localDateKey } from '../dates.ts';
import { canTransition } from '../memberStatus.ts';
import type { ConsentRecord, MemberChangeDoc, MemberDoc, MemberPiiDoc, MemberStatus, MembershipDoc, TenantSettings } from '../types.ts';
import { MEMBER_STATUSES } from '../types.ts';
import { boardUids, bumpMemberStats, getSettings, notify, sendTemplateMail, shortName, tid } from './helpers.ts';
import { upsertMembership } from './access.ts';

export const TERMS_VERSION = '2026-11';

const zAddress = z
  .object({
    street: zText(120).optional(),
    number: zText(20).optional(),
    district: zText(80).optional(),
    city: zText(80).optional(),
    state: zText(2).optional(),
    zip: zText(10).optional(),
  })
  .optional();

const zGuardian = z
  .object({ name: zText(120).min(3), email: z.string().email().max(120).optional(), phone: zText(30).optional(), cpf: zText(20).optional(), consent: z.literal(true) })
  .optional();

const zSocials = z.object({ instagram: zText(120).optional(), facebook: zText(200).optional() }).optional();

const zPersonal = z.object({
  fullName: zText(150).min(3),
  socials: zSocials,
  memberSinceYear: z.number().int().min(1850).max(2100).optional(),
  cpf: zText(20).optional(),
  birthDate: zDateKey.optional(),
  email: z.string().email().max(120).optional().or(z.literal('')),
  phone: zText(30).optional(),
  address: zAddress,
  guardian: zGuardian,
  categoryId: zId,
  custom: z.record(zId, zText(300)).optional(),
});

const zConsents = z.object({ cadastro: z.literal(true), imagem: z.boolean(), comunicacao: z.boolean(), marketing: z.boolean() });

function today(ctx: OpContext): string {
  return localDateKey(ctx.now(), ctx.tenant?.timezone);
}

function buildConsents(ctx: OpContext, c: z.infer<typeof zConsents>): ConsentRecord[] {
  const at = ctx.nowIso;
  return [
    { purpose: 'cadastro', legalBasis: 'execucao_contrato', granted: true, termsVersion: TERMS_VERSION, at },
    { purpose: 'imagem', legalBasis: 'consentimento', granted: c.imagem, termsVersion: TERMS_VERSION, at },
    { purpose: 'comunicacao', legalBasis: 'legitimo_interesse', granted: c.comunicacao, termsVersion: TERMS_VERSION, at },
    { purpose: 'marketing', legalBasis: 'consentimento', granted: c.marketing, termsVersion: TERMS_VERSION, at },
  ];
}

async function cpfFields(ctx: OpContext, cpfRaw: string | undefined, memberId: string) {
  if (!cpfRaw) return {};
  const cpf = cleanCPF(cpfRaw);
  if (!validateCPF(cpf)) fail('invalid-argument', 'CPF inválido.');
  const hmac = await ctx.crypto.hmacHex(`${tid(ctx)}:${cpf}`);
  const idx = await ctx.store.get<{ memberId: string }>(P.cpfIndex(tid(ctx), hmac));
  if (idx && idx.memberId !== memberId) fail('already-exists', 'Já existe um cadastro com este CPF nesta sociedade.');
  return { cpfEnc: await ctx.crypto.encrypt(cpf), cpfHmac: hmac, cpfMasked: maskCPF(cpf) };
}

async function writeCpfIndex(ctx: OpContext, hmac: string | undefined, memberId: string, oldHmac?: string) {
  if (oldHmac && oldHmac !== hmac) await ctx.store.delete(P.cpfIndex(tid(ctx), oldHmac));
  if (hmac) await ctx.store.set(P.cpfIndex(tid(ctx), hmac), { memberId });
}

function validateMinor(ctx: OpContext, birthDate: string | undefined, guardian: unknown): boolean {
  if (!birthDate) return false;
  const minor = ageOn(birthDate, today(ctx)) < 18;
  // LGPD art. 14: dados de crianças e adolescentes com consentimento de um responsável legal
  if (minor && !guardian) fail('invalid-argument', 'Menores de 18 anos precisam de um responsável legal com consentimento.');
  return minor;
}

async function category(settings: TenantSettings, id: string) {
  const c = settings.categories.find(x => x.id === id);
  if (!c) fail('invalid-argument', 'Categoria inexistente.');
  return c!;
}

async function addHistory(ctx: OpContext, memberId: string, from: MemberStatus | null, to: MemberStatus, reason?: string) {
  await ctx.store.add(P.memberHistory(tid(ctx), memberId), { from, to, ...(reason ? { reason } : {}), byUid: ctx.actor?.uid || 'sistema', at: ctx.nowIso });
}

interface CreateArgs {
  data: z.infer<typeof zPersonal>;
  consents: z.infer<typeof zConsents>;
  status: MemberStatus;
  uid?: string;
  dependentOf?: string;
  memberId?: string;
}

export async function createMemberCore(ctx: OpContext, a: CreateArgs): Promise<string> {
  const t = tid(ctx);
  const settings = await getSettings(ctx);
  const cat = await category(settings, a.data.categoryId);
  const memberId = a.memberId || ctx.store.newId();
  const isMinor = validateMinor(ctx, a.data.birthDate, a.data.guardian);
  // Campos extras obrigatórios valem para o titular; o dependente responde pelo cadastro dele
  for (const f of a.dependentOf ? [] : settings.customFields) {
    if (f.required && !a.data.custom?.[f.id]) fail('invalid-argument', `Preencha o campo "${f.label}".`);
  }
  const cpf = await cpfFields(ctx, a.data.cpf, memberId);
  const member: MemberDoc = {
    id: memberId,
    ...(a.uid ? { uid: a.uid } : {}),
    fullName: a.data.fullName,
    displayName: shortName(a.data.fullName),
    categoryId: cat.id,
    categoryName: cat.name,
    status: a.status,
    birthMonthDay: birthMonthDay(a.data.birthDate),
    isMinor,
    ...(a.data.memberSinceYear ? { memberSinceYear: a.data.memberSinceYear } : {}),
    ...(a.dependentOf ? { dependentOf: a.dependentOf } : {}),
    groups: [],
    custom: a.data.custom || {},
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  const pii: MemberPiiDoc = {
    ...cpf,
    ...(a.data.birthDate ? { birthDate: a.data.birthDate } : {}),
    ...(a.data.email ? { email: a.data.email.toLowerCase() } : {}),
    ...(a.data.phone ? { phone: a.data.phone } : {}),
    ...(a.data.socials && (a.data.socials.instagram || a.data.socials.facebook) ? { socials: a.data.socials } : {}),
    ...(a.data.address ? { address: a.data.address } : {}),
    ...(a.data.guardian
      ? {
          guardian: {
            name: a.data.guardian.name,
            ...(a.data.guardian.email ? { email: a.data.guardian.email } : {}),
            ...(a.data.guardian.phone ? { phone: a.data.guardian.phone } : {}),
            ...(a.data.guardian.cpf ? { cpfMasked: maskCPF(a.data.guardian.cpf) } : {}),
            consentAt: ctx.nowIso,
          },
        }
      : {}),
    consents: buildConsents(ctx, a.consents),
    updatedAt: ctx.nowIso,
  };
  await ctx.store.set(P.member(t, memberId), member as unknown as Record<string, unknown>);
  await ctx.store.set(P.memberPii(t, memberId), pii as unknown as Record<string, unknown>);
  await writeCpfIndex(ctx, cpf.cpfHmac, memberId);
  await addHistory(ctx, memberId, null, a.status);
  await bumpMemberStats(ctx, null, a.status);
  return memberId;
}

/** Aprovação: matrícula sequencial, validade pela regra da sociedade e situação inicial */
export async function approveCore(ctx: OpContext, memberId: string, opts: { categoryId?: string; validUntil?: string }): Promise<MemberStatus> {
  const t = tid(ctx);
  const settings = await getSettings(ctx);
  const m = await ctx.store.get<MemberDoc>(P.member(t, memberId));
  if (!m) fail('not-found', 'Sócio não encontrado.');
  if (!['pendente', 'rejeitado', 'desligado'].includes(m!.status)) fail('failed-precondition', 'Este cadastro não está aguardando aprovação.');
  const cat = await category(settings, opts.categoryId || m!.categoryId);
  const to: MemberStatus = cat.feeCents === 0 || cat.period === 'isento' ? 'ativo' : 'aprovado';
  let number = m!.membershipNumber;
  if (!number) {
    number = await ctx.store.runTransaction(async tx => {
      const s = await tx.get<TenantSettings>(P.settings(t));
      const n = s?.nextMembershipNumber || 1;
      tx.update(P.settings(t), { nextMembershipNumber: n + 1 });
      return `${s?.membershipPrefix || ''}${String(n).padStart(4, '0')}`;
    });
  }
  const validUntil = opts.validUntil || addMonthsKey(today(ctx), settings.validityMonths);
  await ctx.store.update(P.member(t, memberId), {
    status: to,
    categoryId: cat.id,
    categoryName: cat.name,
    membershipNumber: number,
    joinedAt: m!.joinedAt || today(ctx),
    validUntil,
    statusReason: '',
    updatedAt: ctx.nowIso,
  });
  await addHistory(ctx, memberId, m!.status, to);
  await bumpMemberStats(ctx, m!.status, to);
  await notify(ctx, m!.uid, 'Cadastro aprovado', 'Sua carteirinha já está disponível no portal.', 'carteirinha');
  const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, memberId));
  await sendTemplateMail(ctx, pii?.email, 'aprovacao', { nome: m!.fullName.split(' ')[0], link: `${ctx.appUrl}/${ctx.tenant!.slug}` }, { subject: 'Cadastro aprovado', body: 'Seu cadastro foi aprovado. {link}' });
  return to;
}

// ---------- Operações ----------

export const applyMember = defineOp({
  name: 'members.apply',
  input: zTenant.extend({ data: zPersonal, consents: zConsents, dependents: z.array(zPersonal).max(10).default([]) }),
  auth: 'user',
  tenant: { perm: null, allowNonMember: true },
  rateLimit: { per: 'uid', max: 5, windowSec: 3600 },
  async run(ctx, input) {
    const actor = ctx.requireActor();
    const t = tid(ctx);
    const existing = await ctx.store.get<MembershipDoc>(P.membership(t, actor.uid));
    if (existing?.memberId) fail('already-exists', 'Você já tem um cadastro nesta sociedade.');
    const settings = await getSettings(ctx);
    const memberId = await createMemberCore(ctx, {
      data: { ...input.data, email: input.data.email || actor.email },
      consents: input.consents,
      status: 'pendente',
      uid: actor.uid,
    });
    await upsertMembership(ctx, ctx.tenant!, actor, ['socio'], memberId);
    const depIds: string[] = [];
    if (input.dependents.length) {
      const cat = settings.categories.find(c => c.id === input.data.categoryId);
      if (cat && !cat.allowsDependents) fail('failed-precondition', `A categoria ${cat.name} não permite dependentes.`);
      // O dependente herda os consentimentos do titular, que responde por ele
      for (const d of input.dependents) depIds.push(await createMemberCore(ctx, { data: d, consents: input.consents, status: 'pendente', dependentOf: memberId }));
    }
    // Sem aprovação exigida, ou quem se cadastra já aprova sócios (diretoria): entra aprovado
    if (!settings.approvalRequired || ctx.can('socios', 'aprovar')) {
      await approveCore(ctx, memberId, {});
      for (const id of depIds) await approveCore(ctx, id, {});
    } else {
      const who = shortName(input.data.fullName);
      for (const uid of await boardUids(ctx)) {
        await notify(ctx, uid, 'Novo cadastro para aprovar', depIds.length ? `${who} e ${depIds.length} dependente(s).` : who, 'socios');
      }
    }
    await ctx.audit('members.applied', memberId, { dependents: depIds.length });
    return { memberId, dependents: depIds.length };
  },
});

export const createMember = defineOp({
  name: 'members.create',
  input: zTenant.extend({ data: zPersonal, consents: zConsents, approve: z.boolean().default(false), inviteEmail: z.boolean().default(false) }),
  auth: 'user',
  tenant: { perm: ['socios', 'criar'] },
  idempotent: true,
  async run(ctx, input) {
    const memberId = await createMemberCore(ctx, { data: input.data, consents: input.consents, status: 'pendente' });
    if (input.approve) {
      ctx.require('socios', 'aprovar');
      await approveCore(ctx, memberId, {});
    }
    let inviteLink: string | undefined;
    if (input.inviteEmail && input.data.email) {
      const { createInviteRecord } = await import('./access.ts');
      const inv = await createInviteRecord(ctx, { email: input.data.email, roleIds: ['socio'], memberId, days: 14 });
      inviteLink = inv.mailStatus === 'enviado' ? undefined : inv.link;
    }
    await ctx.audit('members.created', memberId);
    return { memberId, inviteLink };
  },
});

export const addDependent = defineOp({
  name: 'members.addDependent',
  input: zTenant.extend({ holderId: zId, data: zPersonal, consents: zConsents }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const t = tid(ctx);
    const own = ctx.membership?.memberId === input.holderId;
    if (!own) ctx.require('socios', 'criar');
    const holder = await ctx.store.get<MemberDoc>(P.member(t, input.holderId));
    if (!holder) fail('not-found', 'Titular não encontrado.');
    const settings = await getSettings(ctx);
    const cat = settings.categories.find(c => c.id === holder!.categoryId);
    if (cat && !cat.allowsDependents) fail('failed-precondition', 'A categoria do titular não permite dependentes.');
    const memberId = await createMemberCore(ctx, { data: input.data, consents: input.consents, status: 'pendente', dependentOf: input.holderId });
    await ctx.audit('members.dependent_added', memberId, { holder: input.holderId });
    return { memberId };
  },
});

export const approveMember = defineOp({
  name: 'members.approve',
  input: zTenant.extend({ memberId: zId, categoryId: zId.optional(), validUntil: zDateKey.optional(), withDependents: z.boolean().default(false) }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  idempotent: true,
  async run(ctx, input) {
    const to = await approveCore(ctx, input.memberId, input);
    let dependents = 0;
    if (input.withDependents) {
      const deps = await ctx.store.query<MemberDoc>(P.members(tid(ctx)), { where: [['dependentOf', '==', input.memberId], ['status', '==', 'pendente']], limit: 20 });
      // O dependente vale até a validade do titular
      const holder = await ctx.store.get<MemberDoc>(P.member(tid(ctx), input.memberId));
      for (const d of deps) await approveCore(ctx, d.id, { validUntil: holder?.validUntil });
      dependents = deps.length;
    }
    await ctx.audit('members.approved', input.memberId, { status: to, dependents });
    return { status: to, dependents };
  },
});

export const rejectMember = defineOp({
  name: 'members.requestFix',
  input: zTenant.extend({ memberId: zId, reason: zText(500).min(5) }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    if (m!.status !== 'pendente') fail('failed-precondition', 'Só cadastros pendentes recebem pedido de ajuste.');
    await ctx.store.update(P.member(t, input.memberId), { status: 'rejeitado', statusReason: input.reason, updatedAt: ctx.nowIso });
    await addHistory(ctx, input.memberId, m!.status, 'rejeitado', input.reason);
    await bumpMemberStats(ctx, m!.status, 'rejeitado');
    await notify(ctx, m!.uid, 'Ajuste no cadastro', input.reason, 'inicio');
    const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId));
    await sendTemplateMail(ctx, pii?.email, 'ajuste', { nome: m!.fullName.split(' ')[0], motivo: input.reason, link: `${ctx.appUrl}/${ctx.tenant!.slug}` }, { subject: 'Ajuste no cadastro', body: '{motivo}' });
    await ctx.audit('members.fix_requested', input.memberId);
    return { ok: true };
  },
});

export async function setStatusCore(ctx: OpContext, memberId: string, to: MemberStatus, reason?: string): Promise<boolean> {
  const t = tid(ctx);
  const m = await ctx.store.get<MemberDoc>(P.member(t, memberId));
  if (!m) fail('not-found', 'Sócio não encontrado.');
  if (m!.status === to) return false;
  if (!canTransition(m!.status, to)) fail('failed-precondition', `Não é possível passar de "${m!.status}" para "${to}".`);
  await ctx.store.update(P.member(t, memberId), { status: to, statusReason: reason || '', updatedAt: ctx.nowIso });
  await addHistory(ctx, memberId, m!.status, to, reason);
  await bumpMemberStats(ctx, m!.status, to);
  if (to === 'suspenso') await notify(ctx, m!.uid, 'Carteirinha suspensa', 'Fale com a diretoria para regularizar.', 'financeiro');
  if (to === 'ativo' && m!.status !== 'aprovado') await notify(ctx, m!.uid, 'Carteirinha reativada', 'Sua situação foi regularizada.', 'carteirinha');
  return true;
}

export const setMemberStatus = defineOp({
  name: 'members.setStatus',
  input: zTenant.extend({ memberId: zId, status: z.enum(MEMBER_STATUSES), reason: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  async run(ctx, input) {
    await setStatusCore(ctx, input.memberId, input.status, input.reason);
    await ctx.audit('members.status_changed', input.memberId, { to: input.status });
    return { ok: true };
  },
});

export const renewMember = defineOp({
  name: 'members.renew',
  input: zTenant.extend({ memberId: zId, months: z.number().int().min(1).max(120).optional() }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const settings = await getSettings(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    const base = m!.validUntil && m!.validUntil > today(ctx) ? m!.validUntil : today(ctx);
    const validUntil = addMonthsKey(base, input.months || settings.validityMonths);
    await ctx.store.update(P.member(t, input.memberId), { validUntil, updatedAt: ctx.nowIso });
    await notify(ctx, m!.uid, 'Carteirinha renovada', `Nova validade: ${validUntil.split('-').reverse().join('/')}.`, 'carteirinha');
    await ctx.audit('members.renewed', input.memberId, { validUntil });
    return { validUntil };
  },
});

export const updateMember = defineOp({
  name: 'members.update',
  input: zTenant.extend({
    memberId: zId,
    data: zPersonal.partial().extend({ groups: z.array(zText(40)).max(20).optional() }),
  }),
  auth: 'user',
  tenant: { perm: ['socios', 'editar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    const pii = (await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId))) || ({ consents: [] } as unknown as MemberPiiDoc);
    const d = input.data;
    const basic: Record<string, unknown> = { updatedAt: ctx.nowIso };
    if (d.fullName) Object.assign(basic, { fullName: d.fullName, displayName: shortName(d.fullName) });
    if (d.categoryId) {
      const cat = await category(await getSettings(ctx), d.categoryId);
      Object.assign(basic, { categoryId: cat.id, categoryName: cat.name });
    }
    if (d.groups) basic.groups = d.groups;
    if (d.custom) basic.custom = d.custom;
    if (d.memberSinceYear) basic.memberSinceYear = d.memberSinceYear;
    if (d.birthDate) Object.assign(basic, { birthMonthDay: birthMonthDay(d.birthDate), isMinor: validateMinor(ctx, d.birthDate, d.guardian || pii.guardian) });
    const piiPatch: Record<string, unknown> = { updatedAt: ctx.nowIso };
    if (d.cpf !== undefined) {
      const c = await cpfFields(ctx, d.cpf, input.memberId);
      Object.assign(piiPatch, c);
      await writeCpfIndex(ctx, c.cpfHmac, input.memberId, pii.cpfHmac);
    }
    for (const k of ['birthDate', 'email', 'phone', 'address'] as const) if (d[k] !== undefined) piiPatch[k] = d[k];
    await ctx.store.update(P.member(t, input.memberId), basic);
    await ctx.store.set(P.memberPii(t, input.memberId), piiPatch, { merge: true });
    await ctx.audit('members.updated', input.memberId, { fields: [...Object.keys(basic), ...Object.keys(piiPatch)].join(',') });
    return { ok: true };
  },
});

/** O próprio sócio: contato e consentimentos sempre; identificação só enquanto não aprovado */
export const updateSelf = defineOp({
  name: 'members.updateSelf',
  input: zTenant.extend({
    memberId: zId,
    phone: zText(30).optional(),
    socials: zSocials,
    address: zAddress,
    consents: zConsents.partial().omit({ cadastro: true }).optional(),
    fullName: zText(150).min(3).optional(),
    birthDate: zDateKey.optional(),
    cpf: zText(20).optional(),
    resubmit: z.boolean().optional(),
  }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Cadastro não encontrado.');
    const own = m!.uid === ctx.actor?.uid || (m!.dependentOf && m!.dependentOf === ctx.membership?.memberId);
    if (!own) fail('permission-denied', 'Você só pode alterar o seu cadastro.');
    const editableIdentity = ['pendente', 'rejeitado'].includes(m!.status);
    if ((input.fullName || input.birthDate || input.cpf) && !editableIdentity) {
      fail('failed-precondition', 'Com o cadastro aprovado, nome, nascimento e CPF só mudam pela secretaria.');
    }
    const pii = (await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId))) || ({ consents: [] } as unknown as MemberPiiDoc);
    const piiPatch: Record<string, unknown> = { updatedAt: ctx.nowIso };
    if (input.phone !== undefined) piiPatch.phone = input.phone;
    if (input.socials !== undefined) piiPatch.socials = input.socials;
    if (input.address !== undefined) piiPatch.address = input.address;
    if (input.birthDate) piiPatch.birthDate = input.birthDate;
    if (input.cpf) {
      const c = await cpfFields(ctx, input.cpf, input.memberId);
      Object.assign(piiPatch, c);
      await writeCpfIndex(ctx, c.cpfHmac, input.memberId, pii.cpfHmac);
    }
    if (input.consents) {
      const next = [...(pii.consents || [])];
      for (const [purpose, granted] of Object.entries(input.consents)) {
        if (granted === undefined) continue;
        next.push({ purpose: purpose as ConsentRecord['purpose'], legalBasis: purpose === 'comunicacao' ? 'legitimo_interesse' : 'consentimento', granted, termsVersion: TERMS_VERSION, at: ctx.nowIso });
      }
      piiPatch.consents = next;
    }
    await ctx.store.set(P.memberPii(t, input.memberId), piiPatch, { merge: true });
    const basic: Record<string, unknown> = { updatedAt: ctx.nowIso };
    if (input.fullName) Object.assign(basic, { fullName: input.fullName, displayName: shortName(input.fullName) });
    if (input.birthDate) basic.birthMonthDay = birthMonthDay(input.birthDate);
    if (input.resubmit && m!.status === 'rejeitado') {
      basic.status = 'pendente';
      basic.statusReason = '';
      await addHistory(ctx, input.memberId, 'rejeitado', 'pendente', 'Correção enviada pelo sócio');
      await bumpMemberStats(ctx, 'rejeitado', 'pendente');
    }
    await ctx.store.update(P.member(t, input.memberId), basic);
    await ctx.audit('members.self_updated', input.memberId);
    return { ok: true };
  },
});

/** Depois de aprovado: nome, nascimento, CPF ou a saída de um dependente viram pedido para a diretoria aprovar */
export const requestChange = defineOp({
  name: 'members.requestChange',
  input: zTenant.extend({
    memberId: zId,
    kind: z.enum(['dados', 'remover']),
    fullName: zText(150).min(3).optional(),
    birthDate: zDateKey.optional(),
    cpf: zText(20).optional(),
    note: zText(300).optional(),
  }),
  auth: 'user',
  tenant: { perm: null },
  rateLimit: { per: 'uid', max: 10, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Cadastro não encontrado.');
    const own = m!.uid === ctx.actor?.uid || (m!.dependentOf && m!.dependentOf === ctx.membership?.memberId);
    if (!own) fail('permission-denied', 'Você só pode pedir alteração do seu cadastro ou dos seus dependentes.');
    if (['pendente', 'rejeitado'].includes(m!.status)) fail('failed-precondition', 'Este cadastro ainda está em análise: corrija direto no formulário.');
    if (m!.status === 'desligado') fail('failed-precondition', 'Este cadastro está desligado.');
    if (m!.changePending) fail('failed-precondition', 'Já existe um pedido de alteração esperando a diretoria.');
    if (input.kind === 'remover' && !m!.dependentOf) fail('failed-precondition', 'Só dependentes podem ser retirados por pedido. Para sair, fale com a diretoria.');
    const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId));
    const change: Record<string, unknown> = {
      kind: input.kind,
      before: { fullName: m!.fullName, ...(pii?.birthDate ? { birthDate: pii.birthDate } : {}), ...(pii?.cpfMasked ? { cpfMasked: pii.cpfMasked } : {}) },
      status: 'pendente',
      byUid: ctx.actor!.uid,
      at: ctx.nowIso,
      ...(input.note ? { note: input.note } : {}),
    };
    if (input.kind === 'dados') {
      if (input.fullName && input.fullName !== m!.fullName) change.fullName = input.fullName;
      if (input.birthDate && input.birthDate !== pii?.birthDate) change.birthDate = input.birthDate;
      if (input.cpf) {
        const c = await cpfFields(ctx, input.cpf, input.memberId);
        if (c.cpfHmac !== pii?.cpfHmac) Object.assign(change, { cpfEnc: c.cpfEnc, cpfMasked: c.cpfMasked });
      }
      if (!change.fullName && !change.birthDate && !change.cpfEnc) fail('invalid-argument', 'Nada mudou em relação ao cadastro atual.');
    }
    const id = await ctx.store.add(P.memberChanges(t, input.memberId), change);
    await ctx.store.update(P.member(t, input.memberId), { changePending: true, updatedAt: ctx.nowIso });
    const title = input.kind === 'remover' ? 'Pedido para retirar dependente' : 'Pedido de alteração de cadastro';
    for (const uid of await boardUids(ctx)) await notify(ctx, uid, title, m!.displayName, 'socios');
    await ctx.audit('members.change_requested', input.memberId, { kind: input.kind });
    return { changeId: id };
  },
});

export const reviewChange = defineOp({
  name: 'members.reviewChange',
  input: zTenant.extend({ memberId: zId, changeId: zId, approve: z.boolean(), reason: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    const c = await ctx.store.get<MemberChangeDoc>(P.memberChange(t, input.memberId, input.changeId));
    if (!m || !c) fail('not-found', 'Pedido não encontrado.');
    if (c!.status !== 'pendente') fail('failed-precondition', 'Este pedido já foi decidido.');
    if (!input.approve && !input.reason?.trim()) fail('invalid-argument', 'Explique ao sócio por que o pedido foi recusado.');
    if (input.approve) {
      if (c!.kind === 'remover') {
        await setStatusCore(ctx, input.memberId, 'desligado', 'Retirado a pedido do titular');
      } else {
        const basic: Record<string, unknown> = {};
        const piiPatch: Record<string, unknown> = { updatedAt: ctx.nowIso };
        if (c!.fullName) Object.assign(basic, { fullName: c!.fullName, displayName: shortName(c!.fullName) });
        if (c!.birthDate) {
          piiPatch.birthDate = c!.birthDate;
          basic.birthMonthDay = birthMonthDay(c!.birthDate);
          basic.isMinor = ageOn(c!.birthDate, today(ctx)) < 18;
        }
        if (c!.cpfEnc) {
          const old = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId));
          // Confere de novo: outro cadastro pode ter usado o CPF enquanto o pedido esperava
          const f = await cpfFields(ctx, await ctx.crypto.decrypt(c!.cpfEnc), input.memberId);
          Object.assign(piiPatch, f);
          await writeCpfIndex(ctx, f.cpfHmac, input.memberId, old?.cpfHmac);
        }
        if (Object.keys(basic).length) await ctx.store.update(P.member(t, input.memberId), basic);
        await ctx.store.set(P.memberPii(t, input.memberId), piiPatch, { merge: true });
      }
    }
    await ctx.store.update(P.memberChange(t, input.memberId, input.changeId), {
      status: input.approve ? 'aprovado' : 'recusado',
      decidedBy: ctx.actor!.uid,
      decidedAt: ctx.nowIso,
      cpfEnc: '',
      ...(input.reason ? { reason: input.reason } : {}),
    });
    await ctx.store.update(P.member(t, input.memberId), { changePending: false, updatedAt: ctx.nowIso });
    const to = m!.uid || c!.byUid;
    await notify(ctx, to, input.approve ? 'Alteração aprovada' : 'Alteração não aprovada', input.approve ? 'O seu cadastro já está atualizado.' : input.reason!, 'perfil');
    await ctx.audit(input.approve ? 'members.change_approved' : 'members.change_rejected', input.memberId, { kind: c!.kind });
    return { ok: true };
  },
});

export const setPhoto = defineOp({
  name: 'members.setPhoto',
  input: zTenant.extend({ memberId: zId, path: z.string().max(300) }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Cadastro não encontrado.');
    const own = m!.uid === ctx.actor?.uid || (m!.dependentOf && m!.dependentOf === ctx.membership?.memberId);
    if (!own) ctx.require('socios', 'editar');
    const prefix = `tenants/${t}/members/${input.memberId}/photo/`;
    if (!input.path.startsWith(prefix) || input.path.includes('..')) fail('invalid-argument', 'Caminho de foto inválido.');
    if (m!.photoPath && m!.photoPath !== input.path) await ctx.files.remove(m!.photoPath).catch(() => undefined);
    await ctx.store.update(P.member(t, input.memberId), { photoPath: input.path, updatedAt: ctx.nowIso });
    return { ok: true };
  },
});

export const getPii = defineOp({
  name: 'members.getPii',
  input: zTenant.extend({ memberId: zId, revealCpf: z.boolean().default(false) }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Cadastro não encontrado.');
    const own = m!.uid === ctx.actor?.uid || (m!.dependentOf && m!.dependentOf === ctx.membership?.memberId);
    if (!own) ctx.require('pii', 'ver');
    const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId));
    if (!pii) return null;
    let cpf: string | undefined;
    if (input.revealCpf && pii.cpfEnc) {
      cpf = await ctx.crypto.decrypt(pii.cpfEnc);
      // Revelar CPF de terceiros sempre gera auditoria
      if (!own) await ctx.audit('pii.cpf_revealed', input.memberId);
    }
    if (!own) await ctx.audit('pii.viewed', input.memberId);
    const { cpfEnc: _e, cpfHmac: _h, ...safe } = pii;
    void _e;
    void _h;
    return { ...safe, ...(cpf ? { cpf } : {}) };
  },
});

const zImportRow = z.object({
  fullName: zText(150).min(3),
  cpf: zText(20).optional(),
  email: z.string().email().max(120).optional().or(z.literal('')),
  phone: zText(30).optional(),
  birthDate: zDateKey.optional().or(z.literal('')),
  categoryName: zText(60).optional(),
  membershipNumber: zText(30).optional(),
  status: z.enum(['pendente', 'ativo']).optional(),
});

export const importMembers = defineOp({
  name: 'members.import',
  input: zTenant.extend({ rows: z.array(zImportRow).min(1).max(2000), commit: z.boolean() }),
  auth: 'user',
  tenant: { perm: ['socios', 'criar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const settings = await getSettings(ctx);
    const seenCpf = new Set<string>();
    const seenEmail = new Set<string>();
    const preview: { row: number; fullName: string; problem: string; action: 'criar' | 'ignorar' }[] = [];
    let created = 0;
    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i];
      let problem = '';
      const cpf = r.cpf ? cleanCPF(r.cpf) : '';
      if (cpf && !validateCPF(cpf)) problem = 'CPF inválido';
      if (!problem && cpf) {
        if (seenCpf.has(cpf)) problem = 'CPF repetido na planilha';
        const hmac = await ctx.crypto.hmacHex(`${t}:${cpf}`);
        if (!problem && (await ctx.store.get(P.cpfIndex(t, hmac)))) problem = 'Já cadastrado (CPF)';
        seenCpf.add(cpf);
      }
      const email = (r.email || '').toLowerCase();
      if (!problem && email) {
        if (seenEmail.has(email)) problem = 'E-mail repetido na planilha';
        seenEmail.add(email);
      }
      const cat = settings.categories.find(c => c.name.toLowerCase() === (r.categoryName || '').toLowerCase()) || settings.categories[0];
      preview.push({ row: i + 1, fullName: r.fullName, problem, action: problem ? 'ignorar' : 'criar' });
      if (input.commit && !problem) {
        const memberId = await createMemberCore(ctx, {
          data: { fullName: r.fullName, cpf: cpf || undefined, email, phone: r.phone, birthDate: r.birthDate || undefined, categoryId: cat.id },
          consents: { cadastro: true, imagem: false, comunicacao: true, marketing: false },
          status: 'pendente',
        });
        if (r.status === 'ativo') await approveCore(ctx, memberId, {});
        if (r.membershipNumber) await ctx.store.update(P.member(t, memberId), { membershipNumber: r.membershipNumber });
        created++;
      }
    }
    if (input.commit) await ctx.audit('members.imported', undefined, { created, rows: input.rows.length });
    return { preview, created };
  },
});

export const exportMembers = defineOp({
  name: 'members.export',
  input: zTenant.extend({ includeContacts: z.boolean().default(false), includeCpf: z.boolean().default(false), purpose: zText(200).min(5) }),
  auth: 'user',
  tenant: { perm: ['socios', 'exportar'] },
  rateLimit: { per: 'uid', max: 10, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    if (input.includeCpf || input.includeContacts) ctx.require('pii', 'ver');
    const rows = await ctx.store.query<MemberDoc>(P.members(t), { orderBy: [['fullName', 'asc']], limit: 5000 });
    const out = [];
    for (const r of rows) {
      const m = r.data;
      const base: Record<string, string> = {
        matricula: m.membershipNumber || '',
        nome: m.fullName,
        categoria: m.categoryName,
        situacao: m.status,
        validade: m.validUntil || '',
        entrada: m.joinedAt || '',
      };
      if (input.includeContacts || input.includeCpf) {
        const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, r.id));
        if (input.includeContacts) Object.assign(base, { email: pii?.email || '', telefone: pii?.phone || '' });
        base.cpf = input.includeCpf && pii?.cpfEnc ? await ctx.crypto.decrypt(pii.cpfEnc) : pii?.cpfMasked || '';
      }
      out.push(base);
    }
    await ctx.audit('members.exported', undefined, { rows: out.length, cpf: input.includeCpf, contatos: input.includeContacts, finalidade: input.purpose.slice(0, 80) });
    return { rows: out };
  },
});

/** Desligamento com anonimização (respeita retenção legal de financeiro e atas, que guardam só ids) */
export const anonymizeMember = defineOp({
  name: 'members.anonymize',
  input: zTenant.extend({ memberId: zId, reason: zText(300).min(5) }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId));
    if (pii?.cpfHmac) await ctx.store.delete(P.cpfIndex(t, pii.cpfHmac));
    await ctx.store.delete(P.memberPii(t, input.memberId));
    if (m!.photoPath) await ctx.files.remove(m!.photoPath).catch(() => undefined);
    await ctx.store.update(P.member(t, input.memberId), {
      fullName: `Ex-sócio ${m!.membershipNumber || input.memberId.slice(0, 6)}`,
      displayName: 'Ex-sócio',
      status: 'desligado',
      statusReason: '',
      photoPath: '',
      birthMonthDay: '',
      custom: {},
      anonymizedAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    });
    if (m!.status !== 'desligado') await bumpMemberStats(ctx, m!.status, 'desligado');
    await addHistory(ctx, input.memberId, m!.status, 'desligado', 'Anonimizado');
    if (m!.uid) {
      const ms = await ctx.store.get<MembershipDoc>(P.membership(t, m!.uid));
      if (ms && !ms.board) await ctx.store.delete(P.membership(t, m!.uid));
    }
    await ctx.audit('members.anonymized', input.memberId);
    return { ok: true };
  },
});

export const memberOps = [
  applyMember,
  createMember,
  addDependent,
  approveMember,
  rejectMember,
  setMemberStatus,
  renewMember,
  updateMember,
  updateSelf,
  requestChange,
  reviewChange,
  setPhoto,
  getPii,
  importMembers,
  exportMembers,
  anonymizeMember,
];
