/** Prestação de contas para os sócios: lista das publicadas e o detalhe com PDF e compartilhar. */
import { FileBarChart } from 'lucide-react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useDoc, useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { AccountabilityDoc } from '../../shared/types.ts';
import { Button, Card, EmptyState, ErrorState, Loading, Money, PageHeader } from '../../ui/index.tsx';
import { AccountabilityActions, AccountabilityView } from './AccountabilityView.tsx';

export default function AccountabilityPage() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id" element={<Detail />} />
    </Routes>
  );
}

function List() {
  const t = useTenant();
  const navigate = useNavigate();
  // A regra não filtra: quem não vê o financeiro pede só as publicadas para os sócios
  const list = useList<AccountabilityDoc>(
    P.accountabilities(t.tenantId),
    t.can('financeiro', 'ver') ? { orderBy: [['publishedAt', 'desc']], limit: 60 } : { where: [['audience', '==', 'socios'], ['status', '==', 'publicado']], orderBy: [['publishedAt', 'desc']], limit: 60 }
  );
  const rows = list.data.filter(a => a.status === 'publicado');
  return (
    <div className="space-y-5">
      <PageHeader title="Prestação de contas" subtitle="Quanto entrou, quanto saiu e onde está o dinheiro da sociedade." />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : !rows.length ? (
        <EmptyState icon={<FileBarChart className="w-5 h-5" />} title="Nenhuma prestação de contas publicada ainda" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {rows.map(a => (
            <button key={a.id} type="button" className="text-left cursor-pointer" onClick={() => navigate(t.to(`prestacao-de-contas/${a.id}`))}>
              <Card className="h-full hover:border-brand transition-colors space-y-1">
                <div className="text-xs text-muted">Publicada em {formatDate(a.publishedAt, t.tenant.timezone)}</div>
                <div className="font-semibold">{a.periodLabel}</div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Entradas</span>
                  <Money cents={a.report.totals.inCents} className="text-ok" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Saídas</span>
                  <Money cents={a.report.totals.outCents} className="text-bad" />
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>{a.kind === 'periodo' ? 'Saldo atual' : a.report.resultCents >= 0 ? 'Lucro' : 'Prejuízo'}</span>
                  <Money cents={a.kind === 'periodo' ? a.report.closingCents : a.report.resultCents} />
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail() {
  const t = useTenant();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const doc = useDoc<AccountabilityDoc>(id ? P.accountability(t.tenantId, id) : null);
  if (doc.loading) return <Loading />;
  if (!doc.data) return <ErrorState text="Prestação de contas não encontrada ou não disponível para você." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate(t.to('prestacao-de-contas'))}>
          Voltar
        </Button>
        <AccountabilityActions a={doc.data} />
      </div>
      <AccountabilityView a={doc.data} />
    </div>
  );
}
