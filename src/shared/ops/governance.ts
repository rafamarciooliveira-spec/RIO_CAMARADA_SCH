/**
 * Governança: eventos (presença, convidados, ingressos, check-in, agenda), plano de ação
 * (comentários, kanban, tarefas nascidas de deliberações), assembleias (convocação, presença e
 * quórum), atas (versões, hash, assinatura eletrônica simples, publicação numerada), votações
 * secretas (um voto por sócio, sem vínculo entre pessoa e voto) e enquetes.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zIso, zTenant, zText, type OpContext } from '../core/ops.ts';
import { inc } from '../core/store.ts';
import { P } from '../paths.ts';
import { localDateKey } from '../dates.ts';
import type {
  AssemblyDoc,
  CalendarEntryDoc,
  ChargeDoc,
  ElectionDoc,
  EventDoc,
  EventGuestDoc,
  MemberDoc,
  MembershipDoc,
  MinuteDoc,
  SurveyDoc,
  TaskDoc,
} from '../types.ts';
import { notify, tid } from './helpers.ts';
import { commitEntries, todayKey } from './finance.ts';
import { electionEligibility, minuteCanonicalText, quorumNeeded } from '../governance/rules.ts';

async function getOrFail<T>(ctx: OpContext, path: string, what: string): Promise<T> {
  const d = await ctx.store.get<T>(path);
  if (!d) fail('not-found', `${what} não encontrado(a).`);
  return d!;
}

function ownMemberId(ctx: OpContext): string {
  const id = ctx.membership?.memberId;
  if (!id) fail('failed-precondition', 'Seu acesso não está vinculado a um cadastro de sócio.');
  return id!;
}

async function upsertCalendar(ctx: OpContext, id: string, data: Omit<CalendarEntryDoc, 'id' | 'createdAt'>): Promise<void> {
  const path = `${P.calendar(tid(ctx))}/${id}`;
  const cur = await ctx.store.get(path);
  await ctx.store.set(path, { ...data, id, ...(cur ? {} : { createdAt: ctx.nowIso }), updatedAt: ctx.nowIso }, { merge: true });
}

function plusHours(iso: string, h: number): string {
  return new Date(Date.parse(iso) + h * 3600_000).toISOString();
}

// ---------- Eventos ----------

export const eventsRsvp = defineOp({
  name: 'events.rsvp',
  input: zTenant.extend({ eventId: zId, going: z.boolean() }),
  auth: 'user',
  tenant: { perm: null },
  module: 'eventos',
  async run(ctx, input) {
    const t = tid(ctx);
    const memberId = ownMemberId(ctx);
    const member = await getOrFail<MemberDoc>(ctx, P.member(t, memberId), 'Cadastro');
    const ev = await getOrFail<EventDoc>(ctx, P.event(t, input.eventId), 'Evento');
    if (!ev.rsvpEnabled) fail('failed-precondition', 'Este evento não recebe confirmação de presença.');
    if (ev.status === 'cancelado' || ev.status === 'realizado') fail('failed-precondition', 'Este evento não está mais aberto.');
    const guestPath = `${P.eventGuests(t, input.eventId)}/m_${memberId}`;
    const changed = await ctx.store.runTransaction(async tx => {
      const g = await tx.get<EventGuestDoc>(guestPath);
      if (input.going && !g) {
        tx.create(guestPath, { id: `m_${memberId}`, name: member.displayName || member.fullName, kind: 'socio', memberId, uid: ctx.actor!.uid, createdAt: ctx.nowIso });
        tx.update(P.event(t, input.eventId), { rsvpCount: inc(1) });
        return true;
      }
      if (!input.going && g) {
        if (g.checkedInAt) fail('failed-precondition', 'A entrada já foi registrada neste evento.');
        tx.delete(guestPath);
        tx.update(P.event(t, input.eventId), { rsvpCount: inc(-1) });
        return true;
      }
      return false;
    });
    return { going: input.going, changed };
  },
});

export const eventsAddGuest = defineOp({
  name: 'events.addGuest',
  input: zTenant.extend({ eventId: zId, name: zText(150).min(2), memberId: zId.optional() }),
  auth: 'user',
  tenant: { perm: ['eventos', 'editar'] },
  module: 'eventos',
  async run(ctx, input) {
    const t = tid(ctx);
    await getOrFail<EventDoc>(ctx, P.event(t, input.eventId), 'Evento');
    let uid: string | undefined;
    if (input.memberId) uid = (await getOrFail<MemberDoc>(ctx, P.member(t, input.memberId), 'Sócio')).uid;
    const id = input.memberId ? `m_${input.memberId}` : ctx.store.newId();
    const path = `${P.eventGuests(t, input.eventId)}/${id}`;
    if (await ctx.store.get(path)) fail('already-exists', 'Esta pessoa já está na lista.');
    const g: EventGuestDoc = {
      id,
      name: input.name,
      kind: input.memberId ? 'socio' : 'convidado',
      ...(input.memberId ? { memberId: input.memberId } : {}),
      ...(uid ? { uid } : {}),
      createdAt: ctx.nowIso,
    };
    await ctx.store.set(path, g as unknown as Record<string, unknown>);
    await ctx.audit('events.guest_added', input.eventId);
    return { id };
  },
});

export const eventsRemoveGuest = defineOp({
  name: 'events.removeGuest',
  input: zTenant.extend({ eventId: zId, guestId: zId }),
  auth: 'user',
  tenant: { perm: ['eventos', 'editar'] },
  module: 'eventos',
  async run(ctx, input) {
    const t = tid(ctx);
    const path = `${P.eventGuests(t, input.eventId)}/${input.guestId}`;
    const g = await getOrFail<EventGuestDoc>(ctx, path, 'Convidado');
    if (g.kind === 'ingresso') fail('failed-precondition', 'Ingresso vendido não sai da lista. Se houve devolução, estorne a receita no financeiro.');
    await ctx.store.runTransaction(async tx => {
      tx.delete(path);
      if (g.kind === 'socio' && g.uid) tx.update(P.event(t, input.eventId), { rsvpCount: inc(-1) });
    });
    await ctx.audit('events.guest_removed', input.eventId);
    return { ok: true };
  },
});

export const eventsSellTicket = defineOp({
  name: 'events.sellTicket',
  input: zTenant.extend({
    eventId: zId,
    lotId: zId,
    buyerName: zText(150).min(2),
    quantity: z.number().int().min(1).max(20).default(1),
    ledger: z.object({ accountId: zId, chartAccountId: zId.default('c1_02'), date: zDateKey.optional() }).optional(),
  }),
  auth: 'user',
  tenant: { perm: ['eventos', 'editar'] },
  module: 'eventos',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    if (input.ledger) ctx.require('financeiro', 'criar');
    const evPath = P.event(t, input.eventId);
    const codes: string[] = [];
    const guests: { path: string; doc: EventGuestDoc }[] = [];
    for (let i = 0; i < input.quantity; i++) {
      // Código legível (sem 0/O/1/l) mostrado uma única vez; só o hash fica gravado
      const raw = ctx.crypto.randomToken(12).replace(/[^A-HJ-NP-Za-hj-km-z2-9]/g, '').toUpperCase().slice(0, 10).padEnd(10, 'X');
      const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
      const id = ctx.store.newId();
      codes.push(code);
      guests.push({
        path: `${P.eventGuests(t, input.eventId)}/${id}`,
        doc: { id, name: input.buyerName, kind: 'ingresso', lotId: input.lotId, ticketCode: await ctx.crypto.sha256Hex(`${input.eventId}:${code}`), createdAt: ctx.nowIso },
      });
    }
    const sale = await ctx.store.runTransaction(async tx => {
      const ev = await tx.get<EventDoc>(evPath);
      if (!ev) fail('not-found', 'Evento não encontrado.');
      if (!ev!.ticketing?.enabled) fail('failed-precondition', 'A venda de ingressos não está ligada neste evento.');
      if (ev!.status === 'cancelado') fail('failed-precondition', 'Evento cancelado.');
      const lots = ev!.ticketing.lots.map(l => ({ ...l, sold: l.sold || 0 }));
      const lot = lots.find(l => l.id === input.lotId);
      if (!lot) fail('not-found', 'Lote não encontrado.');
      if (lot!.sold + input.quantity > lot!.quantity) fail('resource-exhausted', `Restam ${Math.max(0, lot!.quantity - lot!.sold)} ingresso(s) neste lote.`);
      lot!.sold += input.quantity;
      tx.update(evPath, { 'ticketing.lots': lots });
      for (const g of guests) tx.create(g.path, g.doc as unknown as Record<string, unknown>);
      return { priceCents: lot!.priceCents, lotName: lot!.name, costCenterId: ev!.costCenterId, eventName: ev!.name };
    });
    let entryId: string | undefined;
    const total = sale.priceCents * input.quantity;
    if (input.ledger && total > 0) {
      const { made } = await commitEntries(ctx, async () => ({
        entries: [
          {
            date: input.ledger!.date || todayKey(ctx),
            accountId: input.ledger!.accountId,
            direction: 'entrada',
            amountCents: total,
            chartAccountId: input.ledger!.chartAccountId,
            ...(sale.costCenterId ? { costCenterId: sale.costCenterId } : {}),
            eventId: input.eventId,
            description: `Ingressos: ${sale.eventName} (${sale.lotName}, ${input.quantity}x)`.slice(0, 300),
            status: 'lancado',
          },
        ],
      }));
      entryId = made[0].id;
    }
    await ctx.audit('events.ticket_sold', input.eventId, { quantity: input.quantity, amountCents: total });
    return { codes, totalCents: total, ...(entryId ? { entryId } : {}) };
  },
});

export const eventsCheckinGuest = defineOp({
  name: 'events.checkinGuest',
  input: zTenant.extend({ eventId: zId, code: z.string().min(4).max(40).optional(), guestId: zId.optional() }),
  auth: 'user',
  tenant: { perm: null },
  module: 'eventos',
  rateLimit: { per: 'uid', max: 900, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.can('portaria', 'criar') && !ctx.can('eventos', 'editar')) fail('permission-denied', 'Seu papel não permite registrar entradas.');
    const t = tid(ctx);
    let path = '';
    if (input.code) {
      const code = input.code.trim().toUpperCase().replace(/\s/g, '');
      const norm = code.includes('-') ? code : `${code.slice(0, 5)}-${code.slice(5)}`;
      const hash = await ctx.crypto.sha256Hex(`${input.eventId}:${norm}`);
      const rows = await ctx.store.query(P.eventGuests(t, input.eventId), { where: [['ticketCode', '==', hash]], limit: 1 });
      if (!rows.length) return { status: 'invalido' as const };
      path = rows[0].path;
    } else if (input.guestId) {
      path = `${P.eventGuests(t, input.eventId)}/${input.guestId}`;
    } else fail('invalid-argument', 'Informe o código do ingresso ou escolha o convidado.');
    const res = await ctx.store.runTransaction(async tx => {
      const g = await tx.get<EventGuestDoc>(path);
      if (!g) return { status: 'invalido' as const };
      if (g.checkedInAt) return { status: 'ja_utilizado' as const, name: g.name, at: g.checkedInAt };
      tx.update(path, { checkedInAt: ctx.nowIso });
      tx.update(P.event(t, input.eventId), { checkinCount: inc(1) });
      return { status: 'ok' as const, name: g.name, at: ctx.nowIso };
    });
    return res;
  },
});

export const eventsSyncCalendar = defineOp({
  name: 'events.syncCalendar',
  input: zTenant.extend({ eventId: zId }),
  auth: 'user',
  tenant: { perm: ['eventos', 'editar'] },
  module: 'eventos',
  async run(ctx, input) {
    const t = tid(ctx);
    const ev = await getOrFail<EventDoc>(ctx, P.event(t, input.eventId), 'Evento');
    const calId = `evt_${input.eventId}`;
    if (ev.status === 'cancelado') {
      await ctx.store.delete(`${P.calendar(t)}/${calId}`);
      return { removed: true };
    }
    await upsertCalendar(ctx, calId, {
      title: ev.name,
      description: ev.description?.slice(0, 2000) || '',
      location: ev.location || '',
      start: ev.start,
      end: ev.end || plusHours(ev.start, 2),
      allDay: false,
      category: ev.kind === 'projeto' ? 'Projeto' : 'Evento',
      color: '#d4a64a',
      recurrence: { freq: 'nenhuma' },
      visibility: ev.publicListing ? 'publico' : 'socios',
      source: 'evento',
      sourceId: input.eventId,
    });
    return { calendarId: calId };
  },
});

// ---------- Tarefas ----------

async function taskForEdit(ctx: OpContext, taskId: string): Promise<{ path: string; task: TaskDoc }> {
  const path = `${P.tasks(tid(ctx))}/${taskId}`;
  const task = await getOrFail<TaskDoc>(ctx, path, 'Tarefa');
  const responsible = !!task.whoUid && task.whoUid === ctx.actor?.uid;
  if (!responsible) ctx.require('tarefas', 'editar');
  return { path, task };
}

export const tasksComment = defineOp({
  name: 'tasks.comment',
  input: zTenant.extend({ taskId: zId, text: zText(1000).min(1) }),
  auth: 'user',
  tenant: { perm: null },
  module: 'tarefas',
  async run(ctx, input) {
    const { path, task } = await taskForEdit(ctx, input.taskId);
    const comments = [...(task.comments || []), { uid: ctx.actor!.uid, name: ctx.membership?.displayName || ctx.actor!.displayName, text: input.text, at: ctx.nowIso }].slice(-200);
    await ctx.store.update(path, { comments, updatedAt: ctx.nowIso });
    if (task.whoUid && task.whoUid !== ctx.actor!.uid) await notify(ctx, task.whoUid, 'Novo comentário na tarefa', task.title, 'plano-de-acao');
    return { ok: true };
  },
});

export const tasksSetStatus = defineOp({
  name: 'tasks.setStatus',
  input: zTenant.extend({ taskId: zId, status: z.enum(['a_fazer', 'fazendo', 'bloqueada', 'concluida']) }),
  auth: 'user',
  tenant: { perm: null },
  module: 'tarefas',
  async run(ctx, input) {
    const { path } = await taskForEdit(ctx, input.taskId);
    await ctx.store.update(path, { status: input.status, updatedAt: ctx.nowIso });
    await ctx.audit('tasks.status_changed', input.taskId, { to: input.status });
    return { ok: true };
  },
});

export const tasksFromDeliberation = defineOp({
  name: 'tasks.fromDeliberation',
  input: zTenant.extend({
    minuteId: zId,
    deliberationId: zId,
    who: zText(150).default(''),
    whoUid: zId.optional(),
    when: zDateKey,
    priority: z.enum(['baixa', 'media', 'alta']).default('media'),
  }),
  auth: 'user',
  tenant: { perm: ['atas', 'editar'] },
  module: 'tarefas',
  async run(ctx, input) {
    const t = tid(ctx);
    const mPath = `${P.minutes(t)}/${input.minuteId}`;
    const minute = await getOrFail<MinuteDoc>(ctx, mPath, 'Ata');
    const d = minute.deliberations.find(x => x.id === input.deliberationId);
    if (!d) fail('not-found', 'Deliberação não encontrada.');
    if (d!.taskId) fail('already-exists', 'Esta deliberação já virou tarefa.');
    const id = ctx.store.newId();
    const task: TaskDoc = {
      id,
      title: d!.text.slice(0, 150),
      what: d!.text.slice(0, 1000),
      why: `Deliberação da ata ${minute.number || minute.title}`.slice(0, 1000),
      where: '',
      when: input.when,
      who: input.who,
      ...(input.whoUid ? { whoUid: input.whoUid } : {}),
      how: '',
      howMuchCents: 0,
      priority: input.priority,
      status: 'a_fazer',
      ref: { type: 'ata', id: input.minuteId, label: (minute.number ? `Ata ${minute.number}` : minute.title).slice(0, 150) },
      comments: [],
      attachments: [],
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    await ctx.store.set(`${P.tasks(t)}/${id}`, task as unknown as Record<string, unknown>);
    await ctx.store.update(mPath, { deliberations: minute.deliberations.map(x => (x.id === input.deliberationId ? { ...x, taskId: id } : x)) });
    if (input.whoUid) await notify(ctx, input.whoUid, 'Nova tarefa para você', task.title, 'plano-de-acao');
    await ctx.audit('tasks.from_deliberation', id, { minute: input.minuteId });
    return { taskId: id };
  },
});

// ---------- Assembleias ----------

async function countActive(ctx: OpContext): Promise<number> {
  return ctx.store.count(P.members(tid(ctx)), { where: [['status', '==', 'ativo']] });
}

export const assembliesSave = defineOp({
  name: 'assemblies.save',
  input: zTenant.extend({
    id: zId.optional(),
    title: zText(200).min(3),
    kind: z.enum(['ordinaria', 'extraordinaria', 'reuniao_diretoria']),
    date: zIso,
    location: zText(200),
    noticeText: zText(10000),
    agenda: z.array(zText(300).min(1)).max(50),
    quorumPercent: z.number().min(0).max(100),
    status: z.enum(['convocada', 'realizada', 'cancelada']).default('convocada'),
  }),
  auth: 'user',
  tenant: { perm: null },
  module: 'atas',
  async run(ctx, input) {
    const t = tid(ctx);
    ctx.require('atas', input.id ? 'editar' : 'criar');
    const id = input.id || ctx.store.newId();
    const path = `${P.assemblies(t)}/${id}`;
    const cur = input.id ? await getOrFail<AssemblyDoc>(ctx, path, 'Assembleia') : null;
    const { id: _ignore, tenantId: _t, requestId: _r, ...fields } = input;
    const data: Record<string, unknown> = { ...fields, updatedAt: ctx.nowIso };
    // Base do quórum: sócios ativos, recalculada enquanto a assembleia está convocada
    if (!cur || input.status === 'convocada') data.eligibleCount = await countActive(ctx);
    if (cur) await ctx.store.update(path, data);
    else await ctx.store.set(path, { ...data, id, attendanceCount: 0, createdAt: ctx.nowIso });
    const calId = `asm_${id}`;
    if (input.status === 'cancelada') await ctx.store.delete(`${P.calendar(t)}/${calId}`);
    else {
      await upsertCalendar(ctx, calId, {
        title: input.title,
        description: input.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n').slice(0, 2000),
        location: input.location,
        start: input.date,
        end: plusHours(input.date, 2),
        allDay: false,
        category: input.kind === 'reuniao_diretoria' ? 'Reunião' : 'Assembleia',
        color: '#2563eb',
        recurrence: { freq: 'nenhuma' },
        visibility: input.kind === 'reuniao_diretoria' ? 'diretoria' : 'socios',
        source: 'assembleia',
        sourceId: id,
      });
    }
    await ctx.audit(cur ? 'assemblies.updated' : 'assemblies.created', id);
    return { id };
  },
});

export const assembliesAttendance = defineOp({
  name: 'assemblies.attendance',
  input: zTenant.extend({ assemblyId: zId, memberId: zId, present: z.boolean() }),
  auth: 'user',
  tenant: { perm: ['atas', 'editar'] },
  module: 'atas',
  async run(ctx, input) {
    const t = tid(ctx);
    const aPath = `${P.assemblies(t)}/${input.assemblyId}`;
    const m = await getOrFail<MemberDoc>(ctx, P.member(t, input.memberId), 'Sócio');
    const attPath = `${P.attendance(t, input.assemblyId)}/${input.memberId}`;
    const r = await ctx.store.runTransaction(async tx => {
      const a = await tx.get<AssemblyDoc>(aPath);
      if (!a) fail('not-found', 'Assembleia não encontrada.');
      if (a!.status === 'cancelada') fail('failed-precondition', 'Assembleia cancelada.');
      const cur = await tx.get(attPath);
      let count = a!.attendanceCount || 0;
      if (input.present && !cur) {
        tx.create(attPath, { memberId: input.memberId, name: m.fullName, at: ctx.nowIso, byUid: ctx.actor!.uid });
        tx.update(aPath, { attendanceCount: inc(1) });
        count++;
      } else if (!input.present && cur) {
        tx.delete(attPath);
        tx.update(aPath, { attendanceCount: inc(-1) });
        count--;
      }
      return { attendanceCount: count, eligibleCount: a!.eligibleCount || 0, quorumPercent: a!.quorumPercent || 0 };
    });
    const needed = quorumNeeded(r.eligibleCount, r.quorumPercent);
    return { attendanceCount: r.attendanceCount, eligibleCount: r.eligibleCount, needed, quorumReached: r.attendanceCount >= needed };
  },
});

// ---------- Atas ----------

export const minutesSave = defineOp({
  name: 'minutes.save',
  input: zTenant.extend({
    id: zId.optional(),
    title: zText(200).min(3),
    assemblyId: zId.optional(),
    body: zText(100_000),
    deliberations: z.array(z.object({ id: zId.optional(), text: zText(1000).min(1) })).max(100),
  }),
  auth: 'user',
  tenant: { perm: null },
  module: 'atas',
  async run(ctx, input) {
    const t = tid(ctx);
    ctx.require('atas', input.id ? 'editar' : 'criar');
    const id = input.id || ctx.store.newId();
    const path = `${P.minutes(t)}/${id}`;
    const cur = input.id ? await getOrFail<MinuteDoc>(ctx, path, 'Ata') : null;
    if (cur && (cur.status === 'aprovada' || cur.status === 'publicada')) fail('failed-precondition', 'Ata aprovada ou publicada não se edita. Registre uma retificação em nova ata.');
    // taskId nunca vem do cliente: preserva o vínculo existente pelo id da deliberação
    const prevTasks = new Map((cur?.deliberations || []).map(d => [d.id, d.taskId]));
    const deliberations = input.deliberations.map(d => {
      const did = d.id || ctx.store.newId();
      const taskId = prevTasks.get(did);
      return { id: did, text: d.text, ...(taskId ? { taskId } : {}) };
    });
    if (cur) {
      await ctx.store.set(`${P.minuteVersions(t, id)}/v${cur.version}`, {
        version: cur.version,
        title: cur.title,
        body: cur.body,
        deliberations: cur.deliberations,
        status: cur.status,
        savedBy: ctx.actor!.uid,
        savedAt: ctx.nowIso,
      });
      await ctx.store.update(path, {
        title: input.title,
        body: input.body,
        deliberations,
        ...(input.assemblyId ? { assemblyId: input.assemblyId } : {}),
        version: cur.version + 1,
        // Mudou o texto durante a coleta: as assinaturas anteriores deixam de valer
        status: 'rascunho',
        signatures: [],
        updatedAt: ctx.nowIso,
      });
    } else {
      const doc: MinuteDoc = {
        id,
        number: '',
        title: input.title,
        ...(input.assemblyId ? { assemblyId: input.assemblyId } : {}),
        body: input.body,
        version: 1,
        status: 'rascunho',
        deliberations,
        signers: [],
        signatures: [],
        published: false,
        createdBy: ctx.actor!.uid,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      };
      await ctx.store.set(path, doc as unknown as Record<string, unknown>);
    }
    if (input.assemblyId) {
      const aPath = `${P.assemblies(t)}/${input.assemblyId}`;
      if (await ctx.store.get(aPath)) await ctx.store.update(aPath, { minuteId: id });
    }
    await ctx.audit(cur ? 'minutes.updated' : 'minutes.created', id, { version: cur ? cur.version + 1 : 1 });
    return { id, version: cur ? cur.version + 1 : 1 };
  },
});

export const minutesSubmit = defineOp({
  name: 'minutes.submit',
  input: zTenant.extend({ minuteId: zId, signers: z.array(z.object({ uid: zId, name: zText(150).min(2), role: zText(80).min(2) })).min(1).max(20) }),
  auth: 'user',
  tenant: { perm: ['atas', 'editar'] },
  module: 'atas',
  async run(ctx, input) {
    const t = tid(ctx);
    const path = `${P.minutes(t)}/${input.minuteId}`;
    const m = await getOrFail<MinuteDoc>(ctx, path, 'Ata');
    if (m.status !== 'rascunho') fail('failed-precondition', 'Só rascunhos vão para assinatura.');
    if (!m.body.trim()) fail('invalid-argument', 'Escreva o texto da ata antes de enviar.');
    const uids = new Set<string>();
    for (const s of input.signers) {
      if (uids.has(s.uid)) fail('invalid-argument', 'Signatário repetido.');
      uids.add(s.uid);
      const ms = await ctx.store.get<MembershipDoc>(P.membership(t, s.uid));
      if (!ms?.active) fail('invalid-argument', `${s.name} não tem acesso ativo ao portal.`);
    }
    const contentHash = await ctx.crypto.sha256Hex(minuteCanonicalText(m));
    await ctx.store.update(path, { status: 'em_assinatura', signers: input.signers, signatures: [], contentHash, updatedAt: ctx.nowIso });
    for (const s of input.signers) await notify(ctx, s.uid, 'Ata para assinar', m.title, 'atas');
    await ctx.audit('minutes.submitted', input.minuteId, { signers: input.signers.length });
    return { contentHash };
  },
});

export const minutesSign = defineOp({
  name: 'minutes.sign',
  input: zTenant.extend({ minuteId: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'atas',
  async run(ctx, input) {
    // TODO(JURÍDICO): assinatura eletrônica SIMPLES (Lei 14.063/2020, art. 4º, I): identifica o
    // signatário pela conta autenticada e vincula data/hora ao hash SHA-256 do texto. Confirmar
    // com assessoria jurídica se o estatuto e o cartório aceitam este nível para o registro da ata.
    const t = tid(ctx);
    const path = `${P.minutes(t)}/${input.minuteId}`;
    const res = await ctx.store.runTransaction(async tx => {
      const m = await tx.get<MinuteDoc>(path);
      if (!m) fail('not-found', 'Ata não encontrada.');
      if (m!.status !== 'em_assinatura') fail('failed-precondition', 'Esta ata não está em assinatura.');
      const signer = m!.signers.find(s => s.uid === ctx.actor!.uid);
      if (!signer) fail('permission-denied', 'Você não está entre os signatários desta ata.');
      if (m!.signatures.some(s => s.uid === ctx.actor!.uid)) fail('already-exists', 'Você já assinou esta ata.');
      const hash = await ctx.crypto.sha256Hex(minuteCanonicalText(m!));
      if (hash !== m!.contentHash) fail('failed-precondition', 'O texto da ata mudou depois do envio. Peça um novo envio para assinatura.');
      const signatures = [...m!.signatures, { uid: signer!.uid, name: signer!.name, role: signer!.role, at: ctx.nowIso, contentHash: hash }];
      const all = m!.signers.every(s => signatures.some(x => x.uid === s.uid));
      tx.update(path, { signatures, ...(all ? { status: 'aprovada' } : {}), updatedAt: ctx.nowIso });
      return { all, hash };
    });
    await ctx.audit('minutes.signed', input.minuteId, { completo: res.all });
    return { complete: res.all, contentHash: res.hash };
  },
});

export const minutesPublish = defineOp({
  name: 'minutes.publish',
  input: zTenant.extend({ minuteId: zId }),
  auth: 'user',
  tenant: { perm: ['atas', 'aprovar'] },
  module: 'atas',
  async run(ctx, input) {
    const t = tid(ctx);
    const path = `${P.minutes(t)}/${input.minuteId}`;
    const year = localDateKey(ctx.now(), ctx.tenant?.timezone).slice(0, 4);
    const number = await ctx.store.runTransaction(async tx => {
      const m = await tx.get<MinuteDoc>(path);
      if (!m) fail('not-found', 'Ata não encontrada.');
      if (m!.status !== 'aprovada') fail('failed-precondition', 'A ata precisa estar aprovada (todas as assinaturas) para ser publicada.');
      if (!m!.signers.every(s => m!.signatures.some(x => x.uid === s.uid))) fail('failed-precondition', 'Faltam assinaturas.');
      const c = (await tx.get<{ minuteNumber?: number; minuteYear?: string }>(P.counters(t))) || {};
      // Numeração reinicia a cada ano: NNN/AAAA
      const n = c.minuteYear === year ? (c.minuteNumber || 0) + 1 : 1;
      const num = `${String(n).padStart(3, '0')}/${year}`;
      tx.set(P.counters(t), { minuteNumber: n, minuteYear: year }, { merge: true });
      tx.update(path, { number: num, status: 'publicada', published: true, publishedAt: ctx.nowIso, updatedAt: ctx.nowIso });
      return num;
    });
    await ctx.audit('minutes.published', input.minuteId, { number });
    return { number };
  },
});

// ---------- Votações ----------

const zOption = z.object({ id: zId.optional(), label: zText(150).min(1), detail: zText(1000).optional() });

export const electionsSave = defineOp({
  name: 'elections.save',
  input: zTenant.extend({
    id: zId.optional(),
    title: zText(200).min(3),
    description: zText(4000),
    kind: z.enum(['eleicao', 'votacao']),
    options: z.array(zOption).min(1).max(30),
    opensAt: zIso,
    closesAt: zIso,
    eligibility: z.object({ requireUpToDate: z.boolean(), categoryIds: z.array(zId).max(30), minMonths: z.number().int().min(0).max(600) }),
  }),
  auth: 'user',
  tenant: { perm: null },
  module: 'votacoes',
  async run(ctx, input) {
    const t = tid(ctx);
    ctx.require('votacoes', input.id ? 'editar' : 'criar');
    if (Date.parse(input.closesAt) <= Date.parse(input.opensAt)) fail('invalid-argument', 'O encerramento precisa ser depois da abertura.');
    const id = input.id || ctx.store.newId();
    const path = P.election(t, id);
    if (input.id) {
      const cur = await getOrFail<ElectionDoc>(ctx, path, 'Votação');
      if (cur.status !== 'rascunho') fail('failed-precondition', 'Votação aberta ou encerrada não se edita.');
    }
    const options = input.options.map(o => ({ id: o.id || ctx.store.newId(), label: o.label, ...(o.detail ? { detail: o.detail } : {}) }));
    const data = { title: input.title, description: input.description, kind: input.kind, options, opensAt: input.opensAt, closesAt: input.closesAt, eligibility: input.eligibility, updatedAt: ctx.nowIso };
    if (input.id) await ctx.store.update(path, data);
    else await ctx.store.set(path, { ...data, id, status: 'rascunho', votersCount: 0, createdAt: ctx.nowIso });
    await ctx.audit(input.id ? 'elections.updated' : 'elections.created', id);
    return { id };
  },
});

export const electionsOpen = defineOp({
  name: 'elections.open',
  input: zTenant.extend({ electionId: zId }),
  auth: 'user',
  tenant: { perm: ['votacoes', 'aprovar'] },
  module: 'votacoes',
  async run(ctx, input) {
    const path = P.election(tid(ctx), input.electionId);
    const e = await getOrFail<ElectionDoc>(ctx, path, 'Votação');
    if (e.status !== 'rascunho') fail('failed-precondition', 'Só rascunhos podem ser abertos.');
    if (Date.parse(e.closesAt) <= ctx.now().getTime()) fail('failed-precondition', 'O horário de encerramento já passou. Ajuste as datas.');
    await ctx.store.update(path, { status: 'aberta', updatedAt: ctx.nowIso });
    await ctx.audit('elections.opened', input.electionId);
    return { ok: true };
  },
});

export const electionsClose = defineOp({
  name: 'elections.close',
  input: zTenant.extend({ electionId: zId }),
  auth: 'user',
  tenant: { perm: ['votacoes', 'aprovar'] },
  module: 'votacoes',
  async run(ctx, input) {
    const t = tid(ctx);
    const path = P.election(t, input.electionId);
    const e = await getOrFail<ElectionDoc>(ctx, path, 'Votação');
    if (e.status !== 'aberta') fail('failed-precondition', 'Só votações abertas podem ser encerradas.');
    await ctx.store.update(path, { status: 'encerrada', closedAt: ctx.nowIso });
    const ballots = await ctx.store.query<{ optionId: string | null }>(P.ballots(t, input.electionId));
    const results: Record<string, number> = Object.fromEntries(e.options.map(o => [o.id, 0]));
    let blankCount = 0;
    for (const b of ballots) {
      if (b.data.optionId && b.data.optionId in results) results[b.data.optionId]++;
      else blankCount++;
    }
    await ctx.store.update(path, { results, blankCount, tallyCount: ballots.length, updatedAt: ctx.nowIso });
    await ctx.audit('elections.closed', input.electionId, { ballots: ballots.length });
    return { results, blankCount, total: ballots.length };
  },
});

async function memberOverdue(ctx: OpContext, memberId: string): Promise<boolean> {
  const today = todayKey(ctx);
  const rows = await ctx.store.query<ChargeDoc>(P.charges(tid(ctx)), { where: [['memberId', '==', memberId]] });
  return rows.some(r => r.data.status === 'vencida' || (r.data.status === 'aberta' && r.data.dueDate < today));
}

export const electionsEligibility = defineOp({
  name: 'elections.eligibility',
  input: zTenant.extend({ electionId: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'votacoes',
  async run(ctx, input) {
    const t = tid(ctx);
    const e = await getOrFail<ElectionDoc>(ctx, P.election(t, input.electionId), 'Votação');
    const memberId = ctx.membership?.memberId;
    const m = memberId ? await ctx.store.get<MemberDoc>(P.member(t, memberId)) : null;
    const el = electionEligibility(e, m, { hasOverdue: memberId ? await memberOverdue(ctx, memberId) : false, todayKey: todayKey(ctx) });
    const voter = memberId ? await ctx.store.get<{ votedAt: string }>(P.voter(t, input.electionId, memberId)) : null;
    return { ...el, voted: !!voter, votedAt: voter?.votedAt };
  },
});

export const electionsVote = defineOp({
  name: 'elections.vote',
  input: zTenant.extend({ electionId: zId, optionId: zId.nullable() }),
  auth: 'user',
  tenant: { perm: null },
  module: 'votacoes',
  rateLimit: { per: 'uid', max: 30, windowSec: 600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const memberId = ownMemberId(ctx);
    const ePath = P.election(t, input.electionId);
    const e = await getOrFail<ElectionDoc>(ctx, ePath, 'Votação');
    const now = ctx.now().getTime();
    if (e.status !== 'aberta' || now < Date.parse(e.opensAt) || now > Date.parse(e.closesAt)) fail('failed-precondition', 'A votação não está aberta agora.');
    if (input.optionId !== null && !e.options.some(o => o.id === input.optionId)) fail('invalid-argument', 'Opção inválida.');
    const m = await ctx.store.get<MemberDoc>(P.member(t, memberId));
    const el = electionEligibility(e, m, { hasOverdue: await memberOverdue(ctx, memberId), todayKey: todayKey(ctx) });
    if (!el.eligible) fail('permission-denied', el.reasons[0] || 'Você não pode votar nesta votação.');
    const voterPath = P.voter(t, input.electionId, memberId);
    // Cédula com id ALEATÓRIO e só a opção: sem sócio, sem horário, sem ordem
    const ballotId = ctx.crypto.randomToken(18);
    const votedAt = ctx.nowIso;
    await ctx.store
      .runTransaction(async tx => {
        const cur = await tx.get<ElectionDoc>(ePath);
        if (!cur || cur.status !== 'aberta') fail('failed-precondition', 'A votação não está aberta agora.');
        if (await tx.get(voterPath)) fail('already-exists', 'Você já votou nesta votação.');
        tx.create(voterPath, { votedAt });
        tx.create(`${P.ballots(t, input.electionId)}/${ballotId}`, { optionId: input.optionId });
        tx.update(ePath, { votersCount: inc(1) });
      })
      .catch(err => {
        if (/already-exists/.test(String((err as Error).message))) fail('already-exists', 'Você já votou nesta votação.');
        throw err;
      });
    // Comprovante: prova QUE votou, sem dizer em quem
    return { votedAt };
  },
});

export const surveysVote = defineOp({
  name: 'surveys.vote',
  input: zTenant.extend({ surveyId: zId, optionIndex: z.number().int().min(0).max(20) }),
  auth: 'user',
  tenant: { perm: null },
  module: 'engajamento',
  async run(ctx, input) {
    const t = tid(ctx);
    const sPath = `${P.surveys(t)}/${input.surveyId}`;
    const vPath = P.surveyVoter(t, input.surveyId, ctx.actor!.uid);
    await ctx.store.runTransaction(async tx => {
      const s = await tx.get<SurveyDoc>(sPath);
      if (!s) fail('not-found', 'Enquete não encontrada.');
      if (!s!.open) fail('failed-precondition', 'Esta enquete está encerrada.');
      if (input.optionIndex >= s!.options.length) fail('invalid-argument', 'Opção inválida.');
      if (await tx.get(vPath)) fail('already-exists', 'Você já respondeu esta enquete.');
      const counts = s!.options.map((_, i) => (s!.counts?.[i] || 0) + (i === input.optionIndex ? 1 : 0));
      tx.create(vPath, { at: ctx.nowIso });
      tx.update(sPath, { counts });
    });
    return { ok: true };
  },
});

export const governanceOps = [
  eventsRsvp,
  eventsAddGuest,
  eventsRemoveGuest,
  eventsSellTicket,
  eventsCheckinGuest,
  eventsSyncCalendar,
  tasksComment,
  tasksSetStatus,
  tasksFromDeliberation,
  assembliesSave,
  assembliesAttendance,
  minutesSave,
  minutesSubmit,
  minutesSign,
  minutesPublish,
  electionsSave,
  electionsOpen,
  electionsClose,
  electionsEligibility,
  electionsVote,
  surveysVote,
];

