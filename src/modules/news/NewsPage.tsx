/**
 * Notícias: "Da sociedade" (notícias internas, fixadas primeiro) e "Na região" (manchetes de outros veículos,
 * só título, fonte, data e link). Quem tem notícias/editar atualiza, configura, esconde e bloqueia fontes.
 */
import { useMemo, useState } from 'react';
import { EyeOff, Eye, ExternalLink, ImagePlus, Newspaper, Pencil, Pin, PinOff, Plus, RefreshCw, Settings2, ShieldBan, Trash2, X } from 'lucide-react';
import { useData, useDoc, useFileUrl, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import { effectiveNewsConfig, type RefreshResult, type StoredNewsConfig } from '../../shared/ops/news.ts';
import { BR_STATES, STATE_NAMES, societyType } from '../../shared/societyTypes.ts';
import type { NewsItemDoc } from '../../shared/types.ts';
import { randomId, resizeImage } from '../../utils/image.ts';
import { Badge, Button, cx, EmptyState, ErrorState, Field, Input, LoadMore, Loading, Modal, Notice, PageHeader, Select, Tabs, Textarea, Toggle, useConfirm, useToast } from '../../ui/index.tsx';

type Item = NewsItemDoc & { id: string };
type Tab = 'interna' | 'externa';
const PAGE = 20;

/** "há 5 min", "há 3 h", "ontem", "há 4 dias" ou a data */
function relativeTime(iso: string, now = Date.now(), tz?: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return formatDate(iso, tz);
}

export default function NewsPage() {
  const t = useTenant();
  const canEdit = t.can('noticias', 'editar');
  const canCreate = t.can('noticias', 'criar');
  const [tab, setTab] = useState<Tab>('interna');
  const [limits, setLimits] = useState<Record<Tab, number>>({ interna: PAGE, externa: PAGE });
  const [editing, setEditing] = useState<Item | 'novo' | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const { run, busy } = useOp();
  const toast = useToast();

  // Quem não edita só pode pedir o que não está escondido (as regras exigem o filtro)
  const where: [string, '==', unknown][] = canEdit ? [['kind', '==', tab]] : [['hidden', '==', false], ['kind', '==', tab]];
  const list = useList<NewsItemDoc>(P.news(t.tenantId), { where, orderBy: [['publishedAt', 'desc']], limit: limits[tab] });
  const cfgDoc = useDoc<StoredNewsConfig>(canEdit ? P.newsConfig(t.tenantId) : null);
  const cfg = effectiveNewsConfig(t.tenant, cfgDoc.data);

  const items = useMemo(
    () => [...list.data].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt)),
    [list.data]
  );
  const more = list.data.length >= limits[tab];

  const refresh = async () => {
    const r = await run<RefreshResult>('news.refresh', { tenantId: t.tenantId });
    if (!r) return;
    if (!r.ok) toast.show(r.warning || 'Nada foi buscado.', 'info');
    else if (r.failedQueries && !r.added) toast.show('Os veículos não responderam agora. Tente de novo mais tarde.', 'erro');
    else toast.show(r.added ? `${r.added} manchete${r.added > 1 ? 's' : ''} nova${r.added > 1 ? 's' : ''}.` : 'Nenhuma manchete nova por enquanto.', 'sucesso');
    setTab('externa');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notícias"
        subtitle="O que acontece na sociedade e as manchetes do nosso meio na região."
        actions={
          <>
            {canCreate && (
              <Button icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setEditing('novo')}>
                Publicar notícia
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="secondary" loading={busy} icon={<RefreshCw className="w-4 h-4" aria-hidden />} onClick={refresh}>
                  Atualizar agora
                </Button>
                <Button variant="secondary" icon={<Settings2 className="w-4 h-4" aria-hidden />} onClick={() => setConfigOpen(true)}>
                  Configurar
                </Button>
              </>
            )}
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'interna', label: 'Da sociedade' },
          { id: 'externa', label: 'Na região' },
        ]}
      />

      {tab === 'externa' && (
        <Notice>
          As manchetes vêm de outros veículos e o conteúdo pertence a cada um deles. Aqui aparecem só o título, a fonte e a data; ao tocar, a notícia abre no site original.
        </Notice>
      )}
      {tab === 'externa' && canEdit && !cfg.enabled && <Notice tone="warn">As manchetes da região estão desligadas. Ligue em Configurar.</Notice>}

      {list.loading && !list.data.length ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : items.length === 0 ? (
        tab === 'interna' ? (
          <EmptyState
            icon={<Newspaper className="w-5 h-5" />}
            title="Nenhuma notícia da sociedade ainda"
            text={canCreate ? 'Conte aos sócios o que aconteceu: uma festa, uma conquista, uma visita.' : 'Quando a diretoria publicar, as notícias aparecem aqui.'}
          />
        ) : (
          <EmptyState
            icon={<Newspaper className="w-5 h-5" />}
            title="Nenhuma manchete por enquanto"
            text={
              canEdit
                ? 'As manchetes chegam uma vez por dia, pelas palavras-chave configuradas. Use Atualizar agora para buscar já.'
                : 'As manchetes chegam uma vez por dia. Volte mais tarde.'
            }
          />
        )
      ) : (
        <ul className="space-y-3">
          {items.map(n =>
            n.kind === 'externa' ? (
              <ExternalCard key={n.id} n={n} canEdit={canEdit} blocked={cfg.blockedSources} onBlock={async source => {
                if (!cfg.blockedSources.includes(source)) {
                  await run('news.saveConfig', { tenantId: t.tenantId, enabled: cfg.enabled, keywords: cfg.keywords, includeRegion: cfg.includeRegion, blockedSources: [...cfg.blockedSources, source] }, { success: `Fonte ${source} bloqueada.` });
                }
              }} />
            ) : (
              <InternalCard key={n.id} n={n} canEdit={canEdit} onEdit={() => setEditing(n)} />
            )
          )}
        </ul>
      )}
      {items.length > 0 && <LoadMore loading={list.loading} done={!more} onClick={() => setLimits(l => ({ ...l, [tab]: l[tab] + PAGE }))} />}

      {tab === 'externa' && canEdit && cfgDoc.data?.lastRefreshAt && (
        <p className="text-xs text-muted">Última busca: {formatDateTime(cfgDoc.data.lastRefreshAt, t.tenant.timezone)}.</p>
      )}

      {editing && <NewsEditor item={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} />}
      {configOpen && <ConfigModal stored={cfgDoc.data} onClose={() => setConfigOpen(false)} />}
    </div>
  );
}

// ---------- Manchete externa ----------
function ExternalCard({ n, canEdit, blocked, onBlock }: { n: Item; canEdit: boolean; blocked: string[]; onBlock: (source: string) => Promise<void> }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const source = n.source || 'Fonte não informada';
  const isBlocked = blocked.some(b => b.toLowerCase() === source.toLowerCase());
  return (
    <li className={cx('rounded-2xl border bg-surface p-4', n.hidden ? 'border-line opacity-60' : n.pinned ? 'border-accent/50' : 'border-line')}>
      <div className="flex items-start gap-3">
        {n.pinned ? <Pin className="w-4 h-4 text-accent shrink-0 mt-1" aria-label="Fixada" /> : <Newspaper className="w-4 h-4 text-muted shrink-0 mt-1" aria-hidden />}
        <div className="min-w-0 flex-1">
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline focus-visible:underline inline-flex items-start gap-1.5"
          >
            <span>{n.title}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-1 text-muted" aria-hidden />
            <span className="sr-only">(abre o site {source} em outra aba)</span>
          </a>
          <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-fg/80">{source}</span>
            <span aria-hidden>·</span>
            <time dateTime={n.publishedAt} title={formatDateTime(n.publishedAt, t.tenant.timezone)}>
              {relativeTime(n.publishedAt, Date.now(), t.tenant.timezone)}
            </time>
            {n.hidden && <Badge tone="warn">Escondida dos sócios</Badge>}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2 mt-3 pl-7">
          <Button size="sm" variant="ghost" disabled={busy} icon={n.hidden ? <Eye className="w-3.5 h-3.5" aria-hidden /> : <EyeOff className="w-3.5 h-3.5" aria-hidden />}
            onClick={() => run('news.hide', { tenantId: t.tenantId, id: n.id, hidden: !n.hidden }, { success: n.hidden ? 'Manchete visível de novo.' : 'Manchete escondida.' })}>
            {n.hidden ? 'Mostrar' : 'Esconder'}
          </Button>
          {!n.hidden && (
            <Button size="sm" variant="ghost" disabled={busy} icon={n.pinned ? <PinOff className="w-3.5 h-3.5" aria-hidden /> : <Pin className="w-3.5 h-3.5" aria-hidden />}
              onClick={() => run('news.pin', { tenantId: t.tenantId, id: n.id, pinned: !n.pinned })}>
              {n.pinned ? 'Desafixar' : 'Fixar'}
            </Button>
          )}
          {n.source && !isBlocked && (
            <Button size="sm" variant="ghost" disabled={busy} icon={<ShieldBan className="w-3.5 h-3.5" aria-hidden />}
              onClick={async () => {
                const ok = await confirm({ title: 'Bloquear fonte', text: `As manchetes de ${source} deixam de aparecer, inclusive as que já estão aqui. Dá para desbloquear em Configurar.`, confirmLabel: 'Bloquear', danger: true });
                if (ok) await onBlock(source);
              }}>
              Bloquear fonte
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Notícia da sociedade ----------
function InternalCard({ n, canEdit, onEdit }: { n: Item; canEdit: boolean; onEdit: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const img = useFileUrl(n.imagePath || null, true);
  const [open, setOpen] = useState(false);
  const hasBody = !!n.body && n.body !== n.summary;
  return (
    <li className={cx('rounded-2xl border bg-surface overflow-hidden', n.pinned ? 'border-accent/50' : 'border-line')}>
      {img && <img src={img} alt="" className="w-full max-h-64 object-cover" loading="lazy" />}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {n.pinned && <Pin className="w-4 h-4 text-accent" aria-label="Fixada" />}
          <h2 className="font-semibold text-base">{n.title}</h2>
          {canEdit && <Badge tone={n.visibility === 'publico' ? 'info' : 'neutral'}>{n.visibility === 'publico' ? 'Pública' : 'Só sócios'}</Badge>}
        </div>
        <time className="block text-xs text-muted mt-0.5" dateTime={n.publishedAt}>{formatDateTime(n.publishedAt, t.tenant.timezone)}</time>
        {n.summary && <p className="text-sm mt-2">{n.summary}</p>}
        {hasBody && open && <p className="text-sm mt-3 whitespace-pre-line">{n.body}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          {hasBody && (
            <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen(o => !o)}>
              {open ? 'Mostrar menos' : 'Ler notícia'}
            </Button>
          )}
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" aria-hidden />} onClick={onEdit}>Editar</Button>
              <Button size="sm" variant="ghost" disabled={busy} icon={n.pinned ? <PinOff className="w-3.5 h-3.5" aria-hidden /> : <Pin className="w-3.5 h-3.5" aria-hidden />}
                onClick={() => run('news.pin', { tenantId: t.tenantId, id: n.id, pinned: !n.pinned })}>
                {n.pinned ? 'Desafixar' : 'Fixar'}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />}
                onClick={async () => {
                  if (await confirm({ title: 'Apagar notícia', text: `"${n.title}" sai do ar para todos. Não dá para desfazer.`, confirmLabel: 'Apagar', danger: true })) {
                    await run('news.delete', { tenantId: t.tenantId, id: n.id }, { success: 'Notícia apagada.' });
                  }
                }}>
                Apagar
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------- Publicar / editar ----------
function NewsEditor({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const t = useTenant();
  const { client } = useData();
  const { run, busy } = useOp();
  const [title, setTitle] = useState(item?.title || '');
  const [summary, setSummary] = useState(item?.summary || '');
  const [body, setBody] = useState(item?.body || '');
  const [imagePath, setImagePath] = useState(item?.imagePath || '');
  const [visibility, setVisibility] = useState<'publico' | 'socios'>(item?.visibility || 'socios');
  const [pinned, setPinned] = useState(item?.pinned || false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => `noticia_${randomId()}`.slice(0, 60));
  const preview = useFileUrl(imagePath || null, true);
  const publicOn = !!t.tenant.publicPage?.enabled;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setError('Use uma imagem JPG, PNG ou WEBP.');
    setUploading(true);
    try {
      const blob = await resizeImage(f, 1600, 'image/jpeg');
      if (blob.size > 2 * 1024 * 1024) throw new Error('grande');
      const path = `tenants/${t.tenantId}/public/news/${randomId()}.jpg`;
      await client.upload(path, blob, 'image/jpeg');
      setImagePath(path);
    } catch {
      setError('Não foi possível enviar a imagem (até 2 MB depois de reduzida).');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError('');
    if (title.trim().length < 3) return setError('Escreva um título com pelo menos 3 letras.');
    if (!summary.trim() && !body.trim()) return setError('Escreva um resumo ou o texto da notícia.');
    const data = { tenantId: t.tenantId, title: title.trim(), summary: summary.trim(), body: body.trim(), imagePath, visibility, pinned };
    const r = item
      ? await run('news.update', { ...data, id: item.id }, { success: 'Notícia atualizada.' })
      : await run('news.post', { ...data, requestId }, { success: 'Notícia publicada.' });
    if (r) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Editar notícia' : 'Publicar notícia'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} disabled={uploading} onClick={save}>{item ? 'Salvar' : 'Publicar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="1. Título" required>{id => <Input id={id} value={title} maxLength={150} onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="2. Resumo" hint="Uma ou duas frases. Aparece no cartão da notícia.">
          {id => <Textarea id={id} rows={2} maxLength={400} value={summary} onChange={e => setSummary(e.target.value)} />}
        </Field>
        <Field label="3. Texto completo" hint="Opcional. O sócio abre em Ler notícia.">
          {id => <Textarea id={id} rows={8} maxLength={20000} value={body} onChange={e => setBody(e.target.value)} />}
        </Field>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">4. Imagem (opcional)</div>
          {preview && <img src={preview} alt="Imagem escolhida para a notícia" className="w-full max-h-48 object-cover rounded-xl border border-line" />}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl font-semibold bg-surface-2 border border-line cursor-pointer hover:border-muted focus-within:ring-2 focus-within:ring-accent">
              <ImagePlus className="w-3.5 h-3.5" aria-hidden />
              {uploading ? 'Enviando...' : imagePath ? 'Trocar imagem' : 'Escolher imagem'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={e => pick(e.target.files?.[0])} />
            </label>
            {imagePath && (
              <Button size="sm" variant="ghost" icon={<X className="w-3.5 h-3.5" aria-hidden />} onClick={() => setImagePath('')}>Tirar imagem</Button>
            )}
          </div>
        </div>
        <Field label="5. Quem pode ver" hint={publicOn ? undefined : 'A página pública da sociedade está desligada; por enquanto só os sócios veem.'}>
          {id => (
            <Select id={id} value={visibility} onChange={e => setVisibility(e.target.value as 'publico' | 'socios')}>
              <option value="socios">Só sócios</option>
              <option value="publico">Todos, também na página pública</option>
            </Select>
          )}
        </Field>
        <Toggle checked={pinned} onChange={setPinned} label="6. Fixar no topo da lista" />
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Modal>
  );
}

// ---------- Configurar busca ----------
function ConfigModal({ stored, onClose }: { stored: StoredNewsConfig | null; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const start = effectiveNewsConfig(t.tenant, stored);
  const [enabled, setEnabled] = useState(start.enabled);
  const [keywords, setKeywords] = useState<string[]>(start.keywords);
  const [includeRegion, setIncludeRegion] = useState(start.includeRegion);
  const [blocked, setBlocked] = useState<string[]>(start.blockedSources);
  const [typed, setTyped] = useState('');
  const [city, setCity] = useState(t.tenant.region?.city || '');
  const [uf, setUf] = useState(t.tenant.region?.state || '');
  const [error, setError] = useState('');
  const canRegion = t.can('sociedade', 'editar');
  const suggestions = societyType(t.tenant.societyType).newsKeywords.filter(k => !keywords.some(x => x.toLowerCase() === k.toLowerCase()));

  const add = (k: string) => {
    const v = k.replace(/\s+/g, ' ').trim();
    setError('');
    if (v.length < 2 || v.length > 60) return setError('Cada palavra-chave precisa ter de 2 a 60 caracteres.');
    if (keywords.length >= 10) return setError('No máximo 10 palavras-chave.');
    if (keywords.some(x => x.toLowerCase() === v.toLowerCase())) return setTyped('');
    setKeywords([...keywords, v]);
    setTyped('');
  };

  const save = async () => {
    setError('');
    if (enabled && !keywords.length) return setError('Cadastre ao menos uma palavra-chave ou desligue as manchetes.');
    if (canRegion && (city.trim() !== (t.tenant.region?.city || '') || uf !== (t.tenant.region?.state || ''))) {
      const ok = await run('tenant.update', { tenantId: t.tenantId, region: { city: city.trim(), state: uf } });
      if (!ok) return;
    }
    const r = await run('news.saveConfig', { tenantId: t.tenantId, enabled, keywords, includeRegion, blockedSources: blocked }, { success: 'Configuração das notícias salva.' });
    if (r) onClose();
  };

  const stateName = STATE_NAMES[(canRegion ? uf : t.tenant.region?.state) || ''];

  return (
    <Modal
      open
      onClose={onClose}
      title="Configurar manchetes da região"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Toggle checked={enabled} onChange={setEnabled} label="1. Buscar manchetes uma vez por dia" />

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">2. Palavras-chave ({keywords.length} de 10)</div>
          <p className="text-xs text-muted">Cada palavra-chave vira uma busca; usamos as 4 primeiras.</p>
          {keywords.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {keywords.map((k, i) => (
                <li key={k} className={cx('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm', i < 4 ? 'border-accent/50' : 'border-line text-muted')}>
                  {k}
                  <button type="button" className="p-0.5 rounded-full hover:bg-surface-2 cursor-pointer" aria-label={`Tirar ${k}`} onClick={() => setKeywords(keywords.filter(x => x !== k))}>
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma palavra-chave.</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              add(typed);
            }}
          >
            <Input aria-label="Nova palavra-chave" placeholder="Ex.: festa do tiro" value={typed} maxLength={60} onChange={e => setTyped(e.target.value)} />
            <Button type="submit" variant="secondary" icon={<Plus className="w-4 h-4" aria-hidden />}>Incluir</Button>
          </form>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Sugestões para {societyType(t.tenant.societyType).label.toLowerCase()}:</span>
              {suggestions.map(s => (
                <button key={s} type="button" onClick={() => add(s)} className="text-xs rounded-full border border-dashed border-line px-2.5 py-1 hover:border-muted cursor-pointer">
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">3. Região</div>
          {canRegion && (
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label="Cidade">{id => <Input id={id} value={city} maxLength={80} onChange={e => setCity(e.target.value)} />}</Field>
              <Field label="UF">
                {id => (
                  <Select id={id} value={uf} onChange={e => setUf(e.target.value)}>
                    <option value="">Escolha</option>
                    {BR_STATES.map(x => <option key={x} value={x}>{x}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          )}
          <Toggle
            checked={includeRegion}
            onChange={setIncludeRegion}
            label={stateName ? `Procurar só notícias de ${stateName}` : 'Procurar só notícias do estado da sociedade'}
          />
          {includeRegion && !stateName && (
            <p className="text-xs text-warn">
              {canRegion ? 'Escolha a UF para a busca usar o estado.' : 'O estado da sociedade não está cadastrado; peça a quem cuida das configurações.'}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">4. Fontes bloqueadas</div>
          {blocked.length ? (
            <ul className="flex flex-wrap gap-2">
              {blocked.map(b => (
                <li key={b} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm">
                  {b}
                  <button type="button" className="p-0.5 rounded-full hover:bg-surface-2 cursor-pointer" aria-label={`Desbloquear ${b}`} onClick={() => setBlocked(blocked.filter(x => x !== b))}>
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma. Para bloquear, use Bloquear fonte numa manchete.</p>
          )}
        </div>

        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Modal>
  );
}
