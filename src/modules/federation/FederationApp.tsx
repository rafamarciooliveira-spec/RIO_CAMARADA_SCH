/**
 * Painel da diretoria da federação (/federacao/:slug): números por filial, transferências,
 * campeonato que soma as filiais e configurações. Nunca mostra dado pessoal de sócio.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRightLeft, LayoutDashboard, LogOut, Plus, Settings, Trophy } from 'lucide-react';
import { useOp, useSession } from '../../app/DataContext.tsx';
import { ThemeToggle } from '../../ui/ThemeToggle.tsx';
import { formatBRL } from '../../shared/money.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { formatValue } from '../../shared/rankings.ts';
import type { FedChampionshipDoc, FedTransferDoc } from '../../shared/types.ts';
import { Badge, Button, Card, cx, EmptyState, Field, Input, Loading, Modal, Notice, PageHeader, Select, Stat, Table, Textarea, Toggle } from '../../ui/index.tsx';

interface Branch {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  city: string;
  planId: string;
  members: { active: number; holders: number; dependents: number; pending: number; overdue: number; total: number };
  newThisMonth: number;
  finance: { overdueCents: number; monthInCents: number };
}

interface Dash {
  federation: { id: string; name: string; slug: string; networkCard: boolean; primaryColor: string; adminEmails: string[]; pricePerMemberCents: number };
  branches: Branch[];
  totals: { branches: number; active: number; holders: number; dependents: number; pending: number; overdue: number; newThisMonth: number };
  billing: { holders: number; pricePerMemberCents: number; monthlyCents: number };
}

type Tab = 'painel' | 'transferencias' | 'campeonatos' | 'config';

export default function FederationApp() {
  const { slug = '' } = useParams();
  const session = useSession();
  const { run } = useOp();
  const [dash, setDash] = useState<Dash | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('painel');
  const load = useCallback(async () => setDash((await run<Dash>('federation.dashboard', { slug }, { silent: true })) || null), [run, slug]);
  useEffect(() => {
    if (session.user) load();
  }, [session.user, load]);

  if (session.loading) return <Loading />;
  if (!session.user) {
    return (
      <div className="max-w-sm mx-auto p-6 space-y-4">
        <h1 className="text-xl font-bold">Painel da federação</h1>
        <Button className="w-full" onClick={() => session.signInGoogle()}>Entrar com a Conta Google</Button>
      </div>
    );
  }
  if (dash === undefined) return <Loading label="Carregando a federação..." />;
  if (dash === null) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-3">
        <Notice tone="bad">Esta conta não faz parte da diretoria desta federação.</Notice>
        <Link to="/entrar" className="text-sm text-accent">Ver os meus acessos</Link>
      </div>
    );
  }
  const f = dash.federation;
  const nav: { id: Tab; label: string; icon: typeof Trophy }[] = [
    { id: 'painel', label: 'Painel', icon: LayoutDashboard },
    { id: 'transferencias', label: 'Transferências', icon: ArrowRightLeft },
    { id: 'campeonatos', label: 'Campeonatos', icon: Trophy },
    { id: 'config', label: 'Configurações', icon: Settings },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line" style={{ borderTop: `4px solid ${f.primaryColor}` }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="font-display text-lg truncate">{f.name}</span>
          <Badge tone="brand">federação</Badge>
          <Link to="/entrar" className="text-xs text-muted hover:text-fg hidden sm:inline">Trocar de acesso</Link>
          <div className="flex-1" />
          <ThemeToggle />
          <button onClick={() => session.signOut()} aria-label="Sair" className="p-2 rounded-xl hover:bg-surface-2 cursor-pointer">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {nav.map(n => (
            <button key={n.id} type="button" onClick={() => setTab(n.id)} className={cx('flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 cursor-pointer', tab === n.id ? 'border-accent' : 'border-transparent text-muted')}>
              <n.icon className="w-4 h-4" />
              {n.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        {tab === 'painel' && <Panel dash={dash} />}
        {tab === 'transferencias' && <Transfers federationId={f.id} />}
        {tab === 'campeonatos' && <Championships federationId={f.id} />}
        {tab === 'config' && <Config dash={dash} onSaved={load} />}
      </main>
    </div>
  );
}

function Panel({ dash }: { dash: Dash }) {
  const t = dash.totals;
  return (
    <>
      <PageHeader title="Painel da federação" subtitle="Números de cada filial, somados. Os cadastros dos sócios ficam só com as filiais." />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Filiais" value={t.branches} />
        <Stat label="Sócios ativos" value={t.active} hint={`${t.holders} titulares e ${t.dependents} dependentes`} />
        <Stat label="Novos no mês" value={t.newThisMonth} tone="ok" />
        <Stat label="Em atraso" value={t.overdue} tone={t.overdue ? 'warn' : undefined} />
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Cobrança da federação (todas as filiais)</div>
          <div className="text-2xl font-semibold">{formatBRL(dash.billing.monthlyCents)} por mês</div>
          <div className="text-xs text-muted">
            {dash.billing.holders} titulares ativos × {formatBRL(dash.billing.pricePerMemberCents)}. Dependentes não contam.
          </div>
        </div>
      </Card>
      <Table
        rows={dash.branches}
        empty={<EmptyState title="Nenhuma filial ainda" text="A plataforma liga as sociedades à federação." />}
        columns={[
          { key: 'n', label: 'Filial', render: b => <div><div className="font-medium">{b.name}</div>{b.city && <div className="text-xs text-muted">{b.city}</div>}</div> },
          { key: 'a', label: 'Ativos', render: b => b.members.active, className: 'tabular-nums' },
          { key: 'h', label: 'Titulares', render: b => b.members.holders, className: 'tabular-nums', hideOnMobile: true },
          { key: 'p', label: 'Para aprovar', render: b => b.members.pending, className: 'tabular-nums', hideOnMobile: true },
          { key: 'o', label: 'Em atraso', render: b => (b.members.overdue ? <Badge tone="warn">{b.members.overdue}</Badge> : '0') },
          { key: 'f', label: 'Recebido no mês', render: b => formatBRL(b.finance.monthInCents), className: 'tabular-nums', hideOnMobile: true },
        ]}
      />
    </>
  );
}

function Transfers({ federationId }: { federationId: string }) {
  const { run } = useOp();
  const [rows, setRows] = useState<FedTransferDoc[] | null>(null);
  useEffect(() => {
    run<FedTransferDoc[]>('federation.transfers', { federationId }, { silent: true }).then(r => setRows(r || []));
  }, [run, federationId]);
  if (!rows) return <Loading />;
  const tone = (s: FedTransferDoc['status']) => (s === 'concluida' ? 'ok' : s === 'recusada' ? 'bad' : 'info');
  return (
    <>
      <PageHeader title="Transferências entre filiais" subtitle="A filial de origem pede e a de destino aprova. O sócio leva o tempo de casa e os dependentes." />
      <Table
        rows={rows}
        empty={<EmptyState title="Nenhuma transferência ainda" />}
        columns={[
          { key: 'm', label: 'Sócio', render: r => <div><div className="font-medium">{r.memberName}</div>{r.dependents > 0 && <div className="text-xs text-muted">+ {r.dependents} dependente(s)</div>}</div> },
          { key: 'de', label: 'De', render: r => r.fromTenantName },
          { key: 'para', label: 'Para', render: r => r.toTenantName },
          { key: 's', label: 'Situação', render: r => <Badge tone={tone(r.status)}>{r.status}</Badge> },
          { key: 'q', label: 'Pedida em', render: r => formatDateTime(r.requestedAt), hideOnMobile: true },
        ]}
      />
    </>
  );
}

const blankChamp = { name: '', season: String(new Date().getFullYear()), unit: 'pontos', higherIsBetter: true, aggregate: 'soma' as const, status: 'em_andamento' as const };

function Championships({ federationId }: { federationId: string }) {
  const { run, busy } = useOp();
  const [list, setList] = useState<FedChampionshipDoc[] | null>(null);
  const [edit, setEdit] = useState<(Omit<FedChampionshipDoc, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) | null>(null);
  const [open, setOpen] = useState<string>('');
  const [ranking, setRanking] = useState<{ rows: { key: string; position: number; participantName: string; total: number; stagesPlayed: number }[]; stages: { id: string; name: string; branch: string }[]; championship: FedChampionshipDoc } | null>(null);
  const reload = useCallback(async () => setList((await run<FedChampionshipDoc[]>('federation.championships', { federationId }, { silent: true })) || []), [run, federationId]);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (!open) return setRanking(null);
    run<NonNullable<typeof ranking>>('federation.ranking', { federationId, championshipId: open }, { silent: true }).then(r => setRanking(r || null));
  }, [open, run, federationId]);
  if (!list) return <Loading />;
  return (
    <>
      <PageHeader
        title="Campeonatos da federação"
        subtitle="Cada filial lança as etapas dela na própria competição e escolhe a qual campeonato ela vale. O ranking soma tudo."
        actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ ...blankChamp })}>Novo campeonato</Button>}
      />
      {list.length === 0 ? (
        <EmptyState title="Nenhum campeonato ainda" />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map(c => (
            <Card key={c.id} className={cx('cursor-pointer', open === c.id && 'border-accent')} onClick={() => setOpen(open === c.id ? '' : c.id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{c.name}</div>
                <Badge>{c.season}</Badge>
              </div>
              <div className="text-xs text-muted">{c.unit} · {c.higherIsBetter ? 'maior vence' : 'menor vence'} · {c.aggregate}</div>
              <button type="button" className="text-xs text-accent mt-2 cursor-pointer" onClick={e => (e.stopPropagation(), setEdit({ ...c }))}>Editar</button>
            </Card>
          ))}
        </div>
      )}
      {open && (
        <Card className="space-y-3">
          <div className="font-semibold">Ranking geral</div>
          {!ranking ? (
            <Loading />
          ) : ranking.rows.length === 0 ? (
            <Notice>Nenhuma filial lançou resultado ainda. Na filial: Competições e ranking, editar a competição, campo "Vale para o campeonato da federação".</Notice>
          ) : (
            <>
              <p className="text-xs text-muted">Etapas: {ranking.stages.map(s => `${s.name} (${s.branch})`).join(', ')}</p>
              <Table
                rows={ranking.rows.map(r => ({ ...r, id: r.key }))}
                columns={[
                  { key: 'p', label: 'Pos.', render: r => `${r.position}º` },
                  { key: 'n', label: 'Nome (filial)', render: r => r.participantName },
                  { key: 't', label: `Total (${ranking.championship.unit})`, render: r => formatValue(r.total, ranking.championship.unit), className: 'tabular-nums' },
                  { key: 'e', label: 'Etapas', render: r => r.stagesPlayed, className: 'tabular-nums' },
                ]}
              />
            </>
          )}
        </Card>
      )}
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? edit.name : 'Novo campeonato'}
          footer={<Button loading={busy} disabled={edit.name.trim().length < 3} onClick={async () => {
            const { id, ...data } = edit;
            const r = await run('federation.championshipSave', { federationId, ...(id ? { id } : {}), data: { ...data, name: data.name.trim() }, requestId: `champ_${id || 'novo'}_${Date.now()}` }, { success: 'Campeonato salvo.' });
            if (r) {
              setEdit(null);
              reload();
            }
          }}>Salvar</Button>}
        >
          <div className="space-y-3">
            <Field label="Nome" required>{id => <Input id={id} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Campeonato Estadual de Tiro" />}</Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Temporada">{id => <Input id={id} value={edit.season} onChange={e => setEdit({ ...edit, season: e.target.value })} />}</Field>
              <Field label="Unidade">{id => <Input id={id} value={edit.unit} onChange={e => setEdit({ ...edit, unit: e.target.value })} placeholder="pontos, pinos, tempo..." />}</Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Como somar as etapas">
                {id => (
                  <Select id={id} value={edit.aggregate} onChange={e => setEdit({ ...edit, aggregate: e.target.value as typeof edit.aggregate })}>
                    <option value="soma">Soma de todas</option>
                    <option value="media">Média</option>
                    <option value="melhores">Soma das melhores</option>
                  </Select>
                )}
              </Field>
              {edit.aggregate === 'melhores' && <Field label="Quantas etapas contam">{id => <Input id={id} type="number" min={1} value={edit.bestN || 3} onChange={e => setEdit({ ...edit, bestN: Math.max(1, Number(e.target.value) || 1) })} />}</Field>}
            </div>
            <Toggle label="Maior resultado vence" checked={edit.higherIsBetter} onChange={v => setEdit({ ...edit, higherIsBetter: v })} />
            <Field label="Situação">
              {id => (
                <Select id={id} value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value as typeof edit.status })}>
                  <option value="planejada">Planejado</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="encerrada">Encerrado</option>
                </Select>
              )}
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function Config({ dash, onSaved }: { dash: Dash; onSaved: () => void }) {
  const { run, busy } = useOp();
  const [networkCard, setNetworkCard] = useState(dash.federation.networkCard);
  const [emails, setEmails] = useState(dash.federation.adminEmails.join(', '));
  return (
    <>
      <PageHeader title="Configurações da federação" />
      <Card className="space-y-4">
        <Toggle label="Carteirinha de uma filial vale na portaria das outras" checked={networkCard} onChange={setNetworkCard} />
        <Field label="Diretoria da federação (e-mails das contas Google)" hint="Separe por vírgula. Quem está aqui vê este painel.">
          {id => <Textarea id={id} value={emails} onChange={e => setEmails(e.target.value)} />}
        </Field>
        <Button loading={busy} onClick={async () => {
          const list = emails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
          if (await run('federation.updateSettings', { federationId: dash.federation.id, networkCard, adminEmails: list }, { success: 'Configurações salvas.' })) onSaved();
        }}>
          Salvar
        </Button>
      </Card>
      <Notice>As filiais e o valor por titular são definidos pela plataforma.</Notice>
    </>
  );
}
