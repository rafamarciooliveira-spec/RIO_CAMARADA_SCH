/** Visão geral: saldo por conta, receitas x despesas do mês, pendências e inadimplência. */
import { useDoc, useList } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { FIN_ACCOUNT_TYPE_LABEL, type ChargeDoc, type DashboardStats, type LedgerEntryDoc } from '../../../shared/types.ts';
import { delinquency, nature, isTransfer } from '../../../shared/finance/reports.ts';
import { todayIn, periodLabel } from '../../../app/formHelpers.ts';
import { Card, ErrorState, Loading, Money, Section, Stat } from '../../../ui/index.tsx';
import { useFinanceCatalog } from '../common.tsx';

export default function OverviewTab({ onGo }: { onGo: (tab: 'lancamentos' | 'cobrancas') => void }) {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const month = today.slice(0, 7);
  const cat = useFinanceCatalog();
  const stats = useDoc<DashboardStats>(P.stats(t.tenantId));
  const monthEntries = useList<LedgerEntryDoc>(P.ledger(t.tenantId), { where: [['periodKey', '==', month]] });
  const pending = useList<LedgerEntryDoc>(P.ledger(t.tenantId), { where: [['status', '==', 'aguardando_aprovacao']] });
  const open = useList<ChargeDoc>(P.charges(t.tenantId), { where: [['status', 'in', ['aberta', 'vencida']]] });

  if (cat.loading || monthEntries.loading) return <Loading />;
  if (cat.accounts.error) return <ErrorState text={cat.accounts.error} />;

  let inC = 0;
  let outC = 0;
  for (const e of monthEntries.data) {
    if (e.status !== 'lancado' || isTransfer(e)) continue;
    const n = nature(e);
    if (n.kind === 'receita') inC += n.cents;
    else outC += n.cents;
  }
  const total = cat.accounts.data.reduce((a, c) => a + (c.balanceCents || 0), 0);
  const del = delinquency(open.data, today);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Saldo total" value={<Money cents={total} />} tone={total < 0 ? 'bad' : undefined} />
        <Stat label={`Receitas de ${periodLabel(month)}`} value={<Money cents={inC} />} tone="ok" />
        <Stat label={`Despesas de ${periodLabel(month)}`} value={<Money cents={outC} />} tone="warn" />
        <Stat label="Inadimplência" value={<Money cents={del.totalCents} />} hint={`${del.count} cobrança(s) vencida(s)`} tone={del.count ? 'bad' : 'ok'} onClick={() => onGo('cobrancas')} />
      </div>
      {pending.data.length > 0 && (
        <Stat label="Lançamentos aguardando a segunda aprovação" value={pending.data.length} tone="warn" onClick={() => onGo('lancamentos')} hint="Toque para revisar" />
      )}
      <Section title="Saldo por conta">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cat.accounts.data.map(a => (
            <Card key={a.id} className={a.active === false ? 'opacity-60' : ''}>
              <div className="text-xs text-muted">{FIN_ACCOUNT_TYPE_LABEL[a.type] || a.type}{a.institution ? ` · ${a.institution}` : ''}{a.active === false ? ' (desativada)' : ''}</div>
              <div className="font-semibold">{a.name}</div>
              <div className="text-xl font-bold tabular-nums mt-1">
                <Money cents={a.balanceCents || 0} />
              </div>
            </Card>
          ))}
        </div>
      </Section>
      {del.byMember.length > 0 && (
        <Section title="Maiores atrasos">
          <Card className="divide-y divide-line p-0 sm:p-0">
            {del.byMember.slice(0, 5).map(m => (
              <div key={m.memberId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{m.memberName}</span>
                <span className="text-muted text-xs whitespace-nowrap">{m.oldestDays} dias</span>
                <Money cents={m.totalCents} className="font-semibold" />
              </div>
            ))}
          </Card>
        </Section>
      )}
      {stats.data && <p className="text-[11px] text-muted">O painel da gestão é recalculado todos os dias pela rotina automática.</p>}
    </div>
  );
}
