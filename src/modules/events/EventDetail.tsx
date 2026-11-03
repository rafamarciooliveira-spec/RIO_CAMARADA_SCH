/** Detalhe do evento ou projeto, com abas. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, FileText, Plus, ScanLine, Trash2 } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { isoToLocalInput, localInputToIso, todayIn } from '../../app/formHelpers.ts';
import { eventReportPdf } from '../../app/pdf.ts';
import { uuid } from '../../app/uploads.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { budgetVsActual } from '../../shared/finance/reports.ts';
import type { CostCenterDoc, EventDoc, EventGuestDoc, FinAccountDoc, LedgerEntryDoc, MemberDoc, SponsorDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Money, MoneyInput, Notice, Section, Select, Stat, Tabs, Textarea, Toggle, useConfirm, useToast } from '../../ui/index.tsx';

export const EVENT_STATUS: Record<EventDoc['status'], { label: string; tone: 'neutral' | 'ok' | 'info' | 'bad' }> = {
  planejamento: { label: 'Em planejamento', tone: 'info' },
  confirmado: { label: 'Confirmado', tone: 'ok' },
  realizado: { label: 'Realizado', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'bad' },
};

type Tab = 'dados' | 'orcamento' | 'ingressos' | 'convidados' | 'equipe' | 'patrocinios' | 'relatorio';
type Form = Omit<EventDoc, 'id' | 'createdAt' | 'rsvpCount' | 'checkinCount'>;

function emptyForm(): Form {
  const start = new Date(Date.now() + 7 * 86400000);
  start.setHours(20, 0, 0, 0);
  return {
    name: '',
    kind: 'evento',
    description: '',
    start: start.toISOString(),
    end: new Date(start.getTime() + 4 * 3600000).toISOString(),
    location: '',
    status: 'planejamento',
    publicListing: false,
    rsvpEnabled: true,
    budget: { items: [] },
    ticketing: { enabled: false, lots: [] },
    team: [],
    report: '',
  };
}

function toPayload(f: Form) {
  return {
    name: f.name.trim(),
    kind: f.kind,
    description: f.description,
    start: f.start,
    end: f.end,
    location: f.location,
    status: f.status,
    publicListing: f.publicListing,
    rsvpEnabled: f.rsvpEnabled,
    ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
    budget: { items: f.budget.items.map(i => ({ id: i.id, label: i.label, kind: i.kind, plannedCents: i.plannedCents })) },
    ticketing: { enabled: f.ticketing.enabled, lots: f.ticketing.lots.map(l => ({ id: l.id, name: l.name, priceCents: l.priceCents, quantity: l.quantity })) },
    team: f.team,
    report: f.report || '',
  };
}

const short = () => uuid().replace(/-/g, '').slice(0, 12);

export default function EventDetail({ id, onBack, onCreated }: { id?: string; onBack: () => void; onCreated: (id: string) => void }) {
  const t = useTenant();
  const doc = useDoc<EventDoc>(id ? P.event(t.tenantId, id) : null);
  const { run, busy } = useOp();
  const [tab, setTab] = useState<Tab>('dados');
  const [f, setF] = useState<Form>(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [createCc, setCreateCc] = useState(true);
  const canEdit = t.can('eventos', id ? 'editar' : 'criar');

  useEffect(() => {
    if (doc.data && !dirty) {
      const { id: _i, createdAt: _c, rsvpCount: _r, checkinCount: _k, ...rest } = doc.data;
      setF({ ...emptyForm(), ...rest });
    }
  }, [doc.data, dirty]);

  const set = (p: Partial<Form>) => {
    setF(v => ({ ...v, ...p }));
    setDirty(true);
  };

  const save = async () => {
    if (f.name.trim().length < 2) return;
    if (Date.parse(f.end) < Date.parse(f.start)) return;
    const data = toPayload(f);
    const r = await run<{ id: string }>('generic.save', { tenantId: t.tenantId, collection: 'events', ...(id ? { id } : {}), data }, { success: 'Evento salvo.' });
    if (!r) return;
    setDirty(false);
    if (!id) {
      if (createCc && t.can('financeiro', 'criar')) {
        const cc = await run<{ id: string }>('generic.save', { tenantId: t.tenantId, collection: 'costCenters', data: { name: f.name.trim().slice(0, 120), kind: f.kind === 'projeto' ? 'projeto' : 'evento', refId: r.id, active: true } }, { silent: true });
        if (cc) await run('generic.save', { tenantId: t.tenantId, collection: 'events', id: r.id, data: { costCenterId: cc.id } }, { silent: true });
      }
      onCreated(r.id);
    }
  };

  if (id && doc.loading) return <Loading />;
  if (id && !doc.data) return <EmptyState title="Evento não encontrado" action={<Button onClick={onBack}>Voltar</Button>} />;

  const tabs: { id: Tab; label: string }[] = id
    ? [
        { id: 'dados', label: 'Dados' },
        { id: 'orcamento', label: 'Orçamento' },
        { id: 'ingressos', label: 'Ingressos' },
        { id: 'convidados', label: 'Convidados e check-in' },
        { id: 'equipe', label: 'Equipe' },
        { id: 'patrocinios', label: 'Patrocinadores' },
        { id: 'relatorio', label: 'Relatório' },
      ]
    : [{ id: 'dados', label: 'Dados' }];
  const saveBar = canEdit && (tab === 'dados' || tab === 'orcamento' || tab === 'equipe' || tab === 'relatorio' || tab === 'ingressos') && (
    <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-line -mx-4 px-4 py-3 flex justify-end gap-2">
      {dirty && <span className="text-xs text-warn self-center mr-auto">Alterações não salvas</span>}
      <Button loading={busy} disabled={f.name.trim().length < 2 || Date.parse(f.end) < Date.parse(f.start)} onClick={save}>
        Salvar
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
          Voltar
        </Button>
        <h1 className="text-xl font-bold truncate">{id ? f.name || 'Evento' : 'Novo evento ou projeto'}</h1>
        {id && <Badge tone={EVENT_STATUS[f.status].tone}>{EVENT_STATUS[f.status].label}</Badge>}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'dados' && <DataTab f={f} set={set} id={id} readOnly={!canEdit} createCc={createCc} setCreateCc={setCreateCc} />}
      {tab === 'orcamento' && id && <BudgetTab f={f} set={set} eventId={id} readOnly={!canEdit} />}
      {tab === 'ingressos' && id && <TicketsTab f={f} set={set} eventId={id} readOnly={!canEdit} lotsSold={doc.data?.ticketing?.lots || []} />}
      {tab === 'convidados' && id && <GuestsTab eventId={id} ev={doc.data!} />}
      {tab === 'equipe' && <TeamTab f={f} set={set} readOnly={!canEdit} />}
      {tab === 'patrocinios' && id && <SponsorsTab eventId={id} />}
      {tab === 'relatorio' && id && <ReportTab f={f} set={set} ev={doc.data!} eventId={id} readOnly={!canEdit} />}
      {saveBar}
    </div>
  );
}

function DataTab({ f, set, id, readOnly, createCc, setCreateCc }: { f: Form; set: (p: Partial<Form>) => void; id?: string; readOnly: boolean; createCc: boolean; setCreateCc: (v: boolean) => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const cc = useList<CostCenterDoc>(P.costCenters(t.tenantId), { orderBy: [['name', 'asc']] });
  const endBefore = Date.parse(f.end) < Date.parse(f.start);
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nome" required>
          {i => <Input id={i} value={f.name} maxLength={150} disabled={readOnly} onChange={e => set({ name: e.target.value })} />}
        </Field>
        <Field label="Tipo">
          {i => (
            <Select id={i} value={f.kind} disabled={readOnly} onChange={e => set({ kind: e.target.value as Form['kind'] })}>
              <option value="evento">Evento</option>
              <option value="projeto">Projeto</option>
            </Select>
          )}
        </Field>
        <Field label="Início" required>
          {i => <Input id={i} type="datetime-local" disabled={readOnly} value={isoToLocalInput(f.start)} onChange={e => set({ start: localInputToIso(e.target.value) || f.start })} />}
        </Field>
        <Field label="Fim" required error={endBefore ? 'O fim precisa ser depois do início.' : null}>
          {i => <Input id={i} type="datetime-local" disabled={readOnly} value={isoToLocalInput(f.end)} onChange={e => set({ end: localInputToIso(e.target.value) || f.end })} />}
        </Field>
        <Field label="Local">{i => <Input id={i} value={f.location} maxLength={200} disabled={readOnly} onChange={e => set({ location: e.target.value })} />}</Field>
        <Field label="Situação">
          {i => (
            <Select id={i} value={f.status} disabled={readOnly} onChange={e => set({ status: e.target.value as Form['status'] })}>
              {Object.entries(EVENT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {id ? (
          <Field label="Centro de custo" hint="Despesas e receitas lançadas nele contam no realizado.">
            {i => (
              <Select id={i} value={f.costCenterId || ''} disabled={readOnly} onChange={e => set({ costCenterId: e.target.value || undefined })}>
                <option value="">Nenhum</option>
                {cc.data.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          t.can('financeiro', 'criar') && <Toggle checked={createCc} onChange={setCreateCc} label="Criar um centro de custo para este evento" />
        )}
      </div>
      <Field label="Descrição">{i => <Textarea id={i} value={f.description} maxLength={4000} disabled={readOnly} onChange={e => set({ description: e.target.value })} />}</Field>
      <div className="flex flex-col gap-3">
        <Toggle checked={f.rsvpEnabled} disabled={readOnly} onChange={v => set({ rsvpEnabled: v })} label="Sócios podem confirmar presença pelo portal" />
        <Toggle checked={f.publicListing} disabled={readOnly} onChange={v => set({ publicListing: v })} label="Aparece na página pública e na agenda pública" />
      </div>
      {id && !readOnly && (
        <Button
          variant="secondary"
          size="sm"
          icon={<CalendarPlus className="w-4 h-4" />}
          loading={busy}
          onClick={() => run('events.syncCalendar', { tenantId: t.tenantId, eventId: id }, { success: f.status === 'cancelado' ? 'Removido da agenda.' : 'Agenda atualizada.' })}
        >
          {f.status === 'cancelado' ? 'Tirar da agenda' : 'Publicar na agenda'}
        </Button>
      )}
    </div>
  );
}

function useEventLedger(eventId: string, costCenterId?: string) {
  const t = useTenant();
  const byEvent = useList<LedgerEntryDoc>(t.can('financeiro', 'ver') ? P.ledger(t.tenantId) : null, { where: [['eventId', '==', eventId]] });
  const byCc = useList<LedgerEntryDoc>(t.can('financeiro', 'ver') && costCenterId ? P.ledger(t.tenantId) : null, { where: [['costCenterId', '==', costCenterId || '-']] });
  return useMemo(() => {
    const map = new Map<string, LedgerEntryDoc & { id: string }>();
    for (const e of [...byEvent.data, ...byCc.data]) map.set(e.id, e);
    return [...map.values()];
  }, [byEvent.data, byCc.data]);
}

function BudgetTab({ f, set, eventId, readOnly }: { f: Form; set: (p: Partial<Form>) => void; eventId: string; readOnly: boolean }) {
  const t = useTenant();
  const entries = useEventLedger(eventId, f.costCenterId);
  const cmp = budgetVsActual(f.budget.items, entries, { eventId, costCenterId: f.costCenterId });
  const items = f.budget.items;
  const upd = (i: number, p: Partial<Form['budget']['items'][number]>) => set({ budget: { items: items.map((x, k) => (k === i ? { ...x, ...p } : x)) } });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Receitas orçadas" value={<Money cents={cmp.plannedInCents} />} />
        <Stat label="Receitas realizadas" value={<Money cents={cmp.actualInCents} />} tone="ok" />
        <Stat label="Despesas orçadas" value={<Money cents={cmp.plannedOutCents} />} />
        <Stat label="Despesas realizadas" value={<Money cents={cmp.actualOutCents} />} tone="warn" />
      </div>
      <Card className="flex items-center justify-between">
        <span className="text-sm">{cmp.actualResultCents >= 0 ? 'Lucro até agora' : 'Prejuízo até agora'}</span>
        <Money cents={cmp.actualResultCents} className={`text-xl font-bold ${cmp.actualResultCents >= 0 ? 'text-ok' : 'text-bad'}`} />
      </Card>
      {!t.can('financeiro', 'ver') && <Notice>O realizado vem do livro caixa e aparece para quem tem acesso ao financeiro.</Notice>}
      <Section
        title="Itens do orçamento"
        actions={
          !readOnly && (
            <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => set({ budget: { items: [...items, { id: short(), label: '', kind: 'despesa', plannedCents: 0 }] } })}>
              Item
            </Button>
          )
        }
      >
        {items.length === 0 && <EmptyState title="Sem itens" text="Planeje receitas (ingressos, patrocínio) e despesas (som, comida, decoração)." />}
        {items.map((it, i) => (
          <div key={it.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_9rem_10rem_auto] gap-2 items-end">
            <Field label={`Item ${i + 1}`}>{id => <Input id={id} value={it.label} maxLength={120} disabled={readOnly} onChange={e => upd(i, { label: e.target.value })} />}</Field>
            <Field label="Tipo">
              {id => (
                <Select id={id} value={it.kind} disabled={readOnly} onChange={e => upd(i, { kind: e.target.value as 'receita' | 'despesa' })}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </Select>
              )}
            </Field>
            <Field label="Valor previsto">{id => <MoneyInput id={id} value={it.plannedCents} disabled={readOnly} onChange={c => upd(i, { plannedCents: c })} />}</Field>
            {!readOnly && <Button variant="ghost" aria-label={`Remover item ${i + 1}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ budget: { items: items.filter((_, k) => k !== i) } })} />}
          </div>
        ))}
      </Section>
      {entries.length > 0 && (
        <Section title="Lançamentos do evento">
          <ul className="divide-y divide-line border border-line rounded-2xl bg-surface text-sm">
            {entries
              .filter(e => e.status === 'lancado')
              .map(e => (
                <li key={e.id} className="flex justify-between gap-3 px-4 py-2">
                  <span className="truncate">{e.description}</span>
                  <Money cents={e.direction === 'entrada' ? e.amountCents : -e.amountCents} className={e.direction === 'entrada' ? 'text-ok' : 'text-bad'} />
                </li>
              ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function TicketsTab({ f, set, eventId, readOnly, lotsSold }: { f: Form; set: (p: Partial<Form>) => void; eventId: string; readOnly: boolean; lotsSold: EventDoc['ticketing']['lots'] }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const accounts = useList<FinAccountDoc>(t.can('financeiro', 'criar') ? P.accounts(t.tenantId) : null, { where: [['active', '==', true]] });
  const [sale, setSale] = useState<{ lotId: string; buyerName: string; quantity: number; ledger: boolean; accountId: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const lots = f.ticketing.lots;
  const sold = (lid: string) => lotsSold.find(l => l.id === lid)?.sold || 0;
  const upd = (i: number, p: Partial<EventDoc['ticketing']['lots'][number]>) => set({ ticketing: { ...f.ticketing, lots: lots.map((x, k) => (k === i ? { ...x, ...p } : x)) } });
  return (
    <div className="space-y-4">
      <Toggle checked={f.ticketing.enabled} disabled={readOnly} onChange={v => set({ ticketing: { ...f.ticketing, enabled: v } })} label="Venda de ingressos ligada" />
      <Section
        title="Lotes"
        actions={
          !readOnly && (
            <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => set({ ticketing: { ...f.ticketing, lots: [...lots, { id: short(), name: `${lots.length + 1}º lote`, priceCents: 0, quantity: 100, sold: 0 }] } })}>
              Lote
            </Button>
          )
        }
      >
        {lots.map((l, i) => (
          <Card key={l.id} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_9rem_8rem_auto] gap-2 items-end">
              <Field label="Nome do lote">{id => <Input id={id} value={l.name} maxLength={60} disabled={readOnly} onChange={e => upd(i, { name: e.target.value })} />}</Field>
              <Field label="Preço">{id => <MoneyInput id={id} value={l.priceCents} disabled={readOnly} onChange={c => upd(i, { priceCents: c })} />}</Field>
              <Field label="Quantidade">{id => <Input id={id} type="number" min={sold(l.id)} value={l.quantity} disabled={readOnly} onChange={e => upd(i, { quantity: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
              <div className="text-xs text-muted pb-3">
                {sold(l.id)} vendido(s)
              </div>
            </div>
            {!readOnly && f.ticketing.enabled && lotsSold.some(x => x.id === l.id) && (
              <Button size="sm" disabled={sold(l.id) >= l.quantity} onClick={() => setSale({ lotId: l.id, buyerName: '', quantity: 1, ledger: !!accounts.data.length, accountId: accounts.data[0]?.id || '' })}>
                Vender ingresso
              </Button>
            )}
          </Card>
        ))}
        {lots.length === 0 && <EmptyState title="Sem lotes" text="Crie um lote, salve o evento e comece a vender." />}
        {lots.some(l => !lotsSold.some(x => x.id === l.id)) && <p className="text-xs text-muted">Salve o evento para liberar a venda dos lotes novos.</p>}
      </Section>
      <Modal
        open={!!sale}
        onClose={() => setSale(null)}
        title="Vender ingresso"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSale(null)}>
              Cancelar
            </Button>
            <Button
              loading={busy}
              disabled={!sale || sale.buyerName.trim().length < 2}
              onClick={async () => {
                if (!sale) return;
                const r = await run<{ codes: string[] }>('events.sellTicket', {
                  tenantId: t.tenantId,
                  requestId: `${Date.now()}`,
                  eventId,
                  lotId: sale.lotId,
                  buyerName: sale.buyerName.trim(),
                  quantity: sale.quantity,
                  ...(sale.ledger && sale.accountId ? { ledger: { accountId: sale.accountId } } : {}),
                });
                if (r) {
                  setSale(null);
                  setCodes(r.codes);
                }
              }}
            >
              Confirmar venda
            </Button>
          </>
        }
      >
        {sale && (
          <>
            <Field label="Nome do comprador" required>{id => <Input id={id} value={sale.buyerName} maxLength={150} onChange={e => setSale({ ...sale, buyerName: e.target.value })} />}</Field>
            <Field label="Quantidade">{id => <Input id={id} type="number" min={1} max={20} value={sale.quantity} onChange={e => setSale({ ...sale, quantity: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />}</Field>
            {accounts.data.length > 0 && (
              <>
                <Toggle checked={sale.ledger} onChange={v => setSale({ ...sale, ledger: v })} label="Lançar a receita no livro caixa" />
                {sale.ledger && (
                  <Field label="Conta que recebeu">
                    {id => (
                      <Select id={id} value={sale.accountId} onChange={e => setSale({ ...sale, accountId: e.target.value })}>
                        {accounts.data.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
              </>
            )}
          </>
        )}
      </Modal>
      <Modal open={!!codes} onClose={() => setCodes(null)} title="Códigos dos ingressos" footer={<Button onClick={() => setCodes(null)}>Já anotei</Button>}>
        <Notice tone="warn">Estes códigos aparecem só agora. Entregue ao comprador: na entrada, a portaria digita o código para registrar o acesso.</Notice>
        <ul className="space-y-2">
          {codes?.map(c => (
            <li key={c} className="font-mono text-xl tracking-widest text-center p-3 rounded-xl bg-surface-2 select-all">
              {c}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function GuestsTab({ eventId, ev }: { eventId: string; ev: EventDoc }) {
  const t = useTenant();
  const confirm = useConfirm();
  const toast = useToast();
  const { run, busy } = useOp();
  const guests = useList<EventGuestDoc>(P.eventGuests(t.tenantId, eventId), { orderBy: [['name', 'asc']] });
  const members = useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 1000 });
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState('');
  const canEdit = t.can('eventos', 'editar');
  const canCheckin = canEdit || t.can('portaria', 'criar');
  const shown = guests.data.filter(g => !filter || g.name.toLowerCase().includes(filter.toLowerCase()));
  const checked = guests.data.filter(g => g.checkedInAt).length;
  const kindLabel = { socio: 'Sócio', convidado: 'Convidado', ingresso: 'Ingresso' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Na lista" value={guests.data.length} />
        <Stat label="Confirmaram" value={ev.rsvpCount || 0} />
        <Stat label="Entraram" value={checked} tone="ok" />
      </div>
      {canCheckin && (
        <Card className="space-y-2">
          <div className="text-sm font-semibold flex items-center gap-2">
            <ScanLine className="w-4 h-4" aria-hidden /> Check-in por código do ingresso
          </div>
          <form
            className="flex gap-2"
            onSubmit={async e => {
              e.preventDefault();
              if (code.trim().length < 4) return;
              const r = await run<{ status: string; name?: string }>('events.checkinGuest', { tenantId: t.tenantId, eventId, code: code.trim() });
              if (!r) return;
              if (r.status === 'ok') toast.show(`Entrada liberada: ${r.name}.`, 'sucesso');
              else if (r.status === 'ja_utilizado') toast.show(`Ingresso já utilizado (${r.name}).`, 'erro');
              else toast.show('Código não encontrado neste evento.', 'erro');
              setCode('');
            }}
          >
            <Input aria-label="Código do ingresso" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCDE-FGHIJ" className="font-mono" autoComplete="off" />
            <Button type="submit" loading={busy}>
              Registrar
            </Button>
          </form>
          <p className="text-[11px] text-muted">Sócios também entram pela leitura da carteirinha na tela da Portaria.</p>
        </Card>
      )}
      {canEdit && (
        <Card className="space-y-2">
          <div className="text-sm font-semibold">Adicionar à lista</div>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            {members.data.length > 0 && (
              <Field label={t.labels.member}>
                {id => (
                  <Select
                    id={id}
                    value={memberId}
                    onChange={e => {
                      setMemberId(e.target.value);
                      const m = members.data.find(x => x.id === e.target.value);
                      if (m) setName(m.fullName);
                    }}
                  >
                    <option value="">Convidado externo</option>
                    {members.data.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label="Nome">{id => <Input id={id} value={name} maxLength={150} onChange={e => setName(e.target.value)} />}</Field>
            <Button
              loading={busy}
              disabled={name.trim().length < 2}
              onClick={async () => {
                const r = await run('events.addGuest', { tenantId: t.tenantId, eventId, name: name.trim(), ...(memberId ? { memberId } : {}) }, { success: 'Adicionado à lista.' });
                if (r) {
                  setName('');
                  setMemberId('');
                }
              }}
            >
              Adicionar
            </Button>
          </div>
        </Card>
      )}
      <Input aria-label="Filtrar lista" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar por nome" />
      {guests.loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState title="Lista vazia" />
      ) : (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {shown.map(g => (
            <li key={g.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{g.name}</div>
                <div className="text-xs text-muted">
                  {kindLabel[g.kind]}
                  {g.checkedInAt ? ` · entrou ${formatDateTime(g.checkedInAt, t.tenant.timezone)}` : ''}
                </div>
              </div>
              <div className="flex gap-1">
                {canCheckin && !g.checkedInAt && (
                  <Button size="sm" variant="secondary" icon={<Check className="w-4 h-4" />} onClick={() => run('events.checkinGuest', { tenantId: t.tenantId, eventId, guestId: g.id }, { success: `Entrada de ${g.name} registrada.` })}>
                    Entrada
                  </Button>
                )}
                {canEdit && g.kind !== 'ingresso' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remover ${g.name}`}
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={async () => {
                      if (await confirm({ title: 'Remover da lista?', text: `${g.name} sai da lista de convidados.`, confirmLabel: 'Remover', danger: true })) run('events.removeGuest', { tenantId: t.tenantId, eventId, guestId: g.id });
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamTab({ f, set, readOnly }: { f: Form; set: (p: Partial<Form>) => void; readOnly: boolean }) {
  const upd = (i: number, p: Partial<Form['team'][number]>) => set({ team: f.team.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  return (
    <Section
      title="Equipe e voluntários"
      actions={
        !readOnly && (
          <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => set({ team: [...f.team, { name: '', role: '', volunteer: true }] })}>
            Pessoa
          </Button>
        )
      }
    >
      {f.team.length === 0 && <EmptyState title="Ninguém na equipe ainda" />}
      {f.team.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
          <Field label="Nome">{id => <Input id={id} value={m.name} maxLength={150} disabled={readOnly} onChange={e => upd(i, { name: e.target.value })} />}</Field>
          <Field label="Função">{id => <Input id={id} value={m.role} maxLength={80} disabled={readOnly} onChange={e => upd(i, { role: e.target.value })} />}</Field>
          <Toggle checked={m.volunteer} disabled={readOnly} onChange={v => upd(i, { volunteer: v })} label="Voluntário" />
          {!readOnly && <Button variant="ghost" aria-label={`Remover ${m.name || 'pessoa'}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ team: f.team.filter((_, k) => k !== i) })} />}
        </div>
      ))}
    </Section>
  );
}

function SponsorsTab({ eventId }: { eventId: string }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const list = useList<SponsorDoc>(P.sponsors(t.tenantId), { where: [['eventId', '==', eventId]] });
  const [f, setF] = useState({ name: '', tier: '', amountCents: 0, counterparts: '' });
  const canAdd = t.can('patrocinios', 'criar');
  const today = todayIn(t.tenant.timezone);
  return (
    <div className="space-y-4">
      {list.data.length === 0 ? (
        <EmptyState title="Sem patrocinadores neste evento" />
      ) : (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {list.data.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted">
                  {s.tier} {s.counterparts ? `· ${s.counterparts}` : ''}
                </div>
              </div>
              <Money cents={s.amountCents} className="font-semibold" />
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <Card className="space-y-2">
          <div className="text-sm font-semibold">Novo patrocinador do evento</div>
          <div className="grid sm:grid-cols-3 gap-2">
            <Field label="Nome">{id => <Input id={id} value={f.name} maxLength={150} onChange={e => setF({ ...f, name: e.target.value })} />}</Field>
            <Field label="Cota">{id => <Input id={id} value={f.tier} maxLength={60} placeholder="Ouro, prata..." onChange={e => setF({ ...f, tier: e.target.value })} />}</Field>
            <Field label="Valor">{id => <MoneyInput id={id} value={f.amountCents} onChange={c => setF({ ...f, amountCents: c })} />}</Field>
          </div>
          <Field label="Contrapartidas">{id => <Input id={id} value={f.counterparts} maxLength={2000} onChange={e => setF({ ...f, counterparts: e.target.value })} />}</Field>
          <Button
            size="sm"
            loading={busy}
            disabled={f.name.trim().length < 2}
            onClick={async () => {
              const r = await run('generic.save', { tenantId: t.tenantId, collection: 'sponsors', data: { ...f, name: f.name.trim(), contractStart: today, contractEnd: today, eventId } }, { success: 'Patrocinador adicionado.' });
              if (r) setF({ name: '', tier: '', amountCents: 0, counterparts: '' });
            }}
          >
            Adicionar
          </Button>
          <p className="text-[11px] text-muted">Contrato e vencimentos completos ficam em Patrocínios e benefícios.</p>
        </Card>
      )}
    </div>
  );
}

function ReportTab({ f, set, ev, eventId, readOnly }: { f: Form; set: (p: Partial<Form>) => void; ev: EventDoc; eventId: string; readOnly: boolean }) {
  const t = useTenant();
  const entries = useEventLedger(eventId, f.costCenterId);
  const guests = useList<EventGuestDoc>(P.eventGuests(t.tenantId, eventId));
  const sponsors = useList<SponsorDoc>(P.sponsors(t.tenantId), { where: [['eventId', '==', eventId]] });
  const budget = budgetVsActual(f.budget.items, entries, { eventId, costCenterId: f.costCenterId });
  const ticketsSold = (ev.ticketing?.lots || []).reduce((a, l) => a + (l.sold || 0), 0);
  return (
    <div className="space-y-4">
      <Field label="Relato do evento" hint="O que deu certo, o que melhorar, público estimado, fotos e agradecimentos.">
        {id => <Textarea id={id} value={f.report || ''} maxLength={8000} disabled={readOnly} className="min-h-48" onChange={e => set({ report: e.target.value })} />}
      </Field>
      <Button
        variant="secondary"
        icon={<FileText className="w-4 h-4" />}
        onClick={() =>
          eventReportPdf(t.tenant, { ...ev, ...f, id: eventId } as EventDoc, {
            budget,
            guests: guests.data.length,
            checkins: guests.data.filter(g => g.checkedInAt).length,
            ticketsSold,
            sponsors: sponsors.data.map(s => ({ name: s.name, amountCents: s.amountCents })),
          })
        }
      >
        Relatório em PDF
      </Button>
    </div>
  );
}
