/** Eventos abertos para o sócio, com confirmação de presença. */
import { CalendarDays, MapPin } from 'lucide-react';
import { useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { EventDoc, EventGuestDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader } from '../../ui/index.tsx';
import MemberSurveys from '../culture/MemberSurveys.tsx';

export default function MemberEventsPage() {
  const t = useTenant();
  const list = useList<EventDoc>(P.events(t.tenantId), { where: [['status', 'in', ['planejamento', 'confirmado']]], orderBy: [['start', 'asc']], limit: 100 });
  const now = new Date().toISOString();
  const upcoming = list.data.filter(e => (e.end || e.start) >= now);
  return (
    <div className="space-y-4">
      <PageHeader title="Eventos" subtitle="Programação da sociedade. Confirme presença para a organização se planejar." />
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading ? (
        <Loading />
      ) : upcoming.length === 0 ? (
        <EmptyState icon={<CalendarDays className="w-5 h-5" />} title="Nenhum evento programado" text="Quando a diretoria publicar um evento, ele aparece aqui." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {upcoming.map(e => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      )}
      <MemberSurveys />
    </div>
  );
}

function EventCard({ e }: { e: EventDoc & { id: string } }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const memberId = t.member?.id;
  const session = useSession();
  // Convidados: o sócio só lê a própria linha (where uid == próprio, como exige a regra)
  const guest = useList<EventGuestDoc>(memberId && session.user ? P.eventGuests(t.tenantId, e.id) : null, { where: [['uid', '==', session.user?.uid || '-']], limit: 1 });
  const going = guest.data.length > 0;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{e.name}</h2>
        {e.status === 'confirmado' ? <Badge tone="ok">Confirmado</Badge> : <Badge tone="info">Em planejamento</Badge>}
      </div>
      <div className="text-sm text-muted space-y-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 shrink-0" aria-hidden /> {formatDateTime(e.start, t.tenant.timezone)}
        </div>
        {e.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 shrink-0" aria-hidden /> {e.location}
          </div>
        )}
      </div>
      {e.description && <p className="text-sm line-clamp-4 whitespace-pre-line">{e.description}</p>}
      {e.rsvpEnabled && memberId ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{e.rsvpCount || 0} confirmado(s)</span>
          <Button
            size="sm"
            variant={going ? 'secondary' : 'primary'}
            loading={busy}
            aria-pressed={going}
            onClick={() => run('events.rsvp', { tenantId: t.tenantId, eventId: e.id, going: !going }, { success: going ? 'Presença cancelada.' : 'Presença confirmada.' })}
          >
            {going ? 'Cancelar presença' : 'Vou participar'}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
