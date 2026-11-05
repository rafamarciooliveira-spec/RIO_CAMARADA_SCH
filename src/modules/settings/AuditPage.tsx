/** Trilha de auditoria (append-only): quem fez, o quê, sobre quem e quando, com nomes no lugar dos identificadores. */
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import { usePeopleNames } from '../../app/usePeopleNames.ts';
import type { QuerySpec } from '../../shared/core/store.ts';
import type { AuditDoc } from '../../shared/types.ts';
import { Badge, EmptyState, ErrorState, LoadMore, Loading, PageHeader, Select, Table, type Column } from '../../ui/index.tsx';

const PAGE = 50;

const ACTION_LABEL: Record<string, string> = {
  'pii.cpf_revealed': 'CPF revelado',
  'pii.viewed': 'Dados pessoais consultados',
  'members.exported': 'Exportação de sócios',
  'members.imported': 'Importação de sócios',
  'members.approved': 'Cadastro aprovado',
  'members.status_changed': 'Situação alterada',
  'members.anonymized': 'Cadastro anonimizado',
  'members.updated': 'Cadastro editado',
  'members.self_updated': 'Sócio atualizou o próprio cadastro',
  'members.created': 'Cadastro criado',
  'members.applied': 'Proposta online',
  'members.fix_requested': 'Ajuste pedido',
  'members.renewed': 'Validade renovada',
  'members.change_requested': 'Alteração pedida pelo sócio',
  'members.dependent_added': 'Dependente incluído',
  'members.dependent_promoted': 'Dependente virou titular',
  'card.downloaded': 'Carteirinha baixada',
  'roles.saved': 'Papel salvo',
  'roles.deleted': 'Papel apagado',
  'memberships.roles_set': 'Papéis de pessoa alterados',
  'memberships.roles_changed': 'Papéis de pessoa alterados',
  'memberships.revoked': 'Acesso removido',
  'invites.created': 'Convite criado',
  'invites.revoked': 'Convite cancelado',
  'invites.accepted': 'Convite aceito',
  'tenant.updated': 'Sociedade alterada',
  'tenant.settings_updated': 'Configurações alteradas',
  'tenant.slug_changed': 'Endereço trocado',
  'notices.published': 'Aviso publicado',
  'notices.scheduled': 'Aviso agendado',
  'notices.updated': 'Aviso alterado',
  'notices.deleted': 'Aviso apagado',
  'privacy.requested': 'Pedido de privacidade',
  'privacy.resolved': 'Pedido de privacidade respondido',
  'privacy.data_exported': 'Cópia dos dados baixada pelo titular',
  'privacy.retention_run': 'Rotina de retenção',
  'ledger.posted': 'Lançamento no caixa',
  'ledger.approved': 'Lançamento aprovado',
  'ledger.rejected': 'Lançamento recusado',
  'ledger.reversed': 'Lançamento estornado',
  'ledger.transfer': 'Transferência entre contas',
  'periods.closed': 'Mês fechado',
  'periods.reopened': 'Mês reaberto',
  'charges.created': 'Cobrança criada',
  'charges.batch_generated': 'Mensalidades geradas',
  'charges.canceled': 'Cobrança cancelada',
  'charges.paid': 'Pagamento recebido',
  'charges.payment_created': 'Pagamento gerado',
  'finance.payment_event': 'Aviso do meio de pagamento',
  'finance.reconciled': 'Conciliação feita',
  'finance.reconciled_auto': 'Conciliação automática',
  'finance.unreconciled': 'Conciliação desfeita',
  'finance.statement_imported': 'Extrato importado',
  'accountability.published': 'Prestação de contas publicada',
  'accountability.signed': 'Prestação de contas assinada',
  'accountability.withdrawn': 'Prestação de contas retirada',
  'billing.change_requested': 'Troca de plano pedida',
  'billing.change_cancelled': 'Pedido de troca de plano cancelado',
  'billing.checkout_opened': 'Pagamento do plano aberto',
  'events.guest_added': 'Convidado incluído no evento',
  'events.guest_removed': 'Convidado retirado do evento',
  'events.ticket_sold': 'Ingresso vendido',
  'minutes.published': 'Ata publicada',
  'minutes.signed': 'Ata assinada',
  'minutes.submitted': 'Ata enviada para assinatura',
  'elections.opened': 'Votação aberta',
  'elections.closed': 'Votação encerrada',
  'surveys.created': 'Enquete criada',
  'tasks.from_deliberation': 'Tarefa criada da ata',
  'tasks.status_changed': 'Tarefa mudou de etapa',
  'orgchart.saved': 'Organograma salvo',
  'orgchart.handover': 'Cargo passado adiante',
  'competitions.created': 'Competição criada',
  'competitions.updated': 'Competição alterada',
  'competitions.deleted': 'Competição apagada',
  'competitions.results': 'Resultados lançados',
  'competitions.status': 'Competição mudou de situação',
  'federation.championship_saved': 'Campeonato da federação salvo',
  'federation.settings': 'Federação alterada',
  'federation.transfer_requested': 'Transferência de sócio pedida',
  'federation.transfer_done': 'Transferência de sócio feita',
  'federation.transfer_rejected': 'Transferência de sócio recusada',
  'assets.loaned': 'Item do patrimônio emprestado',
  'assets.returned': 'Item do patrimônio devolvido',
  'bookings.confirmed': 'Reserva confirmada',
  'bookings.canceled': 'Reserva cancelada',
  'workshops.enrolled': 'Inscrição em oficina',
  'workshops.unenrolled': 'Saída de oficina',
  'calendar.ics_created': 'Agenda ligada ao celular',
  'calendar.ics_revoked': 'Agenda desligada do celular',
  'news.posted': 'Notícia publicada',
  'news.updated': 'Notícia alterada',
  'news.deleted': 'Notícia apagada',
  'news.refreshed': 'Notícias externas atualizadas',
  'news.config_saved': 'Fontes de notícias salvas',
  'handbook.published': 'Manual do sócio publicado',
  'handbook.draft_saved': 'Rascunho do manual salvo',
  'platform.support_access': 'Acesso de suporte da plataforma',
  'support.access_opened': 'Acesso de suporte da plataforma',
};

/** Nome legível das informações extras (o que não estiver aqui aparece como veio) */
const DETAIL_LABEL: Record<string, string> = {
  status: 'situação', from: 'de', to: 'para', kind: 'tipo', amountCents: 'valor', totalCents: 'total', outCents: 'saídas', paidAmountCents: 'pago',
  count: 'quantidade', total: 'total', rows: 'linhas', created: 'criados', skipped: 'ignorados', removed: 'retirados', added: 'incluídos', notified: 'avisados',
  version: 'versão', number: 'número', period: 'período', format: 'formato', fields: 'campos', reason: 'motivo', hours: 'horas', role: 'papel', roles: 'papéis',
  dependents: 'dependentes', validUntil: 'validade', slug: 'endereço', oldSlug: 'endereço anterior', planId: 'plano', toPlanId: 'plano novo', quantity: 'quantidade',
  receiptNumber: 'recibo', signers: 'assinantes', sent: 'enviados', positions: 'cargos', enabled: 'ligado', visibility: 'visibilidade', scope: 'alcance',
};

function detailValue(k: string, v: string | number | boolean): string {
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number' && /Cents$/.test(k)) return formatBRL(v);
  return String(v);
}

const FILTERS: { id: string; label: string; actions: string[] }[] = [
  { id: 'pii', label: 'Dados pessoais e exportações', actions: ['pii.cpf_revealed', 'pii.viewed', 'members.exported', 'privacy.data_exported'] },
  { id: 'papeis', label: 'Papéis e acessos', actions: ['roles.saved', 'roles.deleted', 'memberships.roles_set', 'memberships.revoked', 'invites.created', 'invites.revoked'] },
  { id: 'socios', label: 'Cadastros', actions: ['members.approved', 'members.status_changed', 'members.anonymized', 'members.updated', 'members.created', 'members.applied', 'members.imported'] },
  { id: 'lgpd', label: 'Privacidade', actions: ['privacy.requested', 'privacy.resolved', 'privacy.retention_run', 'members.anonymized'] },
];

export default function AuditPage() {
  const t = useTenant();
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useMemo<QuerySpec>(() => {
    const f = FILTERS.find(x => x.id === filter);
    return { ...(f ? { where: [['action', 'in', f.actions.slice(0, 10)]] } : {}), orderBy: [['at', 'desc']], limit };
  }, [filter, limit]);
  const list = useList<AuditDoc>(P.audit(t.tenantId), q);
  const name = usePeopleNames(t.tenantId, [...list.data.filter(a => !a.actorName).map(a => a.actorUid), ...list.data.map(a => a.targetId)]);
  const columns: Column<AuditDoc & { id: string }>[] = [
    { key: 'quando', label: 'Quando', render: a => <span className="whitespace-nowrap tabular-nums text-xs">{formatDateTime(a.at, t.tenant.timezone)}</span> },
    {
      key: 'acao',
      label: 'Ação',
      render: a => (
        <div>
          <div className="text-sm">{ACTION_LABEL[a.action] || a.action}</div>
          {a.action.startsWith('pii.') && <Badge tone="warn">Dado pessoal</Badge>}
        </div>
      ),
    },
    { key: 'quem', label: 'Quem fez', render: a => <span className="text-sm">{a.actorName || name(a.actorUid)}</span> },
    { key: 'alvo', label: 'Sobre quem', render: a => <span className="text-xs text-muted">{a.targetId ? name(a.targetId, ' ') : ''}</span>, hideOnMobile: true },
    {
      key: 'detalhes',
      label: 'Detalhes',
      render: a => (
        <span className="text-xs text-muted break-words">
          {Object.entries(a.details || {})
            .map(([k, v]) => `${DETAIL_LABEL[k] || k}: ${detailValue(k, v)}`)
            .join(' · ')}
        </span>
      ),
      hideOnMobile: true,
    },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Auditoria" subtitle="Registro permanente de quem fez o quê e quando. Ninguém consegue apagar ou alterar." />
      <Select aria-label="Filtrar por tipo de ação" value={filter} onChange={e => (setFilter(e.target.value), setLimit(PAGE))} className="sm:w-80">
        <option value="">Todas as ações</option>
        {FILTERS.map(f => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </Select>
      {list.loading && !list.data.length ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : (
        <>
          <Table rows={list.data} columns={columns} empty={<EmptyState icon={<ShieldCheck className="w-5 h-5" />} title="Nenhum registro" />} />
          <LoadMore onClick={() => setLimit(l => l + PAGE)} loading={list.loading} done={list.data.length < limit} />
        </>
      )}
    </div>
  );
}
