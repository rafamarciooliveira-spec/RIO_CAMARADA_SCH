/**
 * Notícias: notícias internas da sociedade e manchetes externas (RSS de notícias) por palavra-chave e região.
 *
 * Direito autoral: das manchetes externas guardamos SÓ título, fonte, link e data. O texto da matéria
 * nunca é copiado; o sócio lê no site do veículo.
 * A busca externa passa pela porta ctx.news (o servidor faz a requisição; a demonstração devolve itens fictícios).
 */
import { z } from 'zod';
import { defineOp, fail, registerJobs, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import type { NewsHeadline } from '../core/ports.ts';
import { P } from '../paths.ts';
import { buildNewsQuery, domainOf, safeUrl } from '../rss.ts';
import { titleFromUrl } from '../linkPreview.ts';
import { societyType } from '../societyTypes.ts';
import type { NewsConfig, NewsItemDoc, TenantDoc } from '../types.ts';
import { tid } from './helpers.ts';

/** Quantas manchetes externas cada sociedade guarda (as mais antigas saem) */
export const MAX_EXTERNAL_NEWS = 200;
/** Atualizações manuais por hora, por sociedade */
export const REFRESH_PER_HOUR = 6;
const PER_QUERY = 10;

/** Como o documento fica gravado (campos de controle além do NewsConfig) */
export type StoredNewsConfig = Partial<NewsConfig> & { lastRefreshAt?: string; lastRefreshAdded?: number };

/** Configuração em vigor: o que foi salvo ou, sem nada salvo, o padrão do tipo da sociedade */
export function effectiveNewsConfig(tenant: Pick<TenantDoc, 'societyType'>, stored: StoredNewsConfig | null | undefined): NewsConfig {
  const preset = societyType(tenant.societyType);
  return {
    enabled: stored?.enabled ?? true,
    keywords: stored?.keywords?.length ? stored.keywords : [...preset.newsKeywords],
    includeRegion: stored?.includeRegion ?? true,
    blockedSources: stored?.blockedSources || [],
    preferredSources: stored?.preferredSources || [],
    updatedAt: stored?.updatedAt || '',
  };
}

/** Comparação de fonte sem diferença de maiúsculas, acentos e espaços */
export function normalizeSource(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^www\./i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Domínio de um site digitado pela diretoria (com ou sem https://, com ou sem www.) */
export function siteDomain(site: string): string {
  const raw = site.trim().toLowerCase();
  try {
    return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A manchete é de uma das fontes da região? Devolve o nome cadastrado */
export function preferredSourceOf(url: string, source: string, preferred: NewsConfig['preferredSources']): string | null {
  const d = domainOf(url).replace(/^www\./, '');
  for (const p of preferred) {
    const pd = siteDomain(p.site);
    if ((pd && (d === pd || d.endsWith(`.${pd}`))) || normalizeSource(p.name) === normalizeSource(source)) return p.name;
  }
  return null;
}

/** Busca própria para cada fonte da região: as palavras-chave da sociedade dentro do site do veículo */
export function preferredQueries(cfg: Pick<NewsConfig, 'keywords' | 'preferredSources'>, max = 3): string[] {
  const words = cfg.keywords
    .slice(0, 3)
    .map(k => k.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim())
    .filter(k => k.length >= 2)
    .map(k => (k.includes(' ') ? `"${k}"` : k));
  const out: string[] = [];
  for (const p of cfg.preferredSources) {
    const d = siteDomain(p.site);
    if (!d) continue;
    out.push(words.length ? `site:${d} (${words.join(' OR ')})` : `site:${d}`);
    if (out.length >= max) break;
  }
  return out;
}

export function isBlockedSource(source: string, url: string, blocked: string[]): boolean {
  if (!blocked.length) return false;
  const set = new Set(blocked.map(normalizeSource));
  return set.has(normalizeSource(source)) || set.has(normalizeSource(domainOf(url)));
}

/** Id determinístico da manchete: o mesmo link nunca entra duas vezes */
export async function externalNewsId(ctx: Pick<OpContext, 'crypto'>, url: string): Promise<string> {
  return `ext_${(await ctx.crypto.sha256Hex(url)).slice(0, 24)}`;
}

const zKeywords = z
  .array(z.string().trim().min(2, 'cada palavra-chave precisa de 2 a 60 caracteres').max(60, 'cada palavra-chave precisa de 2 a 60 caracteres'))
  .max(10, 'no máximo 10 palavras-chave');

/** Limite por sociedade (o executor só limita por ip ou por usuário) */
async function tenantRateLimit(ctx: OpContext, name: string, max: number, windowSec: number): Promise<void> {
  const path = P.rateLimit(`${name}_${tid(ctx)}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200));
  const nowMs = ctx.now().getTime();
  await ctx.store.runTransaction(async tx => {
    const cur = await tx.get<{ count: number; windowStart: number }>(path);
    if (!cur || nowMs - cur.windowStart > windowSec * 1000) {
      tx.set(path, { count: 1, windowStart: nowMs, expiresAt: new Date(nowMs + windowSec * 1000).toISOString() });
      return;
    }
    if (cur.count >= max) fail('resource-exhausted', 'As manchetes já foram atualizadas várias vezes nesta hora. Tente mais tarde.');
    tx.update(path, { count: cur.count + 1 });
  });
}

export interface RefreshResult {
  ok: boolean;
  warning?: string;
  queries: string[];
  added: number;
  duplicates: number;
  blocked: number;
  failedQueries: number;
  removed: number;
}

/** Busca as manchetes de todas as buscas da sociedade e grava as novas (usado pela tela e pela rotina diária) */
export async function refreshHeadlines(ctx: OpContext): Promise<RefreshResult> {
  const t = tid(ctx);
  const stored = await ctx.store.get<StoredNewsConfig>(P.newsConfig(t));
  const cfg = effectiveNewsConfig(ctx.tenant!, stored);
  const empty: RefreshResult = { ok: false, queries: [], added: 0, duplicates: 0, blocked: 0, failedQueries: 0, removed: 0 };
  if (!ctx.news) return { ...empty, warning: 'A busca de manchetes não está disponível neste ambiente.' };
  if (!cfg.enabled) return { ...empty, warning: 'As manchetes da região estão desligadas nas configurações de notícias.' };
  // Fontes da região primeiro (sem filtro de estado: o próprio site já é da região)
  const queries = [...preferredQueries(cfg), ...buildNewsQuery(cfg.keywords, ctx.tenant!.region, cfg.includeRegion)];
  if (!queries.length) return { ...empty, warning: 'Cadastre ao menos uma palavra-chave.' };

  const res: RefreshResult = { ...empty, ok: true, queries };
  const seen = new Set<string>();
  // A mesma matéria republicada por vários sites (mesmo título) entra uma vez só
  const titleKey = (x: string) => normalizeSource(x).replace(/[^a-z0-9 ]/g, '').slice(0, 120);
  const titles = new Set((await ctx.store.query<NewsItemDoc>(P.news(t), { where: [['kind', '==', 'externa']] })).map(r => titleKey(r.data.title)));
  const nowMs = ctx.now().getTime();
  for (const q of queries) {
    let list: NewsHeadline[] = [];
    try {
      list = await ctx.news.search(q, PER_QUERY);
    } catch {
      res.failedQueries++;
      continue;
    }
    for (const h of list.slice(0, PER_QUERY)) {
      const url = safeUrl(String(h?.url || ''));
      const title = String(h?.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!url || !title) continue;
      const rawSource = String(h.source || '').replace(/\s+/g, ' ').trim().slice(0, 120) || domainOf(url);
      const preferredName = preferredSourceOf(url, rawSource, cfg.preferredSources);
      const source = preferredName || rawSource;
      if (isBlockedSource(source, url, cfg.blockedSources)) {
        res.blocked++;
        continue;
      }
      const id = await externalNewsId(ctx, url);
      if (seen.has(id)) continue;
      seen.add(id);
      if (titles.has(titleKey(title))) {
        res.duplicates++;
        continue;
      }
      titles.add(titleKey(title));
      const path = `${P.news(t)}/${id}`;
      if (await ctx.store.get(path)) {
        res.duplicates++;
        continue; // mantém hidden/pinned decididos pela diretoria
      }
      const pubMs = Date.parse(String(h.publishedAt || ''));
      const publishedAt = Number.isFinite(pubMs) ? new Date(Math.min(pubMs, nowMs)).toISOString() : ctx.nowIso;
      // Só título, fonte, link e data: nenhum texto da matéria
      const doc: NewsItemDoc = {
        id,
        kind: 'externa',
        title,
        url,
        source,
        publishedAt,
        pinned: false,
        hidden: false,
        visibility: 'socios',
        query: q.slice(0, 120),
        ...(preferredName ? { preferred: true } : {}),
        createdAt: ctx.nowIso,
      };
      await ctx.store.set(path, doc as unknown as Record<string, unknown>);
      res.added++;
    }
  }

  // Guarda só as mais recentes; as internas nunca entram nessa conta
  const externals = await ctx.store.query<NewsItemDoc>(P.news(t), { where: [['kind', '==', 'externa']] });
  if (externals.length > MAX_EXTERNAL_NEWS) {
    const sorted = externals.sort((a, b) => Number(!!b.data.manual) - Number(!!a.data.manual) || Number(b.data.pinned) - Number(a.data.pinned) || b.data.publishedAt.localeCompare(a.data.publishedAt));
    for (const row of sorted.slice(MAX_EXTERNAL_NEWS)) {
      await ctx.store.delete(row.path);
      res.removed++;
    }
  }

  await ctx.store.set(P.newsConfig(t), { lastRefreshAt: ctx.nowIso, lastRefreshAdded: res.added }, { merge: true });
  return res;
}

// ---------- Configuração ----------
export const saveNewsConfig = defineOp({
  name: 'news.saveConfig',
  input: zTenant.extend({
    enabled: z.boolean(),
    keywords: zKeywords,
    includeRegion: z.boolean(),
    blockedSources: z.array(zText(120).min(1)).max(50),
    // Opcional: quem só bloqueia uma fonte (botão na manchete) não apaga as fontes da região
    preferredSources: z.array(z.object({ name: zText(120).min(2), site: zText(200) })).max(10).optional(),
  }),
  auth: 'user',
  tenant: { perm: ['noticias', 'editar'] },
  module: 'noticias',
  rateLimit: { per: 'uid', max: 60, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const dedupe = (list: string[]) => {
      const seen = new Set<string>();
      return list.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => {
        const k = normalizeSource(s);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    const keywords = dedupe(input.keywords);
    const blockedSources = dedupe(input.blockedSources);
    const prev = effectiveNewsConfig(ctx.tenant!, await ctx.store.get<StoredNewsConfig>(P.newsConfig(t)));
    const preferredSources = input.preferredSources?.map(p => {
      const site = p.site.trim() ? siteDomain(p.site) : '';
      if (p.site.trim() && !site) fail('invalid-argument', `O site de "${p.name}" não parece um endereço. Ex.: reportergabrieljunior.com.br`);
      return { name: p.name.replace(/\s+/g, ' ').trim(), site };
    });
    await ctx.store.set(
      P.newsConfig(t),
      { enabled: input.enabled, keywords, includeRegion: input.includeRegion, blockedSources, ...(preferredSources ? { preferredSources } : {}), updatedAt: ctx.nowIso },
      { merge: true }
    );
    // Fonte recém bloqueada: as manchetes dela que já estão gravadas somem da lista
    const fresh = blockedSources.filter(s => !prev.blockedSources.some(p => normalizeSource(p) === normalizeSource(s)));
    let hidden = 0;
    if (fresh.length) {
      const externals = await ctx.store.query<NewsItemDoc>(P.news(t), { where: [['kind', '==', 'externa']] });
      for (const row of externals) {
        if (!row.data.hidden && isBlockedSource(row.data.source || '', row.data.url || '', fresh)) {
          await ctx.store.update(row.path, { hidden: true });
          hidden++;
        }
      }
    }
    await ctx.audit('news.config_saved', undefined, { keywords: keywords.length, blocked: blockedSources.length, enabled: input.enabled });
    return { ok: true, keywords, blockedSources, hidden };
  },
});

// ---------- Atualização das manchetes ----------
export const refreshNews = defineOp({
  name: 'news.refresh',
  input: zTenant,
  auth: 'user',
  tenant: { perm: ['noticias', 'editar'] },
  module: 'noticias',
  async run(ctx) {
    await tenantRateLimit(ctx, 'news.refresh', REFRESH_PER_HOUR, 3600);
    const r = await refreshHeadlines(ctx);
    await ctx.audit('news.refreshed', undefined, { added: r.added, removed: r.removed, failed: r.failedQueries });
    return r;
  },
});

registerJobs([
  {
    name: 'news.daily',
    async run(ctx) {
      if (ctx.tenant?.modules?.noticias === false) return;
      await refreshHeadlines(ctx);
    },
  },
]);

/** Título, chamada e veículo de um link (a fonte da região cadastrada dá o nome do veículo) */
async function previewLink(ctx: OpContext, url: string): Promise<{ title: string; summary: string; source: string; fetched: boolean }> {
  let title = '';
  let summary = '';
  let source = domainOf(url);
  let fetched = false;
  if (ctx.news?.preview) {
    try {
      const p = await ctx.news.preview(url);
      title = p.title;
      summary = p.description;
      source = p.siteName || source;
      fetched = true;
    } catch {
      // Site fora do ar ou bloqueando robôs: o título sai do endereço e a diretoria confere
    }
  }
  const cfg = effectiveNewsConfig(ctx.tenant!, await ctx.store.get<StoredNewsConfig>(P.newsConfig(tid(ctx))));
  source = preferredSourceOf(url, source, cfg.preferredSources) || source;
  return { title: (title || titleFromUrl(url)).slice(0, 300), summary: summary.slice(0, 400), source: source.slice(0, 120), fetched };
}

// ---------- Notícias da própria sociedade ----------
const zNewsFields = z.object({
  // Com o link, o título pode vir vazio: o servidor busca na própria matéria
  title: zText(150),
  summary: zText(400),
  body: zText(20000),
  imagePath: z.string().max(300).optional().or(z.literal('')),
  visibility: z.enum(['publico', 'socios']),
  pinned: z.boolean(),
  /** Matéria completa em outro site (ex.: o jornal da cidade falou da sociedade) */
  url: z.string().max(2000).optional().or(z.literal('')),
  source: zText(120).optional(),
});

function checkLink(url: string | undefined): { url?: string; source?: string } {
  if (!url) return {};
  const ok = safeUrl(url);
  if (!ok) fail('invalid-argument', 'O link precisa começar com https://');
  return { url: ok };
}

/** Completa título, resumo e veículo pelo link quando a diretoria só colou o endereço */
async function fillFromLink(ctx: OpContext, input: { title: string; summary: string; source?: string }, url: string | undefined): Promise<{ title: string; summary: string; source: string }> {
  let title = input.title.trim();
  let summary = input.summary.trim();
  let source = (input.source || '').trim();
  if (url && (title.length < 3 || !summary || !source)) {
    const p = await previewLink(ctx, url);
    title = title.length >= 3 ? title : p.title;
    summary = summary || p.summary;
    source = source || p.source;
  }
  if (title.length < 3) fail('invalid-argument', 'Escreva um título com pelo menos 3 letras ou cole o link da matéria.');
  return { title: title.slice(0, 150), summary: summary.slice(0, 400), source: source || (url ? domainOf(url) : '') };
}

function checkImage(ctx: OpContext, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const prefix = `tenants/${tid(ctx)}/public/news/`;
  if (!path.startsWith(prefix) || path.includes('..') || !/^[A-Za-z0-9/_.-]+$/.test(path)) fail('invalid-argument', 'Imagem fora da pasta de notícias.');
  return path;
}

async function getItem(ctx: OpContext, id: string): Promise<NewsItemDoc> {
  const n = await ctx.store.get<NewsItemDoc>(`${P.news(tid(ctx))}/${id}`);
  if (!n) fail('not-found', 'Notícia não encontrada.');
  return n!;
}

export const postNews = defineOp({
  name: 'news.post',
  input: zTenant.extend(zNewsFields.shape),
  auth: 'user',
  tenant: { perm: ['noticias', 'criar'] },
  module: 'noticias',
  idempotent: true,
  rateLimit: { per: 'uid', max: 60, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const link = checkLink(input.url || undefined);
    if (!input.summary && !input.body && !link.url) fail('invalid-argument', 'Escreva um resumo, o texto da notícia ou cole o link da matéria.');
    const filled = await fillFromLink(ctx, input, link.url);
    const imagePath = checkImage(ctx, input.imagePath || undefined);
    const id = ctx.store.newId();
    const doc: NewsItemDoc = {
      id,
      kind: 'interna',
      title: filled.title,
      summary: filled.summary,
      body: input.body,
      ...(imagePath ? { imagePath } : {}),
      ...(link.url ? { url: link.url, source: filled.source } : {}),
      publishedAt: ctx.nowIso,
      pinned: input.pinned,
      hidden: false,
      visibility: input.visibility,
      createdAt: ctx.nowIso,
    };
    await ctx.store.set(`${P.news(t)}/${id}`, doc as unknown as Record<string, unknown>);
    await ctx.audit('news.posted', id, { visibility: input.visibility });
    return { id };
  },
});

export const updateNews = defineOp({
  name: 'news.update',
  input: zTenant.extend({ id: zId, ...zNewsFields.shape }),
  auth: 'user',
  tenant: { perm: ['noticias', 'editar'] },
  module: 'noticias',
  async run(ctx, input) {
    const t = tid(ctx);
    const cur = await getItem(ctx, input.id);
    if (cur.kind !== 'interna') fail('failed-precondition', 'Manchetes de outros veículos não podem ser editadas, só escondidas.');
    const link = checkLink(input.url || undefined);
    if (!input.summary && !input.body && !link.url) fail('invalid-argument', 'Escreva um resumo, o texto da notícia ou cole o link da matéria.');
    const filled = await fillFromLink(ctx, input, link.url);
    const imagePath = checkImage(ctx, input.imagePath || undefined);
    if (cur.imagePath && cur.imagePath !== imagePath) await ctx.files.remove(cur.imagePath).catch(() => undefined);
    await ctx.store.set(
      `${P.news(t)}/${input.id}`,
      {
        ...(cur as unknown as Record<string, unknown>),
        title: filled.title,
        summary: filled.summary,
        body: input.body,
        imagePath: imagePath || '',
        url: link.url || '',
        source: link.url ? filled.source : '',
        visibility: input.visibility,
        pinned: input.pinned,
        hidden: false,
      }
    );
    await ctx.audit('news.updated', input.id);
    return { ok: true };
  },
});

export const deleteNews = defineOp({
  name: 'news.delete',
  input: zTenant.extend({ id: zId }),
  auth: 'user',
  tenant: { perm: ['noticias', 'editar'] },
  module: 'noticias',
  async run(ctx, input) {
    const cur = await getItem(ctx, input.id);
    if (cur.kind !== 'interna') fail('failed-precondition', 'Manchetes de outros veículos não se apagam: esconda ou bloqueie a fonte.');
    if (cur.imagePath) await ctx.files.remove(cur.imagePath).catch(() => undefined);
    await ctx.store.delete(`${P.news(tid(ctx))}/${input.id}`);
    await ctx.audit('news.deleted', input.id);
    return { ok: true };
  },
});

export const hideNews = defineOp({
  name: 'news.hide',
  input: zTenant.extend({ id: zId, hidden: z.boolean() }),
  auth: 'user',
  tenant: { perm: ['noticias', 'editar'] },
  module: 'noticias',
  async run(ctx, input) {
    const cur = await getItem(ctx, input.id);
    if (cur.kind !== 'externa') fail('failed-precondition', 'Para tirar uma notícia da sociedade do ar, apague ou edite.');
    await ctx.store.update(`${P.news(tid(ctx))}/${input.id}`, { hidden: input.hidden, ...(input.hidden ? { pinned: false } : {}) });
    await ctx.audit(input.hidden ? 'news.hidden' : 'news.shown', input.id);
    return { ok: true };
  },
});

export const pinNews = defineOp({
  name: 'news.pin',
  input: zTenant.extend({ id: zId, pinned: z.boolean() }),
  auth: 'user',
  tenant: { perm: ['noticias', 'editar'] },
  module: 'noticias',
  async run(ctx, input) {
    const cur = await getItem(ctx, input.id);
    if (input.pinned && cur.hidden) fail('failed-precondition', 'Mostre a manchete antes de fixar.');
    await ctx.store.update(`${P.news(tid(ctx))}/${input.id}`, { pinned: input.pinned });
    await ctx.audit(input.pinned ? 'news.pinned' : 'news.unpinned', input.id);
    return { ok: true };
  },
});

// ---------- Publicar por link ----------
/** Lê título, chamada e veículo de uma matéria para preencher a notícia (nada é gravado aqui) */
export const linkPreview = defineOp({
  name: 'news.linkPreview',
  input: zTenant.extend({ url: z.string().min(8).max(2000) }),
  auth: 'user',
  tenant: { perm: ['noticias', 'criar'] },
  module: 'noticias',
  rateLimit: { per: 'uid', max: 40, windowSec: 3600 },
  async run(ctx, input) {
    const url = safeUrl(input.url);
    if (!url) fail('invalid-argument', 'O link precisa começar com https://');
    return { url, ...(await previewLink(ctx, url!)) };
  },
});

/** Manchete de outro veículo colada pela diretoria (aparece em "Na região"); o mesmo link não entra duas vezes */
export const addNewsLink = defineOp({
  name: 'news.addLink',
  input: zTenant.extend({ url: z.string().min(8).max(2000), title: zText(300).optional(), source: zText(120).optional(), visibility: z.enum(['publico', 'socios']), pinned: z.boolean() }),
  auth: 'user',
  tenant: { perm: ['noticias', 'criar'] },
  module: 'noticias',
  rateLimit: { per: 'uid', max: 60, windowSec: 3600 },
  async run(ctx, input) {
    const t = tid(ctx);
    const url = safeUrl(input.url);
    if (!url) fail('invalid-argument', 'O link precisa começar com https://');
    const id = await externalNewsId(ctx, url);
    const path = `${P.news(t)}/${id}`;
    const cur = await ctx.store.get<NewsItemDoc>(path);
    let title = (input.title || '').trim();
    let source = (input.source || '').trim();
    if (title.length < 3 || !source) {
      const p = await previewLink(ctx, url!);
      title = title.length >= 3 ? title : p.title;
      source = source || p.source;
    }
    if (title.length < 3) fail('invalid-argument', 'Não foi possível ler o título da matéria. Escreva o título.');
    const cfg = effectiveNewsConfig(ctx.tenant!, await ctx.store.get<StoredNewsConfig>(P.newsConfig(t)));
    const doc: NewsItemDoc = {
      id,
      kind: 'externa',
      title,
      url: url!,
      source: source || domainOf(url!),
      publishedAt: cur?.publishedAt || ctx.nowIso,
      pinned: input.pinned,
      hidden: false,
      visibility: input.visibility,
      manual: true,
      ...(preferredSourceOf(url!, source, cfg.preferredSources) ? { preferred: true } : {}),
      createdAt: cur?.createdAt || ctx.nowIso,
    };
    await ctx.store.set(path, doc as unknown as Record<string, unknown>);
    await ctx.audit('news.link_added', id, { source: doc.source || '' });
    return { id, existed: !!cur };
  },
});

export const newsOps = [saveNewsConfig, refreshNews, postNews, updateNews, deleteNews, hideNews, pinNews, linkPreview, addNewsLink];
