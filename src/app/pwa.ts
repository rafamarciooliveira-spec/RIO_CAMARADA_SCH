/**
 * PWA por sociedade: manifest gerado em tempo de execução (nome, ícone e cores da sociedade)
 * e registro do service worker (public/sw.js), que só guarda o app shell. Dados pessoais
 * nunca vão para o cache do service worker; a cópia mínima da carteirinha fica no
 * localStorage com prefixo sodalis_card_ (apagada ao sair).
 */
import type { Branding } from '../shared/types.ts';

interface PwaTenant {
  name: string;
  shortName?: string;
  slug: string;
  branding: Pick<Branding, 'primaryColor' | 'secondaryColor' | 'theme'>;
}

let lastManifestUrl: string | null = null;
let swRequested = false;

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Ícone quadrado gerado em canvas quando a sociedade não tem imagem própria */
function fallbackIcon(t: PwaTenant, size: number): string {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (!g) return '';
    g.fillStyle = t.branding.primaryColor || '#1f3b2d';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#ffffff';
    g.font = `bold ${Math.round(size * 0.42)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const initials = (t.shortName || t.name)
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 2)
      .map(w => w[0]!.toUpperCase())
      .join('');
    g.fillText(initials || 'S', size / 2, size / 2 + size * 0.03);
    return c.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * Instala o manifest da sociedade e registra o service worker.
 * iconUrl: URL de imagem (logo pública); se ausente, gera ícone com as iniciais.
 * basePath: '' no real, '/ver-sistema' na demonstração (lá não registramos service worker).
 */
export function setupTenantPwa(t: PwaTenant, iconUrl?: string | null, basePath = ''): void {
  if (typeof document === 'undefined') return;
  const startUrl = `${location.origin}${basePath}/${t.slug}/inicio`;
  const icon192 = iconUrl || fallbackIcon(t, 192);
  const icon512 = iconUrl || fallbackIcon(t, 512);
  const manifest = {
    name: t.name,
    short_name: (t.shortName || t.name).slice(0, 24),
    start_url: startUrl,
    scope: `${location.origin}${basePath}/${t.slug}/`,
    display: 'standalone',
    background_color: t.branding.theme === 'claro' ? '#ffffff' : '#0b0f0d',
    theme_color: t.branding.primaryColor,
    lang: 'pt-BR',
    icons: [
      ...(icon192 ? [{ src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' }] : []),
      ...(icon512 ? [{ src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] : []),
    ],
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  const url = URL.createObjectURL(blob);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = url;
  if (lastManifestUrl) URL.revokeObjectURL(lastManifestUrl);
  lastManifestUrl = url;
  setMeta('theme-color', t.branding.primaryColor);
  setMeta('apple-mobile-web-app-title', manifest.short_name);
  setMeta('apple-mobile-web-app-capable', 'yes');
  setMeta('mobile-web-app-capable', 'yes');
  // Ícone da tela inicial do iPhone (o Safari usa este, não o do manifest)
  if (icon192) {
    let touch = document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!touch) {
      touch = document.createElement('link');
      touch.rel = 'apple-touch-icon';
      document.head.appendChild(touch);
    }
    touch.href = icon192;
  }

  if (!basePath && !swRequested && 'serviceWorker' in navigator && location.protocol === 'https:') {
    swRequested = true;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}
