/** Regras puras de governança usadas pelo servidor e pelas telas (texto da ata, elegibilidade, quórum). */
import type { ElectionDoc, MemberDoc, MinuteDoc } from '../types.ts';
import { addMonthsKey } from '../dates.ts';

/** Texto canônico da ata: é sobre ele que o hash SHA-256 é calculado e conferido na assinatura */
export function minuteCanonicalText(m: Pick<MinuteDoc, 'title' | 'body' | 'deliberations'>): string {
  const delib = (m.deliberations || []).map((d, i) => `${i + 1}. ${d.text.trim()}`).join('\n');
  return `${m.title.trim()}\n\n${m.body.replace(/\r\n/g, '\n').trim()}\n\nDeliberações:\n${delib}`;
}

export function quorumNeeded(eligibleCount: number, quorumPercent: number): number {
  return Math.ceil((Math.max(0, eligibleCount) * Math.max(0, quorumPercent)) / 100);
}

export function quorumReached(attendance: number, eligibleCount: number, quorumPercent: number): boolean {
  return attendance >= quorumNeeded(eligibleCount, quorumPercent);
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
}

/** Quem pode votar: situação ativa/aprovada, adimplência (se exigida), categoria e tempo mínimo */
export function electionEligibility(
  e: Pick<ElectionDoc, 'eligibility'>,
  m: Pick<MemberDoc, 'status' | 'categoryId' | 'joinedAt'> | null,
  opts: { hasOverdue: boolean; todayKey: string }
): Eligibility {
  const reasons: string[] = [];
  if (!m) return { eligible: false, reasons: ['Seu acesso não está vinculado a um cadastro de sócio.'] };
  if (!['ativo', 'aprovado'].includes(m.status)) reasons.push('Sua situação na sociedade precisa estar ativa.');
  if (e.eligibility.requireUpToDate && opts.hasOverdue) reasons.push('É preciso estar em dia com as contribuições.');
  if (e.eligibility.categoryIds?.length && !e.eligibility.categoryIds.includes(m.categoryId)) reasons.push('Sua categoria de sócio não participa desta votação.');
  if (e.eligibility.minMonths > 0) {
    if (!m.joinedAt || addMonthsKey(m.joinedAt, e.eligibility.minMonths) > opts.todayKey) {
      reasons.push(`É preciso ter pelo menos ${e.eligibility.minMonths} ${e.eligibility.minMonths === 1 ? 'mês' : 'meses'} de associação.`);
    }
  }
  return { eligible: reasons.length === 0, reasons };
}
