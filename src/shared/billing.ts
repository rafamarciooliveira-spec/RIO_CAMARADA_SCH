/** Conta da mensalidade do SaaS: por sócio titular ativo, com valor mínimo; dependentes não contam. */
import type { PlanDoc } from './types.ts';

export const ANNUAL_DISCOUNT = 0.15;

export function perMember(plan: Pick<PlanDoc, 'pricePerMemberCents' | 'priceCents'>): number {
  return plan.pricePerMemberCents ?? 0;
}

/** Valor do mês: titulares × preço, nunca abaixo do mínimo do plano */
export function monthlyCents(plan: Pick<PlanDoc, 'pricePerMemberCents' | 'minMonthlyCents' | 'priceCents'>, holders: number): number {
  const per = perMember(plan);
  if (!per) return plan.priceCents || 0;
  return Math.max(plan.minMonthlyCents || 0, Math.max(0, holders) * per);
}

/** Quantidade cobrada no Stripe: o mínimo vira número de sócios (o Stripe cobra preço × quantidade) */
export function billedQuantity(plan: Pick<PlanDoc, 'pricePerMemberCents' | 'minMonthlyCents'>, holders: number): number {
  const per = plan.pricePerMemberCents || 0;
  if (!per) return 1;
  return Math.max(Math.max(0, holders), Math.ceil((plan.minMonthlyCents || 0) / per), 1);
}

export function annualCents(monthly: number): number {
  return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
}
