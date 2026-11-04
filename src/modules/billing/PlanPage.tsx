/** Plano e cobrança da sociedade: plano atual, sócios cobrados, valor do mês e pedido de troca. */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard } from 'lucide-react';
import { useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { formatBRL } from '../../shared/money.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import { annualCents, monthlyCents } from '../../shared/billing.ts';
import { Badge, Button, Card, Field, Loading, Modal, Notice, PageHeader, Select, Stat, Textarea, useConfirm } from '../../ui/index.tsx';

interface PlanInfo {
  id: string;
  name: string;
  description: string;
  highlights: string[];
  maxMembers: number;
  pricePerMemberCents: number;
  minMonthlyCents: number;
  online: boolean;
}

interface Mine {
  plan: PlanInfo | null;
  counts: { active: number; dependents: number; holders: number };
  monthlyCents: number;
  annualCents: number;
  overLimit: boolean;
  plans: PlanInfo[];
  pendingRequest: { id: string; toPlanId: string; period: 'mensal' | 'anual'; at: string } | null;
  billing: { provider: string; status: string; period: string; currentPeriodEnd: string | null; hasPortal: boolean } | null;
  federation: { name: string; pricePerMemberCents: number } | null;
  onlinePayment: boolean;
}

const BILLING_LABEL: Record<string, [string, 'ok' | 'warn' | 'bad' | 'neutral']> = {
  ativa: ['Assinatura em dia', 'ok'],
  atrasada: ['Pagamento pendente', 'warn'],
  cancelada: ['Assinatura cancelada', 'bad'],
  sem_assinatura: ['Cobrança combinada com a plataforma', 'neutral'],
};

export default function PlanPage() {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const [data, setData] = useState<Mine | null>(null);
  const [pick, setPick] = useState<PlanInfo | null>(null);
  const load = useCallback(async () => setData((await run<Mine>('billing.mine', { tenantId: t.tenantId }, { silent: true })) || null), [run, t.tenantId]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Loading />;
  const canEdit = t.can('sociedade', 'editar');
  const b = data.billing ? BILLING_LABEL[data.billing.status] : BILLING_LABEL.sem_assinatura;
  const toName = (id: string) => data.plans.find(p => p.id === id)?.name || id;

  return (
    <div className="space-y-5">
      <PageHeader title="Plano e cobrança" subtitle="Quanto a sociedade paga pelo sistema e o que o plano inclui." />
      {params.get('pagamento') === 'ok' && <Notice tone="ok">Pagamento recebido. O plano muda assim que o Stripe confirmar, em poucos minutos.</Notice>}
      {data.federation && (
        <Notice>
          Esta sociedade é filial da <strong>{data.federation.name}</strong>. A cobrança é feita pela federação: {formatBRL(data.federation.pricePerMemberCents)} por sócio titular ativo, somando todas as filiais.
        </Notice>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted">Plano atual</div>
            <div className="font-display text-2xl">{data.plan?.name || 'Sem plano'}</div>
            {data.plan?.description && <p className="text-sm text-muted">{data.plan.description}</p>}
          </div>
          <Badge tone={b[1]}>{b[0]}</Badge>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <Stat label="Sócios ativos" value={data.counts.active} hint={data.plan ? `Limite do plano: ${data.plan.maxMembers}` : undefined} tone={data.overLimit ? 'warn' : undefined} />
          <Stat label="Titulares cobrados" value={data.counts.holders} hint={`${data.counts.dependents} dependente(s) não contam`} />
          <Stat label="Valor do mês" value={formatBRL(data.monthlyCents)} hint={data.plan?.pricePerMemberCents ? `${formatBRL(data.plan.pricePerMemberCents)} por titular, mínimo ${formatBRL(data.plan.minMonthlyCents)}` : undefined} />
          <Stat label="No plano anual" value={formatBRL(data.annualCents)} hint="15% de desconto, por ano" tone="ok" />
        </div>
        {data.overLimit && <Notice tone="warn">A sociedade passou do limite de sócios do plano. Peça a troca para o plano seguinte.</Notice>}
        {data.billing?.currentPeriodEnd && <p className="text-xs text-muted">Próxima cobrança: {formatDate(data.billing.currentPeriodEnd, t.tenant.timezone)}</p>}
        {data.billing?.hasPortal && canEdit && (
          <Button variant="secondary" icon={<CreditCard className="w-4 h-4" />} loading={busy} onClick={async () => {
            const r = await run<{ url: string }>('billing.portal', { tenantId: t.tenantId });
            if (r?.url) window.location.href = r.url;
          }}>
            Cartão, faturas e cancelamento
          </Button>
        )}
      </Card>

      {data.pendingRequest && (
        <Notice>
          Pedido de troca para o plano <strong>{toName(data.pendingRequest.toPlanId)}</strong> ({data.pendingRequest.period}) enviado em {formatDateTime(data.pendingRequest.at, t.tenant.timezone)}. A plataforma vai analisar.{' '}
          {canEdit && (
            <button type="button" className="text-accent cursor-pointer" onClick={async () => {
              if (!(await confirm({ title: 'Cancelar pedido', text: 'O pedido de troca de plano será retirado.', confirmLabel: 'Cancelar pedido' }))) return;
              if (await run('billing.cancelRequest', { tenantId: t.tenantId, requestId: data.pendingRequest!.id }, { success: 'Pedido cancelado.' })) load();
            }}>
              Cancelar pedido
            </button>
          )}
        </Notice>
      )}

      {!data.federation && (
        <section className="space-y-3">
          <h2 className="font-semibold">Planos disponíveis</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {data.plans.map(p => {
              const current = p.id === data.plan?.id;
              const value = monthlyCents({ ...p, priceCents: 0 }, data.counts.holders);
              return (
                <Card key={p.id} className={current ? 'border-accent' : ''}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-display text-xl">{p.name}</div>
                    {current && <Badge tone="brand">Plano atual</Badge>}
                  </div>
                  {p.description && <p className="text-sm text-muted">{p.description}</p>}
                  <div className="mt-2">
                    <span className="text-2xl font-semibold">{formatBRL(p.pricePerMemberCents)}</span>
                    <span className="text-sm text-muted"> por titular ativo/mês</span>
                  </div>
                  <p className="text-xs text-muted">Mínimo de {formatBRL(p.minMonthlyCents)}. Até {p.maxMembers.toLocaleString('pt-BR')} sócios. Para a sua sociedade hoje: <strong>{formatBRL(value)}</strong> por mês.</p>
                  {p.highlights.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {p.highlights.map(h => (
                        <li key={h} className="flex gap-2">
                          <Check className="w-4 h-4 mt-0.5 text-accent shrink-0" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!current && canEdit && !data.pendingRequest && (
                    <Button className="mt-4" variant="secondary" onClick={() => setPick(p)}>
                      Mudar para {p.name}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}
      {pick && <ChangeModal plan={pick} holders={data.counts.holders} online={data.onlinePayment && pick.online} onClose={() => setPick(null)} onDone={() => (setPick(null), load())} />}
    </div>
  );
}

function ChangeModal({ plan, holders, online, onClose, onDone }: { plan: PlanInfo; holders: number; online: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [period, setPeriod] = useState<'mensal' | 'anual'>('mensal');
  const [note, setNote] = useState('');
  const monthly = monthlyCents({ ...plan, priceCents: 0 }, holders);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mudar para ${plan.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {online ? (
            <Button loading={busy} onClick={async () => {
              const r = await run<{ url: string }>('billing.checkout', { tenantId: t.tenantId, planId: plan.id, period });
              if (r?.url) window.location.href = r.url;
            }}>
              Ir para o pagamento
            </Button>
          ) : (
            <Button loading={busy} onClick={async () => {
              if (await run('billing.requestChange', { tenantId: t.tenantId, planId: plan.id, period, ...(note.trim() ? { note: note.trim() } : {}), requestId: `${plan.id}_${period}_${Date.now()}` }, { success: 'Pedido enviado para a plataforma.' })) onDone();
            }}>
              Pedir a troca
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Forma de pagamento">
          {id => (
            <Select id={id} value={period} onChange={e => setPeriod(e.target.value as 'mensal' | 'anual')}>
              <option value="mensal">Mensal: {formatBRL(monthly)} por mês</option>
              <option value="anual">Anual: {formatBRL(annualCents(monthly))} por ano (15% de desconto)</option>
            </Select>
          )}
        </Field>
        <p className="text-xs text-muted">O valor acompanha o número de sócios titulares ativos. Dependentes não contam.</p>
        {!online && <Field label="Observação para a plataforma (opcional)">{id => <Textarea id={id} value={note} maxLength={300} onChange={e => setNote(e.target.value)} />}</Field>}
        {!online && <Notice>A plataforma confirma a troca e combina a cobrança com a diretoria. Os módulos do plano novo são ligados na hora da aprovação.</Notice>}
      </div>
    </Modal>
  );
}
