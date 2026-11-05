/**
 * Prestação de contas da tesouraria: monta pelo livro caixa (mês, período ou evento),
 * mostra a prévia igual ao que os sócios vão ver, baixa o PDF e publica no quadro de avisos.
 */
import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Plus, Send, Trash2 } from 'lucide-react';
import { useData, useDoc, useList, useOp, useSession } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { todayIn } from '../../../app/formHelpers.ts';
import { P } from '../../../shared/paths.ts';
import { formatDate } from '../../../shared/dates.ts';
import { accountsOpenedAt } from '../../../shared/finance/reports.ts';
import { accPeriodLabel, buildAccountability, GROUPING_LABEL, monthsBetween, type AccGrouping } from '../../../shared/finance/accountability.ts';
import type { AccountabilityDoc, LedgerEntryDoc, MemberDoc, OrgChartDoc, PeriodDoc } from '../../../shared/types.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Notice, Section, Select, Table, Textarea, Toggle } from '../../../ui/index.tsx';
import { useFinanceCatalog } from '../common.tsx';
import { AccountabilityActions, AccountabilityView } from '../AccountabilityView.tsx';

type Signer = { name: string; role: string; uid?: string };

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const lastDay = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

export default function AccountabilityTab() {
  const t = useTenant();
  const list = useList<AccountabilityDoc>(P.accountabilities(t.tenantId), { orderBy: [['publishedAt', 'desc']], limit: 60 });
  const [open, setOpen] = useState<AccountabilityDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const canPublish = t.can('financeiro', 'editar');
  return (
    <div className="space-y-5">
      <Card className="flex flex-col sm:flex-row sm:items-center gap-3">
        <FileBarChart className="w-8 h-8 text-brand shrink-0" aria-hidden />
        <div className="flex-1">
          <div className="font-semibold">Prestação de contas para os sócios</div>
          <p className="text-sm text-muted">Do mês, de um período ou de uma festa ou evento. Os números saem do livro caixa: histórico com entradas e saídas, saldo anterior e atual e onde o dinheiro está guardado (banco, poupança, aplicação, caixa). Publique no quadro de avisos, baixe o PDF ou mande pelo WhatsApp.</p>
        </div>
        {canPublish && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
            Nova prestação de contas
          </Button>
        )}
      </Card>
      {(!t.tenant.legal?.cnpj || !t.tenant.legal?.address) && canPublish && (
        <Notice>Para sair com CNPJ e endereço no cabeçalho, preencha em Configurações, "Dados para documentos".</Notice>
      )}
      <Section title="Publicadas">
        {list.loading ? (
          <Loading />
        ) : (
          <Table
            rows={list.data}
            onRowClick={setOpen}
            empty={<EmptyState icon={<FileBarChart className="w-5 h-5" />} title="Nenhuma prestação de contas publicada" />}
            columns={[
              { key: 'p', label: 'Período ou evento', render: a => <span className="font-medium">{a.periodLabel}</span> },
              { key: 's', label: 'Saldo atual ou resultado', className: 'text-right', render: a => fmt(a.kind === 'periodo' ? a.report.closingCents : a.report.resultCents) },
              { key: 'a', label: 'Assinaturas', hideOnMobile: true, render: a => `${a.signatures.length} de ${a.signers.filter(s => s.uid).length}` },
              { key: 'd', label: 'Publicada', hideOnMobile: true, render: a => formatDate(a.publishedAt, t.tenant.timezone) },
              { key: 'st', label: '', render: a => (a.status === 'retirado' ? <Badge tone="bad">Retirada</Badge> : a.audience === 'socios' ? <Badge tone="ok">Para os sócios</Badge> : <Badge>Só diretoria</Badge>) },
            ]}
          />
        )}
      </Section>
      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.title} size="lg" footer={<AccountabilityActions a={list.data.find(x => x.id === open.id) || open} />}>
          <AccountabilityView a={list.data.find(x => x.id === open.id) || open} />
        </Modal>
      )}
      {creating && <Builder onClose={() => setCreating(false)} />}
    </div>
  );
}

function Builder({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const session = useSession();
  const { client } = useData();
  const { run, busy } = useOp();
  const cat = useFinanceCatalog();
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const today = todayIn(t.tenant.timezone);
  const prevMonth = (() => {
    const [y, m] = today.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  const [kind, setKind] = useState<'periodo' | 'evento'>('periodo');
  const [mode, setMode] = useState<'mes' | 'intervalo'>('mes');
  const [month, setMonth] = useState(prevMonth);
  const [from, setFrom] = useState(`${prevMonth}-01`);
  const [to, setTo] = useState(lastDay(prevMonth));
  const [cc, setCc] = useState('');
  const [grouping, setGrouping] = useState<AccGrouping>('historico');
  const [notes, setNotes] = useState('');
  const [audience, setAudience] = useState<'socios' | 'diretoria'>('socios');
  const [postNotice, setPostNotice] = useState(true);
  const [signers, setSigners] = useState<Signer[] | null>(null);
  const [title, setTitle] = useState('');

  const range = kind === 'periodo' ? (mode === 'mes' ? { from: `${month}-01`, to: lastDay(month) } : { from, to }) : { from: '2000-01-01', to: '2999-12-31' };
  const center = cat.costCenters.data.find(c => c.id === cc);
  const ledger = useList<LedgerEntryDoc>(
    P.ledger(t.tenantId),
    kind === 'periodo' ? { where: [['periodKey', '>=', range.from.slice(0, 7)]], orderBy: [['periodKey', 'asc'], ['number', 'asc']] } : cc ? { where: [['costCenterId', '==', cc]] } : { where: [['costCenterId', '==', '__nenhum__']] }
  );
  // Lançamentos ligados ao evento sem o centro de custo (o servidor junta do mesmo jeito)
  const byEvent = useList<LedgerEntryDoc>(kind === 'evento' && center?.refId ? P.ledger(t.tenantId) : null, { where: [['eventId', '==', center?.refId || '']] });
  const entries = useMemo(() => {
    if (kind !== 'evento' || !byEvent.data.length) return ledger.data;
    const seen = new Map(ledger.data.map(e => [e.id, e]));
    for (const e of byEvent.data) seen.set(e.id, e);
    return [...seen.values()];
  }, [kind, ledger.data, byEvent.data]);
  const periods = useList<PeriodDoc>(P.periods(t.tenantId), { where: [['closed', '==', true]], limit: 200 });

  const months = useMemo(() => {
    const out: string[] = [];
    const [y, m] = today.split('-').map(Number);
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, [today]);

  // Quem assina: tesouraria, presidência e conselho fiscal do organograma (dá para trocar)
  useEffect(() => {
    if (signers || chart.loading) return;
    const pos = chart.data?.positions || [];
    const pick = (re: RegExp, avoid?: RegExp) => pos.find(p => re.test(p.title) && !(avoid && avoid.test(p.title)) && (p.memberId || p.personName));
    const found = [pick(/tesour/i, /vice|2|segund/i), pick(/presid/i, /vice/i), pick(/fiscal/i)].filter(Boolean) as NonNullable<ReturnType<typeof pick>>[];
    Promise.all(
      found.map(async p => {
        const m = p.memberId ? await client.get<MemberDoc>(P.member(t.tenantId, p.memberId)).catch(() => null) : null;
        return { name: m?.fullName || p.personName || p.title, role: p.title, ...(m?.uid ? { uid: m.uid } : {}) };
      })
    ).then(setSigners);
  }, [chart.loading, chart.data, signers, client, t.tenantId]);

  const report = useMemo(() => {
    if (kind === 'evento' && !center) return null;
    const accounts = kind === 'periodo' ? accountsOpenedAt(cat.accounts.data, entries, range.from) : cat.accounts.data;
    return buildAccountability(entries, accounts, cat.chart.data, { kind, from: range.from, to: range.to, grouping, ...(center ? { costCenter: center } : {}) });
  }, [kind, center, cat.accounts.data, cat.chart.data, entries, range.from, range.to, grouping]);

  const periodLabel = kind === 'evento' ? center?.name || '' : accPeriodLabel(range.from, range.to);
  const finalTitle = title.trim() || `Prestação de contas ${periodLabel}`;
  const closed = kind === 'periodo' && monthsBetween(range.from, range.to).every(k => periods.data.some(p => p.id === k));
  const preview: AccountabilityDoc | null = report && {
    id: '',
    title: finalTitle,
    kind,
    from: range.from,
    to: range.to,
    periodLabel,
    grouping,
    report,
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    audience,
    signers: signers || [],
    signerUids: [],
    signatures: [],
    status: 'publicado',
    periodClosed: closed,
    publishedAt: '',
    publishedBy: session.user?.uid || '',
    publishedByName: '',
  };
  const empty = !!report && !report.lines.length && !report.transfers.length;
  const positions = chart.data?.positions || [];

  const publish = async () => {
    const r = await run<{ id: string; notified: number }>(
      'accountability.publish',
      {
        tenantId: t.tenantId,
        kind,
        from: range.from,
        to: range.to,
        ...(kind === 'evento' ? { costCenterId: cc } : {}),
        grouping,
        title: finalTitle,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        audience,
        signers: (signers || []).filter(s => s.name.trim() && s.role.trim()),
        postNotice: audience === 'socios' && postNotice,
        requestId: `${kind}_${range.from}_${range.to}_${cc}_${Date.now()}`,
      },
      { success: audience === 'socios' && postNotice ? 'Publicada e colocada no quadro de avisos.' : 'Prestação de contas publicada.' }
    );
    if (r) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Nova prestação de contas"
      footer={
        <div className="flex flex-wrap gap-2 w-full">
          {preview && !empty && <AccountabilityActions a={preview} />}
          <Button className="sm:ml-auto" icon={<Send className="w-4 h-4" />} loading={busy} disabled={!preview || empty} onClick={publish}>
            Publicar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="text-sm font-semibold">1. O que vai ser prestado</div>
          <Select aria-label="Tipo" value={kind} onChange={e => setKind(e.target.value as 'periodo' | 'evento')}>
            <option value="periodo">Mês ou período (todas as contas)</option>
            <option value="evento">Festa, evento ou projeto (centro de custo)</option>
          </Select>
          {kind === 'periodo' ? (
            <>
              <Toggle checked={mode === 'intervalo'} onChange={v => setMode(v ? 'intervalo' : 'mes')} label="Escolher datas (trimestre, ano, gestão)" />
              {mode === 'mes' ? (
                <Field label="Mês">
                  {id => (
                    <Select id={id} value={month} onChange={e => setMonth(e.target.value)}>
                      {months.map(m => (
                        <option key={m} value={m}>
                          {MONTHS[Number(m.slice(5)) - 1]}/{m.slice(0, 4)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="De">{id => <Input id={id} type="date" value={from} onChange={e => setFrom(e.target.value)} />}</Field>
                  <Field label="Até">{id => <Input id={id} type="date" value={to} onChange={e => setTo(e.target.value)} />}</Field>
                </div>
              )}
            </>
          ) : (
            <Field label="Evento ou projeto" hint="Os lançamentos com este centro de custo (crie em Contas e plano).">
              {id => (
                <Select id={id} value={cc} onChange={e => setCc(e.target.value)}>
                  <option value="">Escolha...</option>
                  {cat.costCenters.data.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Como mostrar o histórico">
            {id => (
              <Select id={id} value={grouping} onChange={e => setGrouping(e.target.value as AccGrouping)}>
                {(Object.keys(GROUPING_LABEL) as AccGrouping[]).map(g => (
                  <option key={g} value={g}>
                    {GROUPING_LABEL[g]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Título" hint={`Em branco fica "Prestação de contas ${periodLabel}".`}>
            {id => <Input id={id} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />}
          </Field>
          <Field label="Observações (opcional)" hint="Ex.: obras do salão, saldo reservado para a festa, explicação de um gasto.">
            {id => <Textarea id={id} value={notes} maxLength={3000} onChange={e => setNotes(e.target.value)} />}
          </Field>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">2. Quem assina</div>
          <p className="text-xs text-muted">Quem tem conta no portal assina pelo celular ("Conferi e assino"); os outros assinam no papel impresso.</p>
          {(signers || []).map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Input aria-label="Nome" value={s.name} onChange={e => setSigners((signers || []).map((x, j) => (j === i ? { ...x, name: e.target.value, uid: undefined } : x)))} />
              <Input aria-label="Cargo" value={s.role} onChange={e => setSigners((signers || []).map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
              <button type="button" aria-label="Tirar" className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer" onClick={() => setSigners((signers || []).filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {(signers || []).length < 6 && (
            <Select
              aria-label="Incluir do organograma"
              value=""
              onChange={async e => {
                const p = positions.find(x => x.id === e.target.value);
                if (!p) return;
                const m = p.memberId ? await client.get<MemberDoc>(P.member(t.tenantId, p.memberId)).catch(() => null) : null;
                setSigners([...(signers || []), { name: m?.fullName || p.personName || '', role: p.title, ...(m?.uid ? { uid: m.uid } : {}) }]);
              }}
            >
              <option value="">Incluir alguém do organograma...</option>
              {positions
                .filter(p => p.memberId || p.personName)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}: {p.personName || 'sócio do cadastro'}
                  </option>
                ))}
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">3. Para quem</div>
          <Select aria-label="Para quem" value={audience} onChange={e => setAudience(e.target.value as 'socios' | 'diretoria')}>
            <option value="socios">Todos os sócios (aparece em "Prestação de contas")</option>
            <option value="diretoria">Só a diretoria e o conselho fiscal</option>
          </Select>
          {audience === 'socios' && <Toggle checked={postNotice} onChange={setPostNotice} label="Pôr no quadro de avisos e avisar no celular" />}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">4. Prévia (assim os sócios vão ver)</div>
          {ledger.loading || cat.loading ? (
            <Loading label="Somando o livro caixa..." />
          ) : !preview ? (
            <Notice>Escolha o evento ou projeto.</Notice>
          ) : empty ? (
            <Notice tone="warn">Não há lançamentos neste período ou evento.</Notice>
          ) : (
            <AccountabilityView a={preview} />
          )}
        </div>
      </div>
    </Modal>
  );
}

const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
