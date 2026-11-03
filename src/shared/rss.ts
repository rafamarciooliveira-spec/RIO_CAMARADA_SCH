/**
 * Leitura de feeds RSS 2.0 e Atom sem DOM (roda no servidor, nos testes e no navegador).
 * Extrai só o que a plataforma guarda das notícias de terceiros: título, link, fonte e data.
 * Nada do texto da matéria é aproveitado (direito autoral).
 */
import type { NewsHeadline } from './core/ports.ts';
import type { TenantRegion } from './types.ts';
import { STATE_NAMES } from './societyTypes.ts';

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·',
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã',
  eacute: 'é', Eacute: 'É', ecirc: 'ê', Ecirc: 'Ê', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó',
  ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ', uacute: 'ú', Uacute: 'Ú', uuml: 'ü', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç', ordf: 'ª', ordm: 'º', deg: '°', copy: '©', reg: '®',
};

/** Decodifica entidades HTML nomeadas e numéricas (uma passada) */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,10});/g, (all, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return all;
      return String.fromCodePoint(code);
    }
    return NAMED[ent] ?? all;
  });
}

/** Conteúdo de texto de um trecho: tira CDATA, decodifica, remove tags e espaços extras */
function textOf(raw: string | undefined): string {
  if (!raw) return '';
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = decodeEntities(s);
  // Alguns feeds trazem HTML escapado no título; remove as tags depois de decodificar
  s = s.replace(/<[^>]*>/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Primeiro elemento <tag ...>conteúdo</tag> (aceita prefixo de namespace no nome) */
function element(block: string, tag: string): { attrs: string; inner: string } | null {
  const re = new RegExp(`<${escapeRe(tag)}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${escapeRe(tag)}\\s*>)`, 'i');
  const m = re.exec(block);
  if (!m) return null;
  return { attrs: m[1] || '', inner: m[2] || '' };
}

function attr(attrs: string, name: string): string {
  const m = new RegExp(`\\s${escapeRe(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? decodeEntities(m[2] ?? m[3] ?? '').trim() : '';
}

/** Só http(s); devolve a URL normalizada ou '' */
export function safeUrl(raw: string): string {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s) || s.length > 2000) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

/** Domínio sem www (fonte quando o feed não informa o veículo) */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function toIso(raw: string): string {
  const s = textOf(raw);
  if (!s) return '';
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function parseBlock(block: string, atom: boolean): NewsHeadline | null {
  let title = textOf(element(block, 'title')?.inner);
  let url = '';
  if (atom) {
    // Atom: <link rel="alternate" href="..."/> (ou o primeiro link sem rel)
    const links = [...block.matchAll(/<link(\s[^>]*)\/?>/gi)].map(m => m[1]);
    const alt = links.find(a => !attr(a, 'rel') || attr(a, 'rel') === 'alternate') || links[0] || '';
    url = safeUrl(attr(alt, 'href'));
  } else {
    url = safeUrl(textOf(element(block, 'link')?.inner));
    if (!url) {
      const guid = element(block, 'guid');
      if (guid && attr(guid.attrs, 'isPermaLink') !== 'false') url = safeUrl(textOf(guid.inner));
    }
  }
  if (!title || !url) return null;

  const src = element(block, 'source');
  let source = src ? textOf(src.inner) : '';
  if (!source && atom) source = textOf(element(element(block, 'author')?.inner || '', 'name')?.inner);
  if (!source && src) source = domainOf(attr(src.attrs, 'url'));
  if (!source) source = domainOf(url);

  // Google News: o título termina em " - Nome do veículo"; tira a repetição
  if (source && title.endsWith(` - ${source}`) && title.length > source.length + 3) {
    title = title.slice(0, -(source.length + 3)).trim();
  }

  const publishedAt =
    toIso(element(block, 'pubDate')?.inner || '') ||
    toIso(element(block, 'published')?.inner || '') ||
    toIso(element(block, 'updated')?.inner || '') ||
    toIso(element(block, 'dc:date')?.inner || '');

  return { title: title.slice(0, 300), url, source: source.slice(0, 120), publishedAt };
}

/** Lê um feed RSS 2.0 ou Atom e devolve as manchetes (no máximo `limit`) */
export function parseFeed(xml: string, limit = 50): NewsHeadline[] {
  if (!xml) return [];
  // Comentários não contam como itens
  const text = xml.replace(/<!--[\s\S]*?-->/g, '');
  const out: NewsHeadline[] = [];
  const seen = new Set<string>();
  const items = [...text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)].map(m => ({ b: m[1], atom: false }));
  const entries = items.length ? [] : [...text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry\s*>/gi)].map(m => ({ b: m[1], atom: true }));
  for (const { b, atom } of [...items, ...entries]) {
    const h = parseBlock(b, atom);
    if (!h || seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Buscas no estilo do Google News: uma por palavra-chave (no máximo 4), com a expressão entre aspas
 * e, se pedido, o nome do estado da sociedade. Ex.: `"tiro esportivo" Santa Catarina`.
 */
export function buildNewsQuery(keywords: string[], region: TenantRegion | undefined | null, includeRegion: boolean): string[] {
  const state = includeRegion && region?.state ? STATE_NAMES[region.state.toUpperCase()] || '' : '';
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const clean = k.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length < 2) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const phrase = clean.includes(' ') ? `"${clean}"` : clean;
    out.push(state ? `${phrase} ${state}` : phrase);
    if (out.length >= 4) break;
  }
  return out;
}

/** Endereço do RSS de busca do Google News em português do Brasil */
export function googleNewsRssUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}
