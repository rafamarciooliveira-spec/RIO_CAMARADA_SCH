/** Datas com fuso da sociedade (padrão America/Sao_Paulo). Sem dependência de navegador. */

export const DEFAULT_TZ = 'America/Sao_Paulo';

export function formatDate(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '';
  // Datas puras (AAAA-MM-DD) não têm fuso: mostra como estão
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(t);
}

export function formatDateTime(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(t);
  return s.replace(',', ' às');
}

export function tzLabel(tz = DEFAULT_TZ): string {
  if (tz === 'America/Sao_Paulo') return 'horário de Brasília';
  return tz;
}

/** AAAA-MM-DD no fuso indicado */
export function localDateKey(date: Date, tz = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function addMonthsKey(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysKey(dateKey: string, days: number): string {
  const t = Date.parse(`${dateKey}T12:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** "MM-DD" para aniversariantes (sem expor o ano) */
export function birthMonthDay(birthDateISO: string | null | undefined): string {
  if (!birthDateISO || !/^\d{4}-\d{2}-\d{2}/.test(birthDateISO)) return '';
  return birthDateISO.slice(5, 10);
}

export function ageOn(birthDateISO: string, onKey: string): number {
  const [by, bm, bd] = birthDateISO.slice(0, 10).split('-').map(Number);
  const [y, m, d] = onKey.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}
