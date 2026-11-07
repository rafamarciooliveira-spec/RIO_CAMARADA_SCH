/** Sociedade, identidade visual, papéis, convites e vínculos de acesso. */
import { z } from 'zod';
import { defineOp, fail, zColor, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { deleteField } from '../core/store.ts';
import { P } from '../paths.ts';
import { ACTIONS, MODULE_IDS, can, type Perms } from '../modules.ts';
import type { InviteDoc, MembershipDoc, RoleDoc, TenantDoc, UserDoc } from '../types.ts';
import { notify, permsForRoles, refreshMembershipsForRole, sendTemplateMail, tid } from './helpers.ts';
import { formatDateTime } from '../dates.ts';

// ---------- vínculo users/{uid} (seletor de sociedade) ----------
export async function linkUserTenant(ctx: OpContext, uid: string, email: string, displayName: string, tenant: TenantDoc, add: boolean) {
  const cur = await ctx.store.get<UserDoc>(P.user(uid));
  const tenants = { ...(cur?.tenants || {}) };
  if (add) tenants[tenant.id] = { name: tenant.name, slug: tenant.slug };
  else delete tenants[tenant.id];
  await ctx.store.set(P.user(uid), { uid, email, displayName: displayName || cur?.displayName || '', tenants, updatedAt: ctx.nowIso });
}

export async function upsertMembership(
  ctx: OpContext,
  tenant: TenantDoc,
  who: { uid: string; email: string; displayName: string },
  roleIds: string[],
  memberId?: string
): Promise<MembershipDoc> {
  const path = P.membership(tenant.id, who.uid);
  const cur = await ctx.store.get<MembershipDoc>(path);
  const ids = [...new Set([...(cur?.active ? cur.roleIds : []), ...roleIds])];
  const { perms, board } = await permsForRoles(ctx, tenant.id, ids);
  const doc: MembershipDoc = {
    uid: who.uid,
    email: who.email.toLowerCase(),
    displayName: who.displayName || cur?.displayName || '',
    roleIds: ids,
    perms,
    board,
    ...(memberId || cur?.memberId ? { memberId: memberId || cur?.memberId } : {}),
    active: true,
    createdAt: cur?.createdAt || ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  await ctx.store.set(path, doc as unknown as Record<string, unknown>);
  await linkUserTenant(ctx, who.uid, who.email, who.displayName, tenant, true);
  return doc;
}

// ---------- Sociedade ----------
const zBranding = z.object({
  logoUrl: z.string().max(600),
  faviconUrl: z.string().max(600).optional(),
  coverUrl: z.string().max(600).optional(),
  primaryColor: zColor,
  secondaryColor: zColor,
  accentColor: zColor,
  textColor: zColor,
  fontFamily: z.enum(['Inter', 'Merriweather', 'Playfair Display', 'Montserrat', 'Lora']),
  theme: z.enum(['escuro', 'claro']),
});

export const updateTenant = defineOp({
  name: 'tenant.update',
  input: zTenant.extend({
    name: zText(120).min(3).optional(),
    shortName: zText(40).optional(),
    branding: zBranding.optional(),
    labels: z.object({ member: zText(30), members: zText(30), fee: zText(30), board: zText(30), card: zText(30) }).optional(),
    publicPage: z
      .object({
        enabled: z.boolean(),
        about: zText(3000),
        history: zText(6000),
        city: zText(80),
        foundedYear: z.number().int().min(1500).max(2100).optional(),
        socials: z.object({ instagram: zText(200).optional(), facebook: zText(200).optional(), site: zText(200).optional(), whatsapp: zText(40).optional() }),
        contactEmail: z.string().email().max(120).optional().or(z.literal('')),
      })
      .optional(),
    loginMethods: z.object({ google: z.literal(true), emailLink: z.boolean() }).optional(),
    timezone: z.string().max(60).optional(),
    societyType: z.string().max(40).optional(),
    region: z.object({ city: zText(80), state: z.string().max(2) }).optional(),
    legal: z
      .object({
        legalName: zText(160).optional(),
        cnpj: z.string().max(20).regex(/^[0-9./-]*$/, 'CNPJ só com números, ponto, barra e traço').optional(),
        address: zText(200).optional(),
        cityState: zText(80).optional(),
        cep: z.string().max(10).regex(/^[0-9-]*$/, 'CEP só com números e traço').optional(),
      })
      .optional(),
    modules: z.record(z.string(), z.boolean()).optional(),
  }),
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  async run(ctx, input) {
    const patch: Record<string, unknown> = { updatedAt: ctx.nowIso };
    for (const k of ['name', 'shortName', 'branding', 'labels', 'publicPage', 'loginMethods', 'timezone', 'societyType', 'region', 'legal'] as const) {
      if (input[k] !== undefined) patch[k] = input[k];
    }
    if (input.modules) {
      const plan = await ctx.store.get<{ modules: string[] }>(P.plan(ctx.tenant!.planId));
      for (const [k, v] of Object.entries(input.modules)) {
        if (!MODULE_IDS.includes(k as never)) continue;
        if (v && plan && !plan.modules.includes(k)) fail('failed-precondition', 'Este módulo não faz parte do plano da sociedade.');
        patch[`modules.${k}`] = v;
      }
    }
    await ctx.store.update(P.tenant(tid(ctx)), patch);
    await ctx.audit('tenant.updated', tid(ctx), { fields: Object.keys(patch).join(',') });
    return { ok: true };
  },
});

export const updateSettings = defineOp({
  name: 'tenant.updateSettings',
  input: zTenant.extend({
    settings: z
      .object({
        categories: z
          .array(
            z.object({
              id: zId,
              name: zText(60).min(2),
              feeCents: z.number().int().min(0),
              period: z.enum(['mensal', 'trimestral', 'semestral', 'anual', 'isento']),
              allowsDependents: z.boolean(),
            })
          )
          .max(30),
        customFields: z
          .array(
            z.object({
              id: zId,
              label: zText(60).min(1),
              type: z.enum(['texto', 'numero', 'data', 'opcao']),
              options: z.array(zText(60)).max(30).optional(),
              required: z.boolean(),
              sensitive: z.boolean(),
            })
          )
          .max(30),
        membershipPrefix: zText(10),
        validityMonths: z.number().int().min(1).max(120),
        approvalRequired: z.boolean(),
        gracePeriodDays: z.number().int().min(0).max(120),
        suspendAfterDays: z.number().int().min(1).max(365),
        lateFeeBps: z.number().int().min(0).max(200), // multa máxima de 2% (CDC)
        interestBpsMonth: z.number().int().min(0).max(100), // juros até 1% a.m.
        dueDay: z.number().int().min(1).max(28),
        pixKey: zText(120).optional(),
        doubleApprovalAboveCents: z.number().int().min(0),
        showPhotoOnValidation: z.boolean(),
        cardRequiresPhoto: z.boolean(),
        cardDownloadValidity: z.enum(['24h', 'mes', 'ano']),
        showMembershipNumber: z.boolean(),
        memberMenuHidden: z.array(zId).max(40),
        modalities: z.array(zText(60).min(1)).max(40),
        competitionKinds: z.array(zText(60).min(1)).max(40),
        dependentRules: z.object({
          mode: z.enum(['gratis', 'valor_fixo', 'categoria']),
          feeCents: z.number().int().min(0).max(10_000_00),
          freeUntilAge: z.number().int().min(0).max(30),
          maxAge: z.number().int().min(0).max(99),
          familyCapCents: z.number().int().min(0).max(100_000_00),
        }),
        retentionYears: z.object({ financeiro: z.number().int().min(5).max(99), atas: z.number().int().min(5).max(99), inativos: z.number().int().min(1).max(99) }),
        emailTemplates: z.record(z.string().max(40), z.object({ subject: zText(200), body: zText(4000) })),
        activeCardTemplateId: zId,
        memberInvite: z.object({ enabled: z.boolean(), title: zText(60).min(2), intro: zText(400).min(5), closing: zText(200), showQr: z.boolean() }),
      })
      .partial(),
  }),
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  async run(ctx, input) {
    const s = input.settings;
    const finance = ['lateFeeBps', 'interestBpsMonth', 'dueDay', 'pixKey', 'doubleApprovalAboveCents'] as const;
    if (finance.some(k => s[k] !== undefined)) ctx.require('financeiro', 'editar');
    await ctx.store.set(P.settings(tid(ctx)), { ...s, updatedAt: ctx.nowIso }, { merge: true });
    await ctx.audit('tenant.settings_updated', tid(ctx), { fields: Object.keys(s).join(',') });
    return { ok: true };
  },
});

// ---------- Papéis ----------
const zPerms = z.record(z.string(), z.array(z.enum(ACTIONS)));

export const saveRole = defineOp({
  name: 'roles.save',
  input: zTenant.extend({ id: zId.optional(), name: zText(60).min(2), perms: zPerms, board: z.boolean() }),
  auth: 'user',
  tenant: { perm: ['papeis', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const perms: Perms = {};
    for (const [m, a] of Object.entries(input.perms)) if (MODULE_IDS.includes(m as never)) perms[m as keyof Perms] = a;
    const id = input.id || `p_${ctx.store.newId()}`;
    const cur = await ctx.store.get<RoleDoc>(P.role(t, id));
    // Garante que nenhum papel de sistema perca a gestão de papéis por engano (evita travar a sociedade)
    if (cur?.system && (id === 'presidente') && !can(perms, 'papeis', 'aprovar')) {
      fail('failed-precondition', 'O papel de presidente precisa manter a gestão de papéis.');
    }
    await ctx.store.set(P.role(t, id), { id, name: input.name, perms, board: input.board, system: cur?.system || false, updatedAt: ctx.nowIso });
    await refreshMembershipsForRole(ctx, t, id);
    await ctx.audit('roles.saved', id);
    return { id };
  },
});

export const deleteRole = defineOp({
  name: 'roles.delete',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: ['papeis', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const role = await ctx.store.get<RoleDoc>(P.role(t, input.id));
    if (!role) fail('not-found', 'Papel não encontrado.');
    if (role!.system) fail('failed-precondition', 'Papéis padrão não podem ser apagados.');
    const used = await ctx.store.count(P.memberships(t), { where: [['roleIds', 'array-contains', input.id]] });
    if (used > 0) fail('failed-precondition', 'Há pessoas com este papel. Troque o papel delas antes.');
    await ctx.store.delete(P.role(t, input.id));
    await ctx.audit('roles.deleted', input.id);
    return { ok: true };
  },
});

// ---------- Convites ----------
export async function createInviteRecord(
  ctx: OpContext,
  opts: { email: string; roleIds: string[]; memberId?: string; days?: number }
): Promise<{ id: string; link: string; expiresAt: string; mailStatus: string }> {
  const t = tid(ctx);
  const token = ctx.crypto.randomToken(32);
  const id = ctx.store.newId();
  const expiresAt = new Date(ctx.now().getTime() + (opts.days || 7) * 86400_000).toISOString();
  const inv: InviteDoc = {
    id,
    emailLower: opts.email.trim().toLowerCase(),
    roleIds: opts.roleIds,
    ...(opts.memberId ? { memberId: opts.memberId } : {}),
    tokenHash: await ctx.crypto.sha256Hex(token),
    expiresAt,
    createdBy: ctx.actor?.uid || 'sistema',
    createdAt: ctx.nowIso,
  };
  await ctx.store.set(P.invite(t, id), inv as unknown as Record<string, unknown>);
  const link = `${ctx.appUrl}/${ctx.tenant!.slug}/convite?i=${id}&t=${token}`;
  const roles = await Promise.all(opts.roleIds.map(r => ctx.store.get<RoleDoc>(P.role(t, r))));
  const mailStatus = await sendTemplateMail(
    ctx,
    inv.emailLower,
    'convite',
    { papel: roles.map(r => r?.name || '').join(', '), link, validade: formatDateTime(expiresAt, ctx.tenant?.timezone) },
    { subject: 'Convite para acessar {sociedade}', body: 'Abra o link para aceitar: {link}' }
  );
  await ctx.audit('invites.created', id, { roles: opts.roleIds.join(',') });
  return { id, link, expiresAt, mailStatus };
}

export const createInvite = defineOp({
  name: 'invites.create',
  input: zTenant.extend({ email: z.string().email().max(120), roleIds: z.array(zId).min(1).max(5), memberId: zId.optional(), days: z.number().int().min(1).max(30).optional() }),
  auth: 'user',
  tenant: { perm: ['papeis', 'criar'] },
  rateLimit: { per: 'uid', max: 100, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const { board } = await permsForRoles(ctx, t, input.roleIds);
    // Papéis da diretoria exigem quem pode aprovar papéis
    if (board) ctx.require('papeis', 'aprovar');
    const r = await createInviteRecord(ctx, input);
    // O link só volta para quem convidou quando o e-mail não saiu de verdade (ex.: emulador)
    return { id: r.id, expiresAt: r.expiresAt, mailStatus: r.mailStatus, link: r.mailStatus === 'enviado' ? undefined : r.link };
  },
});

export const revokeInvite = defineOp({
  name: 'invites.revoke',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: ['papeis', 'criar'] },
  async run(ctx, input) {
    await ctx.store.update(P.invite(tid(ctx), input.id), { revokedAt: ctx.nowIso });
    await ctx.audit('invites.revoked', input.id);
    return { ok: true };
  },
});

export const acceptInvite = defineOp({
  name: 'invites.accept',
  input: zTenant.extend({ inviteId: zId, token: z.string().min(20).max(200) }),
  auth: 'user',
  tenant: { perm: null, allowNonMember: true },
  rateLimit: { per: 'uid', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    const actor = ctx.requireActor();
    const t = tid(ctx);
    const inv = await ctx.store.get<InviteDoc>(P.invite(t, input.inviteId));
    if (!inv) fail('not-found', 'Convite inválido.');
    if (inv!.revokedAt) fail('failed-precondition', 'Este convite foi cancelado.');
    if (inv!.usedAt) fail('failed-precondition', 'Este convite já foi usado.');
    if (Date.parse(inv!.expiresAt) < ctx.now().getTime()) fail('failed-precondition', 'Este convite expirou. Peça um novo.');
    if ((await ctx.crypto.sha256Hex(input.token)) !== inv!.tokenHash) fail('permission-denied', 'Convite inválido.');
    if (actor.email.toLowerCase() !== inv!.emailLower) fail('permission-denied', `Este convite é para outro e-mail. Entre com ${inv!.emailLower.replace(/(.{2}).*(@.*)/, '$1***$2')}.`);
    await ctx.store.runTransaction(async tx => {
      const cur = await tx.get<InviteDoc>(P.invite(t, input.inviteId));
      if (cur?.usedAt) fail('failed-precondition', 'Este convite já foi usado.');
      tx.update(P.invite(t, input.inviteId), { usedAt: ctx.nowIso, usedBy: actor.uid });
    });
    const m = await upsertMembership(ctx, ctx.tenant!, actor, inv!.roleIds, inv!.memberId);
    if (inv!.memberId) await ctx.store.update(P.member(t, inv!.memberId), { uid: actor.uid, updatedAt: ctx.nowIso });
    await ctx.audit('invites.accepted', input.inviteId);
    return { ok: true, board: m.board };
  },
});

// ---------- Vínculos ----------
export async function assertKeepsAnAdmin(ctx: OpContext, t: string, changingUid: string, newRoleIds: string[] | null) {
  const all = await ctx.store.query<MembershipDoc>(P.memberships(t), { where: [['active', '==', true]] });
  const keeps = [] as boolean[];
  for (const m of all) {
    if (m.data.support) continue;
    if (m.id === changingUid) {
      if (!newRoleIds) continue;
      const { perms } = await permsForRoles(ctx, t, newRoleIds);
      keeps.push(can(perms, 'papeis', 'aprovar'));
    } else keeps.push(can(m.data.perms, 'papeis', 'aprovar'));
  }
  if (!keeps.some(Boolean)) fail('failed-precondition', 'A sociedade precisa de pelo menos uma pessoa que gerencie papéis.');
}

export const setMembershipRoles = defineOp({
  name: 'memberships.setRoles',
  input: zTenant.extend({ uid: zId, roleIds: z.array(zId).min(1).max(5) }),
  auth: 'user',
  tenant: { perm: ['papeis', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const cur = await ctx.store.get<MembershipDoc>(P.membership(t, input.uid));
    if (!cur) fail('not-found', 'Pessoa não encontrada.');
    await assertKeepsAnAdmin(ctx, t, input.uid, input.roleIds);
    const { perms, board } = await permsForRoles(ctx, t, input.roleIds);
    await ctx.store.update(P.membership(t, input.uid), { roleIds: input.roleIds, perms, board, active: true, updatedAt: ctx.nowIso });
    await notify(ctx, input.uid, 'Seu acesso foi atualizado', 'Seus papéis na sociedade mudaram.');
    await ctx.audit('memberships.roles_changed', input.uid, { roles: input.roleIds.join(',') });
    return { ok: true };
  },
});

export const revokeMembership = defineOp({
  name: 'memberships.revoke',
  input: zTenant.extend({ uid: zId }),
  auth: 'user',
  tenant: { perm: ['papeis', 'aprovar'] },
  async run(ctx, input) {
    const t = tid(ctx);
    const cur = await ctx.store.get<MembershipDoc>(P.membership(t, input.uid));
    if (!cur) fail('not-found', 'Pessoa não encontrada.');
    await assertKeepsAnAdmin(ctx, t, input.uid, null);
    // Mantém o vínculo de sócio (memberId) com papel "socio"; tira só os papéis de gestão
    const keepAsMember = !!cur!.memberId;
    if (keepAsMember) {
      const { perms, board } = await permsForRoles(ctx, t, ['socio']);
      await ctx.store.update(P.membership(t, input.uid), { roleIds: ['socio'], perms, board, updatedAt: ctx.nowIso, support: deleteField(), expiresAtMs: deleteField() });
    } else {
      await ctx.store.delete(P.membership(t, input.uid));
      await linkUserTenant(ctx, input.uid, cur!.email, cur!.displayName, ctx.tenant!, false);
    }
    await ctx.audit('memberships.revoked', input.uid);
    return { ok: true };
  },
});

// ---------- Notificações e preferências ----------
export const markNotificationRead = defineOp({
  name: 'notifications.markRead',
  input: zTenant.extend({ ids: z.array(zId).min(1).max(100) }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const uid = ctx.requireActor().uid;
    for (const id of input.ids) {
      const path = `${P.notifications(tid(ctx))}/${id}`;
      const n = await ctx.store.get<{ uid: string }>(path);
      if (n?.uid === uid) await ctx.store.update(path, { read: true });
    }
    return { ok: true };
  },
});

export const registerPushToken = defineOp({
  name: 'push.register',
  input: z.object({ token: z.string().min(20).max(400), platform: zText(40) }),
  auth: 'user',
  async run(ctx, input) {
    const uid = ctx.requireActor().uid;
    const key = (await ctx.crypto.sha256Hex(input.token)).slice(0, 40);
    await ctx.store.set(`users/${uid}/pushTokens/${key}`, { token: input.token, platform: input.platform, updatedAt: ctx.nowIso });
    return { ok: true };
  },
});

export const unregisterPushToken = defineOp({
  name: 'push.unregister',
  input: z.object({ token: z.string().min(20).max(400) }),
  auth: 'user',
  async run(ctx, input) {
    const uid = ctx.requireActor().uid;
    const key = (await ctx.crypto.sha256Hex(input.token)).slice(0, 40);
    await ctx.store.delete(`users/${uid}/pushTokens/${key}`);
    return { ok: true };
  },
});

/**
 * Nomes de quem aparece nos históricos e na auditoria (contas e cadastros), para a tela nunca
 * mostrar identificadores. Só para a diretoria; cada id vira o nome do cadastro de sócio ou o da conta.
 */
export const peopleNames = defineOp({
  name: 'people.names',
  input: zTenant.extend({ ids: z.array(z.string().min(1).max(128)).max(60) }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    if (!ctx.membership?.board) fail('permission-denied', 'Só a diretoria vê os nomes do histórico.');
    const t = tid(ctx);
    const names: Record<string, string> = {};
    for (const id of [...new Set(input.ids)]) {
      if (id === 'sistema') {
        names[id] = 'Rotina automática';
        continue;
      }
      const ms = await ctx.store.get<MembershipDoc>(P.membership(t, id));
      if (ms) {
        const m = ms.memberId ? await ctx.store.get<{ fullName?: string }>(P.member(t, ms.memberId)) : null;
        names[id] = m?.fullName || ms.displayName || ms.email.split('@')[0] || 'Sem nome';
        continue;
      }
      const m = await ctx.store.get<{ fullName?: string }>(P.member(t, id));
      if (m?.fullName) names[id] = m.fullName;
      else if (ctx.actor?.master && id === ctx.actor.uid) names[id] = ctx.actor.displayName || 'Administração da plataforma';
    }
    return { names };
  },
});

export const accessOps = [
  peopleNames,
  unregisterPushToken,
  updateTenant,
  updateSettings,
  saveRole,
  deleteRole,
  createInvite,
  revokeInvite,
  acceptInvite,
  setMembershipRoles,
  revokeMembership,
  markNotificationRead,
  registerPushToken,
];
