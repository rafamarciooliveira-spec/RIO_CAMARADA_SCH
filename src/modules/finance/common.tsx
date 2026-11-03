/** Peças comuns do financeiro: leituras de cadastro, rótulos e selos de situação. */
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { ChargeDoc, ChargeStatus, ChartAccountDoc, CostCenterDoc, FinAccountDoc, LedgerEntryDoc } from '../../shared/types.ts';
import { Badge, Notice } from '../../ui/index.tsx';
import { lateCharges } from '../../shared/money.ts';
import { chargeOpenCents } from '../../shared/finance/reports.ts';

export function useFinanceCatalog() {
  const t = useTenant();
  const accounts = useList<FinAccountDoc>(P.accounts(t.tenantId), { orderBy: [['name', 'asc']] });
  const chart = useList<ChartAccountDoc>(P.chart(t.tenantId), { orderBy: [['code', 'asc']] });
  const costCenters = useList<CostCenterDoc>(P.costCenters(t.tenantId), { orderBy: [['name', 'asc']] });
  const accName = (id: string) => accounts.data.find(a => a.id === id)?.name || (id ? 'Conta removida' : '');
  const chartName = (id: string) => {
    if (id === 'transferencia') return 'Transferência entre contas';
    const c = chart.data.find(x => x.id === id);
    return c ? `${c.code} ${c.name}` : '';
  };
  const ccName = (id?: string) => (id ? costCenters.data.find(c => c.id === id)?.name || '' : '');
  return { accounts, chart, costCenters, accName, chartName, ccName, loading: accounts.loading || chart.loading || costCenters.loading };
}

export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = { aberta: 'Em aberto', paga: 'Paga', vencida: 'Vencida', cancelada: 'Cancelada' };

export function ChargeBadge({ c, today }: { c: Pick<ChargeDoc, 'status' | 'dueDate'>; today: string }) {
  const overdue = c.status === 'vencida' || (c.status === 'aberta' && c.dueDate < today);
  if (overdue) return <Badge tone="bad">Vencida</Badge>;
  if (c.status === 'paga') return <Badge tone="ok">Paga</Badge>;
  if (c.status === 'cancelada') return <Badge>Cancelada</Badge>;
  return <Badge tone="info">Em aberto</Badge>;
}

export function EntryBadge({ e }: { e: Pick<LedgerEntryDoc, 'status' | 'reversedBy' | 'reversalOf' | 'transferId'> }) {
  if (e.status === 'aguardando_aprovacao') return <Badge tone="warn">Aguardando aprovação</Badge>;
  if (e.status === 'recusado') return <Badge tone="bad">Recusado</Badge>;
  if (e.reversalOf) return <Badge tone="info">Estorno</Badge>;
  if (e.reversedBy) return <Badge>Estornado</Badge>;
  if (e.transferId) return <Badge>Transferência</Badge>;
  return <Badge tone="ok">Lançado</Badge>;
}

export function SandboxNotice() {
  return (
    <Notice tone="warn">
      Pagamentos em modo de teste (sandbox): os códigos Pix e boletos gerados aqui não movimentam dinheiro de verdade. O provedor real entra depois que a sociedade escolher o fornecedor.
    </Notice>
  );
}

/** Valor devido numa data, com multa e juros pelas regras da sociedade (a mesma conta do servidor) */
export function dueNow(c: Pick<ChargeDoc, 'amountCents' | 'discountCents' | 'dueDate'>, s: { lateFeeBps?: number; interestBpsMonth?: number } | null, onKey: string) {
  const base = chargeOpenCents(c);
  const l = lateCharges(base, c.dueDate, onKey, s?.lateFeeBps || 0, s?.interestBpsMonth || 0);
  return { base, ...l, total: base + l.lateFeeCents + l.interestCents };
}

