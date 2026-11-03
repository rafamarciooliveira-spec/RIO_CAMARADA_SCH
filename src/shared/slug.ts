/** Slug da sociedade: minúsculas, sem acento, a-z0-9 e hífen. */

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'master', 'login', 'logout', 'app', 'www', 'v', 'suporte', 'ajuda', 'help',
  'demo', 'ver-sistema', 'sodalis', 'static', 'assets', 'public', 'privacidade', 'termos',
  'cadastro', 'conta', 'config', 'configuracoes', 'portal', 'painel', 'dashboard', 'blog',
  'precos', 'planos', 'contato', 'sobre', 'status', 'docs', 'mail', 'email', 'ftp', 'cdn',
  'auth', 'oauth', 'callback', 'webhook', 'webhooks', 'ics', 'robots.txt', 'sitemap.xml',
  'favicon.ico', 'manifest.webmanifest', 'sw.js', 'convite', 'invite', 'null', 'undefined', 'entrar',
]);

export function normalizeSlug(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}

export type SlugProblem = 'curto' | 'reservado' | 'formato' | null;

export function slugProblem(slug: string): SlugProblem {
  if (slug.length < 3) return 'curto';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return 'formato';
  if (RESERVED_SLUGS.has(slug)) return 'reservado';
  return null;
}

export const SLUG_PROBLEM_TEXT: Record<Exclude<SlugProblem, null>, string> = {
  curto: 'Use pelo menos 3 caracteres.',
  reservado: 'Este endereço é reservado pela plataforma.',
  formato: 'Use só letras, números e hífen.',
};
