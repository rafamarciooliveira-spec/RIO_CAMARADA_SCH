/** Utilidades de formulário das telas: datas locais, competência e textos curtos. */
import { localDateKey } from '../shared/dates.ts';

/** ISO (UTC) para o valor de um <input type="datetime-local"> no horário do navegador */
export function isoToLocalInput(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function localInputToIso(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function todayIn(tz?: string): string {
  return localDateKey(new Date(), tz);
}

/** "2026-11" para "11/2026" */
export function periodLabel(key: string): string {
  return key && key.length >= 7 ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : key;
}

export function monthsBack(fromKey: string, n: number): string[] {
  const [y, m] = fromKey.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
