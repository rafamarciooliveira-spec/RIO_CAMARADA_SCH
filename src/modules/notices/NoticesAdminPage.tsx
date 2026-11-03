/** Comunicação da diretoria: criar, agendar, segmentar, anexar, editar e acompanhar confirmações. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Eye, Megaphone, Pencil, Pin, Plus, Trash2, Upload, X } from 'lucide-react';
import { useData, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { NoticeDoc, NoticeReadDoc } from '../../shared/types.ts';
import { randomId } from '../../utils/image.ts';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, Notice, PageHeader, Textarea, Toggle, useConfirm } from '../../ui/index.tsx';
import { AttachmentLink, audienceText, isoToLocalInput, localInputToIso } from './noticeUtils.tsx';

type Draft = {
  title: string;
  body: string;
  mode: 'todos' | 'segmento' | 'diretoria';
  categoryIds: string[];
  groups: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string;
  channels: ('app' | 'push' | 'email')[];
  requireReadConfirmation: boolean;
  attachments: { path: string; name: string }[];
};

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function fromNotice(n?: NoticeDoc): Draft {
  if (!n) return { title: '', body: '', mode: 'todos', categoryIds: [], groups: '', pinned: false, publishAt: '', expiresAt: '', channels: ['app'], requireReadConfirmation: false, attachments: [] };
  return {
    title: n.title,
    body: n.body,
    mode: n.audience.boardOnly ? 'diretoria' : n.audience.all ? 'todos' : 'segmento',
    categoryIds: n.audience.categoryIds,
    groups: n.audience.groups.join(', '),
    pinned: n.pinned,
    publishAt: n.status === 'agendado' ? isoToLocalInput(n.publishAt) : '',
    expiresAt: isoToLocalInput(n.expiresAt),
    channels: n.channels,
    requireReadConfirmation: n.requireReadConfirmation,
    attachments: n.attachments || [],
  };
}

export default function NoticesAdminPage() {
  const t = useTenant();
  const { run } = useOp();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const list = useList<NoticeDoc>(P.notices(t.tenantId), { orderBy: [['createdAt', 'desc']], limit: 100 });
  const presetCat = params.get('categoria');
  const [editing, setEditing] = useState<(NoticeDoc & { id: string }) | 'novo' | null>(presetCat ? 'novo' : null);
  const [readsOf, setReadsOf] = useState<(NoticeDoc & { id: string }) | null>(null);
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const catName = (id: string) => t.settings?.categories.find(c => c.id === id)?.name || id;
  const canEdit = t.can('avisos', 'editar');

  const remove = async (n: NoticeDoc & { id: string }) => {
    if (!(await confirm({ title: 'Apagar aviso', text: `"${n.title}" some do portal de todos. As notificações já enviadas continuam no histórico de cada pessoa.`, confirmLabel: 'Apagar', danger: true }))) return;
    await run('notices.delete', { tenantId: t.tenantId, id: n.id }, { success: 'Aviso apagado.' });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comunicação"
        subtitle="Avisos no portal, por e-mail e notificação no celular. O e-mail só vai para quem aceitou receber."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setEditing('novo')}>
            Novo aviso
          </Button>
        }
      />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Megaphone className="w-5 h-5" />} title="Nenhum aviso publicado" action={<Button onClick={() => setEditing('novo')}>Escrever o primeiro aviso</Button>} />
      ) : (
        <ul className="space-y-2">
          {list.data.map(n => {
            const expired = !!n.expiresAt && n.expiresAt < nowIso;
            return (
              <li key={n.id} className="p-4 rounded-2xl bg-surface border border-line flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.pinned && <Pin className="w-4 h-4 text-accent" aria-label="Fixado" />}
                    <span className="font-semibold">{n.title}</span>
                    {n.status === 'agendado' ? (
                      <Badge tone="info">
                        <Clock className="w-3 h-3 mr-1" aria-hidden /> Agendado
                      </Badge>
                    ) : expired ? (
                      <Badge>Expirado</Badge>
                    ) : (
                      <Badge tone="ok">Publicado</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {formatDateTime(n.publishAt, t.tenant.timezone)} · Para: {audienceText(n.audience, catName, t.labels.board)} · Canais: {n.channels.map(c => (c === 'app' ? 'portal' : c === 'email' ? 'e-mail' : 'push')).join(', ')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="secondary" icon={<Eye className="w-4 h-4" />} onClick={() => setReadsOf(n)}>
                    {n.readCount || 0} {n.requireReadConfirmation ? 'confirmações' : 'leituras'}
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(n)} aria-label={`Editar ${n.title}`} />
                      <Button size="sm" variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={() => remove(n)} aria-label={`Apagar ${n.title}`} />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <NoticeForm notice={editing === 'novo' ? undefined : editing} presetCategory={editing === 'novo' ? presetCat : null} onClose={() => setEditing(null)} />}
      {readsOf && <ReadsModal n={readsOf} onClose={() => setReadsOf(null)} />}
    </div>
  );
}

function ReadsModal({ n, onClose }: { n: NoticeDoc & { id: string }; onClose: () => void }) {
  const t = useTenant();
  const reads = useList<NoticeReadDoc>(`${P.notice(t.tenantId, n.id)}/reads`, { orderBy: [['at', 'desc']], limit: 500 });
  return (
    <Modal open onClose={onClose} title={`Leituras de "${n.title}"`}>
      {reads.loading ? (
        <Loading />
      ) : reads.data.length === 0 ? (
        <EmptyState title="Ninguém confirmou ainda" />
      ) : (
        <ul className="divide-y divide-line">
          {reads.data.map(r => (
            <li key={r.id} className="flex justify-between gap-2 py-2 text-sm">
              <span>{r.displayName}</span>
              <span className="text-xs text-muted">{formatDateTime(r.at, t.tenant.timezone)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function NoticeForm({ notice, presetCategory, onClose }: { notice?: NoticeDoc & { id: string }; presetCategory: string | null; onClose: () => void }) {
  const t = useTenant();
  const { client } = useData();
  const { run, busy } = useOp();
  const [d, setD] = useState<Draft>(() => {
    const base = fromNotice(notice);
    if (presetCategory) return { ...base, mode: 'segmento', categoryIds: [presetCategory] };
    return base;
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => `aviso_${Date.now()}`);
  const set = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }));
  const cats = t.settings?.categories || [];
  const scheduledLocked = !!notice && notice.status !== 'agendado';

  const addFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (!ALLOWED.includes(f.type)) return setError('Anexe PDF, imagem (JPG, PNG, WEBP) ou documento do Word.');
    if (f.size > 10 * 1024 * 1024) return setError('Anexo grande demais (máximo de 10 MB).');
    if (d.attachments.length >= 10) return setError('No máximo 10 anexos.');
    setUploading(true);
    try {
      const safe = f.name.replace(/[^\w.-]+/g, '_').slice(-80);
      const path = `tenants/${t.tenantId}/attachments/avisos/${randomId()}-${safe}`;
      await client.upload(path, f, f.type);
      set({ attachments: [...d.attachments, { path, name: f.name.slice(0, 150) }] });
    } catch {
      setError('Não foi possível enviar o anexo.');
    } finally {
      setUploading(false);
    }
  };

  const toggleChannel = (c: 'app' | 'push' | 'email', on: boolean) => set({ channels: on ? [...new Set([...d.channels, c])] : d.channels.filter(x => x !== c) });

  const save = async () => {
    setError('');
    if (d.title.trim().length < 3) return setError('Escreva um título.');
    if (!d.body.trim()) return setError('Escreva o texto do aviso.');
    if (!d.channels.length) return setError('Escolha ao menos um canal.');
    const groups = d.groups.split(',').map(g => g.trim()).filter(Boolean);
    if (d.mode === 'segmento' && !d.categoryIds.length && !groups.length) return setError('Escolha ao menos uma categoria ou grupo.');
    const data = {
      title: d.title.trim(),
      body: d.body.trim(),
      audience: { all: d.mode === 'todos', boardOnly: d.mode === 'diretoria', categoryIds: d.mode === 'segmento' ? d.categoryIds : [], groups: d.mode === 'segmento' ? groups : [] },
      pinned: d.pinned,
      ...(d.publishAt && !scheduledLocked ? { publishAt: localInputToIso(d.publishAt) } : {}),
      expiresAt: d.expiresAt ? localInputToIso(d.expiresAt) : '',
      channels: d.channels,
      requireReadConfirmation: d.requireReadConfirmation,
      attachments: d.attachments,
    };
    if (notice) {
      const r = await run('notices.update', { tenantId: t.tenantId, id: notice.id, data }, { success: 'Aviso atualizado.' });
      if (r) onClose();
      return;
    }
    const r = await run<{ scheduled: boolean; notified: number; emailed: number }>('notices.publish', { tenantId: t.tenantId, requestId, ...data }, { success: d.publishAt ? 'Aviso agendado.' : 'Aviso publicado.' });
    if (r) {
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={notice ? 'Editar aviso' : 'Novo aviso'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={uploading} onClick={save}>
            {notice ? 'Salvar' : d.publishAt ? 'Agendar' : 'Publicar agora'}
          </Button>
        </>
      }
    >
      <Field label="Título" required>
        {id => <Input id={id} value={d.title} maxLength={150} onChange={e => set({ title: e.target.value })} />}
      </Field>
      <Field label="Texto" required>
        {id => <Textarea id={id} value={d.body} maxLength={8000} rows={6} onChange={e => set({ body: e.target.value })} />}
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted">Para quem</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {(
            [
              ['todos', 'Todos'],
              ['segmento', 'Categorias ou grupos'],
              ['diretoria', `Só ${t.labels.board.toLowerCase()}`],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name="publico" checked={d.mode === v} onChange={() => set({ mode: v })} />
              {l}
            </label>
          ))}
        </div>
        {d.mode === 'segmento' && (
          <div className="space-y-2 p-3 rounded-xl bg-surface-2">
            <div className="flex flex-wrap gap-2">
              {cats.map(c => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={d.categoryIds.includes(c.id)} onChange={e => set({ categoryIds: e.target.checked ? [...d.categoryIds, c.id] : d.categoryIds.filter(x => x !== c.id) })} />
                  {c.name}
                </label>
              ))}
            </div>
            <Field label="Grupos" hint="Separados por vírgula, como no cadastro. Exemplo: coral, dança">
              {id => <Input id={id} value={d.groups} onChange={e => set({ groups: e.target.value })} />}
            </Field>
          </div>
        )}
      </fieldset>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Publicar em" hint={scheduledLocked ? 'Já publicado.' : 'Vazio publica agora. Horário deste aparelho.'}>
          {id => <Input id={id} type="datetime-local" disabled={scheduledLocked} value={d.publishAt} onChange={e => set({ publishAt: e.target.value })} />}
        </Field>
        <Field label="Válido até (opcional)">
          {id => <Input id={id} type="datetime-local" value={d.expiresAt} onChange={e => set({ expiresAt: e.target.value })} />}
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted">Canais</legend>
        <Toggle checked={d.channels.includes('app')} onChange={v => toggleChannel('app', v)} label="No portal (com notificação no sino)" />
        <Toggle checked={d.channels.includes('email')} onChange={v => toggleChannel('email', v)} label="Por e-mail (só para quem aceitou receber)" />
        <Toggle checked={d.channels.includes('push')} onChange={v => toggleChannel('push', v)} label="Notificação no celular" />
        {d.channels.includes('push') && <p className="text-[11px] text-muted">A notificação no celular chega a quem instalou o portal e permitiu notificações.</p>}
        {notice && <p className="text-[11px] text-muted">Mudar canais depois de publicado não reenvia o aviso.</p>}
      </fieldset>
      <Toggle checked={d.pinned} onChange={v => set({ pinned: v })} label="Fixar no topo" />
      <Toggle checked={d.requireReadConfirmation} onChange={v => set({ requireReadConfirmation: v })} label="Pedir confirmação de leitura" />
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted">Anexos</div>
        <div className="flex flex-wrap gap-2">
          {d.attachments.map(a => (
            <span key={a.path} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 text-xs">
              <AttachmentLink a={a} />
              <button type="button" aria-label={`Remover ${a.name}`} onClick={() => set({ attachments: d.attachments.filter(x => x.path !== a.path) })} className="p-0.5 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-2 border border-line cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4" aria-hidden />
          {uploading ? 'Enviando...' : 'Anexar arquivo'}
          <input type="file" accept={ALLOWED.join(',')} className="sr-only" disabled={uploading} onChange={e => addFile(e.target.files?.[0])} />
        </label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}
