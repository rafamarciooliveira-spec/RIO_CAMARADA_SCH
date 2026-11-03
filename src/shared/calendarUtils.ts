/**
 * Agenda: expansão de recorrência, feed iCalendar (RFC 5545) e link "adicionar ao Google Agenda".
 * Puro (sem navegador), usado pela tela da agenda e pela operação calendar.icsFeed.
 */
import type { CalendarEntryDoc } from './types.ts';

export interface Occurrence {
  key: string; // id + início da ocorrência
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  category: string;
  color: string;
  visibility: CalendarEntryDoc['visibility'];
  source: CalendarEntryDoc['source'];
  sourceId?: string;
  recurring: boolean;
}

type EntryLike = Pick<CalendarEntryDoc, 'title' | 'start' | 'end' | 'allDay' | 'category' | 'color' | 'recurrence' | 'visibility' | 'source'> &
  Partial<Pick<CalendarEntryDoc, 'description' | 'location' | 'sourceId'>> & { id: string };

function addInterval(d: Date, freq: CalendarEntryDoc['recurrence']['freq'], n: number): Date {
  const x = new Date(d.getTime());
  if (freq === 'semanal') x.setUTCDate(x.getUTCDate() + 7 * n);
  else if (freq === 'mensal') x.setUTCMonth(x.getUTCMonth() + n);
  else if (freq === 'anual') x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
}

/** Ocorrências que cruzam [fromIso, toIso). Limite de 800 por item para não travar a tela. */
export function expandOccurrences(e: EntryLike, fromIso: string, toIso: string): Occurrence[] {
  const start = new Date(e.start);
  const end = new Date(e.end || e.start);
  if (Number.isNaN(start.getTime())) return [];
  const dur = Math.max(0, end.getTime() - start.getTime());
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const freq = e.recurrence?.freq || 'nenhuma';
  const untilMs = e.recurrence?.until ? Date.parse(`${e.recurrence.until}T23:59:59Z`) : Infinity;
  const out: Occurrence[] = [];
  const make = (s: Date): Occurrence => ({
    key: `${e.id}_${s.toISOString()}`,
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    start: s.toISOString(),
    end: new Date(s.getTime() + dur).toISOString(),
    allDay: e.allDay,
    category: e.category,
    color: e.color,
    visibility: e.visibility,
    source: e.source,
    sourceId: e.sourceId,
    recurring: freq !== 'nenhuma',
  });
  if (freq === 'nenhuma') {
    if (start.getTime() < to && start.getTime() + Math.max(dur, 1) > from) out.push(make(start));
    return out;
  }
  for (let i = 0; i < 800; i++) {
    const s = addInterval(start, freq, i);
    const ms = s.getTime();
    if (ms > untilMs || ms >= to) break;
    if (ms + Math.max(dur, 1) > from) out.push(make(s));
  }
  return out;
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsDay(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

export function icsEscape(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Dobra linhas longas (75 octetos, aproximado por caracteres) */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

export function buildIcs(calName: string, items: Occurrence[], nowIso: string, domain = 'sodalis'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${domain}//Agenda//PT-BR`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calName)}`];
  for (const o of items) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${o.key.replace(/[^A-Za-z0-9_-]/g, '')}@${domain}`);
    lines.push(`DTSTAMP:${icsDate(nowIso)}`);
    if (o.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDay(o.start)}`);
      const endDay = new Date(Date.parse(o.end) > Date.parse(o.start) ? o.end : new Date(Date.parse(o.start) + 86400000).toISOString());
      lines.push(`DTEND;VALUE=DATE:${icsDay(endDay.toISOString())}`);
    } else {
      lines.push(`DTSTART:${icsDate(o.start)}`);
      lines.push(`DTEND:${icsDate(o.end)}`);
    }
    lines.push(`SUMMARY:${icsEscape(o.title)}`);
    if (o.description) lines.push(`DESCRIPTION:${icsEscape(o.description)}`);
    if (o.location) lines.push(`LOCATION:${icsEscape(o.location)}`);
    if (o.category) lines.push(`CATEGORIES:${icsEscape(o.category)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Link "adicionar ao Google Agenda" para uma ocorrência */
export function googleCalendarUrl(o: Pick<Occurrence, 'title' | 'start' | 'end' | 'allDay' | 'description' | 'location'>): string {
  const dates = o.allDay
    ? `${icsDay(o.start)}/${icsDay(new Date(Date.parse(o.start) + 86400000).toISOString())}`
    : `${icsDate(o.start)}/${icsDate(o.end)}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: o.title, dates });
  if (o.description) p.set('details', o.description.slice(0, 1000));
  if (o.location) p.set('location', o.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
