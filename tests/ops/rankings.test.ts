/** Cálculo dos rankings: etapas, temporada (soma, média, melhores N), empates, tempo, categorias e tabela de futebol. */
import { describe, expect, it } from 'vitest';
import {
  formatTime,
  formatValue,
  memberPositions,
  overallRanking,
  parseTime,
  parseValue,
  resultDocId,
  stageRanking,
  teamStandings,
} from '../../src/shared/rankings.ts';
import type { CompetitionDoc } from '../../src/shared/types.ts';

const stages = [
  { id: 'e1', name: 'Etapa 1' },
  { id: 'e2', name: 'Etapa 2' },
  { id: 'e3', name: 'Etapa 3' },
];
const cfg = (extra: Partial<CompetitionDoc> = {}) =>
  ({ higherIsBetter: true, aggregate: 'soma', stages, categories: [], ...extra }) as Pick<CompetitionDoc, 'higherIsBetter' | 'aggregate' | 'bestN' | 'stages' | 'categories'>;
const r = (stageId: string, participantName: string, value: number, extra: { memberId?: string; category?: string } = {}) => ({ stageId, participantName, value, ...extra });

describe('ranking por etapa', () => {
  it('ordena, divide a posição no empate (1, 1, 3) e respeita menor é melhor', () => {
    const res = [r('e1', 'Ana', 95), r('e1', 'Bruno', 98), r('e1', 'Carla', 95), r('e1', 'Davi', 90), r('e2', 'Ana', 100)];
    const rows = stageRanking(res, cfg(), 'e1');
    expect(rows.map(x => [x.participantName, x.position])).toEqual([
      ['Bruno', 1],
      ['Ana', 2],
      ['Carla', 2],
      ['Davi', 4],
    ]);
    const low = stageRanking(res, cfg({ higherIsBetter: false }), 'e1');
    expect(low.map(x => x.participantName)).toEqual(['Davi', 'Ana', 'Carla', 'Bruno']);
  });

  it('valor repetido do mesmo participante na etapa: vale o melhor', () => {
    const rows = stageRanking([r('e1', 'Ana', 80), r('e1', 'ana ', 92)], cfg(), 'e1');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(92);
  });
});

describe('ranking geral da temporada', () => {
  const res = [
    r('e1', 'Ana', 90), r('e2', 'Ana', 80), r('e3', 'Ana', 100),
    r('e1', 'Bruno', 95), r('e2', 'Bruno', 95),
    r('e1', 'Carla', 70), r('e2', 'Carla', 70), r('e3', 'Carla', 70),
  ];

  it('soma', () => {
    const rows = overallRanking(res, cfg());
    expect(rows.map(x => [x.participantName, x.total, x.position, x.stagesPlayed])).toEqual([
      ['Ana', 270, 1, 3],
      ['Carla', 210, 2, 3],
      ['Bruno', 190, 3, 2],
    ]);
  });

  it('média', () => {
    const rows = overallRanking(res, cfg({ aggregate: 'media' }));
    expect(rows.map(x => [x.participantName, x.total])).toEqual([
      ['Bruno', 95],
      ['Ana', 90],
      ['Carla', 70],
    ]);
  });

  it('melhores N descarta os piores', () => {
    const rows = overallRanking(res, cfg({ aggregate: 'melhores', bestN: 2 }));
    expect(rows.map(x => [x.participantName, x.total, x.stagesCounted])).toEqual([
      ['Ana', 190, 2],
      ['Bruno', 190, 2],
      ['Carla', 140, 2],
    ]);
    // Ana e Bruno empatam em 190: desempate pelo melhor resultado único (Ana 100 x Bruno 95)
    expect(rows[0].position).toBe(1);
    expect(rows[1].position).toBe(2);
    expect(rows[0].discarded).toEqual(['e2']);
  });

  it('desempate: melhor resultado, depois mais etapas; empate total divide a posição', () => {
    const tie = [r('e1', 'Zeca', 50), r('e2', 'Zeca', 50), r('e1', 'Beto', 100), r('e1', 'Alice', 50), r('e2', 'Alice', 50)];
    const rows = overallRanking(tie, cfg());
    // Beto 100 em 1 etapa, Zeca e Alice 100 em 2: melhor único decide (Beto 100)
    expect(rows.map(x => [x.participantName, x.position])).toEqual([
      ['Beto', 1],
      ['Alice', 2],
      ['Zeca', 2],
    ]);
    const tie2 = [r('e1', 'Ana', 50), r('e2', 'Ana', 50), r('e1', 'Bia', 50), r('e2', 'Bia', 0)];
    const rows2 = overallRanking(tie2, cfg());
    // Ana 100 em 2; Bia 50 em 2: soma decide
    expect(rows2[0].participantName).toBe('Ana');
    const tie3 = [r('e1', 'Ana', 50), r('e2', 'Ana', 50), r('e1', 'Bia', 50), r('e2', 'Bia', 50), r('e3', 'Bia', 0)];
    const rows3 = overallRanking(tie3, cfg());
    // mesma soma e mesmo melhor: mais etapas disputadas vence
    expect(rows3.map(x => [x.participantName, x.position])).toEqual([
      ['Bia', 1],
      ['Ana', 2],
    ]);
  });

  it('sócio vinculado é o mesmo participante mesmo com nome escrito diferente', () => {
    const rows = overallRanking([r('e1', 'José da Silva', 10, { memberId: 'm1' }), r('e2', 'Jose Silva', 20, { memberId: 'm1' })], cfg());
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(30);
  });

  it('categorias: filtro e posição dentro de cada categoria', () => {
    const c = cfg({ categories: ['Masculino', 'Feminino'] });
    const cat = [
      r('e1', 'Ana', 90, { category: 'Feminino' }),
      r('e1', 'Bia', 95, { category: 'Feminino' }),
      r('e1', 'Caio', 80, { category: 'Masculino' }),
      r('e1', 'Duda', 99, { category: 'Masculino' }),
    ];
    const fem = overallRanking(cat, c, { category: 'feminino' });
    expect(fem.map(x => [x.participantName, x.position])).toEqual([
      ['Bia', 1],
      ['Ana', 2],
    ]);
    const all = overallRanking(cat, c);
    expect(all.map(x => [x.category, x.participantName, x.position])).toEqual([
      ['Masculino', 'Duda', 1],
      ['Masculino', 'Caio', 2],
      ['Feminino', 'Bia', 1],
      ['Feminino', 'Ana', 2],
    ]);
  });

  it('menor é melhor (tempo): quem faltou a etapa não leva vantagem na soma', () => {
    const c = cfg({ higherIsBetter: false, unit: 'tempo' } as Partial<CompetitionDoc>);
    const t = [r('e1', 'Ana', 61.5), r('e2', 'Ana', 60.2), r('e1', 'Bruno', 59.9), r('e1', 'Caio', 62), r('e2', 'Caio', 61)];
    const rows = overallRanking(t, c);
    expect(rows.map(x => x.participantName)).toEqual(['Ana', 'Caio', 'Bruno']);
    expect(formatValue(rows[0].total, 'tempo')).toBe('02:01,70');
    const media = overallRanking(t, { ...c, aggregate: 'media' });
    expect(media[0].participantName).toBe('Bruno');
  });
});

describe('tempo e valores', () => {
  it('formata e lê mm:ss,cc', () => {
    expect(formatTime(83.456)).toBe('01:23,46');
    expect(formatTime(3725.5)).toBe('1:02:05,50');
    expect(parseTime('1:23,45')).toBe(83.45);
    expect(parseTime('83.45')).toBe(83.45);
    expect(parseTime('1:02:05,5')).toBe(3725.5);
    expect(parseTime('abc')).toBeNull();
    expect(parseValue('1.234,5', 'pontos')).toBe(1234.5);
    expect(parseValue('98', 'pinos')).toBe(98);
    expect(parseValue('x', 'pinos')).toBeNull();
    expect(formatValue(1234.5, 'pontos')).toBe('1.234,5');
  });

  it('id do resultado é estável por etapa, participante e categoria', () => {
    expect(resultDocId('e1', { participantName: 'José  Silva' })).toBe('e1_n-jose-silva');
    expect(resultDocId('e1', { participantName: 'x', memberId: 'm1', category: 'Sênior' })).toBe('e1_m-m1__senior');
  });
});

describe('tabela de classificação (times)', () => {
  const teams = [
    { id: 'a', name: 'Atlético' },
    { id: 'b', name: 'Brasil' },
    { id: 'c', name: 'Cruzeiro' },
    { id: 'd', name: 'Dínamo' },
  ];
  const cfgT = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, teams };
  const m = (homeTeamId: string, awayTeamId: string, homeScore: number | null, awayScore: number | null) => ({ homeTeamId, awayTeamId, homeScore, awayScore });

  it('J, V, E, D, GP, GC, SG e pontos; jogo sem placar não conta', () => {
    const rows = teamStandings([m('a', 'b', 2, 1), m('c', 'd', 0, 0), m('a', 'c', 1, 1), m('b', 'd', null, null)], cfgT);
    const a = rows.find(x => x.teamId === 'a')!;
    expect(a).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 2, goalDiff: 1, points: 4, position: 1 });
    expect(rows.find(x => x.teamId === 'b')!.played).toBe(1);
  });

  it('critérios: pontos, vitórias, saldo, gols pró', () => {
    // vitória 2, empate 1: a com 1V 1D (2 pts) e b com 2E (2 pts) => a na frente por vitórias
    const rows = teamStandings([m('a', 'c', 3, 0), m('a', 'd', 0, 3), m('b', 'c', 1, 1), m('b', 'd', 1, 1)], { ...cfgT, pointsWin: 2 });
    expect(rows.find(x => x.teamId === 'a')!.points).toBe(rows.find(x => x.teamId === 'b')!.points);
    const order = rows.map(x => x.teamId);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    // saldo: c e d
    const r2 = teamStandings([m('c', 'a', 5, 0), m('d', 'b', 1, 0)], cfgT);
    expect(r2.map(x => x.teamId).slice(0, 2)).toEqual(['c', 'd']);
    // gols pró com mesmo saldo
    const r3 = teamStandings([m('c', 'a', 3, 2), m('d', 'b', 1, 0)], cfgT);
    expect(r3.map(x => x.teamId).slice(0, 2)).toEqual(['c', 'd']);
  });

  it('confronto direto desempata quem está igual em tudo', () => {
    // c vence d no confronto; ambos com 3 pts, 1 V, saldo 0, 2 GP
    const rows = teamStandings([m('d', 'c', 1, 2), m('c', 'a', 0, 1), m('d', 'b', 1, 0)], cfgT);
    const c = rows.find(x => x.teamId === 'c')!;
    const d = rows.find(x => x.teamId === 'd')!;
    expect([c.points, c.wins, c.goalDiff, c.goalsFor]).toEqual([d.points, d.wins, d.goalDiff, d.goalsFor]);
    expect(c.position).toBeLessThan(d.position);
    // sem jogos: todos empatados na posição 1, ordem por nome
    const empty = teamStandings([], cfgT);
    expect(empty.map(x => [x.name, x.position])).toEqual([
      ['Atlético', 1],
      ['Brasil', 1],
      ['Cruzeiro', 1],
      ['Dínamo', 1],
    ]);
  });

  it('pontuação configurável', () => {
    const rows = teamStandings([m('a', 'b', 1, 0), m('c', 'd', 1, 1)], { ...cfgT, pointsWin: 2, pointsDraw: 1, pointsLoss: 0 });
    expect(rows[0]).toMatchObject({ teamId: 'a', points: 2 });
  });
});

describe('minhas posições', () => {
  it('posição do sócio em várias competições individuais', () => {
    const comp = (id: string, extra: Partial<CompetitionDoc> = {}) =>
      ({ id, name: `Comp ${id}`, format: 'individual', higherIsBetter: true, aggregate: 'soma', stages, categories: [], ...extra }) as CompetitionDoc;
    const out = memberPositions('m1', [
      { competition: comp('x'), results: [r('e1', 'Eu', 10, { memberId: 'm1' }), r('e1', 'Outro', 20)] },
      { competition: comp('y'), results: [r('e1', 'Eu', 30, { memberId: 'm1' }), r('e1', 'Outro', 20)] },
      { competition: comp('z', { format: 'times' }), results: [] },
      { competition: comp('w'), results: [r('e1', 'Outro', 20)] },
    ]);
    expect(out.map(p => [p.competitionId, p.position, p.of])).toEqual([
      ['y', 1, 2],
      ['x', 2, 2],
    ]);
  });
});
