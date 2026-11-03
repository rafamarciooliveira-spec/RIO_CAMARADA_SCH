import type { MemberStatus } from '../../shared/types.ts';

export function statusTone(s: MemberStatus): 'ok' | 'warn' | 'bad' | 'info' | 'neutral' {
  if (s === 'ativo' || s === 'aprovado') return 'ok';
  if (s === 'pendente') return 'info';
  if (s === 'em_atraso' || s === 'rejeitado') return 'warn';
  if (s === 'suspenso') return 'bad';
  return 'neutral';
}
