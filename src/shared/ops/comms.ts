/**
 * Comunicação: avisos segmentados (app, e-mail, push), confirmação de leitura,
 * agendamento (rotina diária publica os vencidos) e feed ICS pessoal com token revogável.
 */
import { z } from 'zod';
import { defineOp, fail, registerJobs, zId, zIso, zTenant, zText, type OpContext } from '../core/ops.ts';
import { inc } from '../core/store.ts';
import { P } from '../paths.ts';
import type { AssemblyDoc, CalendarEntryDoc, ConsentRecord, EventDoc, IcsTokenDoc, MemberDoc, MemberPiiDoc, MembershipDoc, NoticeDoc } from '../types.ts';
import { buildIcs, expandOccurrences, type Occurrence } from '../calendarUtils.ts';
import { notify, sendTemplateMail, tid } from './helpers.ts';

// ---------- Público do aviso ----------
export type Audience = NoticeDoc['audience'];

/** Quem é alcançado pelo aviso. Diretoria vê tudo que é geral ou só da diretoria. */
export function audienceMatches(a: Audience, member: Pick<MemberDoc, 'categoryId' | 'groups'> | null, board: boolean): boolean {
  if (a.boardOnly) return board;
  if (a.all) return true;
  if (member && a.categoryIds?.includes(member.categoryId)) return true;
  if (member && (member.groups || []).some(g => a.groups?.includes(g))) return true;
  return false;
}

/** Último consentimento registrado para a finalidade */
export function latestConsent(consents: ConsentRecord[] | undefined, purpose: ConsentRecord['purpose']): boolean {
  const list = (consents || []).filter(c => c.purpose === purpose);
  return list.length ? list[list.length - 1].granted : false;
}

/** Aviso visível agora (publicado e dentro da validade) */
export function noticeIsLive(n: Pick<NoticeDoc, 'publishAt' | 'expiresAt' | 'status'>, nowIso: string): boolean {
  if (n.status === 'agendado' && n.publishAt > nowIso) return false;
  if (n.publishAt > nowIso) return false;
  if (n.expiresAt && n.expiresAt < nowIso) return false;
  return true;
}

const zAudience = z.object({
  all: z.boolean(),
  categoryIds: z.array(zId).max(30),
  groups: z.array(zText(40)).max(30),
  boardOnly: z.boolean(),
});

const zAttachments = z
  .array(z.object({ path: z.string().max(300), name: zText(150) }))
  .max(10);

const zNoticeFields = z.object({
  title: zText(150).min(3),
  body: zText(8000).min(1),
  audience: zAudience,
  pinned: z.boolean(),
  publishAt: zIso.optional(),
  expiresAt: zIso.optional().or(z.literal('')),
  channels: z.array(z.enum(['app', 'push', 'email'])).min(1).max(3),
  requireReadConfirmation: z.boolean(),
  attachments: zAttachments.optional(),
});

function checkAttachments(ctx: OpContext, list: { path: string }[] | undefined) {
  const prefix = `tenants/${tid(ctx)}/attachments/avisos/`;
  for (const a of list || []) {
    if (!a.path.startsWith(prefix) || a.path.includes('..')) fail('invalid-argument', 'Anexo fora da pasta de avisos.');
  }
}

/** Entrega o aviso: notificação no app, e-mail (só com consentimento) e push (registrado no outbox) */
export async function deliverNotice(ctx: OpContext, id: string, n: NoticeDoc): Promise<{ notified: number; emailed: number; push: number }> {
  const t = tid(ctx);
  const memberships = await ctx.store.query<MembershipDoc>(P.memberships(t), { where: [['active', '==', true]] });
  let notified = 0;
  let emailed = 0;
  let push = 0;
  for (const row of memberships) {
    const ms = row.data;
    if (ms.support) continue; // acesso de suporte não recebe comunicação
    const member = ms.memberId ? await ctx.store.get<MemberDoc>(P.member(t, ms.memberId)) : null;
    if (member && ['desligado', 'rejeitado'].includes(member.status)) continue;
    if (!audienceMatches(n.audience, member, !!ms.board)) continue;
    const uid = ms.uid || row.id;
    const app = n.channels.includes('app');
    const wantsPush = n.channels.includes('push');
    if (app || wantsPush) {
      await notify(ctx, uid, n.title, n.body.slice(0, 180), 'avisos', { app, push: wantsPush });
      if (app) notified++;
      if (wantsPush) push++;
    }
    if (n.channels.includes('email')) {
      // Preferência do sócio: e-mail de aviso só com consentimento de comunicação
      let to: string | undefined;
      if (member) {
        const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, member.id));
        if (latestConsent(pii?.consents, 'comunicacao')) to = pii?.email || ms.email;
      } else if (ms.board) {
        to = ms.email; // diretoria sem cadastro de sócio: comunicação interna da gestão
      }
      if (to) {
        await sendTemplateMail(ctx, to, 'aviso', { titulo: n.title, texto: n.body, link: `${ctx.appUrl}/${ctx.tenant!.slug}/avisos` }, { subject: '{titulo}', body: '{texto}\n\n{link}' });
        emailed++;
      }
    }
  }
  if (push > 0) {
    await ctx.store.add(P.outbox(t), { template: 'aviso', channel: 'push', noticeId: id, recipients: push, status: ctx.push ? 'enviado' : 'simulado', at: ctx.nowIso });
  }
  await ctx.store.update(P.notice(t, id), { status: 'publicado', deliveredAt: ctx.nowIso });
  return { notified, emailed, push };
}

export const publishNotice = defineOp({
  name: 'notices.publish',
  input: zTenant.extend(zNoticeFields.shape),
  auth: 'user',
  tenant: { perm: ['avisos', 'criar'] },
  module: 'avisos',
  idempotent: true,
  rateLimit: { per: 'uid', max: 60, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    checkAttachments(ctx, input.attachments);
    const publishAt = input.publishAt && Date.parse(input.publishAt) > ctx.now().getTime() ? new Date(input.publishAt).toISOString() : ctx.nowIso;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : undefined;
    if (expiresAt && expiresAt <= publishAt) fail('invalid-argument', 'A validade precisa ser depois da publicação.');
    if (!input.audience.all && !input.audience.boardOnly && !input.audience.categoryIds.length && !input.audience.groups.length) {
      fail('invalid-argument', 'Escolha para quem vai o aviso.');
    }
    const scheduled = publishAt > ctx.nowIso;
    const id = ctx.store.newId();
    const doc: NoticeDoc = {
      id,
      title: input.title,
      body: input.body,
      audience: input.audience,
      pinned: input.pinned,
      publishAt,
      ...(expiresAt ? { expiresAt } : {}),
      channels: input.channels,
      requireReadConfirmation: input.requireReadConfirmation,
      readCount: 0,
      attachments: input.attachments || [],
      status: scheduled ? 'agendado' : 'publicado',
      createdBy: ctx.actor!.uid,
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    await ctx.store.set(P.notice(t, id), doc as unknown as Record<string, unknown>);
    let stats = { notified: 0, emailed: 0, push: 0 };
    if (!scheduled) stats = await deliverNotice(ctx, id, doc);
    await ctx.audit(scheduled ? 'notices.scheduled' : 'notices.published', id, { ...stats });
    return { id, scheduled, ...stats };
  },
});

export const updateNotice = defineOp({
  name: 'notices.update',
  input: zTenant.extend({ id: zId, data: zNoticeFields.partial() }),
  auth: 'user',
  tenant: { perm: ['avisos', 'editar'] },
  module: 'avisos',
  async run(ctx, input) {
    const t = tid(ctx);
    const cur = await ctx.store.get<NoticeDoc>(P.notice(t, input.id));
    if (!cur) fail('not-found', 'Aviso não encontrado.');
    checkAttachments(ctx, input.data.attachments);
    const patch: Record<string, unknown> = { updatedAt: ctx.nowIso };
    for (const k of ['title', 'body', 'audience', 'pinned', 'channels', 'requireReadConfirmation', 'attachments'] as const) {
      if (input.data[k] !== undefined) patch[k] = input.data[k];
    }
    if (input.data.expiresAt !== undefined) patch.expiresAt = input.data.expiresAt ? new Date(input.data.expiresAt).toISOString() : '';
    // Reagendar só enquanto não foi publicado
    if (input.data.publishAt && cur!.status === 'agendado') {
      const p = new Date(input.data.publishAt).toISOString();
      patch.publishAt = p > ctx.nowIso ? p : ctx.nowIso;
    }
    await ctx.store.update(P.notice(t, input.id), patch);
    let delivered = false;
    if (cur!.status === 'agendado' && patch.publishAt && String(patch.publishAt) <= ctx.nowIso) {
      const next = (await ctx.store.get<NoticeDoc>(P.notice(t, input.id)))!;
      await deliverNotice(ctx, input.id, next);
      delivered = true;
    }
    await ctx.audit('notices.updated', input.id, { fields: Object.keys(patch).join(',') });
    return { ok: true, delivered };
  },
});

export const deleteNotice = defineOp({
  name: 'notices.delete',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: ['avisos', 'editar'] },
  module: 'avisos',
  async run(ctx, input) {
    const t = tid(ctx);
    const cur = await ctx.store.get<NoticeDoc>(P.notice(t, input.id));
    if (!cur) fail('not-found', 'Aviso não encontrado.');
    for (const a of cur!.attachments || []) await ctx.files.remove(a.path).catch(() => undefined);
    await ctx.store.delete(P.notice(t, input.id));
    await ctx.audit('notices.deleted', input.id);
    return { ok: true };
  },
});

export const confirmRead = defineOp({
  name: 'notices.confirmRead',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'avisos',
  rateLimit: { per: 'uid', max: 300, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const actor = ctx.requireActor();
    const n = await ctx.store.get<NoticeDoc>(P.notice(t, input.id));
    if (!n || !noticeIsLive(n, ctx.nowIso)) fail('not-found', 'Aviso não encontrado.');
    const member = ctx.membership?.memberId ? await ctx.store.get<MemberDoc>(P.member(t, ctx.membership.memberId)) : null;
    if (!audienceMatches(n!.audience, member, !!ctx.membership?.board)) fail('permission-denied', 'Este aviso não é para você.');
    const already = await ctx.store.runTransaction(async tx => {
      const path = P.noticeRead(t, input.id, actor.uid);
      if (await tx.get(path)) return true;
      tx.set(path, {
        uid: actor.uid,
        ...(member ? { memberId: member.id } : {}),
        displayName: member?.displayName || ctx.membership?.displayName || actor.displayName,
        at: ctx.nowIso,
      });
      tx.update(P.notice(t, input.id), { readCount: inc(1) });
      return false;
    });
    return { ok: true, already };
  },
});

// ---------- Agenda: feed ICS ----------
const icsCollection = (t: string) => `tenants/${t}/icsTokens`;

export const createIcsToken = defineOp({
  name: 'calendar.createIcsToken',
  input: zTenant,
  auth: 'user',
  tenant: { perm: null },
  module: 'agenda',
  rateLimit: { per: 'uid', max: 10, windowSec: 3600 },
  async run(ctx) {
    const t = tid(ctx);
    const uid = ctx.requireActor().uid;
    // Um feed por pessoa: gerar outro revoga o anterior
    const prev = await ctx.store.query<IcsTokenDoc>(icsCollection(t), { where: [['uid', '==', uid]] });
    for (const p of prev) await ctx.store.delete(p.path);
    const token = ctx.crypto.randomToken(32);
    const hash = await ctx.crypto.sha256Hex(token);
    await ctx.store.set(P.icsToken(t, hash), { uid, createdAt: ctx.nowIso });
    await ctx.audit('calendar.ics_created', uid);
    return { url: `${ctx.appUrl}/ics?t=${encodeURIComponent(t)}&k=${encodeURIComponent(token)}`, createdAt: ctx.nowIso };
  },
});

export const revokeIcsToken = defineOp({
  name: 'calendar.revokeIcsToken',
  input: zTenant,
  auth: 'user',
  tenant: { perm: null },
  async run(ctx) {
    const t = tid(ctx);
    const uid = ctx.requireActor().uid;
    const prev = await ctx.store.query<IcsTokenDoc>(icsCollection(t), { where: [['uid', '==', uid]] });
    for (const p of prev) await ctx.store.delete(p.path);
    await ctx.audit('calendar.ics_revoked', uid, { count: prev.length });
    return { revoked: prev.length };
  },
});

export const icsStatus = defineOp({
  name: 'calendar.icsStatus',
  input: zTenant,
  auth: 'user',
  tenant: { perm: null },
  async run(ctx) {
    const prev = await ctx.store.query<IcsTokenDoc>(icsCollection(tid(ctx)), { where: [['uid', '==', ctx.requireActor().uid]] });
    return { active: prev.length > 0, createdAt: prev[0]?.data.createdAt || null };
  },
});

/** Itens da agenda que a pessoa pode ver, já expandidos (usado pelo feed) */
export async function agendaFor(ctx: OpContext, board: boolean, fromIso: string, toIso: string): Promise<Occurrence[]> {
  const t = tid(ctx);
  const out: Occurrence[] = [];
  const allowed: CalendarEntryDoc['visibility'][] = board ? ['publico', 'socios', 'diretoria'] : ['publico', 'socios'];
  const entries = await ctx.store.query<CalendarEntryDoc>(P.calendar(t), { limit: 2000 });
  for (const e of entries) {
    if (!allowed.includes(e.data.visibility)) continue;
    out.push(...expandOccurrences({ ...e.data, id: e.id, source: e.data.source || 'manual' }, fromIso, toIso));
  }
  if (ctx.tenant?.modules?.eventos !== false) {
    const events = await ctx.store.query<EventDoc>(P.events(t), { where: [['start', '>=', fromIso]], limit: 1000 });
    for (const ev of events) {
      if (ev.data.status === 'cancelado' || ev.data.start >= toIso) continue;
      if (!board && ev.data.status === 'planejamento') continue;
      out.push(
        ...expandOccurrences(
          { id: `evento_${ev.id}`, title: ev.data.name, description: ev.data.description, location: ev.data.location, start: ev.data.start, end: ev.data.end, allDay: false, category: 'Eventos', color: '#2563eb', recurrence: { freq: 'nenhuma' }, visibility: 'socios', source: 'evento', sourceId: ev.id },
          fromIso,
          toIso
        )
      );
    }
  }
  if (ctx.tenant?.modules?.atas !== false) {
    const asm = await ctx.store.query<AssemblyDoc>(P.assemblies(t), { where: [['date', '>=', fromIso]], limit: 500 });
    for (const a of asm) {
      if (a.data.status === 'cancelada' || a.data.date >= toIso) continue;
      if (!board && a.data.kind === 'reuniao_diretoria') continue;
      const end = new Date(Date.parse(a.data.date) + 2 * 3600_000).toISOString();
      out.push(
        ...expandOccurrences(
          { id: `assembleia_${a.id}`, title: a.data.title, location: a.data.location, start: a.data.date, end, allDay: false, category: 'Assembleias', color: '#7c3aed', recurrence: { freq: 'nenhuma' }, visibility: 'socios', source: 'assembleia', sourceId: a.id },
          fromIso,
          toIso
        )
      );
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Feed iCalendar: chamado só pela Function HTTP /ics (nunca pela API pública) */
export const icsFeed = defineOp({
  name: 'calendar.icsFeed',
  input: z.object({ tenantId: zId, token: z.string().min(20).max(200) }),
  auth: 'public',
  tenant: { perm: null },
  internal: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const hash = await ctx.crypto.sha256Hex(input.token);
    const tok = await ctx.store.get<IcsTokenDoc>(P.icsToken(t, hash));
    if (!tok) fail('not-found', 'Feed inexistente ou revogado.');
    const ms = await ctx.store.get<MembershipDoc>(P.membership(t, tok!.uid));
    // Vínculo encerrado: o feed para de funcionar na hora
    if (!ms || !ms.active || (ms.expiresAtMs && ms.expiresAtMs < ctx.now().getTime())) fail('permission-denied', 'Acesso encerrado.');
    if (ctx.tenant?.modules?.agenda === false) fail('failed-precondition', 'Agenda desligada.');
    const from = new Date(ctx.now().getTime() - 30 * 86400_000).toISOString();
    const to = new Date(ctx.now().getTime() + 366 * 86400_000).toISOString();
    const items = await agendaFor(ctx, !!ms!.board, from, to);
    return { ics: buildIcs(ctx.tenant!.name, items, ctx.nowIso) };
  },
});

registerJobs([
  {
    name: 'avisos_agendados',
    async run(ctx) {
      const t = tid(ctx);
      const due = await ctx.store.query<NoticeDoc>(P.notices(t), { where: [['status', '==', 'agendado'], ['publishAt', '<=', ctx.nowIso]], limit: 200 });
      for (const n of due) await deliverNotice(ctx, n.id, n.data);
    },
  },
]);

export const commsOps = [publishNotice, updateNotice, deleteNotice, confirmRead, createIcsToken, revokeIcsToken, icsStatus, icsFeed];
