/** Votações e eleições (gestão): chapas e opções, regras de elegibilidade, abertura, encerramento, apuração e relatório. */
import { useState } from 'react';
import { Download, Plus, Trash2, Vote } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { isoToLocalInput, localInputToIso } from '../../app/formHelpers.ts';
import { createPdf } from '../../app/pdf.ts';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { ElectionDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Notice, PageHeader, Section, Select, Table, Textarea, Toggle, useConfirm, type Column } from '../../ui/index.tsx';

type Row = ElectionDoc & { id: string };
export const ELECTION_STATUS = { rascunho: { label: 'Rascunho', tone: 'neutral' }, aberta: { label: 'Aberta', tone: 'ok' }, encerrada: { label: 'Encerrada', tone: 'info' } } as const;

export function resultRows(e: ElectionDoc) {
  const total = Object.values(e.results || {}).reduce((a, b) => a + b, 0) + (e.blankCount || 0);
  return {
    total,
    rows: [...e.options.map(o => ({ id: o.id, label: o.label, votes: e.results?.[o.id] || 0 })), { id: '__branco', label: 'Brancos', votes: e.blankCount || 0 }]
      .map(r => ({ ...r, pct: total ? Math.round((r.votes / total) * 1000) / 10 : 0 }))
      .sort((a, b) => (a.id === '__branco' ? 1 : b.id === '__branco' ? -1 : b.votes - a.votes)),
  };
}

export default function ElectionsPage() {
  const t = useTenant();
  const list = useList<ElectionDoc>(P.elections(t.tenantId), { orderBy: [['opensAt', 'desc']], limit: 100 });
  const [open, setOpen] = useState<Row | 'nova' | null>(null);
  const columns: Column<Row>[] = [
    { key: 't', label: 'Título', render: e => <div className="min-w-0"><div className="font-medium truncate">{e.title}</div><div className="text-xs text-muted">{e.kind === 'eleicao' ? 'Eleição' : 'Votação'}</div></div> },
    { key: 'p', label: 'Período', render: e => `${formatDateTime(e.opensAt, t.tenant.timezone)} a ${formatDateTime(e.closesAt, t.tenant.timezone)}`, hideOnMobile: true },
    { key: 'v', label: 'Votantes', render: e => e.votersCount || 0 },
    { key: 's', label: 'Situação', render: e => <Badge tone={ELECTION_STATUS[e.status].tone}>{ELECTION_STATUS[e.status].label}</Badge> },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Votações e eleições"
        subtitle="Voto secreto: o sistema registra quem votou, nunca em quem votou."
        actions={
          t.can('votacoes', 'criar') && (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('nova')}>
              Nova votação
            </Button>
          )
        }
      />
      {list.error ? <ErrorState text={list.error} /> : list.loading ? <Loading /> : <Table rows={list.data} columns={columns} onRowClick={setOpen} empty={<EmptyState icon={<Vote className="w-5 h-5" />} title="Nenhuma votação" />} />}
      {open && <ElectionModal e={open === 'nova' ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ElectionModal({ e, onClose }: { e: Row | null; onClose: () => void }) {
  const t = useTenant();
  const confirm = useConfirm();
  const { run, busy } = useOp();
  const draft = !e || e.status === 'rascunho';
  const canEdit = draft && t.can('votacoes', e ? 'editar' : 'criar');
  const canDecide = t.can('votacoes', 'aprovar');
  const now = Date.now();
  const [f, setF] = useState({
    title: e?.title || '',
    description: e?.description || '',
    kind: e?.kind || ('eleicao' as ElectionDoc['kind']),
    options: e?.options?.length ? e.options : [{ id: '', label: '', detail: '' }],
    opensAt: e?.opensAt || new Date(now + 86400000).toISOString(),
    closesAt: e?.closesAt || new Date(now + 8 * 86400000).toISOString(),
    eligibility: e?.eligibility || { requireUpToDate: true, categoryIds: [] as string[], minMonths: 0 },
  });
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }));
  const cats = t.settings?.categories || [];
  const valid = f.title.trim().length >= 3 && f.options.some(o => o.label.trim()) && Date.parse(f.closesAt) > Date.parse(f.opensAt);

  const save = async () => {
    const r = await run(
      'elections.save',
      {
        tenantId: t.tenantId,
        ...(e ? { id: e.id } : {}),
        title: f.title.trim(),
        description: f.description,
        kind: f.kind,
        options: f.options.filter(o => o.label.trim()).map(o => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim(), ...(o.detail ? { detail: o.detail } : {}) })),
        opensAt: f.opensAt,
        closesAt: f.closesAt,
        eligibility: f.eligibility,
      },
      { success: 'Votação salva.' }
    );
    if (r) onClose();
  };

  const report = async () => {
    if (!e) return;
    const w = await createPdf(t.tenant);
    const r = resultRows(e);
    w.title(`Relatório de apuração`, e.title);
    w.kv([
      ['Período', `${formatDateTime(e.opensAt, t.tenant.timezone)} a ${formatDateTime(e.closesAt, t.tenant.timezone)}`],
      ['Votantes', String(e.votersCount || 0)],
      ['Cédulas apuradas', String(r.total)],
      ['Regras', `${e.eligibility.requireUpToDate ? 'exige adimplência; ' : ''}${e.eligibility.minMonths ? `mínimo de ${e.eligibility.minMonths} meses de associação; ` : ''}${e.eligibility.categoryIds.length ? 'categorias restritas' : 'todas as categorias'}`],
    ]);
    w.table(['Opção', 'Votos', '%'], r.rows.map(x => [x.label, String(x.votes), `${x.pct.toLocaleString('pt-BR')}%`]), { alignRight: [1, 2] });
    w.para('Voto secreto: o sistema registra quem votou separado do conteúdo do voto. As cédulas não têm identificação, horário nem ordem.', { size: 9, color: [90, 90, 90] });
    w.save(`apuracao-${e.id}.pdf`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={e ? e.title : 'Nova votação'}
      footer={
        <>
          {e?.status === 'rascunho' && canDecide && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={async () => {
                if (await confirm({ title: 'Abrir a votação?', text: 'Depois de aberta, opções e regras não mudam mais.', confirmLabel: 'Abrir' })) if (await run('elections.open', { tenantId: t.tenantId, electionId: e.id }, { success: 'Votação aberta.' })) onClose();
              }}
            >
              Abrir votação
            </Button>
          )}
          {e?.status === 'aberta' && canDecide && (
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (await confirm({ title: 'Encerrar e apurar?', text: 'Ninguém mais poderá votar. A apuração acontece na hora.', confirmLabel: 'Encerrar', danger: true })) if (await run('elections.close', { tenantId: t.tenantId, electionId: e.id }, { success: 'Votação encerrada e apurada.' })) onClose();
              }}
            >
              Encerrar e apurar
            </Button>
          )}
          {e?.status === 'encerrada' && (
            <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={report}>
              Relatório em PDF
            </Button>
          )}
          {canEdit && (
            <Button loading={busy} disabled={!valid} onClick={save}>
              Salvar rascunho
            </Button>
          )}
        </>
      }
    >
      {e?.status === 'encerrada' && <Results e={e} />}
      {e?.status === 'aberta' && <Notice tone="ok">Votação aberta: {e.votersCount || 0} sócio(s) já votaram. O resultado só aparece depois do encerramento.</Notice>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Título" required>{i => <Input id={i} value={f.title} maxLength={200} disabled={!canEdit} onChange={x => set({ title: x.target.value })} />}</Field>
        <Field label="Tipo">
          {i => (
            <Select id={i} value={f.kind} disabled={!canEdit} onChange={x => set({ kind: x.target.value as ElectionDoc['kind'] })}>
              <option value="eleicao">Eleição (chapas ou candidatos)</option>
              <option value="votacao">Votação (proposta)</option>
            </Select>
          )}
        </Field>
        <Field label="Abre em" required>{i => <Input id={i} type="datetime-local" disabled={!canEdit} value={isoToLocalInput(f.opensAt)} onChange={x => set({ opensAt: localInputToIso(x.target.value) || f.opensAt })} />}</Field>
        <Field label="Encerra em" required>{i => <Input id={i} type="datetime-local" disabled={!canEdit} value={isoToLocalInput(f.closesAt)} onChange={x => set({ closesAt: localInputToIso(x.target.value) || f.closesAt })} />}</Field>
      </div>
      <Field label="Descrição">{i => <Textarea id={i} value={f.description} maxLength={4000} disabled={!canEdit} onChange={x => set({ description: x.target.value })} />}</Field>
      <Section
        title={f.kind === 'eleicao' ? 'Chapas ou candidatos' : 'Opções'}
        actions={
          canEdit && (
            <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => set({ options: [...f.options, { id: '', label: '', detail: '' }] })}>
              Opção
            </Button>
          )
        }
      >
        {f.options.map((o, i) => (
          <Card key={o.id || i} className="space-y-2 p-3 sm:p-3">
            <div className="flex gap-2">
              <Input aria-label={`Opção ${i + 1}`} placeholder={f.kind === 'eleicao' ? 'Ex.: Chapa 1, Tradição e Futuro' : 'Ex.: Aprovo a proposta'} value={o.label} maxLength={150} disabled={!canEdit} onChange={x => set({ options: f.options.map((y, k) => (k === i ? { ...y, label: x.target.value } : y)) })} />
              {canEdit && f.options.length > 1 && <Button variant="ghost" aria-label={`Remover opção ${i + 1}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ options: f.options.filter((_, k) => k !== i) })} />}
            </div>
            <Textarea aria-label={`Detalhes da opção ${i + 1}`} placeholder="Integrantes da chapa, proposta, currículo" value={o.detail || ''} maxLength={1000} disabled={!canEdit} className="min-h-16" onChange={x => set({ options: f.options.map((y, k) => (k === i ? { ...y, detail: x.target.value } : y)) })} />
          </Card>
        ))}
        <p className="text-[11px] text-muted">O voto em branco sempre é oferecido.</p>
      </Section>
      <Section title="Quem pode votar">
        <Toggle checked={f.eligibility.requireUpToDate} disabled={!canEdit} onChange={v => set({ eligibility: { ...f.eligibility, requireUpToDate: v } })} label="Só quem está em dia (sem cobrança vencida)" />
        <Field label="Tempo mínimo de associação (meses)">
          {i => <Input id={i} type="number" min={0} max={600} disabled={!canEdit} value={f.eligibility.minMonths} onChange={x => set({ eligibility: { ...f.eligibility, minMonths: Math.max(0, Number(x.target.value) || 0) } })} />}
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold text-muted">Categorias (nenhuma marcada = todas)</legend>
          {cats.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={f.eligibility.categoryIds.includes(c.id)}
                onChange={x => set({ eligibility: { ...f.eligibility, categoryIds: x.target.checked ? [...f.eligibility.categoryIds, c.id] : f.eligibility.categoryIds.filter(id => id !== c.id) } })}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-muted">Sempre exige situação ativa ou aprovada.</p>
      </Section>
    </Modal>
  );
}

export function Results({ e }: { e: ElectionDoc }) {
  const r = resultRows(e);
  const winner = r.rows.find(x => x.id !== '__branco');
  const tie = r.rows.filter(x => x.id !== '__branco' && x.votes === winner?.votes).length > 1;
  return (
    <Section title="Resultado">
      <ul className="space-y-2" aria-label="Resultado da apuração">
        {r.rows.map(x => (
          <li key={x.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={x.id === winner?.id && !tie && x.votes > 0 ? 'font-bold' : ''}>{x.label}</span>
              <span className="tabular-nums">
                {x.votes} ({x.pct.toLocaleString('pt-BR')}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
              <div className="h-full bg-accent" style={{ width: `${x.pct}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {r.total} cédula(s) apurada(s){tie ? '. Houve empate: siga o estatuto para o desempate.' : '.'}
      </p>
    </Section>
  );
}
