/**
 * Escalas de trabalho da diretoria: monta os dias, turnos, funções e vagas de um evento, abre para os
 * sócios se inscreverem, confirma os nomes e copia o texto para o grupo. Depois de criada, só quem criou
 * e as pessoas indicadas por essa pessoa mudam a escala.
 */
import { useMemo, useState } from 'react';
import { ClipboardCopy, Copy, Plus, Trash2, Users } from 'lucide-react';
import { useData, useDoc, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { addDaysKey, formatDate } from '../../shared/dates.ts';
import { canManageRoster, sortSlots } from '../../shared/rosters.ts';
import type { EventDoc, MemberDoc, OrgChartDoc, RosterDoc, RosterSlot } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Notice, PageHeader, Select, Table, Textarea, Toggle, useConfirm, useToast, type Column } from '../../ui/index.tsx';
import { missing, rosterWhatsappText, RosterBoard, type Roster } from './rosterShared.tsx';

const STATUS = { rascunho: { label: 'Rascunho', tone: 'neutral' }, aberta: { label: 'Aberta para inscrições', tone: 'ok' }, encerrada: { label: 'Encerrada', tone: 'neutral' } } as const;
const sid = () => `s${Math.random().toString(36).slice(2, 10)}`;
const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const weekdayName = (d: string) => {
  const w = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  return w.charAt(0).toUpperCase() + w.slice(1);
};

export default function RostersPage() {
  const t = useTenant();
  const list = useList<RosterDoc>(P.rosters(t.tenantId), { orderBy: [['updatedAt', 'desc']], limit: 50 });
  const [open, setOpen] = useState<Roster | 'nova' | null>(null);
  const canCreate = t.can('eventos', 'criar');
  const columns: Column<Roster>[] = [
    { key: 't', label: 'Escala', render: r => <div><div className="font-medium">{r.title}</div><div className="text-xs text-muted">{r.eventName || `Criada por ${r.createdByName}`}</div></div> },
    { key: 'd', label: 'Dias', hideOnMobile: true, render: r => { const d = [...new Set(r.slots.map(s => s.date))].sort(); return d.length ? (d.length === 1 ? formatDate(d[0]) : `${formatDate(d[0])} a ${formatDate(d[d.length - 1])}`) : 'Sem turnos'; } },
    { key: 'v', label: 'Vagas', render: r => { const left = missing(r.slots); return left ? <Badge tone="warn">Faltam {left}</Badge> : r.slots.length ? <Badge tone="ok">Completa</Badge> : null; } },
    { key: 's', label: 'Situação', hideOnMobile: true, render: r => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge> },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Escalas de trabalho"
        subtitle="Monte os dias, horários e funções de um evento. Os sócios se inscrevem pelo portal e você confirma os nomes."
        actions={canCreate && <Button icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('nova')}>Nova escala</Button>}
      />
      {list.loading ? (
        <Loading />
      ) : (
        <Table rows={list.data} columns={columns} onRowClick={setOpen} empty={<EmptyState icon={<Users className="w-5 h-5" />} title="Nenhuma escala ainda" text="Crie a escala do próximo evento: dias, turnos, funções e quantas pessoas cada um precisa." />} />
      )}
      {open && <RosterModal r={open === 'nova' ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RosterModal({ r, onClose }: { r: Roster | null; onClose: () => void }) {
  const t = useTenant();
  const session = useSession();
  // Escala aberta: começa mostrando o quadro (quem está em cada turno); quem pode editar troca para a montagem
  const [tab, setTab] = useState<'quadro' | 'montar'>(r ? 'quadro' : 'montar');
  const live = useDoc<RosterDoc>(r ? P.roster(t.tenantId, r.id) : null);
  const cur = (live.data ? { ...live.data, id: r!.id } : r) as Roster | null;
  const manage = !cur || canManageRoster(cur, session.user?.uid);
  if (tab === 'montar' && manage) return <RosterEditor r={cur} onClose={onClose} onBoard={cur ? () => setTab('quadro') : undefined} />;
  return <RosterView r={cur!} manage={manage} onClose={onClose} onEdit={() => setTab('montar')} />;
}

function RosterView({ r, manage, onClose, onEdit }: { r: Roster; manage: boolean; onClose: () => void; onEdit: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rosterWhatsappText(r));
      toast.show('Texto copiado. Cole no grupo do WhatsApp.', 'sucesso');
    } catch {
      toast.show('Não foi possível copiar neste aparelho.', 'erro');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={r.title}
      footer={
        <>
          <Button variant="secondary" icon={<ClipboardCopy className="w-4 h-4" />} onClick={copy}>
            Copiar para o WhatsApp
          </Button>
          {manage && <Button onClick={onEdit}>Mudar dias e turnos</Button>}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
        {r.eventName && <Badge tone="info">{r.eventName}</Badge>}
      </div>
      {r.description && <p className="text-sm whitespace-pre-line">{r.description}</p>}
      {!manage && <Notice>Só {r.createdByName} e as pessoas indicadas por essa pessoa mudam esta escala.</Notice>}
      <RosterBoard r={r} mode="gestor" />
      <p className="text-xs text-muted">
        Criada por {r.createdByName}
        {r.editors.length ? `. Também editam: ${r.editors.map(e => e.name).join(', ')}` : ''}.
      </p>
    </Modal>
  );
}

type DraftSlot = Omit<RosterSlot, 'people'> & { people: RosterSlot['people'] };

function RosterEditor({ r, onClose, onBoard }: { r: Roster | null; onClose: () => void; onBoard?: () => void }) {
  const t = useTenant();
  const { client } = useData();
  const session = useSession();
  const confirm = useConfirm();
  const { run, busy } = useOp();
  const events = useList<EventDoc>(P.events(t.tenantId), { orderBy: [['start', 'desc']], limit: 50 });
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const [title, setTitle] = useState(r?.title || '');
  const [description, setDescription] = useState(r?.description || '');
  const [eventId, setEventId] = useState(r?.eventId || '');
  const [status, setStatus] = useState<RosterDoc['status']>(r?.status || 'rascunho');
  const [announce, setAnnounce] = useState(true);
  const [editors, setEditors] = useState<{ uid: string; name: string }[]>(r?.editors || []);
  const [slots, setSlots] = useState<DraftSlot[]>(r?.slots || []);
  const isCreator = !r || r.createdBy === session.user?.uid;

  // Gerador: mesmo turno em vários dias
  const [gFrom, setGFrom] = useState('');
  const [gTo, setGTo] = useState('');
  const [gDays, setGDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [gLabel, setGLabel] = useState('');
  const [gStart, setGStart] = useState('18:00');
  const [gEnd, setGEnd] = useState('00:00');
  const [gRoles, setGRoles] = useState<{ role: string; needed: number }[]>([{ role: '', needed: 1 }]);

  const dates = useMemo(() => {
    if (!gFrom) return [];
    const to = gTo && gTo >= gFrom ? gTo : gFrom;
    const out: string[] = [];
    for (let d = gFrom, n = 0; d <= to && n < 120; d = addDaysKey(d, 1), n++) if (gDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) out.push(d);
    return out;
  }, [gFrom, gTo, gDays]);
  const roles = gRoles.filter(x => x.role.trim().length >= 2);
  const generate = () => {
    const add: DraftSlot[] = [];
    for (const date of dates) for (const x of roles) add.push({ id: sid(), date, ...(gLabel.trim() ? { label: gLabel.trim() } : {}), start: gStart, end: gEnd, role: x.role.trim(), needed: Math.max(1, x.needed), people: [] });
    setSlots(s => sortSlots([...s, ...add]));
  };

  const upd = (id: string, p: Partial<DraftSlot>) => setSlots(s => s.map(x => (x.id === id ? { ...x, ...p } : x)));
  const days = useMemo(() => [...new Set(sortSlots(slots).map(s => s.date))], [slots]);

  // Quem pode editar junto: pessoas do organograma com conta no portal
  const addEditorFrom = async (posId: string) => {
    const p = chart.data?.positions.find(x => x.id === posId);
    if (!p?.memberId) return;
    const m = await client.get<MemberDoc>(P.member(t.tenantId, p.memberId)).catch(() => null);
    if (!m?.uid || m.uid === (r?.createdBy || session.user?.uid) || editors.some(e => e.uid === m.uid)) return;
    setEditors([...editors, { uid: m.uid, name: m.fullName }]);
  };

  const valid = title.trim().length >= 3 && slots.every(s => s.role.trim().length >= 2 && s.needed >= 1 && s.start !== s.end);
  const save = async () => {
    const ev = events.data.find(e => e.id === eventId);
    const res = await run<{ id: string; noticed: boolean }>(
      'rosters.save',
      {
        tenantId: t.tenantId,
        ...(r ? { id: r.id } : {}),
        title: title.trim(),
        description: description.trim(),
        ...(eventId ? { eventId, eventName: ev?.name || r?.eventName || '' } : {}),
        status,
        editors,
        slots: slots.map(({ people: _p, ...s }) => s),
        announce: status === 'aberta' && announce,
      },
      { success: 'Escala salva.' }
    );
    if (res) onClose();
  };
  const remove = async () => {
    if (!r) return;
    if (await confirm({ title: 'Apagar a escala?', text: 'A escala sai do portal. Só dá para apagar enquanto ninguém se inscreveu.', confirmLabel: 'Apagar', danger: true }))
      if (await run('rosters.delete', { tenantId: t.tenantId, id: r.id }, { success: 'Escala apagada.' })) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={r ? `Montar: ${r.title}` : 'Nova escala'}
      footer={
        <>
          {r && isCreator && (
            <Button variant="ghost" className="mr-auto text-bad" icon={<Trash2 className="w-4 h-4" />} onClick={remove}>
              Apagar
            </Button>
          )}
          {onBoard && (
            <Button variant="secondary" onClick={onBoard}>
              Ver o quadro
            </Button>
          )}
          <Button loading={busy} disabled={!valid} onClick={save}>
            Salvar escala
          </Button>
        </>
      }
    >
      <Field label="1. Nome da escala" required>{id => <Input id={id} value={title} maxLength={150} placeholder="Ex.: Escala da Schützenfest 2026" onChange={e => setTitle(e.target.value)} />}</Field>
      <Field label="2. Evento (opcional)">
        {id => (
          <Select id={id} value={eventId} onChange={e => setEventId(e.target.value)}>
            <option value="">Sem evento ligado</option>
            {events.data.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="3. Recado para os voluntários (opcional)">{id => <Textarea id={id} rows={2} value={description} maxLength={2000} placeholder="Ex.: chegar 15 minutos antes, camiseta da sociedade." onChange={e => setDescription(e.target.value)} />}</Field>

      <Card className="space-y-3">
        <div>
          <div className="text-sm font-semibold">4. Adicionar turnos</div>
          <p className="text-xs text-muted">Escolha os dias, o horário e as funções com a quantidade de pessoas. Dá para repetir com outro horário (ex.: Sábado Tarde e Sábado Noite) e ajustar cada turno depois.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="De">{id => <Input id={id} type="date" value={gFrom} onChange={e => setGFrom(e.target.value)} />}</Field>
          <Field label="Até">{id => <Input id={id} type="date" value={gTo} min={gFrom || undefined} onChange={e => setGTo(e.target.value)} />}</Field>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Dias da semana">
          {WEEK.map((w, i) => (
            <button key={i} type="button" aria-pressed={gDays.includes(i)} className={`w-9 h-9 rounded-lg border text-sm cursor-pointer ${gDays.includes(i) ? 'bg-brand text-on-brand border-brand' : 'border-line'}`} onClick={() => setGDays(d => (d.includes(i) ? d.filter(x => x !== i) : [...d, i]))}>
              {w}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Turno (opcional)">{id => <Input id={id} value={gLabel} maxLength={40} placeholder="Tarde" onChange={e => setGLabel(e.target.value)} />}</Field>
          <Field label="Início">{id => <Input id={id} type="time" value={gStart} onChange={e => setGStart(e.target.value)} />}</Field>
          <Field label="Fim">{id => <Input id={id} type="time" value={gEnd} onChange={e => setGEnd(e.target.value)} />}</Field>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">Funções e pessoas</div>
          {gRoles.map((x, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label={`Função ${i + 1}`} placeholder="Ex.: Arma, Serviços, Reserva" value={x.role} maxLength={60} onChange={e => setGRoles(gRoles.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} />
              <Input aria-label={`Pessoas para a função ${i + 1}`} type="number" inputMode="numeric" min={1} max={50} className="w-20" value={x.needed} onChange={e => setGRoles(gRoles.map((y, j) => (j === i ? { ...y, needed: Math.max(1, Math.min(50, Number(e.target.value) || 1)) } : y)))} />
              {gRoles.length > 1 && (
                <button type="button" aria-label="Tirar função" className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer" onClick={() => setGRoles(gRoles.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setGRoles([...gRoles, { role: '', needed: 1 }])}>
            Outra função
          </Button>
        </div>
        <Button type="button" variant="secondary" icon={<Copy className="w-4 h-4" />} disabled={!dates.length || !roles.length || gStart === gEnd} onClick={generate}>
          {dates.length && roles.length ? `Adicionar ${dates.length * roles.length} turno${dates.length * roles.length > 1 ? 's' : ''} em ${dates.length} dia${dates.length > 1 ? 's' : ''}` : 'Adicionar turnos'}
        </Button>
      </Card>

      <div className="space-y-3">
        <div className="text-sm font-semibold">5. Turnos da escala ({slots.length})</div>
        {!slots.length && <p className="text-sm text-muted">Nenhum turno ainda. Use o passo 4.</p>}
        {days.map(d => (
          <div key={d} className="rounded-xl border border-line">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-line text-sm font-semibold">
              {formatDate(d)} · {weekdayName(d)}
              {slots.filter(s => s.date === d).every(s => !s.people.length) && (
                <button type="button" className="ml-auto text-xs text-bad font-normal cursor-pointer" onClick={() => setSlots(s => s.filter(x => x.date !== d))}>
                  Tirar o dia
                </button>
              )}
            </div>
            <ul className="divide-y divide-line">
              {sortSlots(slots.filter(s => s.date === d)).map(s => (
                <li key={s.id} className="p-2 grid grid-cols-[1fr_1fr_3.25rem_2rem] sm:grid-cols-[1fr_6rem_6.5rem_6.5rem_4.5rem_2.5rem] gap-2 items-center">
                  <Input aria-label="Função" className="col-span-4 sm:col-span-1" value={s.role} maxLength={60} onChange={e => upd(s.id, { role: e.target.value })} />
                  <Input aria-label="Turno" value={s.label || ''} maxLength={40} placeholder="Turno" className="hidden sm:block" onChange={e => upd(s.id, { label: e.target.value || undefined })} />
                  <Input aria-label="Início" type="time" className="px-2" value={s.start} onChange={e => upd(s.id, { start: e.target.value })} />
                  <Input aria-label="Fim" type="time" className="px-2" value={s.end} onChange={e => upd(s.id, { end: e.target.value })} />
                  <Input aria-label="Pessoas" type="number" inputMode="numeric" className="px-2 text-center" min={Math.max(1, s.people.length)} max={50} value={s.needed} onChange={e => upd(s.id, { needed: Math.max(Math.max(1, s.people.length), Math.min(50, Number(e.target.value) || 1)) })} />
                  {s.people.length ? (
                    <span className="text-[11px] leading-tight text-muted text-center">{s.people.length} inscr.</span>
                  ) : (
                    <button type="button" aria-label="Tirar turno" className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer justify-self-end" onClick={() => setSlots(x => x.filter(y => y.id !== s.id))}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Field label="6. Situação">
        {id => (
          <Select id={id} value={status} onChange={e => setStatus(e.target.value as RosterDoc['status'])}>
            <option value="rascunho">Rascunho (só a {t.labels.board.toLowerCase()} vê)</option>
            <option value="aberta">Aberta: os {t.labels.members.toLowerCase()} veem e se inscrevem</option>
            <option value="encerrada">Encerrada: os {t.labels.members.toLowerCase()} veem, sem inscrição</option>
          </Select>
        )}
      </Field>
      {status === 'aberta' && !r?.noticeId && <Toggle checked={announce} onChange={setAnnounce} label="Avisar todos no quadro de avisos e no celular" />}

      <div className="space-y-2">
        <div className="text-sm font-semibold">7. Quem mais pode mudar esta escala</div>
        <p className="text-xs text-muted">Além de {r?.createdByName || 'você'}, só estas pessoas mudam dias, turnos e vagas, põem nomes e confirmam.</p>
        {!isCreator && <Notice>Só quem criou a escala escolhe quem mais pode editar.</Notice>}
        <div className="flex flex-wrap gap-1.5">
          {editors.map(e => (
            <span key={e.uid} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-sm">
              {e.name}
              {isCreator && (
                <button type="button" aria-label={`Tirar ${e.name}`} className="text-bad cursor-pointer" onClick={() => setEditors(editors.filter(x => x.uid !== e.uid))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
        {isCreator && !!chart.data?.positions.some(p => p.memberId) && (
          <Select aria-label="Incluir do organograma" value="" onChange={e => addEditorFrom(e.target.value)} className="sm:w-80">
            <option value="">Incluir do organograma...</option>
            {chart.data!.positions
              .filter(p => p.memberId)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.personName ? `: ${p.personName}` : ''}
                </option>
              ))}
          </Select>
        )}
      </div>
    </Modal>
  );
}
