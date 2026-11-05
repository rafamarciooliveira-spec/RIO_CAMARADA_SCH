/**
 * Prévia de link para publicar notícia a partir de uma matéria (ex.: jornal da cidade).
 * Lê só o que o próprio site oferece para compartilhamento: título, nome do veículo e a chamada curta
 * (og:title, og:site_name, og:description). O texto da matéria nunca é copiado.
 */
import { domainOf } from './rss.ts';

export interface LinkPreview {
  title: string;
  description: string;
  siteName: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', laquo: '"', raquo: '"', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const clean = (s: string | undefined, max: number) =>
  decodeEntities((s || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Valor de <meta property|name="x" content="..."> em qualquer ordem de atributos */
function meta(html: string, key: string): string {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key.replace(/[.:]/g, m => `\\${m}`)}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  if (!tag) return '';
  return /content\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /content\s*=\s*'([^']*)'/i.exec(tag)?.[1] ?? '';
}

/** Título legível a partir do endereço (quando o site não responde): "o-brilho-da-tradicao" vira "O brilho da tradicao" */
export function titleFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const last = decodeURIComponent(parts[parts.length - 1] || '')
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/^\d+[-_]/, '');
    const words = last.replace(/[-_]+/g, ' ').trim();
    if (words.length < 4) return '';
    return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 150);
  } catch {
    return '';
  }
}

export function parseLinkPreview(html: string, url: string): LinkPreview {
  const head = html.slice(0, 300_000);
  const title = clean(meta(head, 'og:title') || meta(head, 'twitter:title') || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1], 150);
  const description = clean(meta(head, 'og:description') || meta(head, 'description') || meta(head, 'twitter:description'), 400);
  const siteName = clean(meta(head, 'og:site_name'), 80) || domainOf(url);
  return { title: title || titleFromUrl(url), description, siteName };
}
