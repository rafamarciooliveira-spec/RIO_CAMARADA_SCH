/** Relatórios calculados do livro caixa: fluxo, DRE, balancete, inadimplência, CSV para o contador e PDF. */
import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useList } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { monthsBack, periodLabel, todayIn } from '../../../app/formHelpers.ts';
import { accountabilityPdf } from '../../../app/pdf.ts';
import { buildSafeCsv, downloadCsv } from '../../../utils/csv.ts';
import { P } from '../../../shared/paths.ts';
import { formatDate } from '../../../shared/dates.ts';
import { accountsOpenedAt, cashFlowByMonth, delinquency, dre, trialBalance } from '../../../shared/finance/reports.ts';
import type { ChargeDoc, LedgerEntryDoc } from '../../../shared/types.ts';
import { Button, Card, ErrorState, Field, Loading, Money, Section, Select, Table } from '../../../ui/index.tsx';
import { useFinanceCatalog } from '../common.tsx';

function lastDay(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

export default function ReportsTab() {
  const t = useTenant();
  const cat = useFinanceCatalog();
  const today = todayIn(t.tenant.timezone);
  const months = monthsBack(today.slice(0, 7), 36);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01`);
  const [to, setTo] = useState(today.slice(0, 7));
  // Só os lançamentos do início do período em diante; o saldo inicial vem do saldo atual das contas
  const startKey = from <= to ? from : to;
  const ledger = useList<LedgerEntryDoc>(P.ledger(t.tenantId), { where: [['periodKey', '>=', startKey]], orderBy: [['periodKey', 'asc'], ['number', 'asc']] });
  const open = useList<ChargeDoc>(P.charges(t.tenantId), { where: [['status', 'in', ['aberta', 'vencida']]] });
  const canExport = t.can('financeiro', 'exportar');
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;

  const r = useMemo(() => {
    const accounts = accountsOpenedAt(cat.accounts.data, ledger.data, `${a}-01`);
    const opening = accounts.reduce((sum, x) => sum + x.openingBalanceCents, 0);
    return {
      cash: cashFlowByMonth(ledger.data, { from: a, to: b, openingCents: opening }),
      dre: dre(ledger.data, cat.chart.data, { from: a, to: b }),
      tb: trialBalance(ledger.data, accounts, { from: `${a}-01`, to: lastDay(b) }),
      del: delinquency(open.data, today),
    };
  }, [ledger.data, cat.accounts.data, cat.chart.data, open.data, a, b, today]);

  if (ledger.loading || cat.loading) return <Loading label="Calculando relatórios..." />;
  if (ledger.error) return <ErrorState text={ledger.error} />;
  const label = a === b ? periodLabel(a) : `${periodLabel(a)} a ${periodLabel(b)}`;

  const exportCsv = () => {
    const rows = ledger.data
      .filter(e => e.date >= `${a}-01` && e.date <= lastDay(b))
      .map(e => [
        e.number,
        formatDate(e.date),
        cat.accName(e.accountId),
        e.direction === 'entrada' ? 'Entrada' : 'Saída',
        (e.amountCents / 100).toFixed(2).replace('.', ','),
        cat.chartName(e.chartAccountId),
        cat.ccName(e.costCenterId),
        e.description,
        e.counterparty || '',
        e.status === 'lancado' ? 'Lançado' : e.status === 'recusado' ? 'Recusado' : 'Aguardando aprovação',
        e.reversalOf ? 'Sim' : '',
        e.attachments?.length || 0,
      ]);
    downloadCsv(
      buildSafeCsv(['Nº', 'Data', 'Conta', 'Tipo', 'Valor (R$)', 'Plano de contas', 'Centro de custo', 'Descrição', 'Favorecido/Pagador', 'Situação', 'Estorno', 'Anexos'], rows),
      `livro-caixa-${a}-a-${b}.csv`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Field label="De">
          {id => (
            <Select id={id} value={from} onChange={e => setFrom(e.target.value)} className="sm:w-36">
              {months.map(m => (
                <option key={m} value={m}>
                  {periodLabel(m)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Até">
          {id => (
            <Select id={id} value={to} onChange={e => setTo(e.target.value)} className="sm:w-36">
              {months.map(m => (
                <option key={m} value={m}>
                  {periodLabel(m)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canExport && (
          <div className="flex gap-2 sm:ml-auto">
            <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={exportCsv}>
              CSV para o contador
            </Button>
            <Button size="sm" icon={<FileText className="w-4 h-4" />} onClick={() => accountabilityPdf(t.tenant, { periodLabel: label, cashFlow: r.cash, dre: r.dre, trial: r.tb, delinquencyCents: r.del.totalCents })}>
              Prestação de contas (PDF)
            </Button>
          </div>
        )}
      </div>

      <Section title="Fluxo de caixa">
        <Table
          rows={r.cash.map(c => ({ ...c, id: c.periodKey }))}
          columns={[
            { key: 'm', label: 'Mês', render: c => periodLabel(c.periodKey) },
            { key: 'i', label: 'Receitas', className: 'text-right', render: c => <Money cents={c.inCents} /> },
            { key: 'o', label: 'Despesas', className: 'text-right', render: c => <Money cents={c.outCents} /> },
            { key: 'n', label: 'Resultado', className: 'text-right', render: c => <Money cents={c.netCents} className={c.netCents < 0 ? 'text-bad' : ''} /> },
            { key: 'a', label: 'Acumulado', className: 'text-right', hideOnMobile: true, render: c => <Money cents={c.cumulativeCents} /> },
          ]}
        />
      </Section>

      <Section title={`Resultado (DRE simplificada) de ${label}`}>
        <Card className="space-y-1 text-sm">
          {r.dre.receitas.map(l => (
            <Line key={l.chartAccountId} label={`${l.code} ${l.name}`} cents={l.cents} />
          ))}
          <Line label="Total de receitas" cents={r.dre.totalReceitasCents} strong />
          <div className="h-2" />
          {r.dre.despesas.map(l => (
            <Line key={l.chartAccountId} label={`${l.code} ${l.name}`} cents={l.cents} />
          ))}
          <Line label="Total de despesas" cents={r.dre.totalDespesasCents} strong />
          <div className="border-t border-line my-2" />
          <Line label={r.dre.resultadoCents >= 0 ? 'Superávit' : 'Déficit'} cents={r.dre.resultadoCents} strong tone={r.dre.resultadoCents >= 0 ? 'text-ok' : 'text-bad'} />
        </Card>
      </Section>

      <Section title="Balancete por conta">
        <Table
          rows={[...r.tb.rows.map(x => ({ ...x, id: x.accountId })), { ...r.tb.total, id: '__total', accountId: '', name: 'Total' }]}
          columns={[
            { key: 'n', label: 'Conta', render: x => <span className={x.id === '__total' ? 'font-bold' : ''}>{x.name}</span> },
            { key: 'o', label: 'Saldo inicial', className: 'text-right', hideOnMobile: true, render: x => <Money cents={x.openingCents} /> },
            { key: 'i', label: 'Entradas', className: 'text-right', render: x => <Money cents={x.inCents} /> },
            { key: 's', label: 'Saídas', className: 'text-right', render: x => <Money cents={x.outCents} /> },
            { key: 'f', label: 'Saldo final', className: 'text-right', render: x => <Money cents={x.finalCents} className="font-semibold" /> },
          ]}
        />
      </Section>

      <Section title="Inadimplência">
        <div className="grid sm:grid-cols-4 gap-3">
          {r.del.byAge.map(g => (
            <Card key={g.bucket}>
              <div className="text-xs text-muted">{g.bucket}</div>
              <div className="font-bold">
                <Money cents={g.totalCents} />
              </div>
              <div className="text-xs text-muted">{g.count} cobrança(s)</div>
            </Card>
          ))}
        </div>
        <Table
          rows={r.del.byMember.map(m => ({ ...m, id: m.memberId }))}
          columns={[
            { key: 'n', label: t.labels.member, render: m => m.memberName },
            { key: 'c', label: 'Cobranças', render: m => m.count },
            { key: 'd', label: 'Atraso mais antigo', render: m => `${m.oldestDays} dias` },
            { key: 't', label: 'Total', className: 'text-right', render: m => <Money cents={m.totalCents} /> },
          ]}
        />
      </Section>
    </div>
  );
}

function Line({ label, cents, strong, tone }: { label: string; cents: number; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <Money cents={cents} className={tone} />
    </div>
  );
}
