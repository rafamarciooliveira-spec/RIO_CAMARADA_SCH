/**
 * Carteirinha: emissão de tokens (QR rotativo de 90 s na tela; 24 h no arquivo baixado),
 * validação pública com resposta mínima e check-in da portaria.
 * O token é aleatório (32 bytes) e só o hash SHA-256 fica gravado.
 */
import { z } from 'zod';
import { defineOp, fail, zId, zTenant, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { cardStatusFor } from '../memberStatus.ts';
import { localDateKey } from '../dates.ts';
import type { CardTokenDoc, MemberDoc, SlugDoc, TenantDoc, TenantSettings, VerifyResult } from '../types.ts';
import { inc } from '../core/store.ts';
import { tid } from './helpers.ts';
import { networkTenantFor } from './federation.ts';

export const ROTATING_TTL_SEC = 90; // QR troca a cada 60 s; 30 s de folga para a leitura
export const DOWNLOAD_TTL_SEC = 24 * 3600;

async function ownCardMember(ctx: OpContext, memberId: string): Promise<MemberDoc> {
  const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), memberId));
  if (!m) fail('not-found', 'Cadastro não encontrado.');
  const own = m!.uid === ctx.actor?.uid || (m!.dependentOf && m!.dependentOf === ctx.membership?.memberId);
  if (!own) fail('permission-denied', 'Esta carteirinha não é sua.');
  return m!;
}

export const issueCardToken = defineOp({
  name: 'card.issue',
  input: zTenant.extend({ memberId: zId, kind: z.enum(['rotativo', 'download']) }),
  auth: 'user',
  tenant: { perm: null },
  rateLimit: { per: 'uid', max: 240, windowSec: 3600 },
  async run(ctx, input) {
    const m = await ownCardMember(ctx, input.memberId);
    const status = cardStatusFor(m, localDateKey(ctx.now(), ctx.tenant!.timezone));
    if (status !== 'valido') fail('failed-precondition', 'A carteirinha não está válida no momento. Fale com a diretoria.');
    const settings = await ctx.store.get<TenantSettings>(P.settings(tid(ctx)));
    if (settings?.cardRequiresPhoto !== false && !m.photoPath) fail('failed-precondition', 'Envie a sua foto para liberar a carteirinha.');
    const token = ctx.crypto.randomToken(32);
    const hash = await ctx.crypto.sha256Hex(token);
    const ttl = input.kind === 'download' ? DOWNLOAD_TTL_SEC : ROTATING_TTL_SEC;
    const expiresAt = new Date(ctx.now().getTime() + ttl * 1000).toISOString();
    const doc: CardTokenDoc = { memberId: m.id, kind: input.kind, expiresAt, createdAt: ctx.nowIso };
    await ctx.store.set(P.cardToken(tid(ctx), hash), doc as unknown as Record<string, unknown>);
    if (input.kind === 'download') await ctx.audit('card.downloaded', m.id);
    return {
      token,
      expiresAt,
      ttlSec: ttl,
      timezone: ctx.tenant!.timezone,
      verifyUrl: `${ctx.appUrl}/${ctx.tenant!.slug}/v/${token}`,
    };
  },
});

async function verifyCore(ctx: OpContext, tenant: TenantDoc, token: string): Promise<{ result: VerifyResult; member: MemberDoc | null }> {
  const base = { tenantName: tenant.name, checkedAt: ctx.nowIso };
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return { result: { status: 'invalido', ...base }, member: null };
  const hash = await ctx.crypto.sha256Hex(token);
  const tok = await ctx.store.get<CardTokenDoc>(P.cardToken(tenant.id, hash));
  if (!tok || tok.revoked) return { result: { status: 'invalido', ...base }, member: null };
  const member = await ctx.store.get<MemberDoc>(P.member(tenant.id, tok.memberId));
  if (!member) return { result: { status: 'invalido', ...base }, member: null };
  // Situação atual vence o token: suspensão vale na hora, mesmo com arquivo baixado
  const status = cardStatusFor(member, localDateKey(ctx.now(), tenant.timezone));
  if (status === 'suspenso' || status === 'invalido') return { result: { status, ...base }, member };
  if (Date.parse(tok.expiresAt) < ctx.now().getTime()) return { result: { status: 'expirado', ...base }, member };
  const settings = await ctx.store.get<TenantSettings>(P.settings(tenant.id));
  let photoUrl: string | undefined;
  if (settings?.showPhotoOnValidation && member.photoPath) {
    photoUrl = (await ctx.files.signedUrl(member.photoPath, 120)) || undefined;
  }
  return {
    result: {
      status,
      ...base,
      displayName: member.displayName,
      categoryName: member.categoryName,
      validUntil: member.validUntil,
      ...(photoUrl ? { photoUrl } : {}),
    },
    member,
  };
}

/** Validação pública: nunca devolve CPF, nascimento, e-mail, telefone, endereço ou motivo financeiro */
export const verifyCard = defineOp({
  name: 'card.verify',
  input: z.object({ slug: z.string().min(1).max(60), token: z.string().min(1).max(200) }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 30, windowSec: 60 },
  async run(ctx, input): Promise<VerifyResult> {
    const s = await ctx.store.get<SlugDoc>(P.slug(input.slug.toLowerCase()));
    if (!s) return { status: 'invalido', tenantName: '', checkedAt: ctx.nowIso };
    const tenant = await ctx.store.get<TenantDoc>(P.tenant(s.tenantId));
    if (!tenant) return { status: 'invalido', tenantName: '', checkedAt: ctx.nowIso };
    return (await verifyCore(ctx, tenant, input.token)).result;
  },
});

export const checkin = defineOp({
  name: 'portaria.checkin',
  input: zTenant.extend({ token: z.string().min(1).max(200), eventId: zId.optional(), slug: z.string().max(60).optional() }),
  auth: 'user',
  tenant: { perm: ['portaria', 'criar'] },
  rateLimit: { per: 'uid', max: 600, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    let { result, member } = await verifyCore(ctx, ctx.tenant!, input.token);
    // Carteirinha de outra filial da mesma federação, quando a federação aceita em toda a rede
    let fromTenantId: string | undefined;
    if (!member) {
      const other = await networkTenantFor(ctx, input.slug);
      if (other) {
        ({ result, member } = await verifyCore(ctx, other, input.token));
        fromTenantId = other.id;
      }
    }
    await ctx.store.add(P.checkins(t), {
      ...(member && !fromTenantId ? { memberId: member.id } : {}),
      ...(member ? { displayName: member.displayName } : {}),
      ...(fromTenantId ? { fromTenantId, fromTenantName: result.tenantName } : {}),
      result: result.status,
      ...(input.eventId ? { eventId: input.eventId } : {}),
      byUid: ctx.actor!.uid,
      at: ctx.nowIso,
    });
    if (input.eventId && result.status === 'valido') {
      await ctx.store.update(P.event(t, input.eventId), { checkinCount: inc(1) }).catch(() => undefined);
    }
    return result;
  },
});

export const cardOps = [issueCardToken, verifyCard, checkin];
