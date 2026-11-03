/**
 * Módulos culturais: inscrição e chamada nas oficinas, empréstimo de patrimônio, decisão de
 * reservas (com bloqueio de conflito e entrada na agenda) e rotinas de alerta para a diretoria
 * (documentos vencendo e empréstimos atrasados), cada alerta uma única vez por item.
 */
import { z } from 'zod';
import { defineOp, fail, registerJobs, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { deleteField } from '../core/store.ts';
import { P } from '../paths.ts';
import { addDaysKey, formatDate } from '../dates.ts';
import type { AssetDoc, BookingDoc, LibraryDocDoc, MemberDoc, WorkshopDoc } from '../types.ts';
import { boardUids, notify, tid } from './helpers.ts';
import { todayKey } from './finance.ts';

/** O sócio age por si e pelos próprios dependentes */
async function isOwnOrDependent(ctx: OpContext, memberId: string): Promise<boolean> {
  const own = ctx.membership?.memberId;
  if (!own) return false;
  if (own === memberId) return true;
  const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), memberId));
  return m?.dependentOf === own;
}

export const workshopsEnroll = defineOp({
  name: 'workshops.enroll',
  input: zTenant.extend({ workshopId: zId, memberId: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'oficinas',
  async run(ctx, input) {
    const t = tid(ctx);
    const admin = ctx.can('oficinas', 'editar');
    if (!admin && !(await isOwnOrDependent(ctx, input.memberId))) fail('permission-denied', 'Seu papel não permite esta ação.');
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    const path = `${P.workshops(t)}/${input.workshopId}`;
    await ctx.store.runTransaction(async tx => {
      const w = await tx.get<WorkshopDoc>(path);
      if (!w) fail('not-found', 'Oficina não encontrada.');
      if (!w!.active) fail('failed-precondition', 'Esta turma não está ativa.');
      const enrolled = w!.enrolled || [];
      if (enrolled.some(e => e.memberId === input.memberId)) fail('already-exists', 'Já inscrito(a) nesta turma.');
      // Sem vaga, só a coordenação pode incluir acima da capacidade
      if (!admin && w!.capacity > 0 && enrolled.length >= w!.capacity) fail('resource-exhausted', 'Não há vagas nesta turma.');
      tx.update(path, { enrolled: [...enrolled, { memberId: input.memberId, name: m!.fullName }], updatedAt: ctx.nowIso });
    });
    await ctx.audit('workshops.enrolled', input.workshopId);
    return { ok: true };
  },
});

export const workshopsUnenroll = defineOp({
  name: 'workshops.unenroll',
  input: zTenant.extend({ workshopId: zId, memberId: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'oficinas',
  async run(ctx, input) {
    const t = tid(ctx);
    if (!ctx.can('oficinas', 'editar') && !(await isOwnOrDependent(ctx, input.memberId))) fail('permission-denied', 'Seu papel não permite esta ação.');
    const path = `${P.workshops(t)}/${input.workshopId}`;
    await ctx.store.runTransaction(async tx => {
      const w = await tx.get<WorkshopDoc>(path);
      if (!w) fail('not-found', 'Oficina não encontrada.');
      tx.update(path, { enrolled: (w!.enrolled || []).filter(e => e.memberId !== input.memberId), updatedAt: ctx.nowIso });
    });
    await ctx.audit('workshops.unenrolled', input.workshopId);
    return { ok: true };
  },
});

export const workshopsAttendance = defineOp({
  name: 'workshops.attendance',
  input: zTenant.extend({ workshopId: zId, date: zDateKey, present: z.array(zId).max(2000) }),
  auth: 'user',
  tenant: { perm: ['oficinas', 'editar'] },
  module: 'oficinas',
  async run(ctx, input) {
    const path = `${P.workshops(tid(ctx))}/${input.workshopId}`;
    const w = await ctx.store.get<WorkshopDoc>(path);
    if (!w) fail('not-found', 'Oficina não encontrada.');
    const ids = new Set((w!.enrolled || []).map(e => e.memberId));
    const present = [...new Set(input.present)].filter(id => ids.has(id));
    const sessions = [...(w!.sessions || []).filter(s => s.date !== input.date), { date: input.date, present }].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-500);
    await ctx.store.update(path, { sessions, updatedAt: ctx.nowIso });
    return { present: present.length, enrolled: ids.size };
  },
});

export const assetsLoan = defineOp({
  name: 'assets.loan',
  input: zTenant.extend({ assetId: zId, to: zText(150).min(2), memberId: zId.optional(), since: zDateKey, due: zDateKey }),
  auth: 'user',
  tenant: { perm: ['patrimonio', 'editar'] },
  module: 'patrimonio',
  async run(ctx, input) {
    if (input.due < input.since) fail('invalid-argument', 'A devolução precisa ser depois da retirada.');
    const path = `${P.assets(tid(ctx))}/${input.assetId}`;
    await ctx.store.runTransaction(async tx => {
      const a = await tx.get<AssetDoc>(path);
      if (!a) fail('not-found', 'Item não encontrado.');
      if (a!.loan) fail('failed-precondition', `Este item já está emprestado para ${a!.loan.to}.`);
      if (a!.historical) fail('failed-precondition', 'Peça do acervo histórico não sai por empréstimo.');
      tx.update(path, { loan: { to: input.to, ...(input.memberId ? { memberId: input.memberId } : {}), since: input.since, due: input.due }, updatedAt: ctx.nowIso });
    });
    await ctx.audit('assets.loaned', input.assetId);
    return { ok: true };
  },
});

export const assetsReturn = defineOp({
  name: 'assets.return',
  input: zTenant.extend({ assetId: zId, condition: z.enum(['otimo', 'bom', 'regular', 'ruim']).optional(), note: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['patrimonio', 'editar'] },
  module: 'patrimonio',
  async run(ctx, input) {
    const path = `${P.assets(tid(ctx))}/${input.assetId}`;
    const today = todayKey(ctx);
    await ctx.store.runTransaction(async tx => {
      const a = await tx.get<AssetDoc>(path);
      if (!a) fail('not-found', 'Item não encontrado.');
      if (!a!.loan) fail('failed-precondition', 'Este item não está emprestado.');
      const { alertedAt: _a, ...loan } = a!.loan!;
      const history = [...(a!.loanHistory || []), { ...loan, returnedAt: today, ...(input.note ? { note: input.note } : {}) }].slice(-200);
      tx.update(path, {
        loan: deleteField(),
        loanHistory: history,
        ...(input.condition ? { condition: input.condition } : {}),
        ...(input.note ? { maintenance: [...(a!.maintenance || []), { date: today, note: `Devolução: ${input.note}` }].slice(-200) } : {}),
        updatedAt: ctx.nowIso,
      });
    });
    await ctx.audit('assets.returned', input.assetId);
    return { ok: true };
  },
});

export const bookingsDecide = defineOp({
  name: 'bookings.decide',
  input: zTenant.extend({ bookingId: zId, decision: z.enum(['confirmar', 'cancelar']), reason: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['reservas', 'aprovar'] },
  module: 'reservas',
  async run(ctx, input) {
    const t = tid(ctx);
    const path = `${P.bookings(t)}/${input.bookingId}`;
    const b = await ctx.store.get<BookingDoc>(path);
    if (!b) fail('not-found', 'Reserva não encontrada.');
    const calPath = `${P.calendar(t)}/bkg_${input.bookingId}`;
    if (input.decision === 'cancelar') {
      if (b!.status === 'cancelada') fail('failed-precondition', 'Esta reserva já está cancelada.');
      await ctx.store.update(path, { status: 'cancelada', ...(input.reason ? { decisionReason: input.reason } : {}), decidedBy: ctx.actor!.uid, decidedAt: ctx.nowIso });
      await ctx.store.delete(calPath);
      await ctx.audit('bookings.canceled', input.bookingId);
      return { status: 'cancelada' };
    }
    if (b!.status === 'confirmada') fail('failed-precondition', 'Esta reserva já está confirmada.');
    if (b!.status === 'cancelada') fail('failed-precondition', 'Reserva cancelada não se confirma. Crie uma nova.');
    const same = await ctx.store.query<BookingDoc>(P.bookings(t), { where: [['spaceId', '==', b!.spaceId]] });
    const clash = same.find(o => o.id !== input.bookingId && o.data.status === 'confirmada' && o.data.start < b!.end && o.data.end > b!.start);
    if (clash) fail('already-exists', 'Já existe reserva confirmada neste espaço nesse horário.');
    await ctx.store.update(path, { status: 'confirmada', decidedBy: ctx.actor!.uid, decidedAt: ctx.nowIso });
    await ctx.store.set(calPath, {
      id: `bkg_${input.bookingId}`,
      title: `Reserva: ${b!.spaceName}`,
      description: `Solicitante: ${b!.requesterName}`,
      location: b!.spaceName,
      start: b!.start,
      end: b!.end,
      allDay: false,
      category: 'Reserva',
      color: '#16a34a',
      recurrence: { freq: 'nenhuma' },
      visibility: 'diretoria',
      source: 'reserva',
      sourceId: input.bookingId,
      createdAt: ctx.nowIso,
    });
    await ctx.audit('bookings.confirmed', input.bookingId);
    return { status: 'confirmada' };
  },
});

registerJobs([
  {
    name: 'culture.libraryExpiry',
    async run(ctx) {
      const t = tid(ctx);
      const limit = addDaysKey(todayKey(ctx), 30);
      const rows = await ctx.store.query<LibraryDocDoc>(P.library(t), { where: [['expiresAt', '<=', limit]] });
      const due = rows.filter(r => r.data.expiresAt && r.data.expiryAlertFor !== r.data.expiresAt);
      if (!due.length) return;
      const uids = await boardUids(ctx);
      for (const r of due) {
        const expired = r.data.expiresAt! < todayKey(ctx);
        for (const uid of uids) {
          await notify(ctx, uid, expired ? 'Documento vencido' : 'Documento vencendo', `${r.data.name}: validade ${formatDate(r.data.expiresAt)}.`, 'gestao-documentos');
        }
        await ctx.store.update(r.path, { expiryAlertFor: r.data.expiresAt });
      }
    },
  },
  {
    name: 'culture.overdueLoans',
    async run(ctx) {
      const t = tid(ctx);
      const rows = await ctx.store.query<AssetDoc>(P.assets(t), { where: [['loan.due', '<', todayKey(ctx)]] });
      const due = rows.filter(r => r.data.loan && !r.data.loan.alertedAt);
      if (!due.length) return;
      const uids = await boardUids(ctx);
      for (const r of due) {
        for (const uid of uids) {
          await notify(ctx, uid, 'Empréstimo atrasado', `${r.data.name} (${r.data.code}) com ${r.data.loan!.to}: devolução era ${formatDate(r.data.loan!.due)}.`, 'patrimonio');
        }
        await ctx.store.update(r.path, { 'loan.alertedAt': ctx.nowIso });
      }
    },
  },
]);

export const cultureOps = [workshopsEnroll, workshopsUnenroll, workshopsAttendance, assetsLoan, assetsReturn, bookingsDecide];
