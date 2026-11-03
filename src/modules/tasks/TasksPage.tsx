/** Plano de ação: 5W2H, kanban e lista, filtros, prazo atrasado em destaque, comentários, anexos e lembrete. */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, LayoutGrid, List, Plus } from 'lucide-react';
import { useDoc, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { AttachmentsField } from '../../app/uploads.tsx';
import { isoToLocalInput, localInputToIso, todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import type { EventDoc, MembershipDoc, TaskDoc, TaskStatus } from '../../shared/types.ts';
import { Badge, Button, Card, cx, EmptyState, ErrorState, Field, Input, Loading, Modal, Money, MoneyInput, PageHeader, Select, Table, Tabs, Textarea, type Column } from '../../ui/index.tsx';

export const TASK_STATUS: { id: TaskStatus; label: string }[] = [
  { id: 'a_fazer', label: 'A fazer' },
  { id: 'fazendo', label: 'Fazendo' },
  { id: 'bloqueada', label: 'Bloqueada' },
  { id: 'concluida', label: 'Concluída' },
];
const PRIORITY = { baixa: { label: 'Baixa', tone: 'neutral' }, media: { label: 'Média', tone: 'info' }, alta: { label: 'Alta', tone: 'bad' } } as const;
type Row = TaskDoc & { id: string };

export default function TasksPage() {
  const t = useTenant();
  const session = useSession();
  const today = todayIn(t.tenant.timezone);
  const list = useList<TaskDoc>(P.tasks(t.tenantId), { orderBy: [['when', 'asc']], limit: 500 });
  const events = useList<EventDoc>(P.events(t.tenantId), { orderBy: [['start', 'desc']], limit: 100 });
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [ref, setRef] = useState('');
  const [prio, setPrio] = useState('');
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState<Row | 'novo' | null>(null);
  const { run } = useOp();
  const canCreate = t.can('tarefas', 'criar');
  const canEdit = t.can('tarefas', 'editar');

  const refs = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of list.data) if (x.ref) m.set(`${x.ref.type}:${x.ref.id}`, `${x.ref.type === 'ata' ? 'Ata' : x.ref.type === 'edital' ? 'Edital' : x.ref.type === 'projeto' ? 'Projeto' : 'Evento'}: ${x.ref.label}`);
    for (const e of events.data) m.set(`${e.kind}:${e.id}`, `${e.kind === 'projeto' ? 'Projeto' : 'Evento'}: ${e.name}`);
    return [...m.entries()];
  }, [list.data, events.data]);

  const rows = list.data.filter(x => (!ref || (x.ref && `${x.ref.type}:${x.ref.id}` === ref)) && (!prio || x.priority === prio) && (!mine || x.whoUid === session.user?.uid));
  const late = (x: TaskDoc) => x.status !== 'concluida' && x.when < today;
  const move = (x: Row, dir: -1 | 1) => {
    const i = TASK_STATUS.findIndex(s => s.id === x.status);
    const next = TASK_STATUS[i + dir];
    if (next) run('tasks.setStatus', { tenantId: t.tenantId, taskId: x.id, status: next.id });
  };
  const canMove = (x: Row) => canEdit || x.whoUid === session.user?.uid;

  const columns: Column<Row>[] = [
    { key: 't', label: 'Tarefa', render: x => <div className="min-w-0"><div className="font-medium truncate">{x.title}</div><div className="text-xs text-muted truncate">{x.ref?.label || ''}</div></div> },
    { key: 'w', label: 'Responsável', render: x => x.who, hideOnMobile: true },
    { key: 'd', label: 'Prazo', render: x => <span className={late(x) ? 'text-bad font-semibold' : ''}>{formatDate(x.when)}</span> },
    { key: 'p', label: 'Prioridade', render: x => <Badge tone={PRIORITY[x.priority].tone}>{PRIORITY[x.priority].label}</Badge>, hideOnMobile: true },
    { key: 's', label: 'Situação', render: x => TASK_STATUS.find(s => s.id === x.status)?.label },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plano de ação"
        subtitle="O quê, por quê, onde, quando, quem, como e quanto (5W2H)."
        actions={
          canCreate && (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setOpen('novo')}>
              Nova tarefa
            </Button>
          )
        }
      />
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <Select aria-label="Filtrar por evento, projeto ou ata" value={ref} onChange={e => setRef(e.target.value)} className="sm:w-64">
          <option value="">Todos os vínculos</option>
          {refs.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrar por prioridade" value={prio} onChange={e => setPrio(e.target.value)} className="sm:w-40">
          <option value="">Toda prioridade</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </Select>
        <Button size="sm" variant={mine ? 'accent' : 'secondary'} aria-pressed={mine} onClick={() => setMine(v => !v)}>
          Minhas tarefas
        </Button>
        <div className="sm:ml-auto flex gap-1" role="group" aria-label="Modo de visualização">
          <Button size="sm" variant={view === 'kanban' ? 'primary' : 'secondary'} icon={<LayoutGrid className="w-4 h-4" />} aria-pressed={view === 'kanban'} onClick={() => setView('kanban')}>
            Quadro
          </Button>
          <Button size="sm" variant={view === 'lista' ? 'primary' : 'secondary'} icon={<List className="w-4 h-4" />} aria-pressed={view === 'lista'} onClick={() => setView('lista')}>
            Lista
          </Button>
        </div>
      </div>
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading ? (
        <Loading />
      ) : rows.length === 0 && !list.data.length ? (
        <EmptyState icon={<ClipboardList className="w-5 h-5" />} title="Nenhuma tarefa" text="Crie tarefas aqui ou a partir das deliberações de uma ata." />
      ) : view === 'lista' ? (
        <Table rows={rows} columns={columns} onRowClick={setOpen} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {TASK_STATUS.map((s, si) => {
            const col = rows.filter(x => x.status === s.id);
            return (
              <section key={s.id} aria-label={s.label} className="bg-surface-2/50 border border-line rounded-2xl p-2 space-y-2 min-h-24">
                <h2 className="px-2 pt-1 text-xs font-bold uppercase tracking-wider text-muted">
                  {s.label} ({col.length})
                </h2>
                {col.map(x => (
                  <div key={x.id} className={cx('bg-surface border rounded-xl p-3 space-y-2', late(x) ? 'border-bad/60' : 'border-line')}>
                    <button className="text-left w-full cursor-pointer" onClick={() => setOpen(x)}>
                      <div className="text-sm font-medium">{x.title}</div>
                      <div className="text-xs text-muted">{x.who}</div>
                    </button>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cx('text-xs', late(x) ? 'text-bad font-semibold' : 'text-muted')}>{late(x) ? `Atrasada: ${formatDate(x.when)}` : formatDate(x.when)}</span>
                      <Badge tone={PRIORITY[x.priority].tone}>{PRIORITY[x.priority].label}</Badge>
                    </div>
                    {canMove(x) && (
                      <div className="flex justify-between">
                        <Button size="sm" variant="ghost" disabled={si === 0} aria-label={`Mover ${x.title} para ${TASK_STATUS[si - 1]?.label || ''}`} icon={<ChevronLeft className="w-4 h-4" />} onClick={() => move(x, -1)} />
                        <Button size="sm" variant="ghost" disabled={si === TASK_STATUS.length - 1} aria-label={`Mover ${x.title} para ${TASK_STATUS[si + 1]?.label || ''}`} icon={<ChevronRight className="w-4 h-4" />} onClick={() => move(x, 1)} />
                      </div>
                    )}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {open && <TaskModal task={open === 'novo' ? null : open} events={events.data} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TaskModal({ task, events, onClose }: { task: Row | null; events: (EventDoc & { id: string })[]; onClose: () => void }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const memberships = useList<MembershipDoc>(t.can('papeis', 'ver') ? P.memberships(t.tenantId) : null, { where: [['board', '==', true]] });
  const [tab, setTab] = useState<'5w2h' | 'comentarios'>('5w2h');
  const live = useDoc<TaskDoc>(task ? `${P.tasks(t.tenantId)}/${task.id}` : null);
  const comments = live.data?.comments || task?.comments || [];
  const [comment, setComment] = useState('');
  const canEdit = task ? t.can('tarefas', 'editar') : t.can('tarefas', 'criar');
  const [f, setF] = useState({
    title: task?.title || '',
    what: task?.what || '',
    why: task?.why || '',
    where: task?.where || '',
    when: task?.when || todayIn(t.tenant.timezone),
    who: task?.who || '',
    whoUid: task?.whoUid || '',
    how: task?.how || '',
    howMuchCents: task?.howMuchCents || 0,
    priority: task?.priority || ('media' as TaskDoc['priority']),
    status: task?.status || ('a_fazer' as TaskStatus),
    ref: task?.ref ? `${task.ref.type}:${task.ref.id}` : '',
    attachments: task?.attachments || [],
    reminderAt: task?.reminderAt || '',
  });
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }));
  const refOpts = events.map(e => ({ key: `${e.kind}:${e.id}`, type: e.kind, id: e.id, label: e.name }));
  if (task?.ref && !refOpts.some(o => o.key === `${task.ref!.type}:${task.ref!.id}`)) refOpts.push({ key: `${task.ref.type}:${task.ref.id}`, type: task.ref.type as 'evento', id: task.ref.id, label: task.ref.label });

  const save = async () => {
    const r = refOpts.find(o => o.key === f.ref);
    const data = {
      title: f.title.trim(),
      what: f.what,
      why: f.why,
      where: f.where,
      when: f.when,
      who: f.who.trim(),
      ...(f.whoUid ? { whoUid: f.whoUid } : {}),
      how: f.how,
      howMuchCents: f.howMuchCents,
      priority: f.priority,
      status: f.status,
      ...(r ? { ref: { type: r.type, id: r.id, label: r.label.slice(0, 150) } } : {}),
      attachments: f.attachments,
      ...(f.reminderAt ? { reminderAt: f.reminderAt } : {}),
    };
    const res = await run('generic.save', { tenantId: t.tenantId, collection: 'tasks', ...(task ? { id: task.id } : {}), data }, { success: 'Tarefa salva.' });
    if (res) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={task ? task.title : 'Nova tarefa'}
      footer={
        canEdit && tab === '5w2h' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={f.title.trim().length < 2 || !f.when} onClick={save}>
              Salvar
            </Button>
          </>
        ) : undefined
      }
    >
      {task && <Tabs tabs={[{ id: '5w2h', label: '5W2H' }, { id: 'comentarios', label: 'Comentários', count: comments.length }]} value={tab} onChange={setTab} />}
      {tab === '5w2h' ? (
        <div className="space-y-3">
          <Field label="Título" required>{id => <Input id={id} value={f.title} maxLength={150} disabled={!canEdit} onChange={e => set({ title: e.target.value })} />}</Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="O quê (what)">{id => <Textarea id={id} value={f.what} maxLength={1000} disabled={!canEdit} onChange={e => set({ what: e.target.value })} />}</Field>
            <Field label="Por quê (why)">{id => <Textarea id={id} value={f.why} maxLength={1000} disabled={!canEdit} onChange={e => set({ why: e.target.value })} />}</Field>
            <Field label="Onde (where)">{id => <Input id={id} value={f.where} maxLength={300} disabled={!canEdit} onChange={e => set({ where: e.target.value })} />}</Field>
            <Field label="Quando (prazo)" required>{id => <Input id={id} type="date" value={f.when} disabled={!canEdit} onChange={e => set({ when: e.target.value })} />}</Field>
            <Field label="Quem (responsável)">
              {id =>
                memberships.data.length ? (
                  <Select
                    id={id}
                    value={f.whoUid}
                    disabled={!canEdit}
                    onChange={e => {
                      const m = memberships.data.find(x => x.id === e.target.value);
                      set({ whoUid: e.target.value, who: m?.displayName || f.who });
                    }}
                  >
                    <option value="">Outra pessoa (digite abaixo)</option>
                    {memberships.data.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input id={id} value={f.who} maxLength={150} disabled={!canEdit} onChange={e => set({ who: e.target.value })} />
                )
              }
            </Field>
            {memberships.data.length > 0 && !f.whoUid && <Field label="Nome do responsável">{id => <Input id={id} value={f.who} maxLength={150} disabled={!canEdit} onChange={e => set({ who: e.target.value })} />}</Field>}
            <Field label="Quanto (custo)">{id => <MoneyInput id={id} value={f.howMuchCents} disabled={!canEdit} onChange={c => set({ howMuchCents: c })} />}</Field>
          </div>
          <Field label="Como (how)">{id => <Textarea id={id} value={f.how} maxLength={2000} disabled={!canEdit} onChange={e => set({ how: e.target.value })} />}</Field>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Prioridade">
              {id => (
                <Select id={id} value={f.priority} disabled={!canEdit} onChange={e => set({ priority: e.target.value as TaskDoc['priority'] })}>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </Select>
              )}
            </Field>
            <Field label="Situação">
              {id => (
                <Select id={id} value={f.status} disabled={!canEdit} onChange={e => set({ status: e.target.value as TaskStatus })}>
                  {TASK_STATUS.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Lembrete">{id => <Input id={id} type="datetime-local" disabled={!canEdit} value={isoToLocalInput(f.reminderAt)} onChange={e => set({ reminderAt: localInputToIso(e.target.value) })} />}</Field>
          </div>
          <Field label="Vínculo (evento ou projeto)">
            {id => (
              <Select id={id} value={f.ref} disabled={!canEdit || task?.ref?.type === 'ata'} onChange={e => set({ ref: e.target.value })}>
                <option value="">Sem vínculo</option>
                {refOpts.map(o => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Anexos">{() => <AttachmentsField tenantId={t.tenantId} module="tarefas" value={f.attachments} onChange={a => set({ attachments: a })} disabled={!canEdit} />}</Field>
          {f.howMuchCents > 0 && (
            <p className="text-xs text-muted">
              Custo previsto: <Money cents={f.howMuchCents} />. Lance a despesa no financeiro quando ela acontecer.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {comments.length === 0 && <p className="text-sm text-muted">Nenhum comentário ainda.</p>}
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={i}>
                <Card className="p-3 sm:p-3">
                  <div className="text-xs text-muted">
                    {c.name} · {formatDateTime(c.at, t.tenant.timezone)}
                  </div>
                  <p className="text-sm whitespace-pre-line">{c.text}</p>
                </Card>
              </li>
            ))}
          </ul>
          {(t.can('tarefas', 'editar') || task?.whoUid === session.user?.uid) && (
            <form
              className="space-y-2"
              onSubmit={async e => {
                e.preventDefault();
                if (!comment.trim() || !task) return;
                if (await run('tasks.comment', { tenantId: t.tenantId, taskId: task.id, text: comment.trim() })) setComment('');
              }}
            >
              <Field label="Novo comentário">{id => <Textarea id={id} value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} />}</Field>
              <Button type="submit" size="sm" loading={busy} disabled={!comment.trim()}>
                Comentar
              </Button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
