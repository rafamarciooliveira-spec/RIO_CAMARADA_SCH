/**
 * Ciclo de vida do sócio: pendente → aprovado → ativo → em atraso → suspenso → desligado.
 * "rejeitado" = ajuste solicitado (volta para pendente quando o sócio corrige).
 */
import type { MemberDoc, MemberStatus, VerifyStatus } from './types.ts';

export const STATUS_TRANSITIONS: Record<MemberStatus, MemberStatus[]> = {
  pendente: ['aprovado', 'ativo', 'rejeitado'],
  rejeitado: ['pendente', 'aprovado', 'ativo'],
  aprovado: ['ativo', 'em_atraso', 'suspenso', 'desligado'],
  ativo: ['em_atraso', 'suspenso', 'desligado'],
  em_atraso: ['ativo', 'suspenso', 'desligado'],
  suspenso: ['ativo', 'em_atraso', 'desligado'],
  desligado: ['pendente', 'ativo'],
};

export function canTransition(from: MemberStatus, to: MemberStatus): boolean {
  return from === to || STATUS_TRANSITIONS[from]?.includes(to);
}

/** Situações em que a carteirinha vale (em atraso ainda vale até a suspensão automática) */
export const CARD_VALID_STATUSES: MemberStatus[] = ['aprovado', 'ativo', 'em_atraso'];

export function cardStatusFor(member: Pick<MemberDoc, 'status' | 'validUntil'> | null, todayKey: string): VerifyStatus {
  if (!member) return 'invalido';
  if (member.status === 'suspenso') return 'suspenso';
  if (!CARD_VALID_STATUSES.includes(member.status)) return 'invalido';
  if (member.validUntil && member.validUntil < todayKey) return 'expirado';
  return 'valido';
}

export const VERIFY_LABEL: Record<VerifyStatus, string> = {
  valido: 'Válida',
  invalido: 'Inválida',
  expirado: 'Expirada',
  suspenso: 'Suspensa',
};

/** Regra de adimplência: dias em atraso da cobrança mais antiga → situação sugerida */
export function statusFromArrears(current: MemberStatus, oldestOverdueDays: number, grace: number, suspendAfter: number): MemberStatus {
  if (!['aprovado', 'ativo', 'em_atraso', 'suspenso'].includes(current)) return current;
  if (oldestOverdueDays <= grace) return current === 'aprovado' ? 'aprovado' : 'ativo';
  if (oldestOverdueDays >= suspendAfter) return 'suspenso';
  return 'em_atraso';
}
