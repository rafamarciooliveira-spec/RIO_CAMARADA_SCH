/** Reserva de espaços: espaços com valores, reservas com calendário de ocupação, contrato com variáveis e decisão. */
import { useMemo, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { isoToLocalInput, localInputToIso } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { formatDateTime, localDateKey } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import { replaceVars } from '../../shared/templates.ts';
import type { BookingDoc, MemberDoc, SpaceDoc } from '../../shared/types.ts';
import { Badge, Button, cx, EmptyState, ErrorState, Field, Input, Loading, Modal, Money, MoneyInput, PageHeader, Select, Table, Tabs, Textarea, Toggle, useConfirm, type Column } from '../../ui/index.tsx';
import { CrudPage, type CrudConfig } from './CrudPage.tsx';

const CONTRACT =
  'CONTRATO DE CESSÃO DE ESPAÇO\n\nA {sociedade} cede a {solicitante} o uso do espaço {espaco}, de {inicio} até {fim}, pelo valor de {valor}.\n\nO(A) solicitante se compromete a respeitar as regras do espaço:\n{regras}\n\nDanos ao patrimônio serão cobrados do(a) solicitante. A reserva só vale após a confirmação da diretoria.\n\nAssinaturas:\n\n______________________          ______________________\n{sociedade}                       {solicitante}';

const STATUS = { solicitada: { label: 'Solicitada', tone: 'warn' }, confirmada: { label: 'Confirmada', tone: 'ok' }, cancelada: { label: 'Cancelada', tone: 'neutral' } } as const;

export default function BookingsPage() {
  const [tab, setTab] = useState<'reservas' | 'espacos'>('reservas');
  const spaces: CrudConfig = {
    collection: 'spaces',
    title: 'Espaços',
    singular: 'espaço',
    query: { orderBy: [['name', 'asc']] },
    defaults: () => ({ name: '', capacity: 0, priceMemberCents: 0, priceNonMemberCents: 0, rules: '' }),
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true, max: 120 },
      { key: 'capacity', label: 'Capacidade (pessoas)', type: 'number' },
      { key: 'priceMemberCents', label: 'Valor para sócio', type: 'money' },
      { key: 'priceNonMemberCents', label: 'Valor para não sócio', type: 'money' },
      { key: 'rules', label: 'Regras de uso', type: 'textarea', max: 3000 },
    ],
    columns: [
      { key: 'n', label: 'Espaço', render: s => <span className="font-medium">{String(s.name)}</span> },
      { key: 'c', label: 'Capacidade', render: s => String(s.capacity || ''), hideOnMobile: true },
      { key: 'm', label: 'Sócio', render: s => formatBRL(Number(s.priceMemberCents)) },
      { key: 'x', label: 'Não sócio', render: s => formatBRL(Number(s.priceNonMemberCents)) },
    ],
    emptyText: 'Cadastre o salão, a sede e demais espaços que podem ser reservados.',
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Reserva de espaços" subtitle="Salão e sede: calendário, valores por sócio e não sócio, contrato e bloqueio de conflitos." />
      <Tabs tabs={[{ id: 'reservas', label: 'Reservas' }, { id: 'espacos', label: 'Espaços' }]} value={tab} onChange={setTab} />
      {tab === 'reservas' ? <Bookings /> : <CrudPage config={spaces} embedded />}
    </div>
  );
}

function Bookings() {
  const t = useTenant();
  const spaces = useList<SpaceDoc>(P.spaces(t.tenantId), { orderBy: [['name', 'asc']] });
  const list = useList<BookingDoc>(P.bookings(t.tenantId), { orderBy: [['start', 'desc']], limit: 300 });
  const [space, setSpace] = useState('');
  const [open, setOpen] = useState<(BookingDoc & { id: string }) | 'nova' | null>(null);
  const [month, setMonth] = useState(() => localDateKey(new Date(), t.tenant.timezone).slice(0, 7));
  const rows = list.data.filter(b => !space || b.spaceId === space);
  const columns: Column<BookingDoc & { id: string }>[] = [
    { key: 's', label: 'Espaço', render: b => <div><div className="font-medium">{b.spaceName}</div><div className="text-xs text-muted">{b.requesterName}</div></div> },
    { key: 'd', label: 'Quando', render: b => formatDateTime(b.start, t.tenant.timezone) },
    { key: 'v', label: 'Valor', render: b => <Money cents={b.priceCents} />, hideOnMobile: true },
    { key: 'st', label: 'Situação', render: b => <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge> },
  ];
  if (spaces.loading || list.loading) return <Loading />;
  if (list.error) return <ErrorState text={list.error} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select aria-label="Filtrar por espaço" value={space} onChange={e => setSpace(e.target.value)} className="sm:w-56">
          <option value="">Todos os espaços</option>
          {spaces.data.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {t.can('reservas', 'criar') && spaces.data.length > 0 && (
          <Button size="sm" className="sm:ml-auto" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('nova')}>
            Nova reserva
          </Button>
        )}
      </div>
      {spaces.data.length === 0 && <EmptyState icon={<Building2 className="w-5 h-5" />} title="Nenhum espaço cadastrado" text="Cadastre os espaços na aba Espaços." />}
      <Occupancy month={month} setMonth={setMonth} bookings={rows} />
      <Table rows={rows} columns={columns} onRowClick={setOpen} empty={<EmptyState title="Nenhuma reserva" />} />
      {open && <BookingModal b={open === 'nova' ? null : open} spaces={spaces.data} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Occupancy({ month, setMonth, bookings }: { month: string; setMonth: (m: string) => void; bookings: (BookingDoc & { id: string })[] }) {
  const t = useTenant();
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const byDay = useMemo(() => {
    const map = new Map<string, (BookingDoc & { id: string })[]>();
    for (const b of bookings) {
      if (b.status === 'cancelada') continue;
      const k = localDateKey(new Date(b.start), t.tenant.timezone);
      map.set(k, [...(map.get(k) || []), b]);
    }
    return map;
  }, [bookings, t.tenant.timezone]);
  const shift = (d: number) => {
    const n = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(`${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  return (
    <div className="border border-line rounded-2xl p-3 bg-surface">
      <div className="flex items-center justify-between mb-2">
        <Button size="sm" variant="ghost" aria-label="Mês anterior" icon={<ChevronLeft className="w-4 h-4" />} onClick={() => shift(-1)} />
        <div className="font-semibold capitalize">{label}</div>
        <Button size="sm" variant="ghost" aria-label="Próximo mês" icon={<ChevronRight className="w-4 h-4" />} onClick={() => shift(1)} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted mb-1" aria-hidden>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, '0')}`;
          const list = byDay.get(key) || [];
          const confirmed = list.some(b => b.status === 'confirmada');
          return (
            <div
              key={key}
              title={list.map(b => `${b.spaceName}: ${b.requesterName}`).join('\n')}
              aria-label={`Dia ${i + 1}: ${list.length ? `${list.length} reserva(s)` : 'livre'}`}
              className={cx('aspect-square rounded-lg text-xs flex flex-col items-center justify-center border', confirmed ? 'bg-ok/20 border-ok/40' : list.length ? 'bg-warn/15 border-warn/40' : 'border-line')}
            >
              {i + 1}
              {list.length > 0 && <span className="text-[9px] font-bold">{list.length}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[11px] text-muted mt-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-ok/30 inline-block" aria-hidden /> confirmada
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-warn/30 inline-block" aria-hidden /> solicitada
        </span>
      </div>
    </div>
  );
}

function BookingModal({ b, spaces, onClose }: { b: (BookingDoc & { id: string }) | null; spaces: (SpaceDoc & { id: string })[]; onClose: () => void }) {
  const t = useTenant();
  const confirm = useConfirm();
  const { run, busy } = useOp();
  const members = useList<MemberDoc>(!b && t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 2000 });
  const editable = !b || (b.status === 'solicitada' && t.can('reservas', 'editar'));
  const [f, setF] = useState({
    spaceId: b?.spaceId || spaces[0]?.id || '',
    start: b?.start || '',
    end: b?.end || '',
    requesterName: b?.requesterName || '',
    memberId: b?.memberId || '',
    isMember: b?.isMember ?? false,
    priceCents: b?.priceCents ?? 0,
    contractText: b?.contractText || '',
  });
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }));
  const sp = spaces.find(s => s.id === f.spaceId);
  const suggested = sp ? (f.isMember ? sp.priceMemberCents : sp.priceNonMemberCents) : 0;
  const valid = f.spaceId && f.start && f.end && f.end > f.start && f.requesterName.trim().length >= 2;
  const fill = () =>
    set({
      contractText: replaceVars(CONTRACT, {
        sociedade: t.tenant.name,
        solicitante: f.requesterName || '{solicitante}',
        espaco: sp?.name || '{espaco}',
        inicio: f.start ? formatDateTime(f.start, t.tenant.timezone) : '{inicio}',
        fim: f.end ? formatDateTime(f.end, t.tenant.timezone) : '{fim}',
        valor: formatBRL(f.priceCents),
        regras: sp?.rules || 'conforme regulamento da sociedade',
      }),
    });

  const save = async () => {
    const data = {
      spaceId: f.spaceId,
      spaceName: sp?.name || '',
      start: f.start,
      end: f.end,
      requesterName: f.requesterName.trim(),
      ...(f.memberId ? { memberId: f.memberId } : {}),
      isMember: f.isMember,
      priceCents: f.priceCents,
      contractText: f.contractText,
      ...(b ? {} : { status: 'solicitada' }),
    };
    if (await run('generic.save', { tenantId: t.tenantId, collection: 'bookings', ...(b ? { id: b.id } : {}), data }, { success: 'Reserva salva.' })) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={b ? `Reserva: ${b.spaceName}` : 'Nova reserva'}
      footer={
        <>
          {b && b.status !== 'cancelada' && t.can('reservas', 'aprovar') && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              onClick={async () => {
                if (await confirm({ title: 'Cancelar a reserva?', text: 'O horário fica livre e a entrada sai da agenda.', confirmLabel: 'Cancelar reserva', danger: true }))
                  if (await run('bookings.decide', { tenantId: t.tenantId, bookingId: b.id, decision: 'cancelar' }, { success: 'Reserva cancelada.' })) onClose();
              }}
            >
              Cancelar reserva
            </Button>
          )}
          {b?.status === 'solicitada' && t.can('reservas', 'aprovar') && (
            <Button variant="secondary" loading={busy} onClick={async () => (await run('bookings.decide', { tenantId: t.tenantId, bookingId: b.id, decision: 'confirmar' }, { success: 'Reserva confirmada e incluída na agenda.' })) && onClose()}>
              Confirmar
            </Button>
          )}
          {editable && (
            <Button loading={busy} disabled={!valid} onClick={save}>
              Salvar
            </Button>
          )}
        </>
      }
    >
      {b && <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Espaço" required>
          {id => (
            <Select id={id} value={f.spaceId} disabled={!editable} onChange={e => set({ spaceId: e.target.value })}>
              {spaces.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Solicitante" required>{id => <Input id={id} value={f.requesterName} maxLength={150} disabled={!editable} onChange={e => set({ requesterName: e.target.value })} />}</Field>
        <Field label="Início" required>{id => <Input id={id} type="datetime-local" disabled={!editable} value={isoToLocalInput(f.start)} onChange={e => set({ start: localInputToIso(e.target.value) })} />}</Field>
        <Field label="Fim" required error={f.start && f.end && f.end <= f.start ? 'O fim precisa ser depois do início.' : null}>
          {id => <Input id={id} type="datetime-local" disabled={!editable} value={isoToLocalInput(f.end)} onChange={e => set({ end: localInputToIso(e.target.value) })} />}
        </Field>
      </div>
      {!b && members.data.length > 0 && (
        <Field label={`${t.labels.member} (se for)`}>
          {id => (
            <Select
              id={id}
              value={f.memberId}
              onChange={e => {
                const m = members.data.find(x => x.id === e.target.value);
                const isMember = !!m;
                set({ memberId: e.target.value, isMember, requesterName: m ? m.fullName : f.requesterName, priceCents: sp ? (isMember ? sp.priceMemberCents : sp.priceNonMemberCents) : f.priceCents });
              }}
            >
              <option value="">Não é sócio</option>
              {members.data.map(m => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Toggle checked={f.isMember} disabled={!editable} onChange={v => set({ isMember: v, priceCents: sp ? (v ? sp.priceMemberCents : sp.priceNonMemberCents) : f.priceCents })} label="Valor de sócio" />
      <Field label="Valor" hint={sp ? `Tabela: ${formatBRL(suggested)}` : undefined}>
        {id => <MoneyInput id={id} value={f.priceCents} disabled={!editable} onChange={c => set({ priceCents: c })} />}
      </Field>
      <Field label="Contrato" hint="Variáveis: {sociedade} {solicitante} {espaco} {inicio} {fim} {valor} {regras}">
        {id => <Textarea id={id} value={f.contractText} maxLength={8000} disabled={!editable} className="min-h-40" onChange={e => set({ contractText: e.target.value })} />}
      </Field>
      {editable && (
        <Button size="sm" variant="secondary" onClick={fill}>
          Preencher com o modelo
        </Button>
      )}
    </Modal>
  );
}
