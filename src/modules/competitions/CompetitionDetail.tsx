/**
 * Detalhe de uma competição. Individual: ranking geral (pódio, total, etapas) e por etapa, com
 * filtro de categoria. Times: classificação e jogos por rodada. Quem pode editar lança
 * resultados, placares, edita e encerra. Exporta em CSV e PDF.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Award, ClipboardList, FileDown, FileText, Medal, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import { aggregateLabel, formatValue, hasScore, normName, overallRanking, stageRanking, teamStandings, type OverallRow, type StageRankRow, type TeamRow } from '../../shared/rankings.ts';
import type { CompetitionDoc, CompetitionMatchDoc, CompetitionResultDoc, OrgChartDoc, TenantDoc } from '../../shared/types.ts';
import type { WithId } from '../../data/client.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Notice, Section, Select, Table, Tabs, cx, useConfirm, type Column } from '../../ui/index.tsx';
import { SCOPE, STATUS, overallCsv, overallPdf, stageCsv, stageName, stagePdf, tableCsv, tablePdf } from './common.ts';
import CompetitionForm from './CompetitionForm.tsx';
import ResultsForm, { suggestedStage } from './ResultsForm.tsx';
import MatchForm from './MatchForm.tsx';

const MEDAL = ['text-[#d4a64a]', 'text-[#9ca3af]', 'text-[#b4703d]'];

function unitSuffix(unit: string): string {
  return unit === 'tempo' ? '' : ` ${unit}`;
}

export default function CompetitionDetail() {
  const { id = '' } = useParams();
  const t = useTenant();
  const navigate = useNavigate();
  const comp = useDoc<CompetitionDoc>(P.competition(t.tenantId, id));
  const back = () => navigate(t.to('ranking'));
  if (comp.loading) return <Loading />;
  if (comp.error) return <ErrorState text={comp.error} />;
  if (!comp.data)
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={back}>
          Competições
        </Button>
        <ErrorState text="Competição não encontrada." />
      </div>
    );
  return <Detail c={comp.data} onBack={back} />;
}

function Detail({ c, onBack }: { c: WithId<CompetitionDoc>; onBack: () => void }) {
  const t = useTenant();
  const op = useOp();
  const confirm = useConfirm();
  const canEdit = t.can('competicoes', 'editar');
  const results = useList<CompetitionResultDoc>(c.format === 'individual' ? P.competitionResults(t.tenantId, c.id) : null, { limit: 5000 });
  const matches = useList<CompetitionMatchDoc>(c.format === 'times' ? P.competitionMatches(t.tenantId, c.id) : null, { limit: 2000 });
  const [editing, setEditing] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [matchEdit, setMatchEdit] = useState<WithId<CompetitionMatchDoc> | 'new' | null>(null);
  const hasData = results.data.length > 0 || matches.data.length > 0;

  const setStatus = async (status: CompetitionDoc['status']) => {
    if (status === 'encerrada') {
      const ok = await confirm({ title: 'Encerrar competição', text: 'O ranking fica congelado e ninguém lança novos resultados. Dá para reabrir depois.', confirmLabel: 'Encerrar' });
      if (!ok) return;
    }
    await op.run('competitions.setStatus', { tenantId: t.tenantId, id: c.id, status }, { success: status === 'encerrada' ? 'Competição encerrada.' : 'Competição reaberta.' });
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Apagar competição', text: `"${c.name}" será apagada. Só é possível enquanto não houver resultados.`, confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    const r = await op.run('competitions.delete', { tenantId: t.tenantId, id: c.id }, { success: 'Competição apagada.' });
    if (r) onBack();
  };

  const closed = c.status === 'encerrada';
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
        Competições
      </Button>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
            <Badge tone="brand">{SCOPE[c.scope]}</Badge>
            <Badge>Temporada {c.season}</Badge>
            {c.publicRanking && <Badge tone="info">Ranking público</Badge>}
          </div>
          <p className="text-sm text-muted mt-2">
            {c.organizer ? `${c.organizer} · ` : ''}
            {c.format === 'times'
              ? `Vitória ${c.pointsWin}, empate ${c.pointsDraw}, derrota ${c.pointsLoss} ponto(s)`
              : `${aggregateLabel(c)} · ${c.higherIsBetter ? 'maior' : 'menor'} ${c.unit === 'tempo' ? 'tempo' : 'valor'} vence · unidade: ${c.unit}`}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {!closed && c.format === 'individual' && (
              <Button size="sm" icon={<ClipboardList className="w-4 h-4" />} onClick={() => setLaunching(suggestedStage(c, results.data))} disabled={!c.stages.length}>
                Lançar resultados
              </Button>
            )}
            {!closed && c.format === 'times' && (
              <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setMatchEdit('new')} disabled={c.teams.length < 2}>
                Novo jogo
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(true)}>
              Editar
            </Button>
            {closed ? (
              <Button size="sm" variant="secondary" onClick={() => setStatus('em_andamento')} loading={op.busy}>
                Reabrir
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setStatus('encerrada')} loading={op.busy}>
                Encerrar
              </Button>
            )}
            {!hasData && !results.loading && !matches.loading && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={remove} aria-label="Apagar competição" />
            )}
          </div>
        )}
      </div>
      {canEdit && !c.stages.length && c.format === 'individual' && <Notice tone="info">Cadastre as etapas em Editar para começar a lançar os resultados.</Notice>}
      {canEdit && c.format === 'times' && c.teams.length < 2 && <Notice tone="info">Cadastre os times em Editar para lançar os jogos.</Notice>}

      {c.format === 'individual' ? (
        results.error ? <ErrorState text={results.error} /> : results.loading ? <Loading /> : <IndividualView c={c} results={results.data} onEditStage={canEdit && !closed ? s => setLaunching(s) : undefined} />
      ) : matches.error ? (
        <ErrorState text={matches.error} />
      ) : matches.loading ? (
        <Loading />
      ) : (
        <TeamsView c={c} matches={matches.data} onEditMatch={canEdit && !closed ? m => setMatchEdit(m) : undefined} />
      )}

      {editing && <CompetitionForm competition={c} hasResults={hasData} onClose={() => setEditing(false)} />}
      {launching !== null && <ResultsForm competition={c} results={results.data} initialStage={launching || undefined} onClose={() => setLaunching(null)} />}
      {matchEdit && <MatchForm competition={c} match={matchEdit === 'new' ? undefined : matchEdit} onClose={() => setMatchEdit(null)} />}
    </div>
  );
}

function ExportButtons({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" icon={<FileDown className="w-4 h-4" />} onClick={onCsv}>
        CSV
      </Button>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        icon={<FileText className="w-4 h-4" />}
        onClick={async () => {
          setBusy(true);
          try {
            await onPdf();
          } finally {
            setBusy(false);
          }
        }}
      >
        PDF
      </Button>
    </div>
  );
}

function Podium({ rows, unit }: { rows: OverallRow[]; unit: string }) {
  const t = useTenant();
  const top = rows.filter(r => r.position <= 3).slice(0, 3);
  if (!top.length) return null;
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="Pódio">
      {top.map((r, i) => (
        <li key={r.key}>
          <Card className={cx('flex items-center gap-3', i === 0 && 'border-accent/60 bg-accent/5', r.memberId && r.memberId === t.member?.id && 'ring-2 ring-accent')}>
            <Medal className={cx('w-8 h-8 shrink-0', MEDAL[r.position - 1] || 'text-muted')} aria-hidden />
            <div className="min-w-0">
              <div className="text-xs text-muted">{r.position}º lugar</div>
              <div className="font-semibold truncate">{r.participantName}</div>
              <div className="text-sm tabular-nums">
                {formatValue(r.total, unit)}
                {unitSuffix(unit)}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/** Um certificado para cada um dos três primeiros (empates entram juntos) */
async function podiumCertificates(tenant: TenantDoc, c: CompetitionDoc, rows: OverallRow[], chart: OrgChartDoc | null, category?: string) {
  const { certificatePdf, presidentSigner } = await import('../../app/pdf.ts');
  const today = formatDate(new Date().toISOString(), tenant.timezone);
  const items = rows
    .filter(r => r.position <= 3)
    .map(r => ({
      title: `Certificado de ${r.position}º lugar`,
      name: r.participantName,
      text: `conquistou o ${r.position}º lugar em ${c.name}${category || r.category ? `, categoria ${category || r.category}` : ''}, temporada ${c.season}, com ${formatValue(r.total, c.unit)}${c.unit === 'tempo' ? '' : ` ${c.unit}`}.`,
      date: today,
      signers: [presidentSigner(chart)],
    }));
  await certificatePdf(tenant, items, `certificados-${c.name.replace(/\W+/g, '-').toLowerCase()}.pdf`);
}

function IndividualView({ c, results, onEditStage }: { c: WithId<CompetitionDoc>; results: CompetitionResultDoc[]; onEditStage?: (stageId: string) => void }) {
  const t = useTenant();
  const [tab, setTab] = useState<'geral' | 'etapa'>('geral');
  const [category, setCategory] = useState(() => c.categories[0] || '');
  const stagesWith = c.stages.filter(s => results.some(r => r.stageId === s.id));
  const [stageId, setStageId] = useState(() => stagesWith[stagesWith.length - 1]?.id || c.stages[0]?.id || '');
  const cat = c.categories.some(x => normName(x) === normName(category)) ? category : '';
  const overall = useMemo(() => overallRanking(results, c, { category: cat || undefined }), [results, c, cat]);
  const stageRows = useMemo(() => stageRanking(results, c, stageId, { category: cat || undefined }), [results, c, stageId, cat]);
  const me = t.member?.id;
  const mine = me ? overall.filter(r => r.memberId === me) : [];
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));

  if (!results.length) {
    return <EmptyState icon={<Trophy className="w-5 h-5" />} title="Nenhum resultado lançado" text={onEditStage ? 'Use Lançar resultados para registrar a última etapa.' : 'Os resultados aparecem aqui assim que a diretoria lançar a primeira etapa.'} />;
  }

  const highlight = (r: { memberId?: string }) => !!me && r.memberId === me;
  const showCat = c.categories.length > 0 && !cat;
  const overallCols: Column<OverallRow & { id: string }>[] = [
    { key: 'p', label: 'Pos.', render: r => <span className="font-bold tabular-nums">{r.position}º</span>, className: 'w-12' },
    {
      key: 'n',
      label: 'Nome',
      render: r => (
        <div className="min-w-0">
          <div className={cx('truncate', highlight(r) && 'font-bold text-accent')}>
            {r.participantName}
            {highlight(r) && <span className="sr-only"> (você)</span>}
          </div>
          {showCat && <div className="text-xs text-muted">{r.category || 'Sem categoria'}</div>}
          {r.discarded.length > 0 && <div className="text-[11px] text-muted">Descartadas: {r.discarded.map(s => stageName(c, s)).join(', ')}</div>}
        </div>
      ),
    },
    { key: 't', label: 'Total', render: r => <span className="tabular-nums font-semibold">{formatValue(r.total, c.unit)}</span>, className: 'text-right' },
    { key: 'e', label: 'Etapas', render: r => <span className="tabular-nums">{r.stagesPlayed}</span>, className: 'text-right' },
    ...c.stages
      .filter(s => stagesWith.some(x => x.id === s.id))
      .map(s => ({
        key: `s_${s.id}`,
        label: s.name,
        hideOnMobile: true,
        className: 'text-right',
        render: (r: OverallRow) => (
          <span className={cx('tabular-nums', r.discarded.includes(s.id) && 'line-through text-muted')}>{r.perStage[s.id] === undefined ? '' : formatValue(r.perStage[s.id], c.unit)}</span>
        ),
      })),
  ];
  const stageCols: Column<StageRankRow & { id: string }>[] = [
    { key: 'p', label: 'Pos.', render: r => <span className="font-bold tabular-nums">{r.position}º</span>, className: 'w-12' },
    { key: 'n', label: 'Nome', render: r => <span className={cx(highlight(r) && 'font-bold text-accent')}>{r.participantName}</span> },
    ...(showCat ? [{ key: 'c', label: 'Categoria', render: (r: StageRankRow) => r.category, hideOnMobile: true }] : []),
    { key: 'v', label: c.unit === 'tempo' ? 'Tempo' : 'Resultado', render: r => <span className="tabular-nums font-semibold">{formatValue(r.value, c.unit)}</span>, className: 'text-right' },
  ];
  const st = c.stages.find(s => s.id === stageId);

  return (
    <div className="space-y-4">
      {mine.length > 0 && (
        <Notice tone="ok">
          {mine.map(r => (
            <span key={r.key} className="block">
              Você está em <strong>{r.position}º</strong>
              {r.category ? ` na categoria ${r.category}` : ''} com {formatValue(r.total, c.unit)}
              {unitSuffix(c.unit)} em {r.stagesPlayed} {r.stagesPlayed === 1 ? 'etapa' : 'etapas'}.
            </span>
          ))}
        </Notice>
      )}
      <Tabs
        tabs={[
          { id: 'geral', label: 'Ranking geral' },
          { id: 'etapa', label: 'Por etapa', count: stagesWith.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {c.categories.length > 0 && (
            <Select aria-label="Categoria" value={cat} onChange={e => setCategory(e.target.value)} className="sm:w-48">
              <option value="">Todas as categorias</option>
              {c.categories.map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          )}
          {tab === 'etapa' && (
            <Select aria-label="Etapa" value={stageId} onChange={e => setStageId(e.target.value)} className="sm:w-56">
              {c.stages.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {results.some(r => r.stageId === s.id) ? '' : ' (sem resultados)'}
                </option>
              ))}
            </Select>
          )}
        </div>
        {tab === 'geral' ? (
          <div className="flex flex-wrap gap-2">
            <ExportButtons onCsv={() => overallCsv(c, overall)} onPdf={() => overallPdf(t.tenant, c, overall, cat || undefined)} />
            {onEditStage && overall.length > 0 && (
              <Button size="sm" variant="secondary" icon={<Award className="w-4 h-4" />} onClick={() => podiumCertificates(t.tenant, c, overall, chart.data, cat)}>
                Certificados do pódio
              </Button>
            )}
          </div>
        ) : (
          <ExportButtons onCsv={() => stageCsv(c, stageId, stageRows)} onPdf={() => stagePdf(t.tenant, c, stageId, stageRows)} />
        )}
      </div>
      {tab === 'geral' ? (
        <>
          {(cat || !c.categories.length) && <Podium rows={overall} unit={c.unit} />}
          <Table rows={overall.map(r => ({ ...r, id: r.key }))} columns={overallCols} empty={<EmptyState title="Ninguém nesta categoria ainda" />} />
        </>
      ) : (
        <>
          {st && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>
                {st.date ? formatDate(st.date) : 'Sem data'}
                {st.location ? ` · ${st.location}` : ''}
              </span>
              {onEditStage && (
                <Button size="sm" variant="ghost" icon={<Pencil className="w-4 h-4" />} onClick={() => onEditStage(st.id)}>
                  Corrigir esta etapa
                </Button>
              )}
            </div>
          )}
          <Table rows={stageRows.map(r => ({ ...r, id: r.key }))} columns={stageCols} empty={<EmptyState title="Etapa sem resultados" text={onEditStage ? 'Lance os resultados desta etapa.' : undefined} />} />
        </>
      )}
    </div>
  );
}

function TeamsView({ c, matches, onEditMatch }: { c: WithId<CompetitionDoc>; matches: WithId<CompetitionMatchDoc>[]; onEditMatch?: (m: WithId<CompetitionMatchDoc>) => void }) {
  const t = useTenant();
  const [tab, setTab] = useState<'tabela' | 'jogos'>('tabela');
  const table = useMemo(() => teamStandings(matches, c), [matches, c]);
  const team = (id: string) => c.teams.find(x => x.id === id)?.name || 'Time removido';
  const played = matches.filter(hasScore).length;
  const cols: Column<TeamRow & { id: string }>[] = [
    { key: 'p', label: 'Pos.', render: r => <span className="font-bold tabular-nums">{r.position}º</span>, className: 'w-12' },
    { key: 'n', label: 'Time', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'pts', label: 'P', render: r => <span className="font-bold tabular-nums">{r.points}</span>, className: 'text-right' },
    { key: 'j', label: 'J', render: r => r.played, className: 'text-right tabular-nums' },
    { key: 'v', label: 'V', render: r => r.wins, className: 'text-right tabular-nums' },
    { key: 'e', label: 'E', render: r => r.draws, className: 'text-right tabular-nums', hideOnMobile: true },
    { key: 'd', label: 'D', render: r => r.losses, className: 'text-right tabular-nums', hideOnMobile: true },
    { key: 'gp', label: 'GP', render: r => r.goalsFor, className: 'text-right tabular-nums', hideOnMobile: true },
    { key: 'gc', label: 'GC', render: r => r.goalsAgainst, className: 'text-right tabular-nums', hideOnMobile: true },
    { key: 'sg', label: 'SG', render: r => (r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff), className: 'text-right tabular-nums' },
  ];
  // Jogos agrupados por rodada, na ordem das rodadas cadastradas
  const groups = [...c.stages.map(s => ({ id: s.id, name: s.name })), { id: '', name: 'Sem rodada' }]
    .map(g => ({ ...g, list: matches.filter(m => (m.stageId || '') === g.id && (g.id === '' || c.stages.some(s => s.id === m.stageId))).sort((a, b) => (a.date || '').localeCompare(b.date || '')) }))
    .map(g => (g.id === '' ? { ...g, list: matches.filter(m => !m.stageId || !c.stages.some(s => s.id === m.stageId)) } : g))
    .filter(g => g.list.length);

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'tabela', label: 'Classificação' },
          { id: 'jogos', label: 'Jogos', count: matches.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'tabela' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {played} {played === 1 ? 'jogo disputado' : 'jogos disputados'}. Critérios: pontos, vitórias, saldo, gols pró, confronto direto.
            </p>
            <ExportButtons onCsv={() => tableCsv(c, table)} onPdf={() => tablePdf(t.tenant, c, table)} />
          </div>
          <Table rows={table.map(r => ({ ...r, id: r.teamId }))} columns={cols} empty={<EmptyState title="Nenhum time cadastrado" />} />
        </>
      ) : !groups.length ? (
        <EmptyState icon={<Trophy className="w-5 h-5" />} title="Nenhum jogo cadastrado" text={onEditMatch ? 'Use Novo jogo para montar a tabela.' : undefined} />
      ) : (
        groups.map(g => (
          <Section key={g.id || 'sem'} title={g.name}>
            <ul className="space-y-2">
              {g.list.map(m => {
                const Tag = onEditMatch ? 'button' : 'div';
                return (
                  <li key={m.id}>
                    <Tag
                      {...(onEditMatch ? { onClick: () => onEditMatch(m), type: 'button' as const } : {})}
                      className={cx('w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-surface border border-line rounded-2xl px-4 py-3 text-sm', onEditMatch && 'hover:border-muted cursor-pointer')}
                    >
                      <span className="text-right font-medium truncate">{team(m.homeTeamId)}</span>
                      <span className="tabular-nums font-bold text-base px-2" aria-label={hasScore(m) ? `${m.homeScore} a ${m.awayScore}` : 'a disputar'}>
                        {hasScore(m) ? `${m.homeScore} x ${m.awayScore}` : 'x'}
                      </span>
                      <span className="text-left font-medium truncate">{team(m.awayTeamId)}</span>
                      {(m.date || m.location) && (
                        <span className="col-span-3 text-center text-xs text-muted">
                          {m.date ? formatDate(m.date) : ''}
                          {m.date && m.location ? ' · ' : ''}
                          {m.location || ''}
                        </span>
                      )}
                    </Tag>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))
      )}
    </div>
  );
}
