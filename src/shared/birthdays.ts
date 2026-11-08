/** Aniversariantes sem repetição e o texto "Filho(a) de ..." (funções puras, usadas nas telas) */
import type { MemberDoc } from './types.ts';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Tira o cadastro marcado como repetido e o mesmo nome com o mesmo nascimento */
export function uniqueBirthdays<T extends MemberDoc & { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of list) {
    if (m.duplicateOf && list.some(x => x.id === m.duplicateOf)) continue;
    const key = `${norm(m.fullName)}|${m.birthMonthDay || ''}|${m.birthYear || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** "Filho(a) de Rafael Oliveira" ou "Dependente de ..." (com o segundo responsável, quando houver) */
export function dependentText(m: MemberDoc, holder?: string, other?: string): string {
  const who = [holder, other].filter(Boolean).join(' e ');
  const rel = (m.custom?.parentesco || '').trim();
  const base = rel && !/^outro$/i.test(rel) ? rel.replace(/\s+ou\s+companheiro\(a\)/i, '') : 'Dependente';
  return who ? `${base} de ${who}` : base;
}

