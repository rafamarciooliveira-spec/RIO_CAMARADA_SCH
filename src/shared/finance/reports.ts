/**
 * Relatórios financeiros calculados a partir do livro caixa (funções puras).
 * Regras:
 * - Só lançamentos com status "lancado" contam (pendentes e recusados ficam de fora).
 * - Estorno é um lançamento de sentido oposto: no fluxo e na DRE ele reduz a natureza do
 *   original (estorno de receita reduz receita), então original + estorno = zero.
 * - Transferências entre contas não são receita nem despesa; só aparecem no balancete.
 */
import type { ChargeDoc, ChartAccountDoc, FinAccountDoc, LedgerEntryDoc } from '../types.ts';
import { daysBetweenKeys } from '../dates.ts';

type Entry = Pick<LedgerEntryDoc, 'id' | 'date' | 'periodKey' | 'accountId' | 'direction' | 'amountCents' | 'chartAccountId' | 'status'> &
  Partial<Pick<LedgerEntryDoc, 'costCenterId' | 'eventId' | 'transferId' | 'reversalOf' | 'description'>>;

export const TRANSFER_CHART_ID = 'transferencia';

export function isPosted(e: Entry): boolean {
  return e.status === 'lancado';
}

export function isTransfer(e: Entry): boolean {
  return !!e.transferId || e.chartAccountId === TRANSFER_CHART_ID;
}

/** Efeito do lançamento no saldo da conta (entrada soma, saída subtrai) */
export function signedCents(e: Entry): number {
  return e.direction === 'entrada' ? e.amountCents : -e.amountCents;
}

/**
 * Natureza do lançamento para fluxo e resultado. Estorno de uma saída é uma entrada que
 * reduz a despesa; estorno de uma entrada é uma saída que reduz a receita.
 */
export function nature(e: Entry): { kind: 'receita' | 'despesa'; cents: number } {
  if (e.reversalOf) return e.direction === 'entrada' ? { kind: 'despesa', cents: -e.amountCents } : { kind: 'receita', cents: -e.amountCents };
  return e.direction === 'entrada' ? { kind: 'receita', cents: e.amountCents } : { kind: 'despesa', cents: e.amountCents };
}

export interface CashFlowRow {
  periodKey: string;
  inCents: number;
  outCents: number;
  netCents: number;
  cumulativeCents: number;
}

/** Fluxo de caixa por mês (receitas x despesas), com acumulado a partir de um saldo inicial */
export function cashFlowByMonth(entries: Entry[], opts: { from?: string; to?: string; openingCents?: number } = {}): CashFlowRow[] {
  const map = new Map<string, { inCents: number; outCents: number }>();
  for (const e of entries) {
    if (!isPosted(e) || isTransfer(e)) continue;
    if (opts.from && e.periodKey < opts.from) continue;
    if (opts.to && e.periodKey > opts.to) continue;
    const row = map.get(e.periodKey) || { inCents: 0, outCents: 0 };
    const n = nature(e);
    if (n.kind === 'receita') row.inCents += n.cents;
    else row.outCents += n.cents;
    map.set(e.periodKey, row);
  }
  let acc = opts.openingCents || 0;
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([periodKey, r]) => {
      const netCents = r.inCents - r.outCents;
      acc += netCents;
      return { periodKey, inCents: r.inCents, outCents: r.outCents, netCents, cumulativeCents: acc };
    });
}

export interface DreLine {
  chartAccountId: string;
  code: string;
  name: string;
  cents: number;
}

export interface Dre {
  receitas: DreLine[];
  despesas: DreLine[];
  totalReceitasCents: number;
  totalDespesasCents: number;
  resultadoCents: number;
}

/** DRE simplificada por plano de contas no intervalo de competências [from, to] */
export function dre(entries: Entry[], chart: (Pick<ChartAccountDoc, 'code' | 'name' | 'kind'> & { id: string })[], opts: { from?: string; to?: string } = {}): Dre {
  const byId = new Map(chart.map(c => [c.id, c]));
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (!isPosted(e) || isTransfer(e)) continue;
    if (opts.from && e.periodKey < opts.from) continue;
    if (opts.to && e.periodKey > opts.to) continue;
    const c = byId.get(e.chartAccountId);
    // Sinal pela natureza da conta: em conta de receita, entrada soma e saída subtrai
    const kind = c?.kind || nature(e).kind;
    const delta = kind === 'receita' ? signedCents(e) : -signedCents(e);
    const key = `${kind}|${e.chartAccountId}`;
    sums.set(key, (sums.get(key) || 0) + delta);
  }
  const receitas: DreLine[] = [];
  const despesas: DreLine[] = [];
  for (const [key, cents] of sums) {
    const [kind, id] = key.split('|');
    const c = byId.get(id);
    const line = { chartAccountId: id, code: c?.code || '', name: c?.name || 'Sem classificação', cents };
    (kind === 'receita' ? receitas : despesas).push(line);
  }
  const sort = (a: DreLine, b: DreLine) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  receitas.sort(sort);
  despesas.sort(sort);
  const totalReceitasCents = receitas.reduce((a, l) => a + l.cents, 0);
  const totalDespesasCents = despesas.reduce((a, l) => a + l.cents, 0);
  return { receitas, despesas, totalReceitasCents, totalDespesasCents, resultadoCents: totalReceitasCents - totalDespesasCents };
}

export interface TrialBalanceRow {
  accountId: string;
  name: string;
  openingCents: number;
  inCents: number;
  outCents: number;
  finalCents: number;
}

/**
 * Balancete por conta: saldo inicial (abertura + movimento antes de "from"), entradas, saídas
 * e saldo final no intervalo de datas [from, to] (AAAA-MM-DD). Inclui transferências.
 */
export function trialBalance(
  entries: Entry[],
  accounts: (Pick<FinAccountDoc, 'name' | 'openingBalanceCents'> & { id: string })[],
  opts: { from?: string; to?: string } = {}
): { rows: TrialBalanceRow[]; total: Omit<TrialBalanceRow, 'accountId' | 'name'> } {
  const rows = new Map<string, TrialBalanceRow>(
    accounts.map(a => [a.id, { accountId: a.id, name: a.name, openingCents: a.openingBalanceCents || 0, inCents: 0, outCents: 0, finalCents: 0 }])
  );
  for (const e of entries) {
    if (!isPosted(e)) continue;
    const r = rows.get(e.accountId);
    if (!r) continue;
    if (opts.to && e.date > opts.to) continue;
    if (opts.from && e.date < opts.from) {
      r.openingCents += signedCents(e);
      continue;
    }
    if (e.direction === 'entrada') r.inCents += e.amountCents;
    else r.outCents += e.amountCents;
  }
  const list = [...rows.values()].map(r => ({ ...r, finalCents: r.openingCents + r.inCents - r.outCents }));
  const total = list.reduce(
    (a, r) => ({ openingCents: a.openingCents + r.openingCents, inCents: a.inCents + r.inCents, outCents: a.outCents + r.outCents, finalCents: a.finalCents + r.finalCents }),
    { openingCents: 0, inCents: 0, outCents: 0, finalCents: 0 }
  );
  return { rows: list, total };
}

export interface DelinquencyByMember {
  memberId: string;
  memberName: string;
  count: number;
  totalCents: number;
  oldestDays: number;
}

export const AGE_BUCKETS = ['1 a 30 dias', '31 a 60 dias', '61 a 90 dias', 'Mais de 90 dias'] as const;

export function chargeOpenCents(c: Pick<ChargeDoc, 'amountCents' | 'discountCents'>): number {
  return Math.max(0, c.amountCents - (c.discountCents || 0));
}

export function isOverdue(c: Pick<ChargeDoc, 'status' | 'dueDate'>, todayKey: string): boolean {
  return c.status === 'vencida' || (c.status === 'aberta' && c.dueDate < todayKey);
}

/** Inadimplência por sócio e por idade da dívida */
export function delinquency(
  charges: Pick<ChargeDoc, 'memberId' | 'memberName' | 'status' | 'dueDate' | 'amountCents' | 'discountCents'>[],
  todayKey: string
): { byMember: DelinquencyByMember[]; byAge: { bucket: (typeof AGE_BUCKETS)[number]; count: number; totalCents: number }[]; totalCents: number; count: number } {
  const members = new Map<string, DelinquencyByMember>();
  const ages = AGE_BUCKETS.map(bucket => ({ bucket, count: 0, totalCents: 0 }));
  let totalCents = 0;
  let count = 0;
  for (const c of charges) {
    if (!isOverdue(c, todayKey)) continue;
    const days = Math.max(1, daysBetweenKeys(c.dueDate, todayKey));
    const cents = chargeOpenCents(c);
    const m = members.get(c.memberId) || { memberId: c.memberId, memberName: c.memberName, count: 0, totalCents: 0, oldestDays: 0 };
    m.count++;
    m.totalCents += cents;
    m.oldestDays = Math.max(m.oldestDays, days);
    members.set(c.memberId, m);
    const idx = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
    ages[idx].count++;
    ages[idx].totalCents += cents;
    totalCents += cents;
    count++;
  }
  return { byMember: [...members.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.totalCents - a.totalCents), byAge: ages, totalCents, count };
}

export interface BudgetComparison {
  plannedInCents: number;
  plannedOutCents: number;
  actualInCents: number;
  actualOutCents: number;
  plannedResultCents: number;
  actualResultCents: number;
}

/**
 * Orçado x realizado de um evento ou centro de custo. O realizado vem do livro caixa:
 * lançamentos com o eventId informado ou no centro de custo informado (sem contar duas vezes).
 */
export function budgetVsActual(
  planned: { kind: 'receita' | 'despesa'; plannedCents: number }[],
  entries: Entry[],
  ref: { eventId?: string; costCenterId?: string }
): BudgetComparison {
  let plannedInCents = 0;
  let plannedOutCents = 0;
  for (const p of planned) {
    if (p.kind === 'receita') plannedInCents += p.plannedCents;
    else plannedOutCents += p.plannedCents;
  }
  let actualInCents = 0;
  let actualOutCents = 0;
  for (const e of entries) {
    if (!isPosted(e) || isTransfer(e)) continue;
    const hit = (ref.eventId && e.eventId === ref.eventId) || (ref.costCenterId && e.costCenterId === ref.costCenterId);
    if (!hit) continue;
    const n = nature(e);
    if (n.kind === 'receita') actualInCents += n.cents;
    else actualOutCents += n.cents;
  }
  return {
    plannedInCents,
    plannedOutCents,
    actualInCents,
    actualOutCents,
    plannedResultCents: plannedInCents - plannedOutCents,
    actualResultCents: actualInCents - actualOutCents,
  };
}

/** Sugestões de conciliação: mesmo valor (com sinal), mesma conta, data em até ±3 dias */
export function suggestMatches(
  lines: { id: string; accountId: string; date: string; amountCents: number; matchedEntryId?: string }[],
  entries: Entry[],
  windowDays = 3
): Record<string, string[]> {
  const used = new Set(lines.map(l => l.matchedEntryId).filter(Boolean) as string[]);
  const out: Record<string, string[]> = {};
  for (const l of lines) {
    if (l.matchedEntryId) continue;
    const cands = entries
      .filter(e => isPosted(e) && !used.has(e.id) && e.accountId === l.accountId && signedCents(e) === l.amountCents && Math.abs(daysBetweenKeys(e.date, l.date)) <= windowDays)
      .sort((a, b) => Math.abs(daysBetweenKeys(a.date, l.date)) - Math.abs(daysBetweenKeys(b.date, l.date)))
      .map(e => e.id);
    if (cands.length) out[l.id] = cands;
  }
  return out;
}

/**
 * Saldo de abertura de cada conta numa data, a partir do saldo ATUAL (mantido pelo servidor)
 * menos o efeito dos lançamentos daquela data em diante. Assim os relatórios leem só o
 * período pedido (e o que veio depois), sem carregar o livro caixa inteiro.
 */
export function accountsOpenedAt<A extends { id: string; balanceCents?: number; openingBalanceCents: number }>(
  accounts: A[],
  entriesFromDate: Entry[],
  fromDate: string
): (A & { openingBalanceCents: number })[] {
  return accounts.map(a => {
    let after = 0;
    for (const e of entriesFromDate) if (isPosted(e) && e.accountId === a.id && e.date >= fromDate) after += signedCents(e);
    return { ...a, openingBalanceCents: (a.balanceCents ?? a.openingBalanceCents) - after };
  });
}
