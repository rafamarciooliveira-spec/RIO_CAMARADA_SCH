/**
 * Agenda no estilo Google Agenda: mês, semana, dia e lista. Junta itens manuais (com recorrência),
 * eventos, cobranças do próprio sócio e assembleias. Link para o Google Agenda e feed ICS revogável.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, ExternalLink, Link2, Plus, Rss } from 'lucide-react';
import { useData, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { expandOccurrences, googleCalendarUrl, type Occurrence } from '../../shared/calendarUtils.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import type { AssemblyDoc, CalendarEntryDoc, ChargeDoc, EventDoc } from '../../shared/types.ts';
import { Badge, Button, Card, cx, EmptyState, Loading, Modal, Notice, PageHeader, Tabs, useConfirm, useToast } from '../../ui/index.tsx';
import { EntryForm } from './components/EntryForm.tsx';

type View = 'mes' | 'semana' | 'dia' | 'lista';
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function rangeFor(view: View, cursor: Date): [Date, Date] {
  if (view === 'dia') return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  if (view === 'semana') {
    const s = addDays(startOfDay(cursor), -cursor.getDay());
    return [s, addDays(s, 7)];
  }
  if (view === 'lista') return [startOfDay(cursor), addDays(startOfDay(cursor), 60)];
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const s = addDays(first, -first.getDay());
  return [s, addDays(s, 42)];
}

export default function CalendarPage() {
  const t = useTenant();
  const session = useSession();
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'lista' : 'mes'));
  const [cursor, setCursor] = useState(() => new Date());
  const [hidden, setHidden] = useState<string[]>([]);
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<{ entry?: CalendarEntryDoc & { id: string }; start?: Date } | null>(null);
  const [from, to] = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const uid = session.user?.uid || '-';
  const canCreate = t.can('agenda', 'criar');

  const entries = useList<CalendarEntryDoc>(P.calendar(t.tenantId), t.board ? { limit: 1000 } : { where: [['visibility', 'in', ['publico', 'socios']]], limit: 1000 });
  const events = useList<EventDoc>(t.moduleOn('eventos') ? P.events(t.tenantId) : null, { where: [['start', '>=', addDays(from, -31).toISOString()], ['start', '<', toIso]], orderBy: [['start', 'asc']], limit: 300 });
  const charges = useList<ChargeDoc>(t.moduleOn('financeiro') && t.member ? P.charges(t.tenantId) : null, { where: [['memberUid', '==', uid]], orderBy: [['dueDate', 'asc']], limit: 200 });
  const assemblies = useList<AssemblyDoc>(t.moduleOn('atas') ? P.assemblies(t.tenantId) : null, { where: [['date', '>=', fromIso], ['date', '<', toIso]], orderBy: [['date', 'asc']], limit: 100 });

  const items = useMemo(() => {
    const out: Occurrence[] = [];
    const allowed = t.board ? ['publico', 'socios', 'diretoria'] : ['publico', 'socios'];
    for (const e of entries.data) if (allowed.includes(e.visibility)) out.push(...expandOccurrences({ ...e, source: e.source || 'manual' }, fromIso, toIso));
    for (const ev of events.data) {
      if (ev.status === 'cancelado' || (!t.board && ev.status === 'planejamento')) continue;
      out.push(...expandOccurrences({ id: `evento_${ev.id}`, title: ev.name, description: ev.description, location: ev.location, start: ev.start, end: ev.end, allDay: false, category: 'Eventos', color: '#2563eb', recurrence: { freq: 'nenhuma' }, visibility: 'socios', source: 'evento', sourceId: ev.id }, fromIso, toIso));
    }
    for (const c of charges.data) {
      if (c.status !== 'aberta' && c.status !== 'vencida') continue;
      const start = new Date(`${c.dueDate}T12:00:00`).toISOString();
      out.push(...expandOccurrences({ id: `cobranca_${c.id}`, title: `Vence: ${c.description} (${formatBRL(c.amountCents - (c.discountCents || 0))})`, start, end: start, allDay: true, category: 'Minhas cobranças', color: '#d97706', recurrence: { freq: 'nenhuma' }, visibility: 'socios', source: 'cobranca', sourceId: c.id }, fromIso, toIso));
    }
    for (const a of assemblies.data) {
      if (a.status === 'cancelada' || (!t.board && a.kind === 'reuniao_diretoria')) continue;
      out.push(...expandOccurrences({ id: `assembleia_${a.id}`, title: a.title, location: a.location, start: a.date, end: new Date(Date.parse(a.date) + 2 * 3600_000).toISOString(), allDay: false, category: 'Assembleias', color: '#7c3aed', recurrence: { freq: 'nenhuma' }, visibility: 'socios', source: 'assembleia', sourceId: a.id }, fromIso, toIso));
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }, [entries.data, events.data, charges.data, assemblies.data, fromIso, toIso, t.board]);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries.data) if (!m.has(e.category)) m.set(e.category, e.color);
    for (const i of items) if (!m.has(i.category)) m.set(i.category, i.color);
    return [...m.entries()].map(([name, color]) => ({ name, color }));
  }, [entries.data, items]);

  const shown = items.filter(i => !hidden.includes(i.category));

  const move = (dir: number) => {
    const c = new Date(cursor);
    if (view === 'mes') c.setMonth(c.getMonth() + dir);
    else if (view === 'semana') c.setDate(c.getDate() + 7 * dir);
    else if (view === 'lista') c.setDate(c.getDate() + 30 * dir);
    else c.setDate(c.getDate() + dir);
    setCursor(c);
  };

  const title =
    view === 'mes'
      ? cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : view === 'dia'
        ? cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
        : `${from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${addDays(to, -1).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const openItem = (o: Occurrence) => setSelected(o);
  const loading = entries.loading && !entries.data.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agenda"
        subtitle="Ensaios, eventos, assembleias e os seus vencimentos num lugar só."
        actions={
          canCreate && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setEditing({ start: cursor })}>
              Novo item
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => move(-1)} aria-label="Anterior" icon={<ChevronLeft className="w-4 h-4" />} />
          <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button variant="secondary" size="sm" onClick={() => move(1)} aria-label="Próximo" icon={<ChevronRight className="w-4 h-4" />} />
        </div>
        <h2 className="text-lg font-bold capitalize flex-1 min-w-40" aria-live="polite">
          {title}
        </h2>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        tabs={[
          { id: 'mes', label: 'Mês' },
          { id: 'semana', label: 'Semana' },
          { id: 'dia', label: 'Dia' },
          { id: 'lista', label: 'Lista' },
        ]}
      />
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Categorias">
          {categories.map(c => {
            const off = hidden.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                aria-pressed={!off}
                onClick={() => setHidden(h => (off ? h.filter(x => x !== c.name) : [...h, c.name]))}
                className={cx('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer', off ? 'border-line text-muted line-through' : 'border-line')}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : view === 'mes' ? (
        <MonthGrid from={from} cursor={cursor} items={shown} onOpen={openItem} onDay={d => (setCursor(d), setView('dia'))} />
      ) : view === 'lista' ? (
        <ListView items={shown} onOpen={openItem} />
      ) : (
        <DaysView from={from} days={view === 'semana' ? 7 : 1} items={shown} onOpen={openItem} onCreate={canCreate ? d => setEditing({ start: d }) : undefined} />
      )}

      <IcsSection />

      {selected && (
        <ItemModal
          o={selected}
          onClose={() => setSelected(null)}
          onEdit={
            canCreate && selected.source === 'manual'
              ? () => {
                  const e = entries.data.find(x => x.id === selected.id);
                  setSelected(null);
                  if (e) setEditing({ entry: e });
                }
              : undefined
          }
        />
      )}
      {editing && <EntryForm entry={editing.entry} initialStart={editing.start} knownCategories={categories.filter(c => !['Eventos', 'Minhas cobranças', 'Assembleias'].includes(c.name))} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Chip({ o, onOpen }: { o: Occurrence; onOpen: (o: Occurrence) => void }) {
  return (
    <button type="button" onClick={() => onOpen(o)} className="w-full text-left truncate text-[11px] px-1.5 py-0.5 rounded-md cursor-pointer text-white" style={{ background: o.color }} title={o.title}>
      {!o.allDay && <span className="opacity-90 mr-1">{timeOf(o.start)}</span>}
      {o.title}
    </button>
  );
}

function MonthGrid({ from, cursor, items, onOpen, onDay }: { from: Date; cursor: Date; items: Occurrence[]; onOpen: (o: Occurrence) => void; onDay: (d: Date) => void }) {
  const today = new Date();
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div className="rounded-2xl border border-line overflow-hidden">
      <div className="grid grid-cols-7 bg-surface-2 text-[11px] text-muted">
        {WEEK.map(w => (
          <div key={w} className="px-2 py-1.5 text-center uppercase">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-line border-t border-line">
        {days.map(d => {
          const list = items.filter(o => sameDay(new Date(o.start), d));
          const out = d.getMonth() !== cursor.getMonth();
          return (
            <div key={d.toISOString()} className={cx('min-h-20 sm:min-h-28 p-1 bg-surface space-y-0.5', out && 'opacity-50')}>
              <button type="button" onClick={() => onDay(d)} aria-label={d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} className={cx('text-xs w-6 h-6 rounded-full cursor-pointer', sameDay(d, today) ? 'bg-accent text-black font-bold' : 'hover:bg-surface-2')}>
                {d.getDate()}
              </button>
              <div className="hidden sm:block space-y-0.5">
                {list.slice(0, 3).map(o => (
                  <Chip key={o.key} o={o} onOpen={onOpen} />
                ))}
                {list.length > 3 && (
                  <button type="button" onClick={() => onDay(d)} className="text-[10px] text-muted cursor-pointer">
                    mais {list.length - 3}
                  </button>
                )}
              </div>
              {list.length > 0 && (
                <div className="sm:hidden flex flex-wrap gap-0.5">
                  {list.slice(0, 4).map(o => (
                    <span key={o.key} className="w-1.5 h-1.5 rounded-full" style={{ background: o.color }} aria-hidden />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DaysView({ from, days, items, onOpen, onCreate }: { from: Date; days: number; items: Occurrence[]; onOpen: (o: Occurrence) => void; onCreate?: (d: Date) => void }) {
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  return (
    <div className={cx('grid gap-2', days === 7 ? 'sm:grid-cols-7' : 'grid-cols-1')}>
      {list.map(d => {
        const dayItems = items.filter(o => sameDay(new Date(o.start), d));
        return (
          <div key={d.toISOString()} className="rounded-2xl border border-line bg-surface p-2 min-h-32 space-y-1">
            <div className="flex items-center justify-between">
              <span className={cx('text-xs font-semibold capitalize', sameDay(d, new Date()) && 'text-accent')}>{d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              {onCreate && (
                <button type="button" onClick={() => onCreate(d)} aria-label="Novo item neste dia" className="p-1 rounded-lg hover:bg-surface-2 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {dayItems.length === 0 && <p className="text-[11px] text-muted">Livre</p>}
            {dayItems.map(o => (
              <button key={o.key} type="button" onClick={() => onOpen(o)} className="w-full text-left p-2 rounded-lg border-l-4 bg-surface-2 cursor-pointer" style={{ borderColor: o.color }}>
                <div className="text-xs font-semibold">{o.title}</div>
                <div className="text-[11px] text-muted">
                  {o.allDay ? 'Dia inteiro' : `${timeOf(o.start)} às ${timeOf(o.end)}`}
                  {o.location && ` · ${o.location}`}
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ items, onOpen }: { items: Occurrence[]; onOpen: (o: Occurrence) => void }) {
  if (!items.length) return <EmptyState title="Nada marcado nos próximos 60 dias" />;
  const groups = new Map<string, Occurrence[]>();
  for (const o of items) {
    const k = startOfDay(new Date(o.start)).toISOString();
    groups.set(k, [...(groups.get(k) || []), o]);
  }
  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([k, list]) => (
        <section key={k}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-1 capitalize">{new Date(k).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</h3>
          <ul className="space-y-1.5">
            {list.map(o => (
              <li key={o.key}>
                <button type="button" onClick={() => onOpen(o)} className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-surface border border-line hover:border-muted cursor-pointer">
                  <span className="w-1.5 self-stretch rounded-full" style={{ background: o.color }} aria-hidden />
                  <span className="text-xs text-muted w-14 shrink-0 tabular-nums">{o.allDay ? 'Dia todo' : timeOf(o.start)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{o.title}</span>
                    {o.location && <span className="block text-xs text-muted truncate">{o.location}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const SOURCE_LABEL: Record<Occurrence['source'], string> = { manual: 'Agenda', evento: 'Evento', cobranca: 'Cobrança', assembleia: 'Assembleia', reserva: 'Reserva', oficina: 'Oficina' };

function ItemModal({ o, onClose, onEdit }: { o: Occurrence; onClose: () => void; onEdit?: () => void }) {
  const t = useTenant();
  const tz = t.tenant.timezone;
  return (
    <Modal
      open
      onClose={onClose}
      title={o.title}
      footer={
        <>
          {onEdit && (
            <Button variant="secondary" onClick={onEdit}>
              Editar
            </Button>
          )}
          <a href={googleCalendarUrl(o)} target="_blank" rel="noopener noreferrer">
            <Button icon={<CalendarPlus className="w-4 h-4" />}>Adicionar ao Google Agenda</Button>
          </a>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Badge>{SOURCE_LABEL[o.source]}</Badge>
        <Badge tone="info">{o.category}</Badge>
        {o.recurring && <Badge>Repete</Badge>}
        {o.visibility === 'diretoria' && <Badge tone="warn">Só {t.labels.board.toLowerCase()}</Badge>}
      </div>
      <p className="text-sm">{o.allDay ? new Date(o.start).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : `${formatDateTime(o.start, tz)} até ${formatDateTime(o.end, tz)}`}</p>
      {o.location && <p className="text-sm text-muted">Local: {o.location}</p>}
      {o.description && <p className="text-sm whitespace-pre-line">{o.description}</p>}
    </Modal>
  );
}

function IcsSection() {
  const t = useTenant();
  const { client } = useData();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<{ active: boolean; createdAt: string | null } | null>(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    client
      .call<{ active: boolean; createdAt: string | null }>('calendar.icsStatus', { tenantId: t.tenantId })
      .then(r => alive && setStatus(r))
      .catch(() => alive && setStatus({ active: false, createdAt: null }));
    return () => {
      alive = false;
    };
  }, [client, t.tenantId, url]);

  const create = async () => {
    if (status?.active && !(await confirm({ title: 'Gerar novo link', text: 'O link anterior para de funcionar. Atualize os aplicativos que usam ele.', confirmLabel: 'Gerar novo' }))) return;
    const r = await run<{ url: string }>('calendar.createIcsToken', { tenantId: t.tenantId }, { success: 'Link do feed criado.' });
    if (r) setUrl(r.url);
  };
  const revoke = async () => {
    if (!(await confirm({ title: 'Desligar o feed', text: 'Os aplicativos que assinam a agenda param de receber atualizações.', confirmLabel: 'Desligar', danger: true }))) return;
    const r = await run('calendar.revokeIcsToken', { tenantId: t.tenantId }, { success: 'Feed desligado.' });
    if (r) {
      setUrl('');
      setStatus({ active: false, createdAt: null });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show('Link copiado.', 'sucesso');
    } catch {
      toast.show('Não foi possível copiar. Selecione o link e copie à mão.', 'erro');
    }
  };
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Rss className="w-4 h-4 text-accent" aria-hidden />
        <h2 className="font-semibold text-sm">Assinar no celular ou no Google Agenda</h2>
      </div>
      <p className="text-sm text-muted">Gere um link pessoal (feed ICS) e cole no Google Agenda, Outlook ou no calendário do iPhone. O link é só seu: não compartilhe. Você pode desligar quando quiser.</p>
      {status?.active && !url && <p className="text-xs text-muted">Você tem um feed ativo{status.createdAt ? `, criado em ${formatDateTime(status.createdAt, t.tenant.timezone)}` : ''}. Por segurança, o link só aparece na hora em que é gerado.</p>}
      {url && (
        <Notice tone="ok">
          <div className="space-y-2">
            <div className="font-mono text-xs break-all">{url}</div>
            <Button size="sm" variant="secondary" icon={<Copy className="w-4 h-4" />} onClick={copy}>
              Copiar link
            </Button>
            <a className="text-xs underline inline-flex items-center gap-1 ml-2" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, 'webcal:'))}`} target="_blank" rel="noopener noreferrer">
              Abrir no Google Agenda <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          </div>
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Link2 className="w-4 h-4" />} loading={busy} onClick={create}>
          {status?.active ? 'Gerar novo link' : 'Gerar link do feed'}
        </Button>
        {status?.active && (
          <Button size="sm" variant="ghost" onClick={revoke}>
            Desligar feed
          </Button>
        )}
      </div>
    </Card>
  );
}
