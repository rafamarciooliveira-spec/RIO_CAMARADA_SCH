/**
 * Prestação de contas (função pura, a mesma na tela, no servidor e no PDF).
 * Modelo de demonstração usado pelas sociedades: histórico com entradas e saídas, totais,
 * saldo anterior, saldo atual, "soma dos totais" que fecha dos dois lados e a composição
 * do saldo por conta (corrente, poupança, aplicação, caixa).
 * Regras:
 * - Só lançamentos "lancado" contam; os que aguardam aprovação ficam de fora e são avisados.
 * - Estorno reduz a natureza do original (estorno de uma saída diminui as saídas).
 * - Transferência entre contas não é entrada nem saída: aparece à parte e só muda a composição.
 * - Evento (centro de custo): só os lançamentos dele, com o resultado (lucro ou prejuízo).
 */
import type { ChartAccountDoc, CostCenterDoc, FinAccountDoc, LedgerEntryDoc } from '../types.ts';
import { isPosted, isTransfer, nature } from './reports.ts';

export type AccGrouping = 'lancamento' | 'historico' | 'plano';

type Entry = Pick<LedgerEntryDoc, 'id' | 'date' | 'periodKey' | 'accountId' | 'direction' | 'amountCents' | 'chartAccountId' | 'status' | 'description'> &
  Partial<Pick<LedgerEntryDoc, 'costCenterId' | 'eventId' | 'transferId' | 'reversalOf' | 'counterparty' | 'number'>>;

type Account = Pick<FinAccountDoc, 'name' | 'type'> & Partial<Pick<FinAccountDoc, 'institution'>> & { id: string; openingBalanceCents: number };

export interface AccLine {
  label: string;
  date?: string; // só no modo "um por lançamento"
  inCents: number;
  outCents: number;
  count: number;
}

export interface AccAccountRow {
  accountId: string;
  name: string;
  type: FinAccountDoc['type'];
  openingCents: number;
  inCents: number;
  outCents: number;
  finalCents: number;
}

export interface AccReport {
  kind: 'periodo' | 'evento';
  from: string; // AAAA-MM-DD
  to: string;
  grouping: AccGrouping;
  lines: AccLine[];
  transfers: { label: string; date: string; cents: number }[];
  totals: { inCents: number; outCents: number };
  resultCents: number; // entradas menos saídas
  openingCents: number; // saldo anterior (período); zero no evento
  closingCents: number; // saldo atual (período); no evento é o resultado
  accounts: AccAccountRow[];
  receitas: { name: string; cents: number }[]; // de onde veio (plano de contas)
  despesas: { name: string; cents: number }[]; // para onde foi
  pending: { count: number; cents: number };
}

export interface AccOptions {
  kind: 'periodo' | 'evento';
  from: string;
  to: string;
  grouping: AccGrouping;
  costCenter?: Pick<CostCenterDoc, 'id'> & Partial<Pick<CostCenterDoc, 'refId'>>;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function inScope(e: Entry, o: AccOptions): boolean {
  if (o.kind === 'evento') {
    const cc = o.costCenter;
    if (!cc) return false;
    if (e.costCenterId !== cc.id && !(cc.refId && e.eventId === cc.refId)) return false;
    if (o.from && e.date < o.from) return false;
    if (o.to && e.date > o.to) return false;
    return true;
  }
  return e.date >= o.from && e.date <= o.to;
}

/**
 * Monta a prestação de contas.
 * `accounts` deve vir com o saldo de abertura na data `from` (ver accountsOpenedAt) e
 * `entries` com todos os lançamentos de `from` em diante (ou os do evento).
 */
export function buildAccountability(
  entries: Entry[],
  accounts: Account[],
  chart: (Pick<ChartAccountDoc, 'name' | 'kind'> & Partial<Pick<ChartAccountDoc, 'code'>> & { id: string })[],
  o: AccOptions
): AccReport {
  const chartName = (id: string) => chart.find(c => c.id === id)?.name || 'Sem classificação';
  const scoped = entries.filter(e => inScope(e, o)).sort((a, b) => (a.date === b.date ? (a.number || 0) - (b.number || 0) : a.date < b.date ? -1 : 1));
  const posted = scoped.filter(isPosted);
  const pendingList = scoped.filter(e => e.status === 'aguardando_aprovacao');

  const ins: AccLine[] = [];
  const outs: AccLine[] = [];
  const keyed = new Map<string, AccLine>();
  const rec = new Map<string, number>();
  const desp = new Map<string, number>();
  const transfers: AccReport['transfers'] = [];
  let inCents = 0;
  let outCents = 0;

  for (const e of posted) {
    if (isTransfer(e)) {
      if (e.direction === 'saida') transfers.push({ label: e.description, date: e.date, cents: e.amountCents });
      continue;
    }
    const n = nature(e);
    const isIn = n.kind === 'receita';
    if (isIn) inCents += n.cents;
    else outCents += n.cents;
    const cat = isIn ? rec : desp;
    const cname = chartName(e.chartAccountId);
    cat.set(cname, (cat.get(cname) || 0) + n.cents);

    const base = e.reversalOf ? `Estorno: ${e.description}` : e.description;
    let line: AccLine | undefined;
    if (o.grouping === 'lancamento') {
      line = { label: e.counterparty && !e.reversalOf ? `${base} (${e.counterparty})` : base, date: e.date, inCents: 0, outCents: 0, count: 0 };
      (isIn ? ins : outs).push(line);
    } else {
      const label = o.grouping === 'plano' ? cname : e.description;
      const key = `${isIn ? 'i' : 'o'}:${norm(label)}`;
      line = keyed.get(key);
      if (!line) {
        line = { label, inCents: 0, outCents: 0, count: 0 };
        keyed.set(key, line);
        (isIn ? ins : outs).push(line);
      }
    }
    if (isIn) line.inCents += n.cents;
    else line.outCents += n.cents;
    line.count += 1;
  }

  // Composição do saldo: movimento de cada conta no intervalo (inclui transferências)
  const rows = new Map<string, AccAccountRow>(
    accounts.map(a => [a.id, { accountId: a.id, name: a.institution ? `${a.name} ${a.institution}` : a.name, type: a.type, openingCents: o.kind === 'periodo' ? a.openingBalanceCents || 0 : 0, inCents: 0, outCents: 0, finalCents: 0 }])
  );
  for (const e of posted) {
    const r = rows.get(e.accountId);
    if (!r) continue;
    if (e.direction === 'entrada') r.inCents += e.amountCents;
    else r.outCents += e.amountCents;
  }
  const accRows = [...rows.values()]
    .map(r => ({ ...r, finalCents: r.openingCents + r.inCents - r.outCents }))
    .filter(r => r.openingCents || r.inCents || r.outCents || r.finalCents);

  const openingCents = o.kind === 'periodo' ? accRows.reduce((s, r) => s + r.openingCents, 0) : 0;
  const resultCents = inCents - outCents;
  const sorted = (m: Map<string, number>) => [...m.entries()].map(([name, cents]) => ({ name, cents })).filter(x => x.cents).sort((a, b) => b.cents - a.cents);

  return {
    kind: o.kind,
    from: o.from,
    to: o.to,
    grouping: o.grouping,
    lines: [...ins, ...outs].filter(l => l.inCents || l.outCents),
    transfers,
    totals: { inCents, outCents },
    resultCents,
    openingCents,
    closingCents: o.kind === 'periodo' ? openingCents + resultCents : resultCents,
    accounts: accRows,
    receitas: sorted(rec),
    despesas: sorted(desp),
    pending: { count: pendingList.length, cents: pendingList.reduce((s, e) => s + e.amountCents, 0) },
  };
}

export const GROUPING_LABEL: Record<AccGrouping, string> = {
  historico: 'Agrupar pelo histórico (como no livro da tesouraria)',
  lancamento: 'Um por lançamento, com a data',
  plano: 'Agrupar pelo plano de contas',
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const br = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

/** "Setembro/2025", "Janeiro a Março/2026" ou "05/09/2025 a 20/09/2025" */
export function accPeriodLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const wholeMonths = fd === 1 && td === lastDayOf(ty, tm);
  if (!wholeMonths) return from === to ? br(from) : `${br(from)} a ${br(to)}`;
  if (fy === ty && fm === tm) return `${MONTHS[fm - 1]}/${fy}`;
  if (fy === ty && fm === 1 && tm === 12) return `Ano de ${fy}`;
  if (fy === ty) return `${MONTHS[fm - 1]} a ${MONTHS[tm - 1]}/${fy}`;
  return `${MONTHS[fm - 1]}/${fy} a ${MONTHS[tm - 1]}/${ty}`;
}

/** Meses (AAAA-MM) cobertos pelo intervalo */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out;
}
