/**
 * Porta de notícias do servidor: RSS de busca do Google News (pt-BR), lido por src/shared/rss.ts.
 * Limites: 8 s por requisição e 1 MB de resposta. Só título, link, fonte e data seguem adiante.
 */
import { logger } from 'firebase-functions';
import type { NewsHeadline, NewsPort } from '../../src/shared/core/ports.ts';
import { googleNewsRssUrl, parseFeed } from '../../src/shared/rss.ts';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1024 * 1024;
const USER_AGENT = 'VereinBot/1.0 (plataforma Verein de sociedades culturais; manchetes para associados)';

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('resposta grande demais');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('resposta grande demais');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

export function googleNewsPort(opts: { timeoutMs?: number; maxBytes?: number } = {}): NewsPort {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  return {
    async search(query: string, limit: number): Promise<NewsHeadline[]> {
      const q = query.slice(0, 200);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(googleNewsRssUrl(q), {
          signal: ctrl.signal,
          redirect: 'follow',
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8' },
        });
        if (!res.ok) {
          logger.warn('noticias_http', { status: res.status });
          throw new Error(`HTTP ${res.status}`);
        }
        const xml = await readLimited(res, maxBytes);
        return parseFeed(xml, Math.max(1, Math.min(limit, 50)));
      } catch (e) {
        logger.warn('noticias_falhou', { erro: (e as Error).name === 'AbortError' ? 'tempo_esgotado' : (e as Error).message.slice(0, 80) });
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
