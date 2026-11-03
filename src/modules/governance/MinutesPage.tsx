/** Atas e assembleias: convocação com modelo, pauta, presença com quórum ao vivo, editor de ata, versões, assinatura e publicação. */
import { useEffect, useState } from 'react';
import { ArrowLeft, FileSignature, FileText, ListPlus, Plus, ScrollText, Send, Trash2, Users } from 'lucide-react';
import { useDoc, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { isoToLocalInput, localInputToIso, todayIn } from '../../app/formHelpers.ts';
import { minutePdf } from '../../app/pdf.ts';
import { P } from '../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import { replaceVars } from '../../shared/templates.ts';
import { quorumNeeded } from '../../shared/governance/rules.ts';
import type { AssemblyDoc, MemberDoc, MembershipDoc, MinuteDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Notice, PageHeader, SearchBox, Section, Select, Stat, Table, Tabs, Textarea, useConfirm, type Column } from '../../ui/index.tsx';

const KIND = { ordinaria: 'Assembleia geral ordinária', extraordinaria: 'Assembleia geral extraordinária', reuniao_diretoria: 'Reunião da diretoria' } as const;
const MIN_STATUS: Record<MinuteDoc['status'], { label: string; tone: 'neutral' | 'warn' | 'ok' | 'info' }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  em_assinatura: { label: 'Em assinatura', tone: 'warn' },
  aprovada: { label: 'Aprovada', tone: 'info' },
  publicada: { label: 'Publicada', tone: 'ok' },
};

export const NOTICE_TEMPLATE =
  'EDITAL DE CONVOCAÇÃO\n\nA {presidencia} da {sociedade} convoca todos os sócios para a {tipo}, a realizar-se em {data}, às {hora}, no(a) {local}, para deliberar sobre a seguinte ordem do dia:\n\n{pauta}\n\nNão havendo quórum na primeira chamada, a assembleia será instalada em segunda chamada, 30 minutos depois, com qualquer número de presentes, conforme o estatuto.\n\n{cidade}, {hoje}.\n\n{presidencia}';

export default function MinutesPage() {
  const [tab, setTab] = useState<'assembleias' | 'atas'>('assembleias');
  return (
    <div className="space-y-4">
      <PageHeader title="Atas e assembleias" subtitle="Convocação, presença e quórum, redação, assinatura eletrônica e publicação." />
      <Tabs
        tabs={[
          { id: 'assembleias', label: 'Assembleias e reuniões' },
          { id: 'atas', label: 'Atas' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'assembleias' ? <Assemblies /> : <Minutes />}
    </div>
  );
}

// ---------- Assembleias ----------

function Assemblies() {
  const t = useTenant();
  const list = useList<AssemblyDoc>(P.assemblies(t.tenantId), { orderBy: [['date', 'desc']], limit: 100 });
  const [edit, setEdit] = useState<(AssemblyDoc & { id: string }) | 'novo' | null>(null);
  const [att, setAtt] = useState<string | null>(null);
  if (att) return <Attendance id={att} onBack={() => setAtt(null)} />;
  const columns: Column<AssemblyDoc & { id: string }>[] = [
    { key: 't', label: 'Título', render: a => <div className="min-w-0"><div className="font-medium truncate">{a.title}</div><div className="text-xs text-muted">{KIND[a.kind]}</div></div> },
    { key: 'd', label: 'Data', render: a => formatDateTime(a.date, t.tenant.timezone), hideOnMobile: true },
    { key: 'q', label: 'Presença', render: a => `${a.attendanceCount || 0} de ${a.eligibleCount || 0}` },
    { key: 's', label: 'Situação', render: a => <Badge tone={a.status === 'realizada' ? 'ok' : a.status === 'cancelada' ? 'bad' : 'info'}>{a.status === 'convocada' ? 'Convocada' : a.status === 'realizada' ? 'Realizada' : 'Cancelada'}</Badge> },
  ];
  return (
    <div className="space-y-3">
      {t.can('atas', 'criar') && (
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit('novo')}>
          Nova convocação
        </Button>
      )}
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading ? (
        <Loading />
      ) : (
        <Table rows={list.data} columns={columns} onRowClick={a => setEdit(a)} empty={<EmptyState icon={<Users className="w-5 h-5" />} title="Nenhuma assembleia" text="Convoque a primeira assembleia ou reunião." />} />
      )}
      {edit && <AssemblyModal a={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} onAttendance={id => (setEdit(null), setAtt(id))} />}
    </div>
  );
}

function AssemblyModal({ a, onClose, onAttendance }: { a: (AssemblyDoc & { id: string }) | null; onClose: () => void; onAttendance: (id: string) => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const canEdit = t.can('atas', a ? 'editar' : 'criar');
  const [f, setF] = useState({
    title: a?.title || '',
    kind: a?.kind || ('ordinaria' as AssemblyDoc['kind']),
    date: a?.date || '',
    location: a?.location || 'Sede social',
    noticeText: a?.noticeText || '',
    agenda: a?.agenda?.length ? a.agenda : [''],
    quorumPercent: a?.quorumPercent ?? 50,
    status: a?.status || ('convocada' as AssemblyDoc['status']),
  });
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }));
  const agenda = f.agenda.map(x => x.trim()).filter(Boolean);
  const fillTemplate = () => {
    const d = f.date ? new Date(f.date) : null;
    set({
      noticeText: replaceVars(NOTICE_TEMPLATE, {
        sociedade: t.tenant.name,
        presidencia: 'Presidência',
        tipo: KIND[f.kind],
        data: d ? formatDate(f.date, t.tenant.timezone) : '{data}',
        hora: d ? new Intl.DateTimeFormat('pt-BR', { timeZone: t.tenant.timezone, hour: '2-digit', minute: '2-digit' }).format(d) : '{hora}',
        local: f.location || '{local}',
        pauta: agenda.map((x, i) => `${i + 1}. ${x}`).join('\n') || '{pauta}',
        cidade: t.tenant.publicPage?.city || '',
        hoje: formatDate(todayIn(t.tenant.timezone)),
      }),
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={a ? a.title : 'Nova convocação'}
      footer={
        <>
          {a && (
            <Button variant="secondary" icon={<Users className="w-4 h-4" />} onClick={() => onAttendance(a.id)}>
              Lista de presença
            </Button>
          )}
          {canEdit && (
            <Button
              loading={busy}
              disabled={f.title.trim().length < 3 || !f.date}
              onClick={async () => {
                const r = await run('assemblies.save', { tenantId: t.tenantId, ...(a ? { id: a.id } : {}), ...f, title: f.title.trim(), agenda }, { success: 'Convocação salva e incluída na agenda.' });
                if (r) onClose();
              }}
            >
              Salvar
            </Button>
          )}
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Título" required>{id => <Input id={id} value={f.title} maxLength={200} disabled={!canEdit} onChange={e => set({ title: e.target.value })} />}</Field>
        <Field label="Tipo">
          {id => (
            <Select id={id} value={f.kind} disabled={!canEdit} onChange={e => set({ kind: e.target.value as AssemblyDoc['kind'] })}>
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Data e hora" required>{id => <Input id={id} type="datetime-local" disabled={!canEdit} value={isoToLocalInput(f.date)} onChange={e => set({ date: localInputToIso(e.target.value) })} />}</Field>
        <Field label="Local">{id => <Input id={id} value={f.location} maxLength={200} disabled={!canEdit} onChange={e => set({ location: e.target.value })} />}</Field>
        <Field label="Quórum de instalação (%)" hint="Percentual dos sócios ativos que precisa estar presente.">
          {id => <Input id={id} type="number" min={0} max={100} disabled={!canEdit} value={f.quorumPercent} onChange={e => set({ quorumPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />}
        </Field>
        <Field label="Situação">
          {id => (
            <Select id={id} value={f.status} disabled={!canEdit} onChange={e => set({ status: e.target.value as AssemblyDoc['status'] })}>
              <option value="convocada">Convocada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          )}
        </Field>
      </div>
      <Section
        title="Pauta"
        actions={
          canEdit && (
            <Button size="sm" variant="secondary" icon={<ListPlus className="w-4 h-4" />} onClick={() => set({ agenda: [...f.agenda, ''] })}>
              Item
            </Button>
          )
        }
      >
        {f.agenda.map((x, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`Item ${i + 1} da pauta`} value={x} maxLength={300} disabled={!canEdit} onChange={e => set({ agenda: f.agenda.map((y, k) => (k === i ? e.target.value : y)) })} />
            {canEdit && f.agenda.length > 1 && <Button variant="ghost" aria-label={`Remover item ${i + 1}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ agenda: f.agenda.filter((_, k) => k !== i) })} />}
          </div>
        ))}
      </Section>
      <Field label="Edital de convocação" hint="Variáveis: {sociedade} {tipo} {data} {hora} {local} {pauta} {cidade} {hoje} {presidencia}">
        {id => <Textarea id={id} value={f.noticeText} maxLength={10000} disabled={!canEdit} className="min-h-48" onChange={e => set({ noticeText: e.target.value })} />}
      </Field>
      {canEdit && (
        <Button size="sm" variant="secondary" onClick={fillTemplate}>
          Preencher com o modelo
        </Button>
      )}
    </Modal>
  );
}

function Attendance({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useTenant();
  const { run } = useOp();
  const a = useDoc<AssemblyDoc>(`${P.assemblies(t.tenantId)}/${id}`);
  const present = useList<{ memberId: string; name: string; at: string }>(P.attendance(t.tenantId, id));
  const members = useList<MemberDoc>(P.members(t.tenantId), { where: [['status', '==', 'ativo']], orderBy: [['fullName', 'asc']], limit: 3000 });
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  if (a.loading) return <Loading />;
  if (!a.data) return <EmptyState title="Assembleia não encontrada" />;
  const ids = new Set(present.data.map(p => p.id));
  const needed = quorumNeeded(a.data.eligibleCount, a.data.quorumPercent);
  const reached = (a.data.attendanceCount || 0) >= needed;
  const canEdit = t.can('atas', 'editar');
  const shown = members.data.filter(m => !q || m.fullName.toLowerCase().includes(q.toLowerCase()) || (m.membershipNumber || '').includes(q));
  const toggle = async (m: MemberDoc & { id: string }) => {
    setPending(s => new Set(s).add(m.id));
    await run('assemblies.attendance', { tenantId: t.tenantId, assemblyId: id, memberId: m.id, present: !ids.has(m.id) }, { silent: false });
    setPending(s => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
  };
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
        Voltar
      </Button>
      <h2 className="text-lg font-bold">{a.data.title}</h2>
      <div className="grid grid-cols-3 gap-3" aria-live="polite">
        <Stat label="Presentes" value={a.data.attendanceCount || 0} />
        <Stat label="Sócios ativos" value={a.data.eligibleCount || 0} />
        <Stat label={`Quórum (${a.data.quorumPercent}%)`} value={reached ? 'Atingido' : `Faltam ${needed - (a.data.attendanceCount || 0)}`} tone={reached ? 'ok' : 'warn'} />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome ou matrícula" />
      {members.loading ? (
        <Loading />
      ) : (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {shown.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="text-sm truncate">
                {m.fullName} {m.membershipNumber && <span className="text-xs text-muted">({m.membershipNumber})</span>}
              </span>
              <Button size="sm" variant={ids.has(m.id) ? 'primary' : 'secondary'} aria-pressed={ids.has(m.id)} disabled={!canEdit || pending.has(m.id) || a.data!.status === 'cancelada'} onClick={() => toggle(m)}>
                {ids.has(m.id) ? 'Presente' : 'Marcar presença'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Atas ----------

function Minutes() {
  const t = useTenant();
  const list = useList<MinuteDoc>(P.minutes(t.tenantId), { orderBy: [['updatedAt', 'desc']], limit: 200 });
  const [open, setOpen] = useState<string | null>(null);
  if (open !== null) return <MinuteEditor id={open || undefined} onBack={() => setOpen(null)} onCreated={setOpen} />;
  const columns: Column<MinuteDoc & { id: string }>[] = [
    { key: 'n', label: 'Número', render: m => <span className="tabular-nums">{m.number || 'sem número'}</span>, hideOnMobile: true },
    { key: 't', label: 'Título', render: m => <span className="font-medium">{m.title}</span> },
    { key: 'v', label: 'Versão', render: m => `v${m.version}`, hideOnMobile: true },
    { key: 's', label: 'Situação', render: m => <Badge tone={MIN_STATUS[m.status].tone}>{MIN_STATUS[m.status].label}</Badge> },
  ];
  return (
    <div className="space-y-3">
      {t.can('atas', 'criar') && (
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('')}>
          Nova ata
        </Button>
      )}
      {list.error ? <ErrorState text={list.error} /> : list.loading ? <Loading /> : <Table rows={list.data} columns={columns} onRowClick={m => setOpen(m.id)} empty={<EmptyState icon={<ScrollText className="w-5 h-5" />} title="Nenhuma ata" />} />}
    </div>
  );
}

function MinuteEditor({ id, onBack, onCreated }: { id?: string; onBack: () => void; onCreated: (id: string) => void }) {
  const t = useTenant();
  const session = useSession();
  const confirm = useConfirm();
  const { run, busy } = useOp();
  const doc = useDoc<MinuteDoc>(id ? `${P.minutes(t.tenantId)}/${id}` : null);
  const versions = useList<{ version: number; title: string; body: string; savedAt: string }>(id ? P.minuteVersions(t.tenantId, id) : null, { orderBy: [['version', 'desc']] });
  const assemblies = useList<AssemblyDoc>(P.assemblies(t.tenantId), { orderBy: [['date', 'desc']], limit: 50 });
  const [f, setF] = useState({ title: '', assemblyId: '', body: '', deliberations: [] as { id?: string; text: string; taskId?: string }[] });
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<'' | 'assinatura' | 'versoes' | { deliberationId: string; text: string }>('');
  useEffect(() => {
    if (doc.data && !dirty) setF({ title: doc.data.title, assemblyId: doc.data.assemblyId || '', body: doc.data.body, deliberations: doc.data.deliberations });
  }, [doc.data, dirty]);
  const set = (p: Partial<typeof f>) => (setF(v => ({ ...v, ...p })), setDirty(true));
  const m = doc.data;
  const status = m?.status || 'rascunho';
  const editable = (status === 'rascunho' || status === 'em_assinatura') && t.can('atas', id ? 'editar' : 'criar');
  const mySigner = m?.signers.find(s => s.uid === session.user?.uid);
  const signed = m?.signatures.some(s => s.uid === session.user?.uid);

  const save = async () => {
    if (status === 'em_assinatura' && !(await confirm({ title: 'Alterar ata em assinatura?', text: 'As assinaturas já coletadas deixam de valer e a ata volta para rascunho.', confirmLabel: 'Salvar mesmo assim', danger: true }))) return;
    const r = await run<{ id: string }>(
      'minutes.save',
      { tenantId: t.tenantId, ...(id ? { id } : {}), title: f.title.trim(), ...(f.assemblyId ? { assemblyId: f.assemblyId } : {}), body: f.body, deliberations: f.deliberations.filter(d => d.text.trim()).map(d => ({ ...(d.id ? { id: d.id } : {}), text: d.text.trim() })) },
      { success: 'Ata salva. Nova versão registrada.' }
    );
    if (r) {
      setDirty(false);
      if (!id) onCreated(r.id);
    }
  };

  if (id && doc.loading) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
          Voltar
        </Button>
        <h2 className="text-lg font-bold truncate">{m?.number ? `Ata nº ${m.number}` : id ? 'Ata' : 'Nova ata'}</h2>
        {m && <Badge tone={MIN_STATUS[status].tone}>{MIN_STATUS[status].label}</Badge>}
        {m && <span className="text-xs text-muted">versão {m.version}</span>}
      </div>
      {status === 'publicada' && <Notice tone="ok">Ata publicada: aparece para os sócios em Documentos. Não pode mais ser editada; correções entram em ata de retificação.</Notice>}
      {status === 'aprovada' && <Notice>Todas as assinaturas foram coletadas. Falta publicar para gerar o número.</Notice>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Título" required>{i => <Input id={i} value={f.title} maxLength={200} disabled={!editable} onChange={e => set({ title: e.target.value })} />}</Field>
        <Field label="Assembleia ou reunião">
          {i => (
            <Select id={i} value={f.assemblyId} disabled={!editable} onChange={e => set({ assemblyId: e.target.value })}>
              <option value="">Nenhuma</option>
              {assemblies.data.map(a => (
                <option key={a.id} value={a.id}>
                  {a.title} ({formatDate(a.date, t.tenant.timezone)})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Texto da ata">{i => <Textarea id={i} value={f.body} maxLength={100000} disabled={!editable} className="min-h-72 font-serif leading-relaxed" onChange={e => set({ body: e.target.value })} />}</Field>
      <Section
        title="Deliberações"
        actions={
          editable && (
            <Button size="sm" variant="secondary" icon={<ListPlus className="w-4 h-4" />} onClick={() => set({ deliberations: [...f.deliberations, { text: '' }] })}>
              Deliberação
            </Button>
          )
        }
      >
        {f.deliberations.length === 0 && <p className="text-sm text-muted">Registre aqui cada decisão. Cada uma pode virar uma tarefa no plano de ação.</p>}
        {f.deliberations.map((d, i) => (
          <div key={d.id || `n${i}`} className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input aria-label={`Deliberação ${i + 1}`} value={d.text} maxLength={1000} disabled={!editable} onChange={e => set({ deliberations: f.deliberations.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
            <div className="flex gap-1 shrink-0">
              {d.taskId ? (
                <Badge tone="ok">Virou tarefa</Badge>
              ) : (
                d.id &&
                !dirty &&
                t.can('atas', 'editar') &&
                t.moduleOn('tarefas') && (
                  <Button size="sm" variant="secondary" onClick={() => setModal({ deliberationId: d.id!, text: d.text })}>
                    Criar tarefa
                  </Button>
                )
              )}
              {editable && !d.taskId && <Button size="sm" variant="ghost" aria-label={`Remover deliberação ${i + 1}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ deliberations: f.deliberations.filter((_, k) => k !== i) })} />}
            </div>
          </div>
        ))}
      </Section>
      {m && m.signers.length > 0 && (
        <Section title="Assinaturas">
          <ul className="space-y-1 text-sm">
            {m.signers.map(s => {
              const sig = m.signatures.find(x => x.uid === s.uid);
              return (
                <li key={s.uid} className="flex items-center justify-between gap-2">
                  <span>
                    {s.name} <span className="text-muted">({s.role})</span>
                  </span>
                  {sig ? <Badge tone="ok">Assinou em {formatDateTime(sig.at, t.tenant.timezone)}</Badge> : <Badge tone="warn">Pendente</Badge>}
                </li>
              );
            })}
          </ul>
          {m.contentHash && <p className="text-[11px] text-muted break-all">Código de integridade (SHA-256): {m.contentHash}</p>}
        </Section>
      )}
      <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-line -mx-4 px-4 py-3 flex flex-wrap justify-end gap-2">
        {id && (
          <Button variant="ghost" size="sm" onClick={() => setModal('versoes')}>
            Versões ({versions.data.length})
          </Button>
        )}
        {m && (
          <Button variant="secondary" size="sm" icon={<FileText className="w-4 h-4" />} onClick={() => minutePdf(t.tenant, m)}>
            PDF
          </Button>
        )}
        {mySigner && status === 'em_assinatura' && !signed && !dirty && (
          <Button
            size="sm"
            icon={<FileSignature className="w-4 h-4" />}
            loading={busy}
            onClick={async () => {
              if (await confirm({ title: 'Assinar a ata?', text: `Você confirma que leu o texto e assina como ${mySigner.role}. A assinatura fica ligada ao código de integridade desta versão.`, confirmLabel: 'Assinar' }))
                run('minutes.sign', { tenantId: t.tenantId, minuteId: id }, { success: 'Ata assinada.' });
            }}
          >
            Assinar
          </Button>
        )}
        {status === 'rascunho' && id && !dirty && t.can('atas', 'editar') && (
          <Button size="sm" variant="secondary" icon={<Send className="w-4 h-4" />} onClick={() => setModal('assinatura')}>
            Enviar para assinatura
          </Button>
        )}
        {status === 'aprovada' && t.can('atas', 'aprovar') && (
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              if (await confirm({ title: 'Publicar a ata?', text: 'A ata recebe o número sequencial do ano e fica visível para os sócios. Depois disso não pode ser editada.', confirmLabel: 'Publicar' }))
                run('minutes.publish', { tenantId: t.tenantId, minuteId: id }, { success: 'Ata publicada.' });
            }}
          >
            Publicar
          </Button>
        )}
        {editable && (
          <Button size="sm" loading={busy} disabled={f.title.trim().length < 3 || (!dirty && !!id)} onClick={save}>
            Salvar
          </Button>
        )}
      </div>
      {modal === 'assinatura' && m && id && <SignersModal minuteId={id} onClose={() => setModal('')} />}
      {modal === 'versoes' && (
        <Modal open onClose={() => setModal('')} title="Versões anteriores" size="lg">
          {versions.data.length === 0 ? (
            <p className="text-sm text-muted">Ainda não há versões anteriores.</p>
          ) : (
            versions.data.map(v => (
              <details key={v.id} className="border border-line rounded-xl p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Versão {v.version} · salva em {formatDateTime(v.savedAt, t.tenant.timezone)}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs font-serif">{v.body}</pre>
              </details>
            ))
          )}
        </Modal>
      )}
      {typeof modal === 'object' && id && <DeliberationTaskModal minuteId={id} d={modal} onClose={() => setModal('')} />}
    </div>
  );
}

function SignersModal({ minuteId, onClose }: { minuteId: string; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const ms = useList<MembershipDoc>(P.memberships(t.tenantId), { where: [['board', '==', true]] });
  const [sel, setSel] = useState<Record<string, string>>({});
  const chosen = Object.entries(sel);
  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar para assinatura"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            disabled={!chosen.length || chosen.some(([, r]) => r.trim().length < 2)}
            onClick={async () => {
              const signers = chosen.map(([uid, role]) => ({ uid, role: role.trim(), name: ms.data.find(m => m.id === uid)?.displayName || 'Signatário' }));
              if (await run('minutes.submit', { tenantId: t.tenantId, minuteId, signers }, { success: 'Ata enviada. Os signatários foram avisados.' })) onClose();
            }}
          >
            Enviar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">Escolha quem assina e em qual função (por exemplo, presidente e secretário). O texto fica travado por um código de integridade.</p>
      {ms.error && <ErrorState text={ms.error} />}
      {ms.loading ? (
        <Loading />
      ) : (
        <ul className="space-y-2">
          {ms.data
            .filter(m => m.active && !m.support)
            .map(m => (
              <li key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="flex items-center gap-2 text-sm sm:w-56">
                  <input
                    type="checkbox"
                    checked={m.id in sel}
                    onChange={e =>
                      setSel(s => {
                        const n = { ...s };
                        if (e.target.checked) n[m.id] = '';
                        else delete n[m.id];
                        return n;
                      })
                    }
                  />
                  {m.displayName}
                </label>
                {m.id in sel && <Input aria-label={`Função de ${m.displayName}`} placeholder="Função (ex.: Presidente)" value={sel[m.id]} maxLength={80} onChange={e => setSel(s => ({ ...s, [m.id]: e.target.value }))} />}
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}

function DeliberationTaskModal({ minuteId, d, onClose }: { minuteId: string; d: { deliberationId: string; text: string }; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [when, setWhen] = useState(todayIn(t.tenant.timezone));
  const [who, setWho] = useState('');
  const [priority, setPriority] = useState('media');
  return (
    <Modal
      open
      onClose={onClose}
      title="Criar tarefa da deliberação"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              if (await run('tasks.fromDeliberation', { tenantId: t.tenantId, minuteId, deliberationId: d.deliberationId, when, who: who.trim(), priority }, { success: 'Tarefa criada no plano de ação.' })) onClose();
            }}
          >
            Criar tarefa
          </Button>
        </>
      }
    >
      <Card className="text-sm">{d.text}</Card>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Prazo">{i => <Input id={i} type="date" value={when} onChange={e => setWhen(e.target.value)} />}</Field>
        <Field label="Responsável">{i => <Input id={i} value={who} maxLength={150} onChange={e => setWho(e.target.value)} />}</Field>
        <Field label="Prioridade">
          {i => (
            <Select id={i} value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </Select>
          )}
        </Field>
      </div>
    </Modal>
  );
}
