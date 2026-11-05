/**
 * Manchetes FICTÍCIAS da demonstração. Não há rede: os itens são montados a partir da busca,
 * com fonte "Jornal Exemplo (fictício)" e links em exemplo.invalid (domínio que nunca existe).
 */
import type { NewsHeadline, NewsPort } from '../shared/core/ports.ts';
import { titleFromUrl } from '../shared/linkPreview.ts';
import { domainOf } from '../shared/rss.ts';

const TEMPLATES = [
  'Temporada de {k} começa com recorde de inscritos{r}',
  'Associações de {k} se reúnem para planejar o calendário{r}',
  'Prefeitura apoia evento de {k} no fim de semana{r}',
  'Jovens descobrem o {k} em oficinas gratuitas{r}',
  'Final regional de {k} lota o salão da comunidade{r}',
  'Voluntários restauram sede histórica ligada ao {k}{r}',
];

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Busca "tiro esportivo" Santa Catarina → palavra-chave e região */
function splitQuery(query: string): { keyword: string; region: string } {
  const m = /^"([^"]+)"\s*(.*)$/.exec(query.trim());
  if (m) return { keyword: m[1], region: m[2].trim() };
  const [first, ...rest] = query.trim().split(/\s+/);
  return { keyword: first || 'cultura', region: rest.join(' ') };
}

export function createDemoNews(now: () => Date = () => new Date()): NewsPort {
  return {
    async search(query, limit) {
      const { keyword, region } = splitQuery(query);
      const base = now().getTime();
      const n = Math.min(limit, 4);
      const out: NewsHeadline[] = [];
      // A posição do modelo varia com a busca para que cada palavra-chave traga manchetes diferentes
      const offset = [...keyword].reduce((s, c) => s + c.charCodeAt(0), 0) % TEMPLATES.length;
      for (let i = 0; i < n; i++) {
        const tpl = TEMPLATES[(offset + i) % TEMPLATES.length];
        const title = tpl.replace('{k}', keyword).replace('{r}', region ? ` em ${region}` : '');
        out.push({
          title: `${title} (exemplo fictício)`,
          url: `https://exemplo.invalid/noticias/${slugify(keyword)}-${slugify(region || 'brasil')}-${i + 1}`,
          source: 'Jornal Exemplo (fictício)',
          publishedAt: new Date(base - (i * 9 + 2) * 3600_000).toISOString(),
        });
      }
      return out;
    },
    // Sem rede na demonstração: o título sai do próprio endereço
    async preview(url) {
      return { title: titleFromUrl(url) || 'Matéria (exemplo fictício)', description: '', siteName: domainOf(url) };
    },
  };
}
