/** Livro caixa: lista paginada, novo lançamento, transferência, estorno e dupla aprovação. */
import { useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Undo2 } from 'lucide-react';
import { useList, useOp, useSession } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { AttachmentsField, FileLink } from '../../../app/uploads.tsx';
import { monthsBack, periodLabel, todayIn } from '../../../app/formHelpers.ts';
import { P } from '../../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../../shared/dates.ts';
import type { QuerySpec } from '../../../shared/core/store.ts';
import type { LedgerEntryDoc } from '../../../shared/types.ts';
import { Button, EmptyState, ErrorState, Field, Input, LoadMore, Loading, Modal, Money, MoneyInput, Notice, Select, Table, Textarea, type Column } from '../../../ui/index.tsx';
import { EntryBadge, useFinanceCatalog } from '../common.tsx';

const PAGE = 50;
type Row = LedgerEntryDoc & { id: string };

export default function LedgerTab() {
  const t = useTenant();
  const session = useSession();
  const cat = useFinanceCatalog();
  const { run, busy } = useOp();
  const [account, setAccount] = useState('');
  const [period, setPeriod] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [modal, setModal] = useState<'' | 'novo' | 'transferir'>('');
  const [open, setOpen] = useState<Row | null>(null);

  const q = useMemo<QuerySpec>(() => {
    const where: QuerySpec['where'] = [];
    if (onlyPending) where.push(['status', '==', 'aguardando_aprovacao']);
    else if (account) where.push(['accountId', '==', account]);
    else if (period) where.push(['periodKey', '==', period]);
    return { where, orderBy: [['number', 'desc']], limit };
  }, [account, period, onlyPending, limit]);
  const list = useList<LedgerEntryDoc>(P.ledger(t.tenantId), q);
  const rows = list.data.filter(e => (!account || e.accountId === account) && (!period || e.periodKey === period));
  const canCreate = t.can('financeiro', 'criar');
  const canApprove = t.can('financeiro', 'aprovar');
  const months = monthsBack(todayIn(t.tenant.timezone).slice(0, 7), 24);

  const columns: Column<Row>[] = [
    { key: 'n', label: 'Nº', render: e => <span className="tabular-nums text-muted">{e.number}</span>, hideOnMobile: true },
    { key: 'data', label: 'Data', render: e => formatDate(e.date) },
    {
      key: 'desc',
      label: 'Descrição',
      render: e => (
        <div className="min-w-0">
          <div className="truncate max-w-[16rem]">{e.description}</div>
          <div className="text-xs text-muted truncate">{cat.chartName(e.chartAccountId)}</div>
        </div>
      ),
    },
    { key: 'conta', label: 'Conta', render: e => cat.accName(e.accountId), hideOnMobile: true },
    {
      key: 'valor',
      label: 'Valor',
      className: 'text-right',
      render: e => <Money cents={e.direction === 'entrada' ? e.amountCents : -e.amountCents} className={e.direction === 'entrada' ? 'text-ok' : 'text-bad'} />,
    },
    { key: 'sit', label: 'Situação', render: e => <EntryBadge e={e} />, hideOnMobile: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <Select aria-label="Filtrar por conta" value={account} onChange={e => (setAccount(e.target.value), setPeriod(''), setLimit(PAGE))} className="sm:w-48">
          <option value="">Todas as contas</option>
          {cat.accounts.data.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrar por mês" value={period} onChange={e => (setPeriod(e.target.value), setAccount(''), setLimit(PAGE))} className="sm:w-40">
          <option value="">Todos os meses</option>
          {months.map(m => (
            <option key={m} value={m}>
              {periodLabel(m)}
            </option>
          ))}
        </Select>
        <Button size="sm" variant={onlyPending ? 'accent' : 'secondary'} onClick={() => setOnlyPending(v => !v)} aria-pressed={onlyPending}>
          Pendentes de aprovação
        </Button>
        <div className="flex gap-2 sm:ml-auto">
          {canCreate && (
            <>
              <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setModal('novo')}>
                Novo lançamento
              </Button>
              <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="w-4 h-4" />} onClick={() => setModal('transferir')}>
                Transferir
              </Button>
            </>
          )}
        </div>
      </div>
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading && !list.data.length ? (
        <Loading />
      ) : (
        <>
          <Table rows={rows} columns={columns} onRowClick={setOpen} empty={<EmptyState title="Nenhum lançamento" text="Os lançamentos do livro caixa aparecem aqui." />} />
          <LoadMore onClick={() => setLimit(l => l + PAGE)} loading={list.loading} done={list.data.length < limit} />
        </>
      )}
      <p className="text-[11px] text-muted">Lançamentos não são apagados nem editados. Para corrigir, faça um estorno: ele cria um lançamento de sentido oposto e mantém o histórico.</p>

      {modal === 'novo' && <NewEntryModal onClose={() => setModal('')} />}
      {modal === 'transferir' && <TransferModal onClose={() => setModal('')} />}
      {open && (
        <EntryDetail
          e={open}
          onClose={() => setOpen(null)}
          canReverse={canCreate}
          canApprove={canApprove && open.createdBy !== session.user?.uid}
          busy={busy}
          onApprove={async () => {
            if (await run('ledger.approve', { tenantId: t.tenantId, entryId: open.id }, { success: 'Lançamento aprovado.' })) setOpen(null);
          }}
          onReject={async reason => {
            if (await run('ledger.reject', { tenantId: t.tenantId, entryId: open.id, reason }, { success: 'Lançamento recusado.' })) setOpen(null);
          }}
          onReverse={async reason => {
            if (await run('ledger.reverse', { tenantId: t.tenantId, entryId: open.id, reason }, { success: 'Estorno lançado.' })) setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function EntryDetail({
  e,
  onClose,
  canReverse,
  canApprove,
  busy,
  onApprove,
  onReject,
  onReverse,
}: {
  e: Row;
  onClose: () => void;
  canReverse: boolean;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onReverse: (reason: string) => void;
}) {
  const t = useTenant();
  const cat = useFinanceCatalog();
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'' | 'estornar' | 'recusar'>('');
  const reversible = e.status === 'lancado' && !e.reversedBy && !e.reversalOf;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Lançamento nº ${e.number}`}
      footer={
        mode ? (
          <>
            <Button variant="secondary" onClick={() => setMode('')}>
              Voltar
            </Button>
            <Button variant="danger" loading={busy} disabled={reason.trim().length < (mode === 'estornar' ? 5 : 3)} onClick={() => (mode === 'estornar' ? onReverse(reason) : onReject(reason))}>
              {mode === 'estornar' ? 'Confirmar estorno' : 'Recusar lançamento'}
            </Button>
          </>
        ) : (
          <>
            {canApprove && e.status === 'aguardando_aprovacao' && (
              <>
                <Button variant="secondary" onClick={() => setMode('recusar')}>
                  Recusar
                </Button>
                <Button loading={busy} onClick={onApprove}>
                  Aprovar
                </Button>
              </>
            )}
            {canReverse && reversible && (
              <Button variant="secondary" icon={<Undo2 className="w-4 h-4" />} onClick={() => setMode('estornar')}>
                Estornar
              </Button>
            )}
          </>
        )
      }
    >
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">Situação</dt>
        <dd>
          <EntryBadge e={e} />
        </dd>
        <dt className="text-muted">Data</dt>
        <dd>{formatDate(e.date)}</dd>
        <dt className="text-muted">Valor</dt>
        <dd>
          <Money cents={e.amountCents} /> ({e.direction === 'entrada' ? 'entrada' : 'saída'})
        </dd>
        <dt className="text-muted">Conta</dt>
        <dd>{cat.accName(e.accountId)}</dd>
        <dt className="text-muted">Plano de contas</dt>
        <dd>{cat.chartName(e.chartAccountId)}</dd>
        {e.costCenterId && (
          <>
            <dt className="text-muted">Centro de custo</dt>
            <dd>{cat.ccName(e.costCenterId)}</dd>
          </>
        )}
        <dt className="text-muted">Descrição</dt>
        <dd className="break-words">{e.description}</dd>
        {e.counterparty && (
          <>
            <dt className="text-muted">Favorecido</dt>
            <dd>{e.counterparty}</dd>
          </>
        )}
        <dt className="text-muted">Registrado em</dt>
        <dd>{formatDateTime(e.createdAt, t.tenant.timezone)}</dd>
        {e.approvals?.length > 0 && (
          <>
            <dt className="text-muted">Aprovado em</dt>
            <dd>{formatDateTime(e.approvals[e.approvals.length - 1].at, t.tenant.timezone)}</dd>
          </>
        )}
        {e.rejectedReason && (
          <>
            <dt className="text-muted">Motivo da recusa</dt>
            <dd>{e.rejectedReason}</dd>
          </>
        )}
      </dl>
      {e.attachments?.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted">Anexos</div>
          {e.attachments.map((p, i) => (
            <div key={p}>
              <FileLink path={p} label={`Anexo ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
      {mode && (
        <Field label={mode === 'estornar' ? 'Motivo do estorno' : 'Motivo da recusa'} required hint={mode === 'estornar' ? 'Fica registrado no lançamento de estorno e na auditoria.' : undefined}>
          {id => <Textarea id={id} value={reason} onChange={ev => setReason(ev.target.value)} maxLength={300} />}
        </Field>
      )}
    </Modal>
  );
}

function NewEntryModal({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const cat = useFinanceCatalog();
  const { run, busy } = useOp();
  const events = useList<{ name: string }>(P.events(t.tenantId), { orderBy: [['start', 'desc']], limit: 50 });
  const [f, setF] = useState({
    date: todayIn(t.tenant.timezone),
    direction: 'saida' as 'entrada' | 'saida',
    accountId: '',
    chartAccountId: '',
    costCenterId: '',
    eventId: '',
    amountCents: 0,
    description: '',
    counterparty: '',
    attachments: [] as string[],
  });
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }));
  const kind = f.direction === 'entrada' ? 'receita' : 'despesa';
  const charts = cat.chart.data.filter(c => c.kind === kind);
  const limit = t.settings?.doubleApprovalAboveCents || 0;
  const needsApproval = f.direction === 'saida' && limit > 0 && f.amountCents > limit;
  const accountId = f.accountId || cat.accounts.data.find(a => a.active !== false)?.id || '';
  const valid = accountId && f.chartAccountId && f.amountCents > 0 && f.description.trim().length >= 2;

  const save = async () => {
    const r = await run(
      'ledger.post',
      {
        tenantId: t.tenantId,
        requestId: `${Date.now()}`,
        date: f.date,
        direction: f.direction,
        accountId,
        chartAccountId: f.chartAccountId,
        ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
        ...(f.eventId ? { eventId: f.eventId } : {}),
        amountCents: f.amountCents,
        description: f.description.trim(),
        ...(f.counterparty.trim() ? { counterparty: f.counterparty.trim() } : {}),
        attachments: f.attachments,
      },
      { success: needsApproval ? 'Lançamento registrado. Aguarda a segunda aprovação.' : 'Lançamento registrado.' }
    );
    if (r) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo lançamento"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!valid} onClick={save}>
            Lançar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
        {(['entrada', 'saida'] as const).map(d => (
          <Button key={d} type="button" variant={f.direction === d ? 'primary' : 'secondary'} aria-pressed={f.direction === d} onClick={() => set({ direction: d, chartAccountId: '' })}>
            {d === 'entrada' ? 'Entrada (receita)' : 'Saída (despesa)'}
          </Button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Data" required>
          {id => <Input id={id} type="date" value={f.date} onChange={e => set({ date: e.target.value })} />}
        </Field>
        <Field label="Valor" required>
          {id => <MoneyInput id={id} value={f.amountCents} onChange={c => set({ amountCents: c })} />}
        </Field>
        <Field label="Conta" required>
          {id => (
            <Select id={id} value={accountId} onChange={e => set({ accountId: e.target.value })}>
              {cat.accounts.data
                .filter(a => a.active !== false)
                .map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Plano de contas" required>
          {id => (
            <Select id={id} value={f.chartAccountId} onChange={e => set({ chartAccountId: e.target.value })}>
              <option value="">Escolha</option>
              {charts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Centro de custo">
          {id => (
            <Select id={id} value={f.costCenterId} onChange={e => set({ costCenterId: e.target.value })}>
              <option value="">Nenhum</option>
              {cat.costCenters.data
                .filter(c => c.active !== false)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Evento ou projeto">
          {id => (
            <Select id={id} value={f.eventId} onChange={e => set({ eventId: e.target.value })}>
              <option value="">Nenhum</option>
              {events.data.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Descrição" required>
        {id => <Input id={id} value={f.description} maxLength={300} onChange={e => set({ description: e.target.value })} />}
      </Field>
      <Field label={f.direction === 'entrada' ? 'Pagador' : 'Favorecido'}>{id => <Input id={id} value={f.counterparty} maxLength={150} onChange={e => set({ counterparty: e.target.value })} />}</Field>
      <Field label="Comprovantes">{() => <AttachmentsField tenantId={t.tenantId} module="financeiro" value={f.attachments} onChange={a => set({ attachments: a })} />}</Field>
      {needsApproval && <Notice tone="warn">Saída acima do limite da dupla aprovação: o lançamento só entra no saldo depois que outra pessoa do financeiro aprovar.</Notice>}
    </Modal>
  );
}

function TransferModal({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const cat = useFinanceCatalog();
  const { run, busy } = useOp();
  const active = cat.accounts.data.filter(a => a.active !== false);
  const [f, setF] = useState({ from: '', to: '', amountCents: 0, date: todayIn(t.tenant.timezone), description: '' });
  const from = f.from || active[0]?.id || '';
  const to = f.to || active.find(a => a.id !== from)?.id || '';
  const valid = from && to && from !== to && f.amountCents > 0 && f.description.trim().length >= 2;
  return (
    <Modal
      open
      onClose={onClose}
      title="Transferência entre contas"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={async () => {
              const r = await run(
                'ledger.transfer',
                { tenantId: t.tenantId, requestId: `${Date.now()}`, fromAccountId: from, toAccountId: to, amountCents: f.amountCents, date: f.date, description: f.description.trim() },
                { success: 'Transferência registrada.' }
              );
              if (r) onClose();
            }}
          >
            Transferir
          </Button>
        </>
      }
    >
      {active.length < 2 ? (
        <Notice>Cadastre pelo menos duas contas ativas na aba Contas e plano.</Notice>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="De">
            {id => (
              <Select id={id} value={from} onChange={e => setF(v => ({ ...v, from: e.target.value }))}>
                {active.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Para">
            {id => (
              <Select id={id} value={to} onChange={e => setF(v => ({ ...v, to: e.target.value }))}>
                {active.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Valor" required>
            {id => <MoneyInput id={id} value={f.amountCents} onChange={c => setF(v => ({ ...v, amountCents: c }))} />}
          </Field>
          <Field label="Data" required>
            {id => <Input id={id} type="date" value={f.date} onChange={e => setF(v => ({ ...v, date: e.target.value }))} />}
          </Field>
        </div>
      )}
      <Field label="Descrição" required>
        {id => <Input id={id} value={f.description} maxLength={200} placeholder="Ex.: depósito do caixa no banco" onChange={e => setF(v => ({ ...v, description: e.target.value }))} />}
      </Field>
      <p className="text-[11px] text-muted">A transferência não é receita nem despesa: gera uma saída numa conta e uma entrada na outra.</p>
    </Modal>
  );
}
