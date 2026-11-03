/**
 * Competições e ranking: torneios internos e etapas externas (liga, federação), formato
 * individual (resultado por etapa) ou times (jogos com placar). O cálculo do ranking fica em
 * `src/shared/rankings.ts`; aqui só se grava, sempre com auditoria e sem dado pessoal além do
 * nome do participante.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { deleteField } from '../core/store.ts';
import { P } from '../paths.ts';
import { societyType } from '../societyTypes.ts';
import { normName, resultDocId } from '../rankings.ts';
import type { CompetitionDoc, CompetitionMatchDoc, CompetitionResultDoc, MemberDoc } from '../types.ts';
import { tid } from './helpers.ts';

const zStage = z.object({ id: zId, name: zText(80).min(1), date: zDateKey.optional(), location: zText(120).optional() });
const zTeam = z.object({ id: zId, name: zText(80).min(1) });
const zPoints = z.number().int().min(0).max(100);

const zCompetitionData = z.object({
  name: zText(120).min(2),
  scope: z.enum(['interno', 'externo']),
  organizer: zText(120),
  season: zText(20).min(1),
  format: z.enum(['individual', 'times']),
  unit: zText(30).min(1),
  higherIsBetter: z.boolean(),
  aggregate: z.enum(['soma', 'media', 'melhores']),
  bestN: z.number().int().min(1).max(100).optional(),
  pointsWin: zPoints,
  pointsDraw: zPoints,
  pointsLoss: zPoints,
  categories: z.array(zText(40).min(1)).max(30),
  stages: z.array(zStage).max(100),
  teams: z.array(zTeam).max(64),
  status: z.enum(['planejada', 'em_andamento', 'encerrada']),
  publicRanking: z.boolean(),
});

type CompetitionData = z.infer<typeof zCompetitionData>;

function compPath(ctx: OpContext, id: string): string {
  return P.competition(tid(ctx), id);
}

async function getCompetition(ctx: OpContext, id: string): Promise<CompetitionDoc> {
  const c = await ctx.store.get<CompetitionDoc>(compPath(ctx, id));
  if (!c) fail('not-found', 'Competição não encontrada.');
  return c!;
}

/** Valores padrão de uma competição nova, pelo tipo da sociedade */
export function competitionDefaults(ctx: Pick<OpContext, 'tenant' | 'now'>): CompetitionData {
  const preset = societyType(ctx.tenant?.societyType).competition;
  const season = String(ctx.now().getFullYear());
  return {
    name: `${preset.label} ${season}`,
    scope: 'interno',
    organizer: ctx.tenant?.name || '',
    season,
    format: preset.format,
    unit: preset.unit,
    higherIsBetter: preset.higherIsBetter,
    aggregate: 'soma',
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    categories: [],
    stages: [],
    teams: [],
    status: 'planejada',
    publicRanking: false,
  };
}

function dupes(list: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const x of list) {
    const k = normName(x);
    if (seen.has(k)) out.add(x);
    seen.add(k);
  }
  return [...out];
}

function validate(d: CompetitionData): void {
  if (d.aggregate === 'melhores') {
    if (!d.bestN) fail('invalid-argument', 'Informe quantos melhores resultados entram no ranking.');
    if (d.stages.length && d.bestN! > d.stages.length) fail('invalid-argument', `Melhores ${d.bestN} resultados é mais do que as ${d.stages.length} etapas cadastradas.`);
  }
  if (d.pointsWin < d.pointsDraw || d.pointsDraw < d.pointsLoss) fail('invalid-argument', 'Os pontos precisam seguir vitória ≥ empate ≥ derrota.');
  const ds = dupes(d.stages.map(s => s.id));
  if (ds.length) fail('invalid-argument', `Etapa repetida: ${ds.join(', ')}.`);
  const dt = dupes(d.teams.map(t => t.id));
  if (dt.length) fail('invalid-argument', `Time repetido: ${dt.join(', ')}.`);
  const dtn = dupes(d.teams.map(t => t.name));
  if (dtn.length) fail('invalid-argument', `Nome de time repetido: ${dtn.join(', ')}.`);
  const dc = dupes(d.categories);
  if (dc.length) fail('invalid-argument', `Categoria repetida: ${dc.join(', ')}.`);
}

export const competitionsSave = defineOp({
  name: 'competitions.save',
  input: zTenant.extend({ id: zId.optional(), data: zCompetitionData.partial().default({}) }),
  auth: 'user',
  tenant: { perm: null },
  module: 'competicoes',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    if (input.id) {
      ctx.require('competicoes', 'editar');
      const cur = await getCompetition(ctx, input.id);
      const { id: _id, createdAt: _c, updatedAt: _u, ...curData } = cur;
      const merged = zCompetitionData.parse({ ...curData, ...input.data });
      validate(merged);
      const results = await ctx.store.query<CompetitionResultDoc>(P.competitionResults(t, input.id), { limit: 2000 });
      const matches = await ctx.store.query<CompetitionMatchDoc>(P.competitionMatches(t, input.id), { limit: 2000 });
      if (merged.format !== cur.format && (results.length || matches.length)) {
        fail('failed-precondition', 'Já há resultados lançados: o formato não pode mudar. Crie outra competição.');
      }
      const stageIds = new Set(merged.stages.map(s => s.id));
      const orphan = cur.stages.find(s => !stageIds.has(s.id) && (results.some(r => r.data.stageId === s.id) || matches.some(m => m.data.stageId === s.id)));
      if (orphan) fail('failed-precondition', `A etapa "${orphan.name}" já tem resultados. Apague os resultados antes de tirá-la.`);
      const teamIds = new Set(merged.teams.map(x => x.id));
      const orphanTeam = cur.teams.find(x => !teamIds.has(x.id) && matches.some(m => m.data.homeTeamId === x.id || m.data.awayTeamId === x.id));
      if (orphanTeam) fail('failed-precondition', `O time "${orphanTeam.name}" tem jogos cadastrados. Apague os jogos antes de tirá-lo.`);
      const clearBest = merged.aggregate !== 'melhores';
      if (clearBest) delete merged.bestN;
      await ctx.store.update(compPath(ctx, input.id), { ...merged, ...(clearBest && cur.bestN !== undefined ? { bestN: deleteField() } : {}), updatedAt: ctx.nowIso });
      await ctx.audit('competitions.updated', input.id, { format: merged.format, stages: merged.stages.length });
      return { id: input.id };
    }
    ctx.require('competicoes', 'criar');
    const data = zCompetitionData.parse({ ...competitionDefaults(ctx), ...input.data });
    validate(data);
    if (data.aggregate !== 'melhores') delete data.bestN;
    const id = ctx.store.newId();
    const doc: CompetitionDoc = { id, ...data, createdAt: ctx.nowIso, updatedAt: ctx.nowIso };
    await ctx.store.set(compPath(ctx, id), doc as unknown as Record<string, unknown>);
    await ctx.audit('competitions.created', id, { format: data.format, scope: data.scope });
    return { id };
  },
});

export const competitionsDelete = defineOp({
  name: 'competitions.delete',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: ['competicoes', 'editar'] },
  module: 'competicoes',
  async run(ctx, input) {
    const t = tid(ctx);
    await getCompetition(ctx, input.id);
    const nRes = await ctx.store.count(P.competitionResults(t, input.id));
    const nMat = await ctx.store.count(P.competitionMatches(t, input.id));
    if (nRes || nMat) fail('failed-precondition', 'Esta competição já tem resultados. Encerre a competição em vez de apagar.');
    await ctx.store.delete(compPath(ctx, input.id));
    await ctx.audit('competitions.deleted', input.id);
    return { ok: true };
  },
});

export const competitionsSetStatus = defineOp({
  name: 'competitions.setStatus',
  input: zTenant.extend({ id: zId, status: z.enum(['planejada', 'em_andamento', 'encerrada']) }),
  auth: 'user',
  tenant: { perm: ['competicoes', 'editar'] },
  module: 'competicoes',
  async run(ctx, input) {
    await getCompetition(ctx, input.id);
    await ctx.store.update(compPath(ctx, input.id), { status: input.status, updatedAt: ctx.nowIso });
    await ctx.audit('competitions.status', input.id, { status: input.status });
    return { ok: true };
  },
});

const zEntry = z.object({
  participantName: zText(120).min(2),
  memberId: zId.optional(),
  category: zText(40).optional(),
  value: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  notes: zText(200).optional(),
});

export const competitionsSaveResults = defineOp({
  name: 'competitions.saveResults',
  input: zTenant.extend({ competitionId: zId, stageId: zId, entries: z.array(zEntry).max(400) }),
  auth: 'user',
  tenant: { perm: ['competicoes', 'editar'] },
  module: 'competicoes',
  idempotent: true,
  rateLimit: { per: 'uid', max: 60, windowSec: 600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const c = await getCompetition(ctx, input.competitionId);
    if (c.format !== 'individual') fail('failed-precondition', 'Esta competição é por times: lance os placares dos jogos.');
    if (c.status === 'encerrada') fail('failed-precondition', 'Competição encerrada. Reabra para lançar resultados.');
    const stage = c.stages.find(s => s.id === input.stageId);
    if (!stage) fail('not-found', 'Etapa não encontrada nesta competição.');

    // Sócios citados: vincula só quem existe nesta sociedade
    const ids = [...new Set(input.entries.map(e => e.memberId).filter(Boolean) as string[])];
    const found = new Set<string>();
    for (const id of ids) if (await ctx.store.get<MemberDoc>(P.member(t, id))) found.add(id);

    const docs = new Map<string, CompetitionResultDoc>();
    input.entries.forEach((e, i) => {
      let category: string | undefined;
      if (c.categories.length) {
        if (!e.category) fail('invalid-argument', `Linha ${i + 1} (${e.participantName}): informe a categoria.`);
        category = c.categories.find(x => normName(x) === normName(e.category!));
        if (!category) fail('invalid-argument', `Linha ${i + 1} (${e.participantName}): categoria "${e.category}" não existe nesta competição.`);
      }
      const memberId = e.memberId && found.has(e.memberId) ? e.memberId : undefined;
      const id = resultDocId(input.stageId, { participantName: e.participantName, memberId, category });
      if (docs.has(id)) fail('invalid-argument', `Linha ${i + 1}: ${e.participantName} aparece duas vezes nesta etapa${category ? ` (${category})` : ''}.`);
      docs.set(id, {
        id,
        stageId: input.stageId,
        participantName: e.participantName,
        ...(memberId ? { memberId } : {}),
        ...(category ? { category } : {}),
        value: e.value,
        ...(e.notes ? { notes: e.notes } : {}),
        createdAt: ctx.nowIso,
      });
    });

    const col = P.competitionResults(t, input.competitionId);
    const existing = await ctx.store.query<CompetitionResultDoc>(col, { where: [['stageId', '==', input.stageId]] });
    const toRemove = existing.filter(r => !docs.has(r.id));
    const writes = docs.size + toRemove.length;
    const apply = async (put: (p: string, d: Record<string, unknown>) => unknown, del: (p: string) => unknown) => {
      for (const r of toRemove) await del(r.path);
      for (const d of docs.values()) {
        const prev = existing.find(x => x.id === d.id);
        await put(`${col}/${d.id}`, { ...d, createdAt: prev?.data.createdAt || ctx.nowIso, updatedAt: ctx.nowIso } as unknown as Record<string, unknown>);
      }
    };
    if (writes <= 490) {
      await ctx.store.runTransaction(async tx => {
        await apply((p, d) => tx.set(p, d), p => tx.delete(p));
      });
    } else {
      await apply((p, d) => ctx.store.set(p, d), p => ctx.store.delete(p));
    }
    if (c.status === 'planejada') await ctx.store.update(compPath(ctx, input.competitionId), { status: 'em_andamento', updatedAt: ctx.nowIso });
    else await ctx.store.update(compPath(ctx, input.competitionId), { updatedAt: ctx.nowIso });
    const unlinked = ids.filter(id => !found.has(id)).length;
    await ctx.audit('competitions.results', input.competitionId, { stageId: input.stageId, saved: docs.size, removed: toRemove.length, unlinked });
    return { saved: docs.size, removed: toRemove.length, unlinked };
  },
});

const zScore = z.number().int().min(0).max(999).nullable();

export const competitionsSaveMatch = defineOp({
  name: 'competitions.saveMatch',
  input: zTenant.extend({
    competitionId: zId,
    id: zId.optional(),
    stageId: zId.optional(),
    homeTeamId: zId,
    awayTeamId: zId,
    homeScore: zScore.default(null),
    awayScore: zScore.default(null),
    date: zDateKey.optional(),
    location: zText(120).optional(),
  }),
  auth: 'user',
  tenant: { perm: ['competicoes', 'editar'] },
  module: 'competicoes',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const c = await getCompetition(ctx, input.competitionId);
    if (c.format !== 'times') fail('failed-precondition', 'Esta competição é individual: lance os resultados por etapa.');
    if (c.status === 'encerrada') fail('failed-precondition', 'Competição encerrada. Reabra para lançar placares.');
    const teams = new Set(c.teams.map(x => x.id));
    if (!teams.has(input.homeTeamId) || !teams.has(input.awayTeamId)) fail('invalid-argument', 'Time não cadastrado nesta competição.');
    if (input.homeTeamId === input.awayTeamId) fail('invalid-argument', 'Mandante e visitante precisam ser times diferentes.');
    if ((input.homeScore === null) !== (input.awayScore === null)) fail('invalid-argument', 'Informe os dois placares, ou deixe os dois em branco.');
    if (input.stageId && !c.stages.some(s => s.id === input.stageId)) fail('not-found', 'Rodada não encontrada nesta competição.');
    const col = P.competitionMatches(t, input.competitionId);
    const id = input.id || ctx.store.newId();
    const prev = input.id ? await ctx.store.get<CompetitionMatchDoc>(`${col}/${id}`) : null;
    if (input.id && !prev) fail('not-found', 'Jogo não encontrado.');
    const doc: CompetitionMatchDoc = {
      id,
      ...(input.stageId ? { stageId: input.stageId } : {}),
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      ...(input.date ? { date: input.date } : {}),
      ...(input.location ? { location: input.location } : {}),
      createdAt: prev?.createdAt || ctx.nowIso,
    };
    await ctx.store.set(`${col}/${id}`, doc as unknown as Record<string, unknown>);
    if (c.status === 'planejada' && input.homeScore !== null) await ctx.store.update(compPath(ctx, input.competitionId), { status: 'em_andamento', updatedAt: ctx.nowIso });
    await ctx.audit(input.id ? 'competitions.matchUpdated' : 'competitions.matchCreated', input.competitionId, { matchId: id, scored: input.homeScore !== null });
    return { id };
  },
});

export const competitionsDeleteMatch = defineOp({
  name: 'competitions.deleteMatch',
  input: zTenant.extend({ competitionId: zId, id: zId }),
  auth: 'user',
  tenant: { perm: ['competicoes', 'editar'] },
  module: 'competicoes',
  async run(ctx, input) {
    const c = await getCompetition(ctx, input.competitionId);
    if (c.status === 'encerrada') fail('failed-precondition', 'Competição encerrada. Reabra para mexer nos jogos.');
    const path = `${P.competitionMatches(tid(ctx), input.competitionId)}/${input.id}`;
    if (!(await ctx.store.get(path))) fail('not-found', 'Jogo não encontrado.');
    await ctx.store.delete(path);
    await ctx.audit('competitions.matchDeleted', input.competitionId, { matchId: input.id });
    return { ok: true };
  },
});

export const competitionOps = [competitionsSave, competitionsDelete, competitionsSetStatus, competitionsSaveResults, competitionsSaveMatch, competitionsDeleteMatch];
