/** Competições: permissões, preset do tipo da sociedade, lote de resultados idempotente, jogos e isolamento. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { createTenantCore } from '../../src/shared/ops/platform.ts';
import { upsertMembership } from '../../src/shared/ops/access.ts';
import type { CompetitionDoc, CompetitionMatchDoc, CompetitionResultDoc, TenantDoc } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;

const STAGES = [
  { id: 'e1', name: 'Etapa 1', date: '2026-03-10' },
  { id: 'e2', name: 'Etapa 2' },
];

async function newComp(h: H, data: Record<string, unknown> = {}) {
  const { id } = await h.call<{ id: string }>(
    'competitions.save',
    { tenantId: h.tenantId, data: { name: 'Liga Regional de Tiro', scope: 'externo', organizer: 'Liga Regional', stages: STAGES, ...data } },
    h.actors.diretor_eventos
  );
  return id;
}

const results = (h: H, id: string) => h.store.query<CompetitionResultDoc>(P.competitionResults(h.tenantId, id));

describe('competitions.save', () => {
  it('cria com o preset do tipo da sociedade e valida', async () => {
    const h = await makeTestTenant();
    await h.store.update(P.tenant(h.tenantId), { societyType: 'futebol' });
    const { id } = await h.call<{ id: string }>('competitions.save', { tenantId: h.tenantId }, h.actors.presidente);
    const c = (await h.store.get<CompetitionDoc>(P.competition(h.tenantId, id)))!;
    expect(c).toMatchObject({ format: 'times', unit: 'gols', higherIsBetter: true, season: '2026', status: 'planejada', publicRanking: false, pointsWin: 3 });
    await expect(newComp(h, { aggregate: 'melhores' })).rejects.toThrow(/melhores/);
    await expect(newComp(h, { aggregate: 'melhores', bestN: 3 })).rejects.toThrow(/etapas/);
    await expect(newComp(h, { stages: [{ id: 'e1', name: 'A' }, { id: 'e1', name: 'B' }] })).rejects.toThrow(/repetida/);
    await expect(newComp(h, { teams: [{ id: 't1', name: 'A' }, { id: 't1', name: 'B' }] })).rejects.toThrow(/repetido/);
    await expect(newComp(h, { pointsWin: -1 })).rejects.toThrow(/pointsWin/);
    const audit = await h.store.query<{ action: string }>(P.audit(h.tenantId), { where: [['action', '==', 'competitions.created']] });
    expect(audit).toHaveLength(1);
  });

  it('sem permissão de competições não cria nem edita', async () => {
    const h = await makeTestTenant();
    const s = await makeMember(h);
    await expect(h.call('competitions.save', { tenantId: h.tenantId }, s.who)).rejects.toThrow(/papel/);
    await expect(h.call('competitions.save', { tenantId: h.tenantId }, h.actors.secretario)).rejects.toThrow(/papel/);
    const id = await newComp(h);
    await expect(h.call('competitions.save', { tenantId: h.tenantId, id, data: { name: 'Outro nome' } }, h.actors.tesoureiro)).rejects.toThrow(/papel/);
    await h.call('competitions.save', { tenantId: h.tenantId, id, data: { aggregate: 'melhores', bestN: 1 } }, h.actors.diretor_eventos);
    await h.call('competitions.save', { tenantId: h.tenantId, id, data: { aggregate: 'soma' } }, h.actors.diretor_eventos);
    const c = (await h.store.get<CompetitionDoc>(P.competition(h.tenantId, id)))!;
    expect(c.aggregate).toBe('soma');
    expect(c.bestN).toBeUndefined();
  });
});

describe('competitions.saveResults', () => {
  it('sócio não lança; lote substitui a etapa de forma idempotente e vincula só sócio existente', async () => {
    const h = await makeTestTenant();
    const s = await makeMember(h);
    const id = await newComp(h);
    const entries = [
      { participantName: 'Pessoa de Teste Silva', memberId: s.memberId, value: 98 },
      { participantName: 'Visitante da Liga', value: 95.5 },
      { participantName: 'Fantasma', memberId: 'naoexiste', value: 90 },
    ];
    await expect(h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries }, s.who)).rejects.toThrow(/papel/);
    const r1 = await h.call<{ saved: number; unlinked: number }>('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries }, h.actors.diretor_eventos);
    expect(r1).toMatchObject({ saved: 3, removed: 0, unlinked: 1 });
    // Repetir o mesmo lote não duplica
    await h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries }, h.actors.diretor_eventos);
    let rows = await results(h, id);
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.data.participantName === 'Fantasma')!.data.memberId).toBeUndefined();
    expect(rows.find(r => r.data.memberId === s.memberId)!.id).toBe(`e1_m-${s.memberId}`);
    // Corrigir a etapa: quem saiu do lote é removido, a outra etapa fica intacta
    await h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e2', entries: [{ participantName: 'Visitante da Liga', value: 97 }] }, h.actors.diretor_eventos);
    const r3 = await h.call<{ removed: number }>('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries: entries.slice(0, 2).map(e => ({ ...e, value: e.value + 1 })) }, h.actors.diretor_eventos);
    expect(r3.removed).toBe(1);
    rows = await results(h, id);
    expect(rows).toHaveLength(3);
    expect(rows.filter(r => r.data.stageId === 'e1').map(r => r.data.value).sort()).toEqual([96.5, 99]);
    const c = (await h.store.get<CompetitionDoc>(P.competition(h.tenantId, id)))!;
    expect(c.status).toBe('em_andamento');
    // Com requestId, repetir a chamada devolve o mesmo resultado
    const rq = { tenantId: h.tenantId, competitionId: id, stageId: 'e2', entries: [], requestId: 'r-1' };
    const a = await h.call('competitions.saveResults', rq, h.actors.diretor_eventos);
    expect(await h.call('competitions.saveResults', rq, h.actors.diretor_eventos)).toEqual(a);
  });

  it('etapa inexistente, categoria inválida, nome repetido e formato times falham', async () => {
    const h = await makeTestTenant();
    const id = await newComp(h, { categories: ['Carabina', 'Pistola'] });
    const call = (stageId: string, entries: object[]) => h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId, entries }, h.actors.diretor_eventos);
    await expect(call('e9', [{ participantName: 'Ana Souza', category: 'Carabina', value: 1 }])).rejects.toThrow(/Etapa não encontrada/);
    await expect(call('e1', [{ participantName: 'Ana Souza', value: 1 }])).rejects.toThrow(/categoria/);
    await expect(call('e1', [{ participantName: 'Ana Souza', category: 'Arco', value: 1 }])).rejects.toThrow(/não existe/);
    await expect(call('e1', [{ participantName: 'Ana Souza', category: 'carabina', value: 1 }, { participantName: 'ana souza', category: 'Carabina', value: 2 }])).rejects.toThrow(/duas vezes/);
    // mesma pessoa em duas categorias pode
    await call('e1', [{ participantName: 'Ana Souza', category: 'carabina', value: 1 }, { participantName: 'Ana Souza', category: 'Pistola', value: 2 }]);
    expect((await results(h, id)).map(r => r.data.category).sort()).toEqual(['Carabina', 'Pistola']);
    const times = await newComp(h, { format: 'times', teams: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    await expect(h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: times, stageId: 'e1', entries: [] }, h.actors.diretor_eventos)).rejects.toThrow(/times/);
  });

  it('não apaga competição com resultados; encerrada não recebe lançamento', async () => {
    const h = await makeTestTenant();
    const id = await newComp(h);
    const vazia = await newComp(h);
    await h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries: [{ participantName: 'Ana Souza', value: 1 }] }, h.actors.diretor_eventos);
    await expect(h.call('competitions.delete', { tenantId: h.tenantId, id }, h.actors.diretor_eventos)).rejects.toThrow(/Encerre/);
    await h.call('competitions.delete', { tenantId: h.tenantId, id: vazia }, h.actors.diretor_eventos);
    expect(await h.store.get(P.competition(h.tenantId, vazia))).toBeNull();
    await expect(h.call('competitions.save', { tenantId: h.tenantId, id, data: { stages: [STAGES[1]] } }, h.actors.diretor_eventos)).rejects.toThrow(/já tem resultados/);
    await expect(h.call('competitions.save', { tenantId: h.tenantId, id, data: { format: 'times' } }, h.actors.diretor_eventos)).rejects.toThrow(/formato/);
    await h.call('competitions.setStatus', { tenantId: h.tenantId, id, status: 'encerrada' }, h.actors.diretor_eventos);
    await expect(h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries: [] }, h.actors.diretor_eventos)).rejects.toThrow(/encerrada/);
  });
});

describe('competitions.saveMatch', () => {
  it('times existentes, mandante diferente do visitante, placar inteiro ou vazio', async () => {
    const h = await makeTestTenant();
    const id = await newComp(h, { format: 'times', teams: [{ id: 'a', name: 'Atlético' }, { id: 'b', name: 'Brasil' }] });
    const call = (data: object, who = h.actors.diretor_eventos) => h.call<{ id: string }>('competitions.saveMatch', { tenantId: h.tenantId, competitionId: id, ...data }, who);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'z' })).rejects.toThrow(/Time não cadastrado/);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'a' })).rejects.toThrow(/diferentes/);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 1.5, awayScore: 0 })).rejects.toThrow(/homeScore/);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'b', homeScore: -1, awayScore: 0 })).rejects.toThrow(/homeScore/);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: null })).rejects.toThrow(/dois placares/);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'b', stageId: 'x9' })).rejects.toThrow(/Rodada/);
    const s = await makeMember(h);
    await expect(call({ homeTeamId: 'a', awayTeamId: 'b' }, s.who)).rejects.toThrow(/papel/);
    const { id: mid } = await call({ homeTeamId: 'a', awayTeamId: 'b', stageId: 'e1' });
    await call({ id: mid, homeTeamId: 'a', awayTeamId: 'b', stageId: 'e1', homeScore: 2, awayScore: 1 });
    const m = (await h.store.get<CompetitionMatchDoc>(`${P.competitionMatches(h.tenantId, id)}/${mid}`))!;
    expect(m).toMatchObject({ homeScore: 2, awayScore: 1, stageId: 'e1' });
    await expect(h.call('competitions.save', { tenantId: h.tenantId, id, data: { teams: [{ id: 'a', name: 'Atlético' }] } }, h.actors.diretor_eventos)).rejects.toThrow(/jogos/);
    await h.call('competitions.deleteMatch', { tenantId: h.tenantId, competitionId: id, id: mid }, h.actors.diretor_eventos);
    expect(await h.store.get(`${P.competitionMatches(h.tenantId, id)}/${mid}`)).toBeNull();
  });
});

describe('isolamento entre sociedades', () => {
  it('quem é de outra sociedade não grava aqui; ids de uma não valem na outra', async () => {
    const h = await makeTestTenant();
    const id = await newComp(h);
    // Segunda sociedade no mesmo banco, com a sua própria diretoria
    const mctx = {
      ...h.env, actor: h.actors.master, ip: '10.0.0.1', nowIso: h.env.now().toISOString(),
      async audit() {}, requireActor: () => h.actors.master, can: () => true, require: () => undefined,
    } as unknown as Parameters<typeof createTenantCore>[0];
    const { tenantId: other } = await createTenantCore(mctx, { name: 'Outra Sociedade', slug: 'outra-sociedade', planId: 'completo', adminEmails: ['pres.b@teste.local'] });
    const tenantB = (await h.store.get<TenantDoc>(P.tenant(other)))!;
    const presB = actor('presB');
    await upsertMembership({ ...mctx, tenantId: other, tenant: tenantB } as never, tenantB, presB, ['presidente']);

    await expect(h.call('competitions.saveResults', { tenantId: h.tenantId, competitionId: id, stageId: 'e1', entries: [{ participantName: 'Intruso', value: 1 }] }, presB)).rejects.toThrow(/não faz parte/);
    await expect(h.call('competitions.setStatus', { tenantId: h.tenantId, id, status: 'encerrada' }, presB)).rejects.toThrow(/não faz parte/);
    await expect(h.call('competitions.saveResults', { tenantId: other, competitionId: id, stageId: 'e1', entries: [] }, presB)).rejects.toThrow(/Competição não encontrada/);
    await expect(h.call('competitions.save', { tenantId: h.tenantId }, h.actors.estranho)).rejects.toThrow(/não faz parte/);
    expect(await results(h, id)).toHaveLength(0);
  });
});
