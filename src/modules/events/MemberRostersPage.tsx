/** Escalas de trabalho na área do sócio: ver as escalas abertas, entrar e sair de um turno. */
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { ChevronLeft, Users } from 'lucide-react';
import { useDoc, useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { RosterDoc } from '../../shared/types.ts';
import { Badge, Card, EmptyState, Loading, Notice, PageHeader } from '../../ui/index.tsx';
import { missing, RosterBoard, type Roster } from './rosterShared.tsx';

export default function MemberRostersPage() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id" element={<Detail />} />
    </Routes>
  );
}

function List() {
  const t = useTenant();
  const list = useList<RosterDoc>(P.rosters(t.tenantId), { where: [['status', 'in', ['aberta', 'encerrada']]], orderBy: [['updatedAt', 'desc']], limit: 30 });
  return (
    <div className="space-y-4">
      <PageHeader title="Escalas de trabalho" subtitle="Escolha o dia, o horário e a função em que você pode ajudar." />
      {list.loading ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Users className="w-5 h-5" />} title="Nenhuma escala aberta" text={`Quando a ${t.labels.board.toLowerCase()} abrir uma escala de evento, ela aparece aqui.`} />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.data.map(r => {
            const d = [...new Set(r.slots.map(s => s.date))].sort();
            const left = missing(r.slots);
            return (
              <Link key={r.id} to={t.to(`escalas/${r.id}`)}>
                <Card className="h-full hover:border-muted space-y-1">
                  <div className="font-semibold">{r.title}</div>
                  {d.length > 0 && <div className="text-sm text-muted">{d.length === 1 ? formatDate(d[0]) : `${formatDate(d[0])} a ${formatDate(d[d.length - 1])}`}</div>}
                  <div className="flex gap-2 pt-1">
                    {r.status === 'encerrada' ? <Badge>Encerrada</Badge> : left ? <Badge tone="warn">Faltam {left} pessoas</Badge> : <Badge tone="ok">Completa</Badge>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail() {
  const t = useTenant();
  const { id = '' } = useParams();
  const doc = useDoc<RosterDoc>(P.roster(t.tenantId, id));
  if (doc.loading) return <Loading />;
  const r = doc.data && ['aberta', 'encerrada'].includes(doc.data.status) ? ({ ...doc.data, id } as Roster) : null;
  return (
    <div className="space-y-4">
      <Link to={t.to('escalas')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="w-4 h-4" /> Escalas
      </Link>
      {!r ? (
        <EmptyState title="Escala não encontrada" text="Ela pode ter sido encerrada ou apagada." />
      ) : (
        <>
          <PageHeader title={r.title} subtitle={r.eventName || undefined} />
          {r.description && <p className="text-sm whitespace-pre-line">{r.description}</p>}
          {r.status === 'encerrada' && <Notice>Esta escala está encerrada: as inscrições terminaram.</Notice>}
          {!t.membership && <Notice tone="warn">Entre no portal para se inscrever.</Notice>}
          <RosterBoard r={r} mode="socio" />
          <p className="text-xs text-muted">Organização: {[r.createdByName, ...r.editors.map(e => e.name)].join(', ')}. Quem organiza confirma os nomes.</p>
        </>
      )}
    </div>
  );
}
