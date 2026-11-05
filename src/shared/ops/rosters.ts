/**
 * Escalas de trabalho (voluntários de um evento): a diretoria monta os dias, turnos, funções e vagas;
 * o sócio se inscreve e sai sozinho; quem organiza põe nomes, confirma e tira.
 * Depois de criada, só quem criou e as pessoas que essa pessoa indicou mudam a escala.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { formatDate } from '../dates.ts';
import type { MemberDoc, NoticeDoc, RosterDoc, RosterPerson, RosterSlot } from '../types.ts';
import { deliverNotice } from './comms.ts';
import { tid } from './helpers.ts';
import { canManageRoster, sortSlots } from '../rosters.ts';

const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora no formato HH:MM');
const zSlot = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  date: zDateKey,
  label: zText(40).optional(),
  start: zTime,
  end: zTime,
  role: zText(60).min(2, 'função com pelo menos 2 letras'),
  needed: z.number().int().min(1).max(50),
});

const MAX_SLOTS = 400;

async function load(ctx: OpContext, id: string): Promise<RosterDoc> {
  const r = await ctx.store.get<RosterDoc>(P.roster(tid(ctx), id));
  if (!r) fail('not-found', 'Escala não encontrada.');
  return r!;
}

function requireManager(ctx: OpContext, r: RosterDoc): void {
  if (!canManageRoster(r, ctx.actor?.uid)) fail('permission-denied', `Só ${r.createdByName || 'quem criou a escala'} e as pessoas indicadas por essa pessoa mudam esta escala.`);
}

async function announce(ctx: OpContext, r: RosterDoc): Promise<string | undefined> {
  if (ctx.tenant?.modules?.avisos === false) return undefined;
  const t = tid(ctx);
  const id = ctx.store.newId();
  const open = r.slots.reduce((s, x) => s + Math.max(0, x.needed - x.people.length), 0);
  const days = [...new Set(r.slots.map(s => s.date))].sort();
  const when = days.length ? (days.length === 1 ? formatDate(days[0]) : `${formatDate(days[0])} a ${formatDate(days[days.length - 1])}`) : '';
  const notice: NoticeDoc = {
    id,
    title: `Escala aberta: ${r.title}`,
    body: `Precisamos de voluntários${when ? ` de ${when}` : ''}. São ${open} vaga${open === 1 ? '' : 's'}. Escolha o dia, o horário e a função e se inscreva pelo portal.`,
    audience: { all: true, categoryIds: [], groups: [], boardOnly: false },
    pinned: false,
    publishAt: ctx.nowIso,
    channels: ['app', 'push'],
    requireReadConfirmation: false,
    readCount: 0,
    attachments: [],
    link: { label: 'Ver a escala e me inscrever', to: `escalas/${r.id}` },
    status: 'publicado',
    createdBy: ctx.actor!.uid,
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  await ctx.store.set(P.notice(t, id), notice as unknown as Record<string, unknown>);
  await deliverNotice(ctx, id, notice);
  return id;
}

export const rostersSave = defineOp({
  name: 'rosters.save',
  input: zTenant.extend({
    id: zId.optional(),
    title: zText(150).min(3, 'título com pelo menos 3 letras'),
    description: zText(2000).optional(),
    eventId: zId.optional(),
    eventName: zText(150).optional(),
    status: z.enum(['rascunho', 'aberta', 'encerrada']),
    editors: z.array(z.object({ uid: zId, name: zText(150) })).max(20),
    slots: z.array(zSlot).max(MAX_SLOTS),
    announce: z.boolean().optional(),
  }),
  auth: 'user',
  tenant: { perm: ['eventos', 'criar'] },
  module: 'eventos',
  rateLimit: { per: 'uid', max: 120, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const ids = new Set<string>();
    for (const s of input.slots) {
      if (ids.has(s.id)) fail('invalid-argument', 'Turno repetido na escala.');
      ids.add(s.id);
      if (s.start === s.end) fail('invalid-argument', `O turno de ${formatDate(s.date)} (${s.role}) começa e termina no mesmo horário.`);
    }
    const editors = input.editors.filter((e, i, a) => a.findIndex(x => x.uid === e.uid) === i);
    const cur = input.id ? await load(ctx, input.id) : null;
    if (cur) requireManager(ctx, cur);
    // As pessoas já inscritas ficam na vaga; vaga não pode ficar menor que o número de inscritos
    const people = new Map((cur?.slots || []).map(s => [s.id, s.people]));
    const slots: RosterSlot[] = sortSlots(
      input.slots.map(s => {
        const p = people.get(s.id) || [];
        if (p.length > s.needed) fail('failed-precondition', `${s.role} em ${formatDate(s.date)} já tem ${p.length} inscritos. Tire alguém antes de diminuir as vagas.`);
        return { id: s.id, date: s.date, ...(s.label ? { label: s.label } : {}), start: s.start, end: s.end, role: s.role.trim(), needed: s.needed, people: p };
      })
    );
    const removedWithPeople = (cur?.slots || []).filter(s => !ids.has(s.id) && s.people.length);
    if (removedWithPeople.length) fail('failed-precondition', `O turno de ${formatDate(removedWithPeople[0].date)} (${removedWithPeople[0].role}) tem inscritos. Tire as pessoas antes de apagar o turno.`);
    const id = cur?.id || ctx.store.newId();
    const doc: RosterDoc = {
      id,
      title: input.title.trim(),
      ...(input.description ? { description: input.description } : {}),
      ...(input.eventId ? { eventId: input.eventId, eventName: input.eventName || '' } : {}),
      status: input.status,
      createdBy: cur?.createdBy || ctx.actor!.uid,
      createdByName: cur?.createdByName || (await ctx.actorName()),
      editorUids: editors.map(e => e.uid),
      editors,
      slots,
      ...(cur?.noticeId ? { noticeId: cur.noticeId } : {}),
      createdAt: cur?.createdAt || ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    // Primeira abertura com aviso: vai para o quadro e para o celular de todos
    if (input.announce && input.status === 'aberta' && !doc.noticeId) {
      const noticeId = await announce(ctx, doc);
      if (noticeId) doc.noticeId = noticeId;
    }
    await ctx.store.set(P.roster(t, id), doc as unknown as Record<string, unknown>);
    await ctx.audit(cur ? 'rosters.updated' : 'rosters.created', id, { slots: slots.length, status: doc.status });
    return { id, noticed: !!doc.noticeId && !cur?.noticeId };
  },
});

export const rostersDelete = defineOp({
  name: 'rosters.delete',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: ['eventos', 'criar'] },
  module: 'eventos',
  async run(ctx, input) {
    const r = await load(ctx, input.id);
    if (r.createdBy !== ctx.actor!.uid) fail('permission-denied', `Só ${r.createdByName || 'quem criou'} apaga esta escala.`);
    if (r.slots.some(s => s.people.length)) fail('failed-precondition', 'A escala tem pessoas inscritas. Encerre em vez de apagar.');
    await ctx.store.delete(P.roster(tid(ctx), input.id));
    if (r.noticeId) await ctx.store.delete(P.notice(tid(ctx), r.noticeId)).catch(() => undefined);
    await ctx.audit('rosters.deleted', input.id);
    return { ok: true };
  },
});

/** O sócio entra numa vaga (ou sai dela) por conta própria */
export const rostersSignup = defineOp({
  name: 'rosters.signup',
  input: zTenant.extend({ id: zId, slotId: z.string().min(1).max(40), leave: z.boolean().optional() }),
  auth: 'user',
  tenant: { perm: null },
  module: 'eventos',
  rateLimit: { per: 'uid', max: 120, windowSec: 3600 },
  async run(ctx, input) {
    const uid = ctx.actor!.uid;
    const path = P.roster(tid(ctx), input.id);
    const name = await ctx.actorName();
    const memberId = ctx.membership?.memberId;
    if (memberId) {
      const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), memberId));
      if (m && ['suspenso', 'desligado', 'rejeitado'].includes(m.status)) fail('permission-denied', 'Seu cadastro não está ativo para se inscrever.');
    }
    let result: 'entrou' | 'saiu' = 'entrou';
    await ctx.store.runTransaction(async tx => {
      const r = await tx.get<RosterDoc>(path);
      if (!r) fail('not-found', 'Escala não encontrada.');
      if (r!.status !== 'aberta') fail('failed-precondition', 'Esta escala não está aberta para inscrições.');
      const slot = r!.slots.find(s => s.id === input.slotId);
      if (!slot) fail('not-found', 'Turno não encontrado. Atualize a página.');
      const mine = slot!.people.findIndex(p => p.uid === uid);
      if (input.leave) {
        if (mine < 0) fail('failed-precondition', 'Você não está neste turno.');
        slot!.people.splice(mine, 1);
        result = 'saiu';
      } else {
        if (mine >= 0) fail('already-exists', 'Você já está neste turno.');
        if (slot!.people.length >= slot!.needed) fail('failed-precondition', 'Este turno já está completo. Escolha outro.');
        const person: RosterPerson = { key: `u_${uid}`.slice(0, 60), uid, ...(memberId ? { memberId } : {}), name, confirmed: false, addedBy: 'proprio', at: ctx.nowIso };
        slot!.people.push(person);
      }
      tx.update(path, { slots: r!.slots, updatedAt: ctx.nowIso });
    });
    await ctx.audit(result === 'entrou' ? 'rosters.signed_up' : 'rosters.left', input.id, { slot: input.slotId });
    return { result };
  },
});

/** Quem organiza põe um nome (sócio ou não), confirma, desconfirma ou tira alguém */
export const rostersAssign = defineOp({
  name: 'rosters.assign',
  input: zTenant.extend({
    id: zId,
    slotId: z.string().min(1).max(40),
    action: z.enum(['adicionar', 'confirmar', 'desconfirmar', 'tirar']),
    key: z.string().max(60).optional(),
    name: zText(150).optional(),
    memberId: zId.optional(),
  }),
  auth: 'user',
  tenant: { perm: null },
  module: 'eventos',
  async run(ctx, input) {
    const path = P.roster(tid(ctx), input.id);
    let memberUid: string | undefined;
    let memberName = input.name?.trim() || '';
    if (input.action === 'adicionar' && input.memberId) {
      const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), input.memberId));
      if (!m) fail('not-found', 'Sócio não encontrado.');
      memberUid = m!.uid || undefined;
      memberName = m!.fullName;
    }
    await ctx.store.runTransaction(async tx => {
      const r = await tx.get<RosterDoc>(path);
      if (!r) fail('not-found', 'Escala não encontrada.');
      requireManager(ctx, r!);
      const slot = r!.slots.find(s => s.id === input.slotId);
      if (!slot) fail('not-found', 'Turno não encontrado.');
      if (input.action === 'adicionar') {
        if (memberName.length < 2) fail('invalid-argument', 'Informe o nome da pessoa.');
        if (slot!.people.length >= slot!.needed) fail('failed-precondition', 'Este turno já está completo. Aumente as vagas antes.');
        const key = input.memberId ? `m_${input.memberId}` : `n_${ctx.store.newId()}`;
        if (slot!.people.some(p => p.key === key || (memberUid && p.uid === memberUid))) fail('already-exists', `${memberName} já está neste turno.`);
        slot!.people.push({ key: key.slice(0, 60), ...(memberUid ? { uid: memberUid } : {}), ...(input.memberId ? { memberId: input.memberId } : {}), name: memberName, confirmed: true, addedBy: 'organizacao', at: ctx.nowIso });
      } else {
        const i = slot!.people.findIndex(p => p.key === input.key);
        if (i < 0) fail('not-found', 'Pessoa não encontrada neste turno.');
        if (input.action === 'tirar') slot!.people.splice(i, 1);
        else slot!.people[i] = { ...slot!.people[i], confirmed: input.action === 'confirmar' };
      }
      tx.update(path, { slots: r!.slots, updatedAt: ctx.nowIso });
    });
    await ctx.audit(`rosters.${input.action}`, input.id, { slot: input.slotId });
    return { ok: true };
  },
});

export const rosterOps = [rostersSave, rostersDelete, rostersSignup, rostersAssign];
