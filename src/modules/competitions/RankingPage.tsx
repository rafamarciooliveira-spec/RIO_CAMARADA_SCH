/**
 * Competições e ranking: lista de competições (torneios internos e etapas externas), destaque
 * "Minhas posições" do sócio logado e o detalhe de cada competição em /ranking/{id}.
 */
import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { Medal, Plus, Trophy } from 'lucide-react';
import { useData, useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatValue, memberPositions } from '../../shared/rankings.ts';
import type { CompetitionDoc, CompetitionResultDoc } from '../../shared/types.ts';
import type { WithId } from '../../data/client.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, SearchBox, Section, Select, Table, type Column } from '../../ui/index.tsx';
import { SCOPE, STATUS } from './common.ts';
import CompetitionDetail from './CompetitionDetail.tsx';
import CompetitionForm from './CompetitionForm.tsx';

export default function RankingPage() {
  return (
    <Routes>
      <Route index element={<CompetitionList />} />
      <Route path=":id" element={<CompetitionDetail />} />
    </Routes>
  );
}

/** Resultados de várias competições ao mesmo tempo (para "Minhas posições") */
function useResultsOf(ids: string[]): Record<string, CompetitionResultDoc[]> {
  const { client } = useData();
  const t = useTenant();
  const key = ids.join(',');
  const [map, setMap] = useState<Record<string, CompetitionResultDoc[]>>({});
  useEffect(() => {
    const list = key ? key.split(',') : [];
    const offs = list.map(id =>
      client.watchList<CompetitionResultDoc>(P.competitionResults(t.tenantId, id), { limit: 3000 }, rows => setMap(m => ({ ...m, [id]: rows })), () => setMap(m => ({ ...m, [id]: [] })))
    );
    return () => offs.forEach(off => off());
  }, [client, t.tenantId, key]);
  return map;
}

function MyPositions({ comps }: { comps: WithId<CompetitionDoc>[] }) {
  const t = useTenant();
  const navigate = useNavigate();
  const memberId = t.member?.id || '';
  const individual = comps.filter(c => c.format === 'individual' && c.status !== 'planejada').slice(0, 12);
  const results = useResultsOf(memberId ? individual.map(c => c.id) : []);
  const mine = useMemo(() => memberPositions(memberId, individual.map(c => ({ competition: c, results: results[c.id] || [] }))), [memberId, individual, results]);
  if (!memberId || !mine.length) return null;
  return (
    <Section title="Minhas posições">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map(p => {
          const c = comps.find(x => x.id === p.competitionId)!;
          return (
            <button
              key={`${p.competitionId}_${p.category}`}
              onClick={() => navigate(t.to(`ranking/${p.competitionId}`))}
              className="text-left bg-surface border border-line rounded-2xl p-4 hover:border-muted transition cursor-pointer flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex flex-col items-center justify-center shrink-0">
                <span className="text-lg font-bold leading-none tabular-nums">{p.position}º</span>
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.competitionName}</div>
                <div className="text-xs text-muted">
                  {p.category ? `${p.category} · ` : ''}de {p.of} · {formatValue(p.total, c.unit)} {c.unit === 'tempo' ? '' : c.unit} · {p.stagesPlayed} {p.stagesPlayed === 1 ? 'etapa' : 'etapas'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function CompetitionList() {
  const t = useTenant();
  const navigate = useNavigate();
  const [scope, setScope] = useState('');
  const [status, setStatus] = useState('');
  const [season, setSeason] = useState('');
  const [modality, setModality] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useList<CompetitionDoc>(P.competitions(t.tenantId), { orderBy: [['season', 'desc']], limit: 200 });
  const seasons = [...new Set(list.data.map(c => c.season))].sort().reverse();
  const modalities = [...new Set(list.data.map(c => c.modality || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const qn = q.trim().toLowerCase();
  const rows = list.data
    .filter(c => (!scope || c.scope === scope) && (!status || c.status === status) && (!season || c.season === season) && (!modality || c.modality === modality))
    .filter(c => !qn || `${c.name} ${c.organizer}`.toLowerCase().includes(qn));
  const columns: Column<WithId<CompetitionDoc>>[] = [
    {
      key: 'n',
      label: 'Competição',
      render: c => (
        <div className="min-w-0">
          <div className="font-medium truncate">{c.name}</div>
          <div className="text-xs text-muted truncate">
            {[c.modality, c.kind || SCOPE[c.scope]].filter(Boolean).join(' · ')}
            {c.organizer ? ` · ${c.organizer}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'f', label: 'Formato', render: c => (c.format === 'times' ? 'Times' : 'Individual'), hideOnMobile: true },
    { key: 't', label: 'Temporada', render: c => c.season, hideOnMobile: true },
    { key: 'e', label: 'Etapas', render: c => c.stages.length, hideOnMobile: true },
    { key: 's', label: 'Situação', render: c => <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Competições e ranking"
        subtitle="Torneios da casa e etapas de ligas e federações, com o ranking de cada uma."
        actions={
          t.can('competicoes', 'criar') && (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
              Nova competição
            </Button>
          )
        }
      />
      {!list.loading && !list.error && <MyPositions comps={list.data} />}
      <Section title="Competições">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar competição" />
          <Select aria-label="Filtrar por tipo" value={scope} onChange={e => setScope(e.target.value)} className="sm:w-48">
            <option value="">Internas e externas</option>
            <option value="interno">Torneios internos</option>
            <option value="externo">Etapas externas</option>
          </Select>
          {modalities.length > 1 && (
            <Select aria-label="Filtrar por modalidade" value={modality} onChange={e => setModality(e.target.value)} className="sm:w-48">
              <option value="">Todas as modalidades</option>
              {modalities.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label="Filtrar por situação" value={status} onChange={e => setStatus(e.target.value)} className="sm:w-44">
            <option value="">Todas as situações</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          {seasons.length > 1 && (
            <Select aria-label="Filtrar por temporada" value={season} onChange={e => setSeason(e.target.value)} className="sm:w-40">
              <option value="">Todas as temporadas</option>
              {seasons.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </div>
        {list.error ? (
          <ErrorState text={list.error} />
        ) : list.loading ? (
          <Loading />
        ) : (
          <Table
            rows={rows}
            columns={columns}
            onRowClick={c => navigate(t.to(`ranking/${c.id}`))}
            empty={
              <EmptyState
                icon={<Trophy className="w-5 h-5" />}
                title={list.data.length ? 'Nenhuma competição com esses filtros' : 'Nenhuma competição ainda'}
                text={list.data.length ? 'Tire algum filtro para ver as demais.' : 'Cadastre o torneio da casa ou as etapas da liga para começar o ranking.'}
              />
            }
          />
        )}
      </Section>
      {!t.member && !t.can('competicoes', 'editar') && (
        <Card className="flex items-center gap-3 text-sm text-muted">
          <Medal className="w-4 h-4 shrink-0" aria-hidden />
          Quando seu cadastro de sócio estiver vinculado, suas posições aparecem aqui.
        </Card>
      )}
      {creating && <CompetitionForm onClose={() => setCreating(false)} onSaved={id => navigate(t.to(`ranking/${id}`))} />}
    </div>
  );
}
