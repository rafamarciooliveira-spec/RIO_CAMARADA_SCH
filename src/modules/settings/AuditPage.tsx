/** Trilha de auditoria (append-only): ações por identificador, sem dados pessoais em texto aberto. */
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
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
  'members.created': 'Cadastro criado',
  'members.applied': 'Proposta online',
  'members.fix_requested': 'Ajuste pedido',
  'members.renewed': 'Validade renovada',
  'card.downloaded': 'Carteirinha baixada',
  'roles.saved': 'Papel salvo',
  'roles.deleted': 'Papel apagado',
  'memberships.roles_set': 'Papéis de pessoa alterados',
  'memberships.revoked': 'Acesso removido',
  'invites.created': 'Convite criado',
  'invites.revoked': 'Convite cancelado',
  'tenant.updated': 'Sociedade alterada',
  'tenant.settings_updated': 'Configurações alteradas',
  'tenant.slug_changed': 'Endereço trocado',
  'notices.published': 'Aviso publicado',
  'notices.scheduled': 'Aviso agendado',
  'privacy.requested': 'Pedido de privacidade',
  'privacy.resolved': 'Pedido de privacidade respondido',
  'privacy.data_exported': 'Cópia dos dados baixada pelo titular',
  'privacy.retention_run': 'Rotina de retenção',
};

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
    { key: 'quem', label: 'Quem (id)', render: a => <code className="text-[11px] break-all">{a.actorUid === 'sistema' ? 'rotina automática' : a.actorUid}</code>, hideOnMobile: true },
    { key: 'alvo', label: 'Alvo (id)', render: a => <code className="text-[11px] break-all">{a.targetId || ''}</code>, hideOnMobile: true },
    {
      key: 'detalhes',
      label: 'Detalhes',
      render: a => (
        <span className="text-xs text-muted break-words">
          {Object.entries(a.details || {})
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
        </span>
      ),
      hideOnMobile: true,
    },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Auditoria" subtitle="Registro permanente de ações sensíveis. Mostra só identificadores, nunca dados pessoais." />
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
