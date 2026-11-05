/** Escalas de trabalho, reservas com preparação e notícia por link, passando pelas operações do servidor. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { BookingDoc, CalendarEntryDoc, NewsItemDoc, NoticeDoc, RosterDoc } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;
const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

const slots = [
  { id: 'a1', date: '2026-11-11', start: '18:30', end: '00:00', role: 'Arma', needed: 1 },
  { id: 'a2', date: '2026-11-11', start: '18:30', end: '00:00', role: 'Reserva', needed: 1 },
];
const save = (h: H, extra: Record<string, unknown> = {}) =>
  h.call<{ id: string; noticed: boolean }>('rosters.save', { tenantId: h.tenantId, title: 'Escala Schützenfest', status: 'aberta', editors: [], slots, announce: true, ...extra }, h.actors.diretor_eventos);

describe('escala de trabalho', () => {
  it('sócio se inscreve até lotar; só quem criou e os indicados mudam a escala', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    await denied(h.call('rosters.save', { tenantId: h.tenantId, title: 'Escala do sócio', status: 'aberta', editors: [], slots }, who), 'permission-denied');
    const { id, noticed } = await save(h);
    expect(noticed).toBe(true);
    const r0 = (await h.store.get<RosterDoc>(P.roster(h.tenantId, id)))!;
    const notice = (await h.store.get<NoticeDoc>(P.notice(h.tenantId, r0.noticeId!)))!;
    expect(notice.link).toEqual({ label: 'Ver a escala e me inscrever', to: `escalas/${id}` });

    await h.call('rosters.signup', { tenantId: h.tenantId, id, slotId: 'a1' }, who);
    await denied(h.call('rosters.signup', { tenantId: h.tenantId, id, slotId: 'a1' }, who), 'already-exists');
    // Vaga cheia: ninguém mais entra, nem a organização
    await denied(h.call('rosters.signup', { tenantId: h.tenantId, id, slotId: 'a1' }, h.actors.tesoureiro), 'failed-precondition');
    await denied(h.call('rosters.assign', { tenantId: h.tenantId, id, slotId: 'a1', action: 'adicionar', name: 'Gilson' }, h.actors.diretor_eventos), 'failed-precondition');

    // Presidente não criou nem foi indicado: não muda a escala
    await denied(h.call('rosters.assign', { tenantId: h.tenantId, id, slotId: 'a2', action: 'adicionar', name: 'Deco' }, h.actors.presidente), 'permission-denied');
    await denied(h.call('rosters.save', { tenantId: h.tenantId, id, title: 'Outra', status: 'aberta', editors: [], slots }, h.actors.presidente), 'permission-denied');
    // Indicado pelo criador passa a poder
    await h.call('rosters.save', { tenantId: h.tenantId, id, title: 'Escala Schützenfest', status: 'aberta', editors: [{ uid: 'presidente', name: 'Presidente' }], slots }, h.actors.diretor_eventos);
    await h.call('rosters.assign', { tenantId: h.tenantId, id, slotId: 'a2', action: 'adicionar', name: 'Deco' }, h.actors.presidente);

    const r = (await h.store.get<RosterDoc>(P.roster(h.tenantId, id)))!;
    expect(r.slots.find(s => s.id === 'a1')!.people.map(p => p.name)).toEqual(['Pessoa de Teste Silva']);
    expect(r.slots.find(s => s.id === 'a2')!.people[0]).toMatchObject({ name: 'Deco', confirmed: true, addedBy: 'organizacao' });
    // Não dá para diminuir vaga nem apagar turno com gente inscrita
    await denied(h.call('rosters.save', { tenantId: h.tenantId, id, title: 'Escala', status: 'aberta', editors: [], slots: [slots[0]] }, h.actors.diretor_eventos), 'failed-precondition');
    // O sócio sai sozinho
    await h.call('rosters.signup', { tenantId: h.tenantId, id, slotId: 'a1', leave: true }, who);
    expect((await h.store.get<RosterDoc>(P.roster(h.tenantId, id)))!.slots.find(s => s.id === 'a1')!.people).toEqual([]);
    // Encerrada: sem inscrição
    await h.call('rosters.save', { tenantId: h.tenantId, id, title: 'Escala Schützenfest', status: 'encerrada', editors: [], slots }, h.actors.diretor_eventos);
    await denied(h.call('rosters.signup', { tenantId: h.tenantId, id, slotId: 'a1' }, who), 'failed-precondition');
  });
});

describe('reserva com evento e preparação', () => {
  it('bloqueia evento na preparação, nasce solicitada e a edição da confirmada atualiza a agenda', async () => {
    const h = await makeTestTenant();
    const { id: spaceId } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'spaces', data: { name: 'Salão Principal', capacity: 200, priceMemberCents: 0, priceNonMemberCents: 0, rules: '', prepDaysBefore: 2, prepDaysAfter: 2 } }, h.actors.diretor_eventos);
    const base = { spaceId, spaceName: 'Salão Principal', requesterName: 'Rubens', isMember: false, priceCents: 0, contractText: '', prepDaysBefore: 2, prepDaysAfter: 2 };
    // Pedir já "confirmada" não pula a aprovação
    const { id } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'bookings', data: { ...base, status: 'confirmada', eventName: 'Casamento', organizer: 'terceiro', access: 'fechado', start: '2026-11-07T21:00:00.000Z', end: '2026-11-08T03:00:00.000Z' } }, h.actors.diretor_eventos);
    expect((await h.store.get<BookingDoc>(`${P.bookings(h.tenantId)}/${id}`))!.status).toBe('solicitada');
    await expect(
      h.call('generic.save', { tenantId: h.tenantId, collection: 'bookings', data: { ...base, status: 'solicitada', prepDaysBefore: 0, prepDaysAfter: 0, start: '2026-11-09T21:00:00.000Z', end: '2026-11-10T01:00:00.000Z' } }, h.actors.diretor_eventos)
    ).rejects.toThrow(/preparação/);
    await h.call('bookings.decide', { tenantId: h.tenantId, bookingId: id, decision: 'confirmar' }, h.actors.presidente);
    const cal = () => h.store.get<CalendarEntryDoc>(`${P.calendar(h.tenantId)}/bkg_${id}`);
    expect((await cal())!.title).toBe('Salão Principal: ocupado');
    await h.call('generic.save', { tenantId: h.tenantId, collection: 'bookings', id, data: { organizer: 'sociedade', eventName: 'Baile do Lampião', access: 'aberto', end: '2026-11-08T04:00:00.000Z' } }, h.actors.diretor_eventos);
    const after = (await cal())!;
    expect(after.title).toBe('Baile do Lampião');
    expect(after.visibility).toBe('publico');
    expect(after.end).toBe('2026-11-08T04:00:00.000Z');
    expect((await h.store.get<BookingDoc>(`${P.bookings(h.tenantId)}/${id}`))!.status).toBe('confirmada');
  });
});

describe('notícia por link', () => {
  it('prévia sem rede usa o endereço; manchete colada não duplica; notícia da sociedade guarda o link', async () => {
    const h = await makeTestTenant();
    const url = 'https://www.reportergabrieljunior.com.br/noticias/17847-o-brilho-da-tradicao-vem-ai';
    const p = await h.call<{ title: string; source: string; fetched: boolean }>('news.linkPreview', { tenantId: h.tenantId, url }, h.actors.secretario);
    expect(p).toMatchObject({ title: 'O brilho da tradicao vem ai', source: 'reportergabrieljunior.com.br', fetched: false });
    h.env.news = { search: async () => [], preview: async () => ({ title: 'O brilho da tradição vem aí', description: 'Baile à luz de lampião.', siteName: 'Repórter Gabriel Júnior' }) };
    const p2 = await h.call<{ title: string; summary: string; source: string; fetched: boolean }>('news.linkPreview', { tenantId: h.tenantId, url }, h.actors.secretario);
    expect(p2).toMatchObject({ title: 'O brilho da tradição vem aí', summary: 'Baile à luz de lampião.', source: 'Repórter Gabriel Júnior', fetched: true });
    await denied(h.call('news.linkPreview', { tenantId: h.tenantId, url: 'javascript:alert(1)' }, h.actors.secretario));

    const a = await h.call<{ id: string; existed: boolean }>('news.addLink', { tenantId: h.tenantId, url, title: p2.title, source: p2.source, visibility: 'socios', pinned: false }, h.actors.secretario);
    const b = await h.call<{ id: string; existed: boolean }>('news.addLink', { tenantId: h.tenantId, url, title: p2.title, source: p2.source, visibility: 'publico', pinned: true }, h.actors.secretario);
    expect(b).toEqual({ id: a.id, existed: true });
    expect((await h.store.get<NewsItemDoc>(`${P.news(h.tenantId)}/${a.id}`))!).toMatchObject({ kind: 'externa', manual: true, visibility: 'publico' });

    const { id } = await h.call<{ id: string }>('news.post', { tenantId: h.tenantId, title: 'Rio Camarada completa 71 anos', summary: '', body: '', visibility: 'socios', pinned: false, url, source: 'Repórter Gabriel Júnior', requestId: 'n1' }, h.actors.secretario);
    expect((await h.store.get<NewsItemDoc>(`${P.news(h.tenantId)}/${id}`))!).toMatchObject({ kind: 'interna', url, source: 'Repórter Gabriel Júnior' });
  });
});
