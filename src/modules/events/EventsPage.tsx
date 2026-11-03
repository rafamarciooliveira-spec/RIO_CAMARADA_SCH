/** Eventos e projetos da diretoria: lista e detalhe (dados, orçamento, ingressos, convidados, equipe, patrocínios, relatório). */
import { useState } from 'react';
import { Plus, Ticket } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { EventDoc } from '../../shared/types.ts';
import { Badge, Button, EmptyState, ErrorState, Loading, PageHeader, Select, Table, type Column } from '../../ui/index.tsx';
import EventDetail, { EVENT_STATUS } from './EventDetail.tsx';

export default function EventsPage() {
  const t = useTenant();
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useList<EventDoc>(P.events(t.tenantId), { orderBy: [['start', 'desc']], limit: 200 });
  if (openId !== null) return <EventDetail id={openId || undefined} onBack={() => setOpenId(null)} onCreated={id => setOpenId(id)} />;
  const rows = list.data.filter(e => !status || e.status === status);
  const columns: Column<EventDoc & { id: string }>[] = [
    {
      key: 'n',
      label: 'Nome',
      render: e => (
        <div className="min-w-0">
          <div className="font-medium truncate">{e.name}</div>
          <div className="text-xs text-muted">{e.kind === 'projeto' ? 'Projeto' : 'Evento'} · {e.location}</div>
        </div>
      ),
    },
    { key: 'd', label: 'Início', render: e => formatDateTime(e.start, t.tenant.timezone), hideOnMobile: true },
    { key: 'p', label: 'Presenças', render: e => `${e.rsvpCount || 0} / ${e.checkinCount || 0}`, hideOnMobile: true },
    { key: 's', label: 'Situação', render: e => <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge> },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Eventos e projetos"
        subtitle="Orçamento x realizado, ingressos, convidados, equipe e relatório."
        actions={
          t.can('eventos', 'criar') && (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setOpenId('')}>
              Novo evento ou projeto
            </Button>
          )
        }
      />
      <Select aria-label="Filtrar por situação" value={status} onChange={e => setStatus(e.target.value)} className="sm:w-56">
        <option value="">Todas as situações</option>
        {Object.entries(EVENT_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading ? (
        <Loading />
      ) : (
        <Table rows={rows} columns={columns} onRowClick={e => setOpenId(e.id)} empty={<EmptyState icon={<Ticket className="w-5 h-5" />} title="Nenhum evento" text="Crie o primeiro evento ou projeto da sociedade." />} />
      )}
    </div>
  );
}
