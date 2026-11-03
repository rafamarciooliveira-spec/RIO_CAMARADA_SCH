import { Paperclip } from 'lucide-react';
import { useFileUrl } from '../../app/DataContext.tsx';
import type { NoticeDoc } from '../../shared/types.ts';

export function AttachmentLink({ a }: { a: { path: string; name: string } }) {
  const url = useFileUrl(a.path);
  return (
    <a href={url || undefined} target="_blank" rel="noopener noreferrer" download={a.name} aria-disabled={!url} className="inline-flex items-center gap-1 text-xs text-accent underline">
      <Paperclip className="w-3 h-3" aria-hidden />
      {a.name}
    </a>
  );
}

export function audienceText(a: NoticeDoc['audience'], catName: (id: string) => string, boardLabel: string): string {
  if (a.boardOnly) return `Só ${boardLabel.toLowerCase()}`;
  if (a.all) return 'Todos';
  const parts = [...a.categoryIds.map(catName), ...a.groups.map(g => `grupo ${g}`)];
  return parts.join(', ') || 'Ninguém';
}

/** "2026-11-05T19:00" (campo datetime-local, horário do aparelho) <-> ISO */
export function localInputToIso(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function isoToLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
