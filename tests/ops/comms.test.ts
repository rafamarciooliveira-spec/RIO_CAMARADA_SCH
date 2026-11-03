/** Avisos segmentados, agendamento, confirmação de leitura e feed ICS com token revogável. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { runDailyJobs } from '../../src/shared/core/ops.ts';
import { expandOccurrences, googleCalendarUrl } from '../../src/shared/calendarUtils.ts';

const base = {
  body: 'Ensaio geral no salão às 19h.',
  pinned: false,
  channels: ['app', 'email'] as const,
  requireReadConfirmation: true,
};

async function setup() {
  const h = await makeTestTenant();
  const a = await makeMember(h, 'socio1', 'Ana Paula Souza');
  // segundo sócio, outra categoria e sem consentimento de comunicação
  const who2 = actor('socio2');
  const { memberId: m2 } = await h.call<{ memberId: string }>(
    'members.apply',
    {
      tenantId: h.tenantId,
      data: { fullName: 'Bruno Lima Costa', birthDate: '1985-02-01', categoryId: 'contribuinte' },
      consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false },
    },
    who2
  );
  await h.call('members.approve', { tenantId: h.tenantId, memberId: m2 }, h.actors.presidente);
  return { h, a, b: { memberId: m2, who: who2 } };
}

const notifFor = async (h: Awaited<ReturnType<typeof makeTestTenant>>, uid: string) =>
  (await h.store.query<{ title: string }>(P.notifications(h.tenantId), { where: [['uid', '==', uid]] })).filter(n => n.data.title.startsWith('Aviso'));

describe('avisos', () => {
  it('segmenta por categoria e manda e-mail só para quem consentiu', async () => {
    const { h, a, b } = await setup();
    const r = await h.call<{ notified: number; emailed: number; scheduled: boolean }>(
      'notices.publish',
      { tenantId: h.tenantId, title: 'Aviso para efetivos', ...base, audience: { all: false, categoryIds: ['efetivo'], groups: [], boardOnly: false } },
      h.actors.secretario
    );
    expect(r.scheduled).toBe(false);
    expect((await notifFor(h, a.who.uid)).length).toBe(1);
    expect((await notifFor(h, b.who.uid)).length).toBe(0);
    const outbox = await h.store.query<{ template: string }>(P.outbox(h.tenantId), { where: [['template', '==', 'aviso']] });
    expect(outbox.length).toBe(r.emailed);
    expect(r.emailed).toBe(1);
  });

  it('para todos alcança os dois, mas o e-mail respeita a preferência', async () => {
    const { h, a, b } = await setup();
    const r = await h.call<{ emailed: number }>('notices.publish', { tenantId: h.tenantId, title: 'Aviso geral', ...base, audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, h.actors.secretario);
    expect((await notifFor(h, a.who.uid)).length).toBe(1);
    expect((await notifFor(h, b.who.uid)).length).toBe(1);
    // diretoria sem cadastro de sócio recebe e-mail interno; o sócio sem consentimento não
    const sent = await h.store.query<{ toHash: string }>(P.outbox(h.tenantId), { where: [['template', '==', 'aviso']] });
    const hashB = await h.env.crypto.sha256Hex('socio2@teste.local');
    expect(sent.some(s => s.data.toHash === hashB)).toBe(false);
    expect(r.emailed).toBeGreaterThanOrEqual(1);
  });

  it('só diretoria não chega ao sócio', async () => {
    const { h, a } = await setup();
    await h.call('notices.publish', { tenantId: h.tenantId, title: 'Aviso interno', ...base, channels: ['app'], audience: { all: false, categoryIds: [], groups: [], boardOnly: true } }, h.actors.secretario);
    expect((await notifFor(h, a.who.uid)).length).toBe(0);
    expect((await notifFor(h, 'tesoureiro')).length).toBe(1);
  });

  it('sem porta de push, o envio fica registrado como simulado', async () => {
    const { h } = await setup();
    await h.call('notices.publish', { tenantId: h.tenantId, title: 'Aviso push', ...base, channels: ['push'], audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, h.actors.secretario);
    const push = await h.store.query<{ status: string; channel: string }>(P.outbox(h.tenantId), { where: [['channel', '==', 'push']] });
    expect(push.length).toBe(1);
    expect(push[0].data.status).toBe('simulado');
  });

  it('push chega aos aparelhos cadastrados e apaga token que não vale mais', async () => {
    const { h, a } = await setup();
    const sent: { tokens: string[]; title: string; link: string }[] = [];
    h.env.push = {
      async send(tokens, msg) {
        sent.push({ tokens, title: msg.title, link: msg.link });
        return { sent: tokens.length - 1, invalid: tokens.filter(t => t.startsWith('velho')) };
      },
    };
    await h.call('push.register', { token: 'token-bom-0123456789abcdef', platform: 'teste' }, a.who);
    await h.call('push.register', { token: 'velho-token-0123456789abcdef', platform: 'teste' }, a.who);
    await h.call('notices.publish', { tenantId: h.tenantId, title: 'Ensaio cancelado', ...base, channels: ['push'], audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, h.actors.secretario);
    const mine = sent.find(x => x.tokens.includes('token-bom-0123456789abcdef'));
    expect(mine?.title).toBe('Ensaio cancelado');
    expect(mine?.link).toBe(`/${h.tenant.slug}/avisos`);
    const left = await h.store.query<{ token: string }>(`users/${a.who.uid}/pushTokens`);
    expect(left.map(x => x.data.token)).toEqual(['token-bom-0123456789abcdef']);
    // Só push: nada aparece no sino do portal
    expect((await notifFor(h, a.who.uid)).length).toBe(0);
  });

  it('sócio não publica aviso', async () => {
    const { h, a } = await setup();
    await expect(
      h.call('notices.publish', { tenantId: h.tenantId, title: 'Aviso pirata', ...base, audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, a.who)
    ).rejects.toThrow();
  });

  it('agendado só notifica quando a rotina diária encontra o horário', async () => {
    const { h, a } = await setup();
    const publishAt = new Date(Date.parse('2026-11-02T12:00:00Z') + 2 * 86400_000).toISOString();
    const r = await h.call<{ id: string; scheduled: boolean }>('notices.publish', { tenantId: h.tenantId, title: 'Aviso agendado', ...base, publishAt, audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, h.actors.secretario);
    expect(r.scheduled).toBe(true);
    expect((await notifFor(h, a.who.uid)).length).toBe(0);
    await expect(h.call('notices.confirmRead', { tenantId: h.tenantId, id: r.id }, a.who)).rejects.toThrow();
    await runDailyJobs(h.env, h.tenantId);
    expect((await notifFor(h, a.who.uid)).length).toBe(0);
    h.clock.advance(3 * 86400_000);
    await runDailyJobs(h.env, h.tenantId);
    expect((await notifFor(h, a.who.uid)).length).toBe(1);
    const n = await h.store.get<{ status: string }>(P.notice(h.tenantId, r.id));
    expect(n?.status).toBe('publicado');
    await runDailyJobs(h.env, h.tenantId);
    expect((await notifFor(h, a.who.uid)).length).toBe(1);
  });

  it('confirmação de leitura conta uma vez só e barra quem não é do público', async () => {
    const { h, a, b } = await setup();
    const r = await h.call<{ id: string }>('notices.publish', { tenantId: h.tenantId, title: 'Aviso efetivos', ...base, audience: { all: false, categoryIds: ['efetivo'], groups: [], boardOnly: false } }, h.actors.secretario);
    const first = await h.call<{ already: boolean }>('notices.confirmRead', { tenantId: h.tenantId, id: r.id }, a.who);
    const second = await h.call<{ already: boolean }>('notices.confirmRead', { tenantId: h.tenantId, id: r.id }, a.who);
    expect(first.already).toBe(false);
    expect(second.already).toBe(true);
    const n = await h.store.get<{ readCount: number }>(P.notice(h.tenantId, r.id));
    expect(n?.readCount).toBe(1);
    await expect(h.call('notices.confirmRead', { tenantId: h.tenantId, id: r.id }, b.who)).rejects.toThrow();
    const read = await h.store.get<{ displayName: string }>(P.noticeRead(h.tenantId, r.id, a.who.uid));
    expect(read?.displayName).toBe('Ana S.');
  });

  it('editar e apagar exigem permissão de avisos', async () => {
    const { h, a } = await setup();
    const r = await h.call<{ id: string }>('notices.publish', { tenantId: h.tenantId, title: 'Aviso editável', ...base, audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, h.actors.secretario);
    await expect(h.call('notices.update', { tenantId: h.tenantId, id: r.id, data: { pinned: true } }, a.who)).rejects.toThrow();
    await h.call('notices.update', { tenantId: h.tenantId, id: r.id, data: { pinned: true } }, h.actors.secretario);
    expect((await h.store.get<{ pinned: boolean }>(P.notice(h.tenantId, r.id)))?.pinned).toBe(true);
    await expect(h.call('notices.delete', { tenantId: h.tenantId, id: r.id }, h.actors.tesoureiro)).rejects.toThrow();
    await h.call('notices.delete', { tenantId: h.tenantId, id: r.id }, h.actors.secretario);
    expect(await h.store.get(P.notice(h.tenantId, r.id))).toBeNull();
  });

  it('anexo fora da pasta de avisos é recusado', async () => {
    const { h } = await setup();
    await expect(
      h.call('notices.publish', { tenantId: h.tenantId, title: 'Aviso com anexo', ...base, attachments: [{ path: `tenants/${h.tenantId}/members/x/photo/a.jpg`, name: 'a.jpg' }], audience: { all: true, categoryIds: [], groups: [], boardOnly: false } }, h.actors.secretario)
    ).rejects.toThrow(/Anexo/);
  });
});

describe('feed ICS', () => {
  it('gera token, guarda só o hash, devolve o feed e revoga', async () => {
    const { h, a } = await setup();
    await h.call(
      'generic.save',
      {
        tenantId: h.tenantId,
        collection: 'calendar',
        data: { title: 'Ensaio do coral', start: '2026-11-04T22:00:00.000Z', end: '2026-11-05T00:00:00.000Z', allDay: false, category: 'Ensaios', color: '#16a34a', recurrence: { freq: 'semanal' }, visibility: 'socios' },
      },
      h.actors.secretario
    );
    await h.call(
      'generic.save',
      {
        tenantId: h.tenantId,
        collection: 'calendar',
        data: { title: 'Reunião secreta da diretoria', start: '2026-11-06T22:00:00.000Z', end: '2026-11-06T23:00:00.000Z', allDay: false, category: 'Gestão', color: '#dc2626', recurrence: { freq: 'nenhuma' }, visibility: 'diretoria' },
      },
      h.actors.secretario
    );
    const r = await h.call<{ url: string }>('calendar.createIcsToken', { tenantId: h.tenantId }, a.who);
    const token = new URL(r.url).searchParams.get('k')!;
    expect(new URL(r.url).searchParams.get('t')).toBe(h.tenantId);
    expect(JSON.stringify(h.store.dump())).not.toContain(token);
    // não pode ser chamado pela API pública
    await expect(h.call('calendar.icsFeed', { tenantId: h.tenantId, token }, null)).rejects.toThrow(/interna/);
    const feed = await h.call<{ ics: string }>('calendar.icsFeed', { tenantId: h.tenantId, token }, null, { internal: true });
    expect(feed.ics).toContain('BEGIN:VCALENDAR');
    expect(feed.ics).toContain('SUMMARY:Ensaio do coral');
    expect(feed.ics).not.toContain('Reunião secreta');
    const count = feed.ics.split('SUMMARY:Ensaio do coral').length - 1;
    expect(count).toBeGreaterThan(50); // semanal expandido por um ano
    expect(count).toBeLessThan(60);
    await h.call('calendar.revokeIcsToken', { tenantId: h.tenantId }, a.who);
    await expect(h.call('calendar.icsFeed', { tenantId: h.tenantId, token }, null, { internal: true })).rejects.toThrow();
  });

  it('gerar outro token invalida o anterior e diretoria vê itens internos', async () => {
    const { h } = await setup();
    await h.call(
      'generic.save',
      {
        tenantId: h.tenantId,
        collection: 'calendar',
        data: { title: 'Reunião da diretoria', start: '2026-11-06T22:00:00.000Z', end: '2026-11-06T23:00:00.000Z', allDay: false, category: 'Gestão', color: '#dc2626', recurrence: { freq: 'nenhuma' }, visibility: 'diretoria' },
      },
      h.actors.secretario
    );
    const r1 = await h.call<{ url: string }>('calendar.createIcsToken', { tenantId: h.tenantId }, h.actors.tesoureiro);
    const r2 = await h.call<{ url: string }>('calendar.createIcsToken', { tenantId: h.tenantId }, h.actors.tesoureiro);
    const k1 = new URL(r1.url).searchParams.get('k')!;
    const k2 = new URL(r2.url).searchParams.get('k')!;
    await expect(h.call('calendar.icsFeed', { tenantId: h.tenantId, token: k1 }, null, { internal: true })).rejects.toThrow();
    const feed = await h.call<{ ics: string }>('calendar.icsFeed', { tenantId: h.tenantId, token: k2 }, null, { internal: true });
    expect(feed.ics).toContain('Reunião da diretoria');
    const st = await h.call<{ active: boolean }>('calendar.icsStatus', { tenantId: h.tenantId }, h.actors.tesoureiro);
    expect(st.active).toBe(true);
  });

  it('recorrência respeita a data final e o link do Google Agenda é montado', () => {
    const occ = expandOccurrences(
      { id: 'x', title: 'Aula', start: '2026-01-05T20:00:00.000Z', end: '2026-01-05T21:00:00.000Z', allDay: false, category: 'Aulas', color: '#000000', recurrence: { freq: 'mensal', until: '2026-04-30' }, visibility: 'socios', source: 'manual' },
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z'
    );
    expect(occ.map(o => o.start.slice(0, 10))).toEqual(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05']);
    const url = googleCalendarUrl(occ[0]);
    expect(url).toContain('calendar.google.com');
    expect(url).toContain('20260105T200000Z%2F20260105T210000Z');
  });
});
