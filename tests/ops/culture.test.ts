/** Cultura: oficinas, patrimônio, reservas e alertas da diretoria (uma vez por item). */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { runDailyJobs } from '../../src/shared/core/ops.ts';
import type { AssetDoc, BookingDoc, WorkshopDoc } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;

async function notifCount(h: H, title: string) {
  return (await h.store.query<{ title: string }>(P.notifications(h.tenantId), { where: [['title', '==', title]] })).length;
}

describe('oficinas', () => {
  it('sócio se inscreve se houver vaga; coordenação inclui acima da capacidade; chamada', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const who2 = actor('socio2');
    const { memberId: m2 } = await h.call<{ memberId: string }>(
      'members.apply',
      { tenantId: h.tenantId, data: { fullName: 'Segunda Pessoa Lima', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: true, marketing: false } },
      who2
    );
    await h.call('members.approve', { tenantId: h.tenantId, memberId: m2 }, h.actors.presidente);
    const { id } = await h.call<{ id: string }>(
      'generic.save',
      { tenantId: h.tenantId, collection: 'workshops', data: { name: 'Coral adulto', kind: 'coral', teacher: 'Maestro', schedule: 'Terças 19h', capacity: 1, enrolled: [], sessions: [], active: true } },
      h.actors.secretario
    );
    await h.call('workshops.enroll', { tenantId: h.tenantId, workshopId: id, memberId: a.memberId }, a.who);
    await expect(h.call('workshops.enroll', { tenantId: h.tenantId, workshopId: id, memberId: m2 }, who2)).rejects.toThrow(/vagas/);
    await expect(h.call('workshops.enroll', { tenantId: h.tenantId, workshopId: id, memberId: m2 }, a.who)).rejects.toThrow(/papel/);
    await h.call('workshops.enroll', { tenantId: h.tenantId, workshopId: id, memberId: m2 }, h.actors.secretario);
    const r = await h.call<{ present: number }>('workshops.attendance', { tenantId: h.tenantId, workshopId: id, date: '2026-11-03', present: [a.memberId, 'naoinscrito'] }, h.actors.secretario);
    expect(r.present).toBe(1);
    await h.call('workshops.unenroll', { tenantId: h.tenantId, workshopId: id, memberId: a.memberId }, a.who);
    const w = (await h.store.get<WorkshopDoc>(`${P.workshops(h.tenantId)}/${id}`))!;
    expect(w.enrolled.map(e => e.memberId)).toEqual([m2]);
    expect(w.sessions).toEqual([{ date: '2026-11-03', present: [a.memberId] }]);
  });
});

describe('patrimônio', () => {
  it('empréstimo, alerta de atraso uma vez e devolução com histórico', async () => {
    const h = await makeTestTenant();
    const { id } = await h.call<{ id: string }>(
      'generic.save',
      { tenantId: h.tenantId, collection: 'assets', data: { code: 'TR-01', name: 'Traje típico', kind: 'traje', location: 'Armário 2', condition: 'bom', valueCents: 80000, maintenance: [], historical: false } },
      h.actors.diretor_eventos
    );
    await h.call('assets.loan', { tenantId: h.tenantId, assetId: id, to: 'Dançarina Ana', since: '2026-10-01', due: '2026-10-30' }, h.actors.diretor_eventos);
    await expect(h.call('assets.loan', { tenantId: h.tenantId, assetId: id, to: 'Outra Pessoa', since: '2026-11-01', due: '2026-11-30' }, h.actors.diretor_eventos)).rejects.toThrow(/emprestado/);
    await runDailyJobs(h.env, h.tenantId);
    await runDailyJobs(h.env, h.tenantId);
    const boardSize = 5; // presidente, tesoureiro, secretário, conselho fiscal, diretor de eventos
    expect(await notifCount(h, 'Empréstimo atrasado')).toBe(boardSize);
    await h.call('assets.return', { tenantId: h.tenantId, assetId: id, condition: 'regular', note: 'Barra descosturada' }, h.actors.diretor_eventos);
    const a = (await h.store.get<AssetDoc>(`${P.assets(h.tenantId)}/${id}`))!;
    expect(a.loan).toBeUndefined();
    expect(a.condition).toBe('regular');
    expect(a.loanHistory![0]).toMatchObject({ to: 'Dançarina Ana', returnedAt: '2026-11-02' });
    expect(a.maintenance).toHaveLength(1);
  });
});

describe('biblioteca', () => {
  it('documento vencendo em até 30 dias alerta uma vez por data de validade', async () => {
    const h = await makeTestTenant();
    const { id } = await h.call<{ id: string }>(
      'generic.save',
      { tenantId: h.tenantId, collection: 'library', data: { name: 'Alvará dos bombeiros', folder: 'Certidões', visibility: 'diretoria', version: 1, kind: 'alvara', expiresAt: '2026-11-20' } },
      h.actors.secretario
    );
    await h.call('generic.save', { tenantId: h.tenantId, collection: 'library', data: { name: 'Seguro', folder: 'Certidões', visibility: 'diretoria', version: 1, kind: 'seguro', expiresAt: '2027-06-01' } }, h.actors.secretario);
    await runDailyJobs(h.env, h.tenantId);
    await runDailyJobs(h.env, h.tenantId);
    expect(await notifCount(h, 'Documento vencendo')).toBe(5);
    // Renovou com nova validade próxima: alerta de novo
    await h.call('generic.save', { tenantId: h.tenantId, collection: 'library', id, data: { expiresAt: '2026-11-25', version: 2 } }, h.actors.secretario);
    await runDailyJobs(h.env, h.tenantId);
    expect(await notifCount(h, 'Documento vencendo')).toBe(10);
  });
});

describe('reservas', () => {
  it('confirmar cria a entrada na agenda e bloqueia conflito', async () => {
    const h = await makeTestTenant();
    await makeMember(h);
    const { id: spaceId } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'spaces', data: { name: 'Salão nobre', capacity: 200, priceMemberCents: 30000, priceNonMemberCents: 60000, rules: '' } }, h.actors.diretor_eventos);
    const base = { spaceId, spaceName: 'Salão nobre', requesterName: 'Família Souza', isMember: false, priceCents: 60000, status: 'solicitada', contractText: 'Contrato' };
    const { id: b1 } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'bookings', data: { ...base, start: '2026-12-05T20:00:00.000Z', end: '2026-12-06T02:00:00.000Z' } }, h.actors.diretor_eventos);
    await expect(
      h.call('generic.save', { tenantId: h.tenantId, collection: 'bookings', data: { ...base, start: '2026-12-05T22:00:00.000Z', end: '2026-12-06T01:00:00.000Z' } }, h.actors.diretor_eventos)
    ).rejects.toThrow(/Já existe/);
    await expect(h.call('bookings.decide', { tenantId: h.tenantId, bookingId: b1, decision: 'confirmar' }, h.actors.portaria)).rejects.toThrow();
    await h.call('bookings.decide', { tenantId: h.tenantId, bookingId: b1, decision: 'confirmar' }, h.actors.tesoureiro);
    expect((await h.store.get<BookingDoc>(`${P.bookings(h.tenantId)}/${b1}`))!.status).toBe('confirmada');
    expect(await h.store.get(`${P.calendar(h.tenantId)}/bkg_${b1}`)).toMatchObject({ source: 'reserva', sourceId: b1 });
    await h.call('bookings.decide', { tenantId: h.tenantId, bookingId: b1, decision: 'cancelar', reason: 'Desistência' }, h.actors.tesoureiro);
    expect(await h.store.get(`${P.calendar(h.tenantId)}/bkg_${b1}`)).toBeNull();
  });
});
