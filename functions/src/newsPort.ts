/**
 * Porta de notícias do servidor: RSS de busca do Google News (pt-BR), lido por src/shared/rss.ts.
 * Limites: 8 s por requisição e 1 MB de resposta. Só título, link, fonte e data seguem adiante.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { logger } from 'firebase-functions';
import type { NewsHeadline, NewsPort } from '../../src/shared/core/ports.ts';
import { parseLinkPreview } from '../../src/shared/linkPreview.ts';
import { googleNewsRssUrl, parseFeed, safeUrl } from '../../src/shared/rss.ts';

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

/** Endereço interno (rede local, nuvem, loopback): a prévia de link nunca vai até lá */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocolo');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('porta');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|metadata(\.google\.internal)?)$/i.test(host) || host.endsWith('.internal') || host.endsWith('.local')) throw new Error('host interno');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new Error('host interno');
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
    async preview(raw: string) {
      let url = safeUrl(raw);
      if (!url) throw new Error('link inválido');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        // Redirecionamentos seguidos à mão (até 3), conferindo cada destino
        for (let hop = 0; hop < 4; hop++) {
          const u = new URL(url);
          await assertPublicHost(u);
          const res = await fetch(u, { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9' } });
          if (res.status >= 300 && res.status < 400) {
            const next = res.headers.get('location');
            if (!next || hop === 3) throw new Error('redirecionamentos demais');
            url = safeUrl(new URL(next, u).toString());
            if (!url) throw new Error('redirecionamento inválido');
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') || '')) throw new Error('não é página');
          const html = await readLimited(res, maxBytes);
          return parseLinkPreview(html, url);
        }
        throw new Error('redirecionamentos demais');
      } catch (e) {
        logger.warn('previa_link_falhou', { erro: (e as Error).name === 'AbortError' ? 'tempo_esgotado' : (e as Error).message.slice(0, 80) });
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
