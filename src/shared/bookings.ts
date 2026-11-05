/**
 * Regras da reserva de espaços (servidor, tela e testes usam as mesmas):
 * dias de preparação antes e depois (montagem e desmontagem), conflito de horário,
 * pintura do calendário por dia e o que a agenda dos sócios mostra.
 */
import { addDaysKey, localDateKey } from './dates.ts';
import type { BookingDoc, CalendarEntryDoc } from './types.ts';

export const DEFAULT_PREP_DAYS = 2;
const DAY = 86400000;

type B = Pick<BookingDoc, 'start' | 'end' | 'status'> & Partial<Pick<BookingDoc, 'prepDaysBefore' | 'prepDaysAfter'>>;

const before = (b: B) => Math.max(0, b.prepDaysBefore ?? 0);
const after = (b: B) => Math.max(0, b.prepDaysAfter ?? 0);

/** Período ocupado de verdade somado aos dias de preparação */
export function bookingSpan(b: B): { start: number; end: number } {
  return { start: Date.parse(b.start) - before(b) * DAY, end: Date.parse(b.end) + after(b) * DAY };
}

/**
 * Duas reservas batem quando o evento de uma cai no evento ou na preparação da outra.
 * Preparação com preparação pode coincidir (uma desmonta enquanto a outra ainda não começou a montar).
 */
export function bookingsClash(a: B, b: B): boolean {
  const ma = { start: Date.parse(a.start), end: Date.parse(a.end) };
  const mb = { start: Date.parse(b.start), end: Date.parse(b.end) };
  const ea = bookingSpan(a);
  const eb = bookingSpan(b);
  const hit = (x: { start: number; end: number }, y: { start: number; end: number }) => x.start < y.end && x.end > y.start;
  return hit(ma, eb) || hit(ea, mb);
}

export type DayMark = 'evento' | 'preparacao';

/** Para cada dia (AAAA-MM-DD), se a reserva ocupa o dia com o evento ou com a preparação */
export function bookingDays(b: B, tz: string): Map<string, DayMark> {
  const out = new Map<string, DayMark>();
  const first = localDateKey(new Date(b.start), tz);
  // Fim às 00:00 não ocupa o dia seguinte
  const last = localDateKey(new Date(Math.max(Date.parse(b.start), Date.parse(b.end) - 1)), tz);
  for (let k = first, n = 0; k <= last && n < 400; k = addDaysKey(k, 1), n++) out.set(k, 'evento');
  for (let i = 1; i <= before(b); i++) out.set(addDaysKey(first, -i), out.get(addDaysKey(first, -i)) || 'preparacao');
  for (let i = 1; i <= after(b); i++) out.set(addDaysKey(last, i), out.get(addDaysKey(last, i)) || 'preparacao');
  return out;
}

/** Evento da sociedade ou aberto ao público aparece por inteiro; evento fechado de terceiro só como "ocupado" */
export function bookingIsPublic(b: Pick<BookingDoc, 'organizer' | 'access'>): boolean {
  return b.organizer === 'sociedade' || b.access === 'aberto';
}

/** Entrada da agenda para uma reserva confirmada */
export function bookingCalendarEntry(id: string, b: BookingDoc, nowIso: string): CalendarEntryDoc {
  const pub = bookingIsPublic(b);
  return {
    id: `bkg_${id}`,
    title: pub ? b.eventName || `Evento no ${b.spaceName}` : `${b.spaceName}: ocupado`,
    description: pub ? (b.organizer === 'sociedade' ? 'Evento da sociedade' : 'Aberto ao público') : 'Evento particular. O espaço não está disponível nesse período.',
    location: b.spaceName,
    start: b.start,
    end: b.end,
    allDay: false,
    category: pub ? 'Eventos no espaço' : 'Espaço ocupado',
    color: pub ? '#2563eb' : '#64748b',
    recurrence: { freq: 'nenhuma' },
    // Aberto ao público entra também na página pública; o resto só para os sócios
    visibility: b.access === 'aberto' ? 'publico' : 'socios',
    source: 'reserva',
    sourceId: id,
    createdAt: nowIso,
  };
}
