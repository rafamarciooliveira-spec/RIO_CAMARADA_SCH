/** Cobranças: lote da competência, avulsa, baixa manual com multa e juros, cancelamento e Pix. */
import { useMemo, useState } from 'react';
import { Copy, Layers, Plus, QrCode } from 'lucide-react';
import { useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { copyText, monthsBack, periodLabel, todayIn } from '../../../app/formHelpers.ts';
import { receiptPdf, METHOD_LABEL } from '../../../app/pdf.ts';
import { P } from '../../../shared/paths.ts';
import { formatDate } from '../../../shared/dates.ts';
import { chargeOpenCents, isOverdue } from '../../../shared/finance/reports.ts';
import type { QuerySpec } from '../../../shared/core/store.ts';
import type { ChargeDoc, ChargeStatus, MemberDoc } from '../../../shared/types.ts';
import { Button, EmptyState, ErrorState, Field, Input, LoadMore, Loading, Modal, Money, MoneyInput, Notice, SearchBox, Select, Table, Textarea, useToast, type Column } from '../../../ui/index.tsx';
import { ChargeBadge, dueNow, useFinanceCatalog } from '../common.tsx';

const PAGE = 50;
type Row = ChargeDoc & { id: string };

export default function ChargesTab() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const [status, setStatus] = useState<ChargeStatus | ''>('');
  const [competence, setCompetence] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [modal, setModal] = useState<'' | 'lote' | 'avulsa'>('');
  const [open, setOpen] = useState<Row | null>(null);
  const q = useMemo<QuerySpec>(() => {
    const where: QuerySpec['where'] = [];
    if (status) where.push(['status', '==', status]);
    else if (competence) where.push(['competence', '==', competence]);
    return { where, orderBy: [['dueDate', 'desc']], limit };
  }, [status, competence, limit]);
  const list = useList<ChargeDoc>(P.charges(t.tenantId), q);
  const term = search.trim().toLowerCase();
  const rows = list.data.filter(c => (!competence || c.competence === competence) && (!term || c.memberName.toLowerCase().includes(term) || c.description.toLowerCase().includes(term)));
  const canCreate = t.can('financeiro', 'criar');
  const months = monthsBack(today.slice(0, 7), 18);

  const columns: Column<Row>[] = [
    { key: 'socio', label: t.labels.member, render: c => <div className="min-w-0"><div className="truncate font-medium">{c.memberName}</div><div className="text-xs text-muted truncate">{c.description}</div></div> },
    { key: 'venc', label: 'Vencimento', render: c => formatDate(c.dueDate), hideOnMobile: true },
    { key: 'valor', label: 'Valor', className: 'text-right', render: c => <Money cents={c.status === 'paga' ? c.paidAmountCents || 0 : chargeOpenCents(c)} /> },
    { key: 'sit', label: 'Situação', render: c => <ChargeBadge c={c} today={today} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nome ou descrição" />
        <Select aria-label="Filtrar por situação" value={status} onChange={e => (setStatus(e.target.value as ChargeStatus | ''), setLimit(PAGE))} className="sm:w-40">
          <option value="">Todas</option>
          <option value="aberta">Em aberto</option>
          <option value="vencida">Vencidas</option>
          <option value="paga">Pagas</option>
          <option value="cancelada">Canceladas</option>
        </Select>
        <Select aria-label="Filtrar por competência" value={competence} onChange={e => (setCompetence(e.target.value), setLimit(PAGE))} className="sm:w-40">
          <option value="">Toda competência</option>
          {months.map(m => (
            <option key={m} value={m}>
              {periodLabel(m)}
            </option>
          ))}
        </Select>
        {canCreate && (
          <div className="flex gap-2 sm:ml-auto">
            <Button size="sm" icon={<Layers className="w-4 h-4" />} onClick={() => setModal('lote')}>
              Gerar {t.labels.fee.toLowerCase()}s
            </Button>
            <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setModal('avulsa')}>
              Cobrança avulsa
            </Button>
          </div>
        )}
      </div>
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading && !list.data.length ? (
        <Loading />
      ) : (
        <>
          <Table rows={rows} columns={columns} onRowClick={setOpen} empty={<EmptyState title="Nenhuma cobrança" text={`Gere as ${t.labels.fee.toLowerCase()}s da competência ou crie uma cobrança avulsa.`} />} />
          <LoadMore onClick={() => setLimit(l => l + PAGE)} loading={list.loading} done={list.data.length < limit} />
        </>
      )}
      {modal === 'lote' && <BatchModal onClose={() => setModal('')} />}
      {modal === 'avulsa' && <SingleModal onClose={() => setModal('')} />}
      {open && <ChargeDetail c={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BatchModal({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const next = todayIn(t.tenant.timezone).slice(0, 7);
  const [competence, setCompetence] = useState(next);
  const [discount, setDiscount] = useState(0);
  const toast = useToast();
  const [ny, nm] = next.split('-').map(Number);
  const ahead = new Date(Date.UTC(ny, nm + 1, 1));
  const months = monthsBack(`${ahead.getUTCFullYear()}-${String(ahead.getUTCMonth() + 1).padStart(2, '0')}`, 9);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Gerar ${t.labels.fee.toLowerCase()}s`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              const r = await run<{ created: number; skipped: number; totalCents: number }>('charges.generateBatch', { tenantId: t.tenantId, requestId: `${competence}_${discount}`, competence, discountCents: discount });
              if (r) {
                onClose();
                toast.show(`${r.created} cobrança(s) gerada(s).${r.skipped ? ` ${r.skipped} já existia(m) e não foi(ram) duplicada(s).` : ''}`, 'sucesso');
              }
            }}
          >
            Gerar
          </Button>
        </>
      }
    >
      <Field label="Competência" required>
        {id => (
          <Select id={id} value={competence} onChange={e => setCompetence(e.target.value)}>
            {[...months].sort().map(m => (
              <option key={m} value={m}>
                {periodLabel(m)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Desconto por cobrança (opcional)">{id => <MoneyInput id={id} value={discount} onChange={setDiscount} />}</Field>
      <Notice>
        Uma cobrança por {t.labels.member.toLowerCase()} ativo, aprovado ou em atraso cuja categoria tem valor, conforme o período da categoria (mensal todo mês, trimestral em jan/abr/jul/out, semestral em jan/jul, anual em janeiro). Vencimento no dia {t.settings?.dueDay || 10}. Gerar de novo a mesma competência não duplica.
      </Notice>
    </Modal>
  );
}

function SingleModal({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const members = useList<MemberDoc>(P.members(t.tenantId), { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso', 'suspenso']]], orderBy: [['fullName', 'asc']], limit: 1000 });
  const [f, setF] = useState({ memberId: '', description: '', amountCents: 0, discountCents: 0, dueDate: todayIn(t.tenant.timezone) });
  const [filter, setFilter] = useState('');
  const shown = members.data.filter(m => !filter || m.fullName.toLowerCase().includes(filter.toLowerCase())).slice(0, 200);
  const valid = f.memberId && f.description.trim().length >= 2 && f.amountCents > 0 && f.discountCents <= f.amountCents;
  return (
    <Modal
      open
      onClose={onClose}
      title="Cobrança avulsa"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={async () => {
              const r = await run('charges.create', { tenantId: t.tenantId, requestId: `${Date.now()}`, ...f, description: f.description.trim() }, { success: 'Cobrança criada.' });
              if (r) onClose();
            }}
          >
            Criar cobrança
          </Button>
        </>
      }
    >
      <Field label={`Buscar ${t.labels.member.toLowerCase()}`}>{id => <Input id={id} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Digite parte do nome" />}</Field>
      <Field label={t.labels.member} required>
        {id => (
          <Select id={id} value={f.memberId} onChange={e => setF(v => ({ ...v, memberId: e.target.value }))}>
            <option value="">Escolha</option>
            {shown.map(m => (
              <option key={m.id} value={m.id}>
                {m.fullName} {m.membershipNumber ? `(${m.membershipNumber})` : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Descrição" required>
        {id => <Input id={id} value={f.description} maxLength={200} placeholder="Ex.: taxa do baile, uniforme" onChange={e => setF(v => ({ ...v, description: e.target.value }))} />}
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Valor" required>
          {id => <MoneyInput id={id} value={f.amountCents} onChange={c => setF(v => ({ ...v, amountCents: c }))} />}
        </Field>
        <Field label="Desconto">{id => <MoneyInput id={id} value={f.discountCents} onChange={c => setF(v => ({ ...v, discountCents: c }))} />}</Field>
        <Field label="Vencimento" required>
          {id => <Input id={id} type="date" value={f.dueDate} onChange={e => setF(v => ({ ...v, dueDate: e.target.value }))} />}
        </Field>
      </div>
    </Modal>
  );
}

function ChargeDetail({ c, onClose }: { c: Row; onClose: () => void }) {
  const t = useTenant();
  const toast = useToast();
  const cat = useFinanceCatalog();
  const { run, busy } = useOp();
  const today = todayIn(t.tenant.timezone);
  const [mode, setMode] = useState<'' | 'baixa' | 'cancelar'>('');
  const [reason, setReason] = useState('');
  const [pix, setPix] = useState<string | null>(c.provider?.pixCopyPaste || null);
  const [pay, setPay] = useState({ accountId: '', method: 'pix', paidOn: today, paidAmountCents: -1, chartAccountId: 'c1_01' });
  const due = dueNow(c, t.settings, pay.paidOn || today);
  const amount = pay.paidAmountCents >= 0 ? pay.paidAmountCents : due.total;
  const accountId = pay.accountId || cat.accounts.data.find(a => a.active !== false)?.id || '';
  const open = c.status === 'aberta' || c.status === 'vencida';
  const canEdit = t.can('financeiro', 'editar');

  return (
    <Modal
      open
      onClose={onClose}
      title="Cobrança"
      footer={
        mode === 'baixa' ? (
          <>
            <Button variant="secondary" onClick={() => setMode('')}>
              Voltar
            </Button>
            <Button
              loading={busy}
              disabled={!accountId || amount <= 0}
              onClick={async () => {
                const r = await run('charges.pay', { tenantId: t.tenantId, requestId: `${c.id}_pay`, chargeId: c.id, accountId, method: pay.method, paidOn: pay.paidOn, paidAmountCents: amount, chartAccountId: pay.chartAccountId }, { success: 'Pagamento registrado e recibo emitido.' });
                if (r) onClose();
              }}
            >
              Confirmar baixa
            </Button>
          </>
        ) : mode === 'cancelar' ? (
          <>
            <Button variant="secondary" onClick={() => setMode('')}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 5}
              onClick={async () => {
                const r = await run('charges.cancel', { tenantId: t.tenantId, chargeId: c.id, reason: reason.trim() }, { success: 'Cobrança cancelada.' });
                if (r) onClose();
              }}
            >
              Cancelar cobrança
            </Button>
          </>
        ) : (
          <>
            {c.status === 'paga' && (
              <Button variant="secondary" onClick={() => receiptPdf(t.tenant, c)}>
                Recibo em PDF
              </Button>
            )}
            {open && canEdit && (
              <>
                <Button variant="secondary" onClick={() => setMode('cancelar')}>
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  icon={<QrCode className="w-4 h-4" />}
                  loading={busy}
                  onClick={async () => {
                    const r = await run<{ pixCopyPaste?: string }>('charges.createPayment', { tenantId: t.tenantId, chargeId: c.id, method: 'pix' });
                    if (r?.pixCopyPaste) setPix(r.pixCopyPaste);
                  }}
                >
                  Gerar Pix
                </Button>
                <Button onClick={() => setMode('baixa')}>Dar baixa</Button>
              </>
            )}
          </>
        )
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{c.memberName}</div>
          <div className="text-sm text-muted">{c.description}</div>
        </div>
        <ChargeBadge c={c} today={today} />
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">Vencimento</dt>
        <dd>{formatDate(c.dueDate)}</dd>
        <dt className="text-muted">Valor</dt>
        <dd>
          <Money cents={c.amountCents} />
          {c.discountCents > 0 && (
            <span className="text-muted">
              {' '}
              (desconto de <Money cents={c.discountCents} />)
            </span>
          )}
        </dd>
        {c.status === 'paga' && (
          <>
            <dt className="text-muted">Pago</dt>
            <dd>
              <Money cents={c.paidAmountCents || 0} /> em {formatDate(c.paidAt, t.tenant.timezone)} ({METHOD_LABEL[c.method || ''] || ''}), recibo nº {c.receiptNumber}
            </dd>
          </>
        )}
        {c.status === 'cancelada' && (
          <>
            <dt className="text-muted">Motivo</dt>
            <dd>{c.cancelReason}</dd>
          </>
        )}
        {open && isOverdue(c, today) && (
          <>
            <dt className="text-muted">Hoje, com encargos</dt>
            <dd>
              <Money cents={dueNow(c, t.settings, today).total} />
            </dd>
          </>
        )}
        {c.reminders?.length > 0 && (
          <>
            <dt className="text-muted">Lembretes</dt>
            <dd>{c.reminders.length} enviado(s)</dd>
          </>
        )}
      </dl>
      {pix && mode === '' && (
        <div className="space-y-2">
          <Field label="Pix copia e cola">{id => <Textarea id={id} readOnly value={pix} className="font-mono text-xs" />}</Field>
          <Button size="sm" variant="secondary" icon={<Copy className="w-4 h-4" />} onClick={async () => toast.show((await copyText(pix)) ? 'Código copiado.' : 'Não foi possível copiar. Selecione o texto.', 'info')}>
            Copiar código
          </Button>
        </div>
      )}
      {mode === 'baixa' && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Data do pagamento" required>
              {id => <Input id={id} type="date" max={today} value={pay.paidOn} onChange={e => setPay(v => ({ ...v, paidOn: e.target.value, paidAmountCents: -1 }))} />}
            </Field>
            <Field label="Forma">
              {id => (
                <Select id={id} value={pay.method} onChange={e => setPay(v => ({ ...v, method: e.target.value }))}>
                  {Object.entries(METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Conta que recebeu" required>
              {id => (
                <Select id={id} value={accountId} onChange={e => setPay(v => ({ ...v, accountId: e.target.value }))}>
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
            <Field label="Plano de contas">
              {id => (
                <Select id={id} value={pay.chartAccountId} onChange={e => setPay(v => ({ ...v, chartAccountId: e.target.value }))}>
                  {cat.chart.data
                    .filter(x => x.kind === 'receita')
                    .map(x => (
                      <option key={x.id} value={x.id}>
                        {x.code} {x.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
          {due.daysLate > 0 && (
            <Notice tone="warn">
              {due.daysLate} dia(s) de atraso: multa de <Money cents={due.lateFeeCents} /> e juros de <Money cents={due.interestCents} /> pelas regras da sociedade.
            </Notice>
          )}
          <Field label="Valor recebido" hint="Já calculado com multa e juros. Ajuste se a diretoria concedeu dispensa.">
            {id => <MoneyInput id={id} value={amount} onChange={v => setPay(p => ({ ...p, paidAmountCents: v }))} />}
          </Field>
        </div>
      )}
      {mode === 'cancelar' && (
        <Field label="Motivo do cancelamento" required hint="A cobrança não é apagada: fica no histórico como cancelada.">
          {id => <Textarea id={id} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} />}
        </Field>
      )}
    </Modal>
  );
}
