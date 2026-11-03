/** Dinheiro sempre em centavos inteiros. */

export function formatBRL(cents: number | null | undefined): string {
  const v = Number.isFinite(cents as number) ? (cents as number) : 0;
  return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "1.234,56" | "1234.56" | "1234" -> centavos */
export function parseBRL(text: string): number | null {
  const raw = String(text || '').replace(/[R$\s]/g, '');
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function assertCents(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/**
 * Multa e juros de atraso.
 * lateFeeBps: multa em pontos-base (200 = 2%), uma vez.
 * interestBpsMonth: juros ao mês em pontos-base (100 = 1% a.m.), pró-rata por dia (30 dias).
 */
export function lateCharges(
  amountCents: number,
  dueDateISO: string,
  paidOnISO: string,
  lateFeeBps: number,
  interestBpsMonth: number
): { lateFeeCents: number; interestCents: number; daysLate: number } {
  const due = Date.parse(`${dueDateISO.slice(0, 10)}T00:00:00Z`);
  const paid = Date.parse(`${paidOnISO.slice(0, 10)}T00:00:00Z`);
  const daysLate = Math.max(0, Math.floor((paid - due) / 86400000));
  if (daysLate === 0) return { lateFeeCents: 0, interestCents: 0, daysLate };
  const lateFeeCents = Math.round((amountCents * lateFeeBps) / 10000);
  const interestCents = Math.round((amountCents * interestBpsMonth * daysLate) / (10000 * 30));
  return { lateFeeCents, interestCents, daysLate };
}

export function sumCents(values: number[]): number {
  return values.reduce((a, b) => a + (Number.isInteger(b) ? b : 0), 0);
}
