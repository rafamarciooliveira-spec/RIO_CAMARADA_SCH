/** Incentivos e editais: prazos, orçamento, documentos, situação e prestação de contas pelo centro de custo. */
import { FileSignature } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { daysBetweenKeys, formatDate } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import { budgetVsActual } from '../../shared/finance/reports.ts';
import type { CostCenterDoc, GrantDoc, LedgerEntryDoc, LibraryDocDoc } from '../../shared/types.ts';
import { Badge, Money, Notice, Section, Stat } from '../../ui/index.tsx';
import { FileLink } from '../../app/uploads.tsx';
import { CrudPage, opts, type CrudConfig, type Doc } from './CrudPage.tsx';

const SPHERE = { municipal: 'Municipal', estadual: 'Estadual', federal: 'Federal', privado: 'Privado (empresa ou fundação)' };
const STATUS = {
  em_preparacao: 'Em preparação',
  inscrito: 'Inscrito',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  prestacao_de_contas: 'Prestação de contas',
  concluido: 'Concluído',
  reprovado: 'Reprovado',
};

export default function GrantsPage() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const cc = useList<CostCenterDoc>(P.costCenters(t.tenantId), { orderBy: [['name', 'asc']] });
  const config: CrudConfig = {
    collection: 'grants',
    title: 'Incentivos e editais',
    subtitle: 'Leis de incentivo municipais, estaduais e federais, prazos, orçamento e prestação de contas.',
    singular: 'projeto',
    icon: <FileSignature className="w-5 h-5" />,
    query: { orderBy: [['deadline', 'asc']] },
    searchKeys: ['name', 'program'],
    defaults: () => ({ name: '', sphere: 'municipal', program: '', deadline: today, budgetCents: 0, approvedCents: 0, status: 'em_preparacao', costCenterId: '', notes: '' }),
    fields: [
      { key: 'name', label: 'Nome do projeto', type: 'text', required: true, max: 200 },
      { key: 'program', label: 'Edital ou programa', type: 'text', max: 200, placeholder: 'Ex.: Lei Rouanet, PNAB, edital municipal' },
      { key: 'sphere', label: 'Esfera', type: 'select', options: opts(SPHERE) },
      { key: 'status', label: 'Situação', type: 'select', options: opts(STATUS) },
      { key: 'deadline', label: 'Prazo (inscrição ou próxima entrega)', type: 'date', required: true },
      { key: 'costCenterId', label: 'Centro de custo', type: 'select', optional: true, options: cc.data.map(c => ({ value: c.id, label: c.name })), hint: 'Receitas e despesas do projeto lançadas neste centro de custo entram na prestação de contas.' },
      { key: 'budgetCents', label: 'Orçamento solicitado', type: 'money' },
      { key: 'approvedCents', label: 'Valor aprovado', type: 'money' },
      { key: 'notes', label: 'Anotações e documentos exigidos', type: 'textarea', max: 4000 },
    ],
    columns: [
      { key: 'n', label: 'Projeto', render: g => <div><div className="font-medium">{String(g.name)}</div><div className="text-xs text-muted">{String(g.program || '')}</div></div> },
      {
        key: 'd',
        label: 'Prazo',
        render: g => {
          const d = daysBetweenKeys(today, String(g.deadline));
          const done = ['concluido', 'reprovado'].includes(String(g.status));
          return <span className={!done && d < 0 ? 'text-bad font-semibold' : !done && d <= 15 ? 'text-warn font-semibold' : ''}>{formatDate(String(g.deadline))}</span>;
        },
      },
      { key: 'v', label: 'Aprovado', render: g => formatBRL(Number(g.approvedCents)), hideOnMobile: true },
      { key: 's', label: 'Situação', render: g => <Badge tone={g.status === 'reprovado' ? 'bad' : g.status === 'concluido' ? 'ok' : 'info'}>{STATUS[g.status as keyof typeof STATUS]}</Badge> },
    ],
    detail: row => <GrantDetail g={row as unknown as GrantDoc & Doc} />,
    emptyText: 'Acompanhe aqui os projetos inscritos em leis de incentivo e editais.',
  };
  return <CrudPage config={config} />;
}

function GrantDetail({ g }: { g: GrantDoc & Doc }) {
  const t = useTenant();
  const canFin = t.can('financeiro', 'ver');
  const ledger = useList<LedgerEntryDoc>(canFin && g.costCenterId ? P.ledger(t.tenantId) : null, { where: [['costCenterId', '==', g.costCenterId || '-']] });
  const docs = useList<LibraryDocDoc>(t.can('documentos', 'ver') ? P.library(t.tenantId) : null, { where: [['folder', '==', `Editais/${g.name}`]] });
  const cmp = budgetVsActual([{ kind: 'despesa', plannedCents: g.approvedCents || g.budgetCents }], ledger.data, { costCenterId: g.costCenterId });
  return (
    <div className="space-y-5 border-t border-line pt-4">
      <Section title="Prestação de contas">
        {!g.costCenterId ? (
          <Notice>Escolha um centro de custo para acompanhar receitas e despesas do projeto pelo livro caixa.</Notice>
        ) : !canFin ? (
          <Notice>Os valores realizados aparecem para quem tem acesso ao financeiro.</Notice>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Aprovado" value={<Money cents={g.approvedCents} />} />
            <Stat label="Recebido" value={<Money cents={cmp.actualInCents} />} tone="ok" />
            <Stat label="Gasto" value={<Money cents={cmp.actualOutCents} />} tone="warn" />
            <Stat label="Saldo do projeto" value={<Money cents={cmp.actualInCents - cmp.actualOutCents} />} />
          </div>
        )}
      </Section>
      <Section title="Documentos">
        {docs.data.length ? (
          <ul className="space-y-1">
            {docs.data.map(d => (
              <li key={d.id} className="text-sm flex items-center gap-2">
                {d.name} {d.filePath && <FileLink path={d.filePath} label="abrir" />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Guarde os documentos do projeto na Biblioteca de documentos, pasta <strong>Editais/{g.name}</strong>, e eles aparecem aqui.
          </p>
        )}
      </Section>
    </div>
  );
}
