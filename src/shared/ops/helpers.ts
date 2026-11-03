/** Utilidades comuns às operações. */
import type { OpContext } from '../core/ops.ts';
import { fail } from '../core/ops.ts';
import { inc } from '../core/store.ts';
import { P } from '../paths.ts';
import { mergePerms, type Perms } from '../modules.ts';
import type { MemberStatus, MembershipDoc, RoleDoc, TenantSettings, DashboardStats } from '../types.ts';
import { replaceVars } from '../templates.ts';

export function tid(ctx: OpContext): string {
  if (!ctx.tenantId) fail('invalid-argument', 'Sociedade não informada.');
  return ctx.tenantId!;
}

export async function getSettings(ctx: OpContext): Promise<TenantSettings> {
  const s = await ctx.store.get<TenantSettings>(P.settings(tid(ctx)));
  if (!s) fail('failed-precondition', 'Configurações da sociedade não encontradas.');
  return s!;
}

export async function permsForRoles(ctx: OpContext, tenantId: string, roleIds: string[]): Promise<{ perms: Perms; board: boolean }> {
  const roles = await Promise.all(roleIds.map(id => ctx.store.get<RoleDoc>(P.role(tenantId, id))));
  const valid = roles.filter(Boolean) as RoleDoc[];
  if (valid.length !== roleIds.length) fail('invalid-argument', 'Papel inexistente nesta sociedade.');
  return { perms: mergePerms(valid.map(r => r.perms)), board: valid.some(r => r.board) };
}

/** Recalcula perms denormalizadas de todas as memberships que usam um papel */
export async function refreshMembershipsForRole(ctx: OpContext, tenantId: string, roleId: string): Promise<void> {
  const rows = await ctx.store.query<MembershipDoc>(P.memberships(tenantId), { where: [['roleIds', 'array-contains', roleId]] });
  for (const r of rows) {
    const { perms, board } = await permsForRoles(ctx, tenantId, r.data.roleIds);
    await ctx.store.update(r.path, { perms, board, updatedAt: ctx.nowIso });
  }
}

export function shortName(fullName: string): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export async function bumpMemberStats(ctx: OpContext, from: MemberStatus | null, to: MemberStatus | null): Promise<void> {
  const t = tid(ctx);
  const data: Record<string, unknown> = { updatedAt: ctx.nowIso };
  if (from) data[`members.${from}`] = inc(-1);
  if (to) data[`members.${to}`] = inc(1);
  if (!from && to) {
    data['members.total'] = inc(1);
    data.newThisMonth = inc(1);
  }
  if (from && !to) data['members.total'] = inc(-1);
  const cur = await ctx.store.get(P.stats(t));
  if (!cur) await ctx.store.set(P.stats(t), emptyStats(ctx.nowIso) as unknown as Record<string, unknown>);
  await ctx.store.update(P.stats(t), data);
}

export function emptyStats(nowIso: string): DashboardStats {
  return {
    members: { total: 0 },
    newThisMonth: 0,
    finance: { balanceCents: 0, monthInCents: 0, monthOutCents: 0, overdueCents: 0, overdueCount: 0 },
    updatedAt: nowIso,
  };
}

/**
 * Notificação no portal (sino) e, se a pessoa ativou, também no celular (push).
 * opts.app = false: só push; opts.push = false: só no portal.
 */
export async function notify(
  ctx: OpContext,
  uid: string | undefined,
  title: string,
  body: string,
  link?: string,
  opts: { app?: boolean; push?: boolean } = {}
): Promise<void> {
  if (!uid) return;
  if (opts.app !== false) {
    await ctx.store.add(P.notifications(tid(ctx)), { uid, title, body, link: link || '', read: false, createdAt: ctx.nowIso });
  }
  if (opts.push !== false) await sendPush(ctx, uid, title, body, link);
}

/** Envia push para os aparelhos da pessoa e apaga os tokens que deixaram de valer */
export async function sendPush(ctx: OpContext, uid: string, title: string, body: string, link?: string): Promise<number> {
  if (!ctx.push) return 0;
  const rows = await ctx.store.query<{ token: string }>(`users/${uid}/pushTokens`, { limit: 10 });
  if (!rows.length) return 0;
  const path = ctx.tenant ? `/${ctx.tenant.slug}/${(link || 'inicio').replace(/^\//, '')}` : '/entrar';
  try {
    const r = await ctx.push.send(rows.map(x => x.data.token), { title: title.slice(0, 120), body: body.slice(0, 240), link: path });
    for (const bad of r.invalid) {
      const row = rows.find(x => x.data.token === bad);
      if (row) await ctx.store.delete(row.path);
    }
    return r.sent;
  } catch {
    return 0; // falha no envio do push nunca derruba a operação
  }
}

/** Envia e-mail pelo provedor (Resend) e registra o resultado real no outbox (sem o corpo) */
export async function sendTemplateMail(
  ctx: OpContext,
  to: string | undefined,
  templateKey: string,
  vars: Record<string, string>,
  fallback: { subject: string; body: string }
): Promise<string> {
  if (!to) return 'sem-destinatario';
  const settings = await ctx.store.get<TenantSettings>(P.settings(tid(ctx)));
  const tpl = settings?.emailTemplates?.[templateKey] || fallback;
  const allVars = { sociedade: ctx.tenant?.name || '', ...vars };
  const subject = replaceVars(tpl.subject, allVars);
  const text = replaceVars(tpl.body, allVars);
  const res = await ctx.mail.send({ to, subject, text, tenantId: ctx.tenantId, tag: templateKey });
  await ctx.store.add(P.outbox(tid(ctx)), {
    template: templateKey,
    toHash: await ctx.crypto.sha256Hex(to.toLowerCase()),
    status: res.status,
    providerId: res.id,
    error: res.error || '',
    at: ctx.nowIso,
  });
  return res.status;
}

export function assertOwnerOrPerm(ctx: OpContext, ownerUid: string | undefined, module: Parameters<OpContext['can']>[0], action: Parameters<OpContext['can']>[1]): void {
  if (ownerUid && ctx.actor?.uid === ownerUid) return;
  ctx.require(module, action);
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Contas da diretoria (ativas, sem o acesso de suporte), para avisos internos */
export async function boardUids(ctx: OpContext): Promise<string[]> {
  const rows = await ctx.store.query<MembershipDoc>(P.memberships(tid(ctx)), { where: [['board', '==', true]] });
  return rows.filter(r => r.data.active && !r.data.support).map(r => r.id);
}
