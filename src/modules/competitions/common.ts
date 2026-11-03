/** Rótulos, exportação (CSV e PDF) e leitura da colagem de resultados das competições. */
import type { CompetitionDoc, TenantDoc } from '../../shared/types.ts';
import { aggregateLabel, formatValue, normName, parseValue, type OverallRow, type StageRankRow, type TeamRow } from '../../shared/rankings.ts';
import { buildSafeCsv, downloadCsv } from '../../utils/csv.ts';
import { parseCsv } from '../members/csvParse.ts';
import { formatDate } from '../../shared/dates.ts';

export const STATUS: Record<CompetitionDoc['status'], { label: string; tone: 'neutral' | 'ok' | 'info' }> = {
  planejada: { label: 'Planejada', tone: 'neutral' },
  em_andamento: { label: 'Em andamento', tone: 'ok' },
  encerrada: { label: 'Encerrada', tone: 'info' },
};

export const SCOPE: Record<CompetitionDoc['scope'], string> = { interno: 'Torneio interno', externo: 'Etapas externas' };

export const UNITS = ['pontos', 'pinos', 'gols', 'tempo', 'acertos', 'notas'];

export function fileSlug(s: string): string {
  return normName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'ranking';
}

export function stageName(c: Pick<CompetitionDoc, 'stages'>, id: string | undefined): string {
  return c.stages.find(s => s.id === id)?.name || 'Sem rodada';
}

type Tenant = Pick<TenantDoc, 'name' | 'branding' | 'timezone' | 'publicPage'>;

export function overallCsv(c: CompetitionDoc, rows: OverallRow[]): void {
  const stages = c.stages.filter(s => rows.some(r => r.perStage[s.id] !== undefined));
  const headers = ['Posição', 'Nome', ...(c.categories.length ? ['Categoria'] : []), `Total (${c.unit})`, 'Etapas disputadas', ...stages.map(s => s.name)];
  const data = rows.map(r => [
    r.position,
    r.participantName,
    ...(c.categories.length ? [r.category] : []),
    formatValue(r.total, c.unit),
    r.stagesPlayed,
    ...stages.map(s => (r.perStage[s.id] === undefined ? '' : formatValue(r.perStage[s.id], c.unit))),
  ]);
  downloadCsv(buildSafeCsv(headers, data), `ranking-${fileSlug(c.name)}.csv`);
}

export function stageCsv(c: CompetitionDoc, stageId: string, rows: StageRankRow[]): void {
  const headers = ['Posição', 'Nome', ...(c.categories.length ? ['Categoria'] : []), `Resultado (${c.unit})`];
  const data = rows.map(r => [r.position, r.participantName, ...(c.categories.length ? [r.category] : []), formatValue(r.value, c.unit)]);
  downloadCsv(buildSafeCsv(headers, data), `${fileSlug(c.name)}-${fileSlug(stageName(c, stageId))}.csv`);
}

export function tableCsv(c: CompetitionDoc, rows: TeamRow[]): void {
  const headers = ['Posição', 'Time', 'Pontos', 'Jogos', 'Vitórias', 'Empates', 'Derrotas', 'Gols pró', 'Gols contra', 'Saldo'];
  const data = rows.map(r => [r.position, r.name, r.points, r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.goalDiff]);
  downloadCsv(buildSafeCsv(headers, data), `classificacao-${fileSlug(c.name)}.csv`);
}

function infoPairs(c: CompetitionDoc): [string, string][] {
  return [
    ['Competição', `${SCOPE[c.scope]}${c.organizer ? ` · ${c.organizer}` : ''}`],
    ['Temporada', c.season],
    ...(c.format === 'individual' ? ([['Regra', `${aggregateLabel(c)} · ${c.higherIsBetter ? 'maior' : 'menor'} ${c.unit === 'tempo' ? 'tempo' : 'valor'} vence`]] as [string, string][]) : []),
    ['Situação', STATUS[c.status].label],
  ];
}

export async function overallPdf(tenant: Tenant, c: CompetitionDoc, rows: OverallRow[], category?: string): Promise<void> {
  const { createPdf } = await import('../../app/pdf.ts');
  const w = await createPdf(tenant);
  w.title('Ranking geral', `${c.name}${category ? ` · ${category}` : ''}`);
  w.kv(infoPairs(c));
  const cats = category ? [category] : c.categories.length ? [...new Set(rows.map(r => r.category))] : [''];
  for (const cat of cats) {
    if (cat) w.heading(cat);
    const list = rows.filter(r => !cat || normName(r.category) === normName(cat));
    w.table(['Pos.', 'Nome', `Total (${c.unit})`, 'Etapas'], list.map(r => [`${r.position}º`, r.participantName, formatValue(r.total, c.unit), String(r.stagesPlayed)]), { widths: [16, 98, 40, 24], alignRight: [2, 3] });
  }
  w.save(`ranking-${fileSlug(c.name)}.pdf`);
}

export async function stagePdf(tenant: Tenant, c: CompetitionDoc, stageId: string, rows: StageRankRow[]): Promise<void> {
  const { createPdf } = await import('../../app/pdf.ts');
  const w = await createPdf(tenant);
  const st = c.stages.find(s => s.id === stageId);
  w.title(`Resultado: ${st?.name || ''}`, c.name);
  w.kv([...infoPairs(c), ...(st?.date ? ([['Data', formatDate(st.date)]] as [string, string][]) : []), ...(st?.location ? ([['Local', st.location]] as [string, string][]) : [])]);
  w.table(
    ['Pos.', 'Nome', ...(c.categories.length ? ['Categoria'] : []), `Resultado (${c.unit})`],
    rows.map(r => [`${r.position}º`, r.participantName, ...(c.categories.length ? [r.category] : []), formatValue(r.value, c.unit)]),
    { alignRight: [c.categories.length ? 3 : 2] }
  );
  w.save(`${fileSlug(c.name)}-${fileSlug(st?.name || 'etapa')}.pdf`);
}

export async function tablePdf(tenant: Tenant, c: CompetitionDoc, rows: TeamRow[]): Promise<void> {
  const { createPdf } = await import('../../app/pdf.ts');
  const w = await createPdf(tenant);
  w.title('Classificação', c.name);
  w.kv(infoPairs(c));
  w.table(
    ['Pos.', 'Time', 'P', 'J', 'V', 'E', 'D', 'GP', 'GC', 'SG'],
    rows.map(r => [`${r.position}º`, r.name, r.points, r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.goalDiff].map(String)),
    { widths: [14, 64, 14, 14, 14, 14, 14, 14, 14, 14], alignRight: [2, 3, 4, 5, 6, 7, 8, 9] }
  );
  w.save(`classificacao-${fileSlug(c.name)}.pdf`);
}

export interface PastedRow {
  participantName: string;
  category: string;
  valueText: string;
}

/**
 * Lê a colagem ou o CSV "nome;categoria;valor" (ou "nome;valor" quando não há categorias).
 * A primeira linha é ignorada se for cabeçalho (o valor não é número).
 */
export function parsePasted(text: string, hasCategories: boolean, unit: string): { rows: PastedRow[]; errors: string[] } {
  const lines = parseCsv(text);
  const rows: PastedRow[] = [];
  const errors: string[] = [];
  lines.forEach((cols, i) => {
    const name = (cols[0] || '').trim();
    const two = cols.length < 3;
    const category = two ? '' : (cols[1] || '').trim();
    const valueText = (two ? cols[1] : cols[2])?.trim() || '';
    if (i === 0 && parseValue(valueText, unit) === null) return; // cabeçalho
    if (!name) return;
    if (parseValue(valueText, unit) === null) {
      errors.push(`Linha ${i + 1}: valor "${valueText}" não é válido.`);
      return;
    }
    if (hasCategories && two) {
      errors.push(`Linha ${i + 1}: falta a categoria (use nome;categoria;valor).`);
      return;
    }
    rows.push({ participantName: name, category, valueText });
  });
  return { rows, errors };
}
