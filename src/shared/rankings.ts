/**
 * Cálculo de rankings das competições (funções puras, sem SDK). Usado pela tela, pelos PDFs/CSV
 * e pelos testes. Duas famílias:
 *
 * 1. Formato individual (tiro, bolão, festivais...): cada resultado é o valor de um participante
 *    numa etapa. Ranking por etapa e ranking geral da temporada conforme `aggregate`:
 *    - `soma`: soma de todas as etapas disputadas;
 *    - `media`: média das etapas disputadas;
 *    - `melhores`: soma dos N melhores resultados (`bestN`), descartando os piores.
 *    Desempate (nesta ordem): melhor resultado único, mais etapas disputadas, nome (só ordena:
 *    quem empata em tudo menos no nome divide a posição).
 *    Quando MENOR é melhor (tempo) e a agregação é soma ou melhores, quem tem menos etapas
 *    contadas fica atrás de quem tem mais (senão faltar a uma etapa daria vantagem).
 *    Competição com categorias: a posição é calculada dentro de cada categoria.
 *
 * 2. Formato times (futebol): tabela a partir dos jogos com placar. Critérios: pontos, vitórias,
 *    saldo de gols, gols pró, confronto direto entre os empatados (pontos e saldo só nos jogos
 *    entre eles), nome. Jogo sem placar não conta.
 */
import type { CompetitionDoc, CompetitionMatchDoc, CompetitionResultDoc } from './types.ts';

const EPS = 1e-9;
const eq = (a: number, b: number) => Math.abs(a - b) < EPS;

export function normName(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trecho de identificador estável a partir de um texto (para o id do resultado) */
export function keyPart(s: string): string {
  return normName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}

/** Chave do participante: o sócio vinculado, ou o nome normalizado */
export function participantKey(r: Pick<CompetitionResultDoc, 'participantName' | 'memberId'>): string {
  return r.memberId ? `m:${r.memberId}` : `n:${normName(r.participantName)}`;
}

/** Id do documento de resultado: `{stageId}_{participante}` (+ categoria, quando houver) */
export function resultDocId(stageId: string, p: { participantName: string; memberId?: string; category?: string }): string {
  const who = p.memberId ? `m-${p.memberId}` : `n-${keyPart(p.participantName)}`;
  const cat = p.category ? `__${keyPart(p.category)}` : '';
  return `${stageId}_${who}${cat}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 128);
}

// ---------------- Tempo e valores ----------------

/** Segundos para "mm:ss,cc" (ou "h:mm:ss,cc" a partir de uma hora) */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const neg = seconds < 0;
  const totalCs = Math.round(Math.abs(seconds) * 100);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const body = h > 0 ? `${h}:${p2(m)}:${p2(s)},${p2(cs)}` : `${p2(totalM)}:${p2(s)},${p2(cs)}`;
  return neg ? `-${body}` : body;
}

/** Lê "1:23,45", "01:02:03,5", "83,45" ou "83.45" como segundos; null se inválido */
export function parseTime(text: string): number | null {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3) return null;
  const last = parts.pop()!.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(last)) return null;
  let total = Number(last);
  let mult = 60;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(parts[i])) return null;
    total += Number(parts[i]) * mult;
    mult *= 60;
  }
  return Math.round(total * 1000) / 1000;
}

export function isTimeUnit(unit: string | undefined): boolean {
  return normName(unit || '') === 'tempo';
}

/** Número em pt-BR (até 2 casas, sem casas quando inteiro) ou tempo, conforme a unidade */
export function formatValue(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '';
  if (isTimeUnit(unit)) return formatTime(value);
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Lê o valor digitado ("98", "98,5", "1.234,5" ou tempo); null se inválido */
export function parseValue(text: string, unit?: string): number | null {
  if (isTimeUnit(unit)) return parseTime(text);
  let t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// ---------------- Formato individual ----------------

type Cfg = Pick<CompetitionDoc, 'higherIsBetter' | 'aggregate' | 'bestN' | 'stages' | 'categories'>;
type Res = Pick<CompetitionResultDoc, 'stageId' | 'participantName' | 'memberId' | 'category' | 'value'> & { id?: string };

/** a é melhor que b? (> 0 quando a é melhor) */
function better(higherIsBetter: boolean, a: number, b: number): number {
  if (eq(a, b)) return 0;
  return higherIsBetter ? (a > b ? 1 : -1) : a < b ? 1 : -1;
}

/** Posições estilo competição (1, 1, 3): itens "iguais" dividem a posição */
function assignPositions<T>(sorted: T[], same: (a: T, b: T) => boolean, set: (row: T, pos: number) => void): void {
  sorted.forEach((row, i) => {
    if (i > 0 && same(sorted[i - 1], row)) set(row, (sorted[i - 1] as unknown as { position: number }).position);
    else set(row, i + 1);
  });
}

function catOf(r: { category?: string }): string {
  return r.category || '';
}

export interface StageRankRow {
  key: string;
  participantName: string;
  memberId?: string;
  category: string;
  value: number;
  position: number;
}

/** Ranking de uma etapa (um valor por participante e categoria; se repetido, vale o melhor) */
export function stageRanking(results: Res[], cfg: Pick<Cfg, 'higherIsBetter' | 'categories'>, stageId: string, opts: { category?: string } = {}): StageRankRow[] {
  const map = new Map<string, StageRankRow>();
  for (const r of results) {
    if (r.stageId !== stageId || !Number.isFinite(r.value)) continue;
    if (opts.category && normName(catOf(r)) !== normName(opts.category)) continue;
    const category = catOf(r);
    const key = `${participantKey(r)}|${normName(category)}`;
    const cur = map.get(key);
    if (!cur || better(cfg.higherIsBetter, r.value, cur.value) > 0) {
      map.set(key, { key, participantName: r.participantName, ...(r.memberId ? { memberId: r.memberId } : {}), category, value: r.value, position: 0 });
    }
  }
  return rankWithinCategories([...map.values()], cfg.categories || [], (a, b) => {
    const v = better(cfg.higherIsBetter, b.value, a.value);
    return v !== 0 ? v : a.participantName.localeCompare(b.participantName, 'pt-BR');
  }, (a, b) => eq(a.value, b.value));
}

export interface OverallRow {
  key: string;
  participantName: string;
  memberId?: string;
  category: string;
  /** total conforme a agregação (soma, média ou soma dos N melhores) */
  total: number;
  /** etapas disputadas */
  stagesPlayed: number;
  /** etapas que entraram no total (melhores N) */
  stagesCounted: number;
  best: number;
  /** valor por etapa (stageId: valor) */
  perStage: Record<string, number>;
  /** etapas descartadas na regra dos melhores N */
  discarded: string[];
  position: number;
}

function rankWithinCategories<T extends { category: string; position: number }>(
  rows: T[],
  categories: string[],
  cmp: (a: T, b: T) => number,
  same: (a: T, b: T) => boolean
): T[] {
  const order = (c: string) => {
    const i = categories.findIndex(x => normName(x) === normName(c));
    return i < 0 ? categories.length : i;
  };
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const g = normName(r.category);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const out: T[] = [];
  const keys = [...groups.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'pt-BR'));
  for (const k of keys) {
    const list = groups.get(k)!.sort(cmp);
    assignPositions(list, same, (row, pos) => {
      row.position = pos;
    });
    out.push(...list);
  }
  return out;
}

/** Ranking geral da temporada (formato individual) */
export function overallRanking(results: Res[], cfg: Cfg, opts: { category?: string } = {}): OverallRow[] {
  const hib = cfg.higherIsBetter;
  const stageIds = new Set((cfg.stages || []).map(s => s.id));
  // Melhor valor por participante, categoria e etapa
  const per = new Map<string, { name: string; memberId?: string; category: string; values: Map<string, number> }>();
  for (const r of results) {
    if (!Number.isFinite(r.value)) continue;
    if (stageIds.size && !stageIds.has(r.stageId)) continue;
    if (opts.category && normName(catOf(r)) !== normName(opts.category)) continue;
    const category = catOf(r);
    const key = `${participantKey(r)}|${normName(category)}`;
    let p = per.get(key);
    if (!p) {
      p = { name: r.participantName, ...(r.memberId ? { memberId: r.memberId } : {}), category, values: new Map() };
      per.set(key, p);
    }
    const cur = p.values.get(r.stageId);
    if (cur === undefined || better(hib, r.value, cur) > 0) p.values.set(r.stageId, r.value);
  }

  const n = cfg.aggregate === 'melhores' ? Math.max(1, Math.floor(cfg.bestN || 1)) : Infinity;
  const rows: OverallRow[] = [];
  for (const [key, p] of per) {
    const entries = [...p.values.entries()];
    const sorted = [...entries].sort((a, b) => better(hib, b[1], a[1]));
    const counted = cfg.aggregate === 'melhores' ? sorted.slice(0, n) : sorted;
    const discarded = cfg.aggregate === 'melhores' ? sorted.slice(n).map(e => e[0]) : [];
    const sum = counted.reduce((s, e) => s + e[1], 0);
    const total = cfg.aggregate === 'media' ? (counted.length ? sum / counted.length : 0) : sum;
    rows.push({
      key,
      participantName: p.name,
      ...(p.memberId ? { memberId: p.memberId } : {}),
      category: p.category,
      total: Math.round(total * 1e6) / 1e6,
      stagesPlayed: entries.length,
      stagesCounted: counted.length,
      best: sorted[0]?.[1] ?? 0,
      perStage: Object.fromEntries(entries),
      discarded,
      position: 0,
    });
  }

  // Menor é melhor com soma: faltar a uma etapa não pode virar vantagem
  const countFirst = !hib && cfg.aggregate !== 'media';
  const cmpCore = (a: OverallRow, b: OverallRow) => {
    if (countFirst && a.stagesCounted !== b.stagesCounted) return b.stagesCounted - a.stagesCounted;
    const t = better(hib, b.total, a.total);
    if (t !== 0) return t;
    const bst = better(hib, b.best, a.best);
    if (bst !== 0) return bst;
    return b.stagesPlayed - a.stagesPlayed;
  };
  return rankWithinCategories(
    rows,
    cfg.categories || [],
    (a, b) => cmpCore(a, b) || a.participantName.localeCompare(b.participantName, 'pt-BR'),
    (a, b) => cmpCore(a, b) === 0
  );
}

// ---------------- Formato times ----------------

type MatchCfg = Pick<CompetitionDoc, 'pointsWin' | 'pointsDraw' | 'pointsLoss' | 'teams'>;
type Match = Pick<CompetitionMatchDoc, 'homeTeamId' | 'awayTeamId' | 'homeScore' | 'awayScore'>;

export interface TeamRow {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  position: number;
}

export function hasScore(m: Match): boolean {
  return Number.isInteger(m.homeScore) && Number.isInteger(m.awayScore);
}

function tally(matches: Match[], cfg: MatchCfg, teamIds: string[]): Map<string, TeamRow> {
  const names = new Map((cfg.teams || []).map(t => [t.id, t.name]));
  const rows = new Map<string, TeamRow>();
  for (const id of teamIds) {
    rows.set(id, { teamId: id, name: names.get(id) || id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, position: 0 });
  }
  for (const m of matches) {
    if (!hasScore(m)) continue;
    const h = rows.get(m.homeTeamId);
    const a = rows.get(m.awayTeamId);
    if (!h || !a || m.homeTeamId === m.awayTeamId) continue;
    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    h.played++;
    a.played++;
    h.goalsFor += hs;
    h.goalsAgainst += as;
    a.goalsFor += as;
    a.goalsAgainst += hs;
    if (hs > as) {
      h.wins++;
      a.losses++;
      h.points += cfg.pointsWin;
      a.points += cfg.pointsLoss;
    } else if (hs < as) {
      a.wins++;
      h.losses++;
      a.points += cfg.pointsWin;
      h.points += cfg.pointsLoss;
    } else {
      h.draws++;
      a.draws++;
      h.points += cfg.pointsDraw;
      a.points += cfg.pointsDraw;
    }
  }
  for (const r of rows.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  return rows;
}

/** Tabela de classificação (formato times) */
export function teamStandings(matches: Match[], cfg: MatchCfg): TeamRow[] {
  const ids = (cfg.teams || []).map(t => t.id);
  const rows = [...tally(matches, cfg, ids).values()];
  const base = (a: TeamRow, b: TeamRow) => b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor;
  rows.sort(base);

  // Confronto direto: dentro de cada grupo empatado nos critérios acima
  const h2h = new Map<string, { points: number; goalDiff: number }>();
  const out: TeamRow[] = [];
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (j < rows.length && base(rows[i], rows[j]) === 0) j++;
    const group = rows.slice(i, j);
    if (group.length > 1) {
      const gIds = group.map(g => g.teamId);
      const set = new Set(gIds);
      const mini = tally(matches.filter(m => set.has(m.homeTeamId) && set.has(m.awayTeamId)), cfg, gIds);
      for (const g of group) h2h.set(g.teamId, { points: mini.get(g.teamId)!.points, goalDiff: mini.get(g.teamId)!.goalDiff });
      group.sort((a, b) => {
        const x = h2h.get(a.teamId)!;
        const y = h2h.get(b.teamId)!;
        return y.points - x.points || y.goalDiff - x.goalDiff || a.name.localeCompare(b.name, 'pt-BR');
      });
    }
    out.push(...group);
    i = j;
  }
  const same = (a: TeamRow, b: TeamRow) => {
    if (base(a, b) !== 0) return false;
    const x = h2h.get(a.teamId);
    const y = h2h.get(b.teamId);
    return !x || !y || (x.points === y.points && x.goalDiff === y.goalDiff);
  };
  assignPositions(out, same, (row, pos) => {
    row.position = pos;
  });
  return out;
}

// ---------------- Minhas posições ----------------

export interface MemberPosition {
  competitionId: string;
  competitionName: string;
  category: string;
  position: number;
  of: number;
  total: number;
  stagesPlayed: number;
}

/** Posição do sócio no ranking geral de cada competição individual em que aparece */
export function memberPositions(
  memberId: string,
  items: { competition: Pick<CompetitionDoc, 'id' | 'name' | 'format'> & Cfg; results: Res[] }[]
): MemberPosition[] {
  const out: MemberPosition[] = [];
  if (!memberId) return out;
  for (const { competition: c, results } of items) {
    if (c.format !== 'individual') continue;
    const rows = overallRanking(results, c);
    for (const r of rows) {
      if (r.memberId !== memberId) continue;
      const of = rows.filter(x => normName(x.category) === normName(r.category)).length;
      out.push({ competitionId: c.id, competitionName: c.name, category: r.category, position: r.position, of, total: r.total, stagesPlayed: r.stagesPlayed });
    }
  }
  return out.sort((a, b) => a.position - b.position || a.competitionName.localeCompare(b.competitionName, 'pt-BR'));
}

/** Texto curto da regra de agregação (para a tela e o PDF) */
export function aggregateLabel(c: Pick<CompetitionDoc, 'aggregate' | 'bestN'>): string {
  if (c.aggregate === 'media') return 'Média das etapas';
  if (c.aggregate === 'melhores') return `Soma dos ${c.bestN || 1} melhores resultados`;
  return 'Soma das etapas';
}
