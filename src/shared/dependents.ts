/**
 * Regras do dependente na mensalidade (cada sociedade escolhe):
 * - gratis: dependente não paga;
 * - valor_fixo: cada dependente soma um valor à mensalidade do titular;
 * - categoria: cada dependente paga o valor da própria categoria, cobrado junto do titular.
 * Em qualquer modo: grátis até uma idade, teto por família e idade máxima para continuar dependente.
 * O dependente nunca recebe cobrança separada: tudo vai na mensalidade do titular, discriminado.
 */
import type { MemberDoc, TenantSettings } from './types.ts';

export interface DependentRules {
  mode: 'gratis' | 'valor_fixo' | 'categoria';
  feeCents: number; // valor_fixo: por dependente
  freeUntilAge: number; // 0 = sem faixa grátis; ex.: 12 = não paga até completar 12 anos
  maxAge: number; // 0 = sem limite; ex.: 21 = ao completar 21 deixa de poder ser dependente
  familyCapCents: number; // 0 = sem teto; teto da soma dos dependentes de uma família
}

export const DEFAULT_DEPENDENT_RULES: DependentRules = { mode: 'gratis', feeCents: 0, freeUntilAge: 0, maxAge: 0, familyCapCents: 0 };

export function dependentRules(s: Pick<TenantSettings, 'dependentRules'> | null | undefined): DependentRules {
  return { ...DEFAULT_DEPENDENT_RULES, ...(s?.dependentRules || {}) };
}

/** Data de nascimento a partir do cadastro básico (ano + mês e dia), sem precisar dos dados pessoais */
export function birthDateOf(m: Pick<MemberDoc, 'birthYear' | 'birthMonthDay'>): string | null {
  if (!m.birthYear || !m.birthMonthDay || !/^\d{2}-\d{2}$/.test(m.birthMonthDay)) return null;
  return `${m.birthYear}-${m.birthMonthDay}`;
}

export function ageAt(birthDate: string, onKey: string): number {
  const [y, mo, d] = birthDate.split('-').map(Number);
  const [ty, tmo, td] = onKey.split('-').map(Number);
  return ty - y - (tmo < mo || (tmo === mo && td < d) ? 1 : 0);
}

/** Dia em que completa a idade (29/02 vira 01/03 nos anos comuns) */
export function birthdayOfAge(birthDate: string, age: number): string {
  const [y, mo, d] = birthDate.split('-').map(Number);
  const yy = y + age;
  const leap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
  if (mo === 2 && d === 29 && !leap) return `${yy}-03-01`;
  return `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface DependentTimeline {
  age: number | null;
  /** Valor que paga hoje (centavos) */
  feeNowCents: number;
  /** A partir de quando passa a pagar (se ainda não paga) */
  paysFrom?: string;
  /** Quando deixa de poder ser dependente */
  limitAt?: string;
  overLimit: boolean;
}

export function dependentTimeline(rules: DependentRules, birthDate: string | null, todayKey: string, categoryFeeCents = 0): DependentTimeline {
  const age = birthDate ? ageAt(birthDate, todayKey) : null;
  const full = rules.mode === 'valor_fixo' ? rules.feeCents : rules.mode === 'categoria' ? categoryFeeCents : 0;
  const free = rules.freeUntilAge > 0 && age !== null && age < rules.freeUntilAge;
  const out: DependentTimeline = { age, feeNowCents: free ? 0 : full, overLimit: false };
  if (free && full > 0 && birthDate) out.paysFrom = birthdayOfAge(birthDate, rules.freeUntilAge);
  if (rules.maxAge > 0 && birthDate) {
    out.limitAt = birthdayOfAge(birthDate, rules.maxAge);
    out.overLimit = age !== null && age >= rules.maxAge;
  }
  return out;
}

/** Soma dos dependentes na mensalidade do titular, com o teto da família */
export function familyDependentsCents(rules: DependentRules, fees: number[]): number {
  const sum = fees.reduce((a, b) => a + b, 0);
  return rules.familyCapCents > 0 ? Math.min(sum, rules.familyCapCents) : sum;
}
