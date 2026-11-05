/** Financeiro da diretoria: visão geral, livro caixa, cobranças, contas, conciliação, relatórios e fechamento. */
import { useState } from 'react';
import { useTenant } from '../../app/TenantContext.tsx';
import { Notice, PageHeader, Tabs } from '../../ui/index.tsx';
import { SandboxNotice } from './common.tsx';
import OverviewTab from './tabs/OverviewTab.tsx';
import LedgerTab from './tabs/LedgerTab.tsx';
import ChargesTab from './tabs/ChargesTab.tsx';
import AccountsTab from './tabs/AccountsTab.tsx';
import ReconcileTab from './tabs/ReconcileTab.tsx';
import ReportsTab from './tabs/ReportsTab.tsx';
import PeriodsTab from './tabs/PeriodsTab.tsx';
import AccountabilityTab from './tabs/AccountabilityTab.tsx';

type Tab = 'visao' | 'lancamentos' | 'cobrancas' | 'contas' | 'conciliacao' | 'relatorios' | 'prestacao' | 'fechamento';

export default function FinancePage() {
  const t = useTenant();
  const [tab, setTab] = useState<Tab>('visao');
  const readOnly = !t.can('financeiro', 'criar') && !t.can('financeiro', 'editar') && !t.can('financeiro', 'aprovar');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'lancamentos', label: 'Lançamentos' },
    { id: 'cobrancas', label: 'Cobranças' },
    { id: 'contas', label: 'Contas e plano' },
    { id: 'conciliacao', label: 'Conciliação' },
    { id: 'relatorios', label: 'Relatórios' },
    { id: 'prestacao', label: 'Prestação de contas' },
    { id: 'fechamento', label: 'Fechamento' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Financeiro" subtitle="Livro caixa, cobranças, conciliação e prestação de contas." />
      {readOnly && <Notice>Acesso de consulta: você vê e exporta tudo, sem botões de alteração (perfil de conselho fiscal).</Notice>}
      <SandboxNotice />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'visao' && <OverviewTab onGo={setTab} />}
      {tab === 'lancamentos' && <LedgerTab />}
      {tab === 'cobrancas' && <ChargesTab />}
      {tab === 'contas' && <AccountsTab />}
      {tab === 'conciliacao' && <ReconcileTab />}
      {tab === 'relatorios' && <ReportsTab />}
      {tab === 'prestacao' && <AccountabilityTab />}
      {tab === 'fechamento' && <PeriodsTab />}
    </div>
  );
}
