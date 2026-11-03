/** Notícias: manchetes externas (porta falsa, sem rede) e notícias internas da sociedade. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { runDailyJobs } from '../../src/shared/core/ops.ts';
import type { NewsHeadline, NewsPort } from '../../src/shared/core/ports.ts';
import type { NewsItemDoc } from '../../src/shared/types.ts';
import { effectiveNewsConfig, MAX_EXTERNAL_NEWS } from '../../src/shared/ops/news.ts';
import { societyType } from '../../src/shared/societyTypes.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;

function fakeNews(make: (q: string) => NewsHeadline[]) {
  const calls: string[] = [];
  const port: NewsPort & { calls: string[] } = {
    calls,
    async search(q, limit) {
      calls.push(q);
      return make(q).slice(0, limit);
    },
  };
  return port;
}

const headline = (i: number, extra: Partial<NewsHeadline> = {}): NewsHeadline => ({
  title: `Manchete ${i}`,
  url: `https://jornal.example.com/n/${i}`,
  source: 'Jornal do Vale',
  publishedAt: new Date(Date.parse('2026-11-01T00:00:00Z') - i * 60_000).toISOString(),
  ...extra,
});

async function setup(make: (q: string) => NewsHeadline[] = () => [headline(1), headline(2)]) {
  const h = await makeTestTenant();
  await h.store.update(P.tenant(h.tenantId), { societyType: 'tiro_esportivo', region: { city: 'Blumenau', state: 'SC' } });
  // A criação já grava a config do tipo; apagar testa a queda no padrão do tipo da sociedade
  await h.store.delete(P.newsConfig(h.tenantId));
  const port = fakeNews(make);
  h.env.news = port;
  return { h, port };
}

const all = async (h: H) => (await h.store.query<NewsItemDoc>(P.news(h.tenantId))).map(r => r.data);
const refresh = (h: H) => h.call<{ ok: boolean; added: number; duplicates: number; blocked: number; warning?: string; queries: string[] }>('news.refresh', { tenantId: h.tenantId }, h.actors.secretario);
const post = (h: H, title = 'Nossa festa', extra: object = {}) =>
  h.call<{ id: string }>('news.post', { tenantId: h.tenantId, title, summary: 'Resumo', body: 'Texto completo', visibility: 'socios', pinned: false, ...extra }, h.actors.secretario);

describe('configuração das notícias', () => {
  it('sem nada salvo, usa as palavras do tipo da sociedade e a região', async () => {
    const { h, port } = await setup();
    const r = await refresh(h);
    const kws = societyType('tiro_esportivo').newsKeywords;
    expect(r.queries.length).toBe(Math.min(4, kws.length));
    expect(port.calls[0]).toBe(`"${kws[0]}" Santa Catarina`);
    expect(effectiveNewsConfig({ societyType: 'tiro_esportivo' }, null).keywords).toEqual(kws);
  });

  it('salva palavras-chave validadas e sem repetição', async () => {
    const { h, port } = await setup();
    await h.call('news.saveConfig', { tenantId: h.tenantId, enabled: true, keywords: ['bolão 23', 'Bolão 23', 'canto coral'], includeRegion: false, blockedSources: [] }, h.actors.secretario);
    await refresh(h);
    expect(port.calls).toEqual(['"bolão 23"', '"canto coral"']);
    await expect(
      h.call('news.saveConfig', { tenantId: h.tenantId, enabled: true, keywords: ['x'], includeRegion: false, blockedSources: [] }, h.actors.secretario)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      h.call('news.saveConfig', { tenantId: h.tenantId, enabled: true, keywords: Array.from({ length: 11 }, (_, i) => `palavra ${i}`), includeRegion: false, blockedSources: [] }, h.actors.secretario)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('manchetes externas', () => {
  it('grava só título, fonte, link e data, com hidden false explícito', async () => {
    const { h } = await setup(() => [{ ...headline(1), body: 'Texto integral da matéria', summary: 'Resumo do veículo' } as unknown as NewsHeadline]);
    await refresh(h);
    const [n] = await all(h);
    expect(n.kind).toBe('externa');
    expect(n.hidden).toBe(false);
    expect(n.title).toBe('Manchete 1');
    expect(n.source).toBe('Jornal do Vale');
    expect(n.url).toBe('https://jornal.example.com/n/1');
    expect(n.summary).toBeUndefined();
    expect(n.body).toBeUndefined();
    expect(JSON.stringify(n)).not.toContain('Texto integral');
  });

  it('não duplica a mesma URL entre buscas nem entre atualizações', async () => {
    const { h } = await setup();
    const r1 = await refresh(h);
    expect(r1.added).toBe(2); // as 4 buscas devolvem os mesmos 2 links
    const r2 = await refresh(h);
    expect(r2.added).toBe(0);
    expect(r2.duplicates).toBeGreaterThan(0);
    expect((await all(h)).length).toBe(2);
  });

  it('mantém escondida a manchete que a diretoria escondeu', async () => {
    const { h } = await setup();
    await refresh(h);
    const [first] = await all(h);
    await h.call('news.hide', { tenantId: h.tenantId, id: first.id, hidden: true }, h.actors.secretario);
    await refresh(h);
    expect((await all(h)).find(n => n.id === first.id)!.hidden).toBe(true);
  });

  it('respeita fonte bloqueada (nome ou domínio) e esconde as já gravadas', async () => {
    const { h } = await setup(() => [headline(1), headline(2, { source: 'Portal Ruim', url: 'https://portalruim.com.br/x' })]);
    await refresh(h);
    expect((await all(h)).length).toBe(2);
    const r = await h.call<{ hidden: number }>('news.saveConfig', { tenantId: h.tenantId, enabled: true, keywords: ['tiro esportivo'], includeRegion: true, blockedSources: ['portal ruim'] }, h.actors.secretario);
    expect(r.hidden).toBe(1);
    const h2 = await setup(() => [headline(3), headline(4, { source: 'Outro nome', url: 'https://www.bloqueado.com/y' })]);
    await h2.h.call('news.saveConfig', { tenantId: h2.h.tenantId, enabled: true, keywords: ['tiro esportivo'], includeRegion: true, blockedSources: ['bloqueado.com'] }, h2.h.actors.secretario);
    const r2 = await refresh(h2.h);
    expect(r2.added).toBe(1);
    expect(r2.blocked).toBe(1);
  });

  it(`guarda no máximo ${MAX_EXTERNAL_NEWS} externas e nunca apaga as internas`, async () => {
    let batch = 0;
    const { h } = await setup(() => {
      batch++;
      return Array.from({ length: 10 }, (_, i) => headline(batch * 100 + i));
    });
    const { id: internalId } = await post(h, 'Notícia antiga da casa');
    await h.store.update(`${P.news(h.tenantId)}/${internalId}`, { publishedAt: '2000-01-01T00:00:00.000Z' });
    for (let i = 0; i < 6; i++) {
      await refresh(h);
      h.clock.advance(3601_000); // passa do limite de 6 por hora
    }
    const items = await all(h);
    expect(items.filter(n => n.kind === 'externa').length).toBe(MAX_EXTERNAL_NEWS);
    expect(items.some(n => n.id === internalId)).toBe(true);
    // as que saíram são as mais antigas
    const oldest = items.filter(n => n.kind === 'externa').map(n => n.publishedAt).sort()[0];
    expect(oldest >= headline(2400).publishedAt).toBe(true);
  });

  it('limita a 6 atualizações por hora na sociedade', async () => {
    const { h } = await setup();
    for (let i = 0; i < 6; i++) await refresh(h);
    await expect(refresh(h)).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(h.call('news.refresh', { tenantId: h.tenantId }, h.actors.presidente)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('desligado ou sem porta: não busca e devolve aviso', async () => {
    const { h, port } = await setup();
    await h.call('news.saveConfig', { tenantId: h.tenantId, enabled: false, keywords: ['tiro esportivo'], includeRegion: true, blockedSources: [] }, h.actors.secretario);
    const r = await refresh(h);
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/desligadas/);
    expect(port.calls).toEqual([]);
    h.env.news = undefined;
    const r2 = await refresh(h);
    expect(r2.ok).toBe(false);
    expect(r2.warning).toBeTruthy();
    expect((await all(h)).length).toBe(0);
  });

  it('falha de uma busca não derruba as outras', async () => {
    const { h } = await setup(q => {
      if (q.includes('clube de tiro')) throw new Error('rede');
      return [headline(q.length)];
    });
    const r = await h.call<{ failedQueries: number; added: number }>('news.refresh', { tenantId: h.tenantId }, h.actors.secretario);
    expect(r.failedQueries).toBe(1);
    expect(r.added).toBeGreaterThan(0);
  });

  it('a rotina diária busca as manchetes', async () => {
    const { h, port } = await setup();
    const out = await runDailyJobs(h.env, h.tenantId);
    expect(out.find(j => j.job === 'news.daily')?.ok).toBe(true);
    expect(port.calls.length).toBeGreaterThan(0);
    expect((await all(h)).length).toBe(2);
  });
});

describe('notícias da sociedade', () => {
  it('publica, fixa, edita e apaga; externa não se edita nem se apaga', async () => {
    const { h } = await setup();
    const { id } = await post(h, 'Baile de rei', { pinned: true, visibility: 'publico', imagePath: `tenants/${'x'}/public/news/a.png` }).catch(() => ({ id: '' }));
    expect(id).toBe(''); // imagem de outra sociedade é recusada
    const r = await post(h, 'Baile de rei', { pinned: true, visibility: 'publico', imagePath: `tenants/${h.tenantId}/public/news/a.png` });
    let n = (await all(h)).find(x => x.id === r.id)!;
    expect(n).toMatchObject({ kind: 'interna', hidden: false, pinned: true, visibility: 'publico', body: 'Texto completo' });
    await h.call('news.update', { tenantId: h.tenantId, id: r.id, title: 'Baile do rei', summary: 'Novo', body: 'Novo texto', visibility: 'socios', pinned: false }, h.actors.secretario);
    n = (await all(h)).find(x => x.id === r.id)!;
    expect(n).toMatchObject({ title: 'Baile do rei', visibility: 'socios', pinned: false, imagePath: '' });
    await refresh(h);
    const ext = (await all(h)).find(x => x.kind === 'externa')!;
    await expect(h.call('news.update', { tenantId: h.tenantId, id: ext.id, title: 'Mudou', summary: 'x', body: '', visibility: 'socios', pinned: false }, h.actors.secretario)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(h.call('news.delete', { tenantId: h.tenantId, id: ext.id }, h.actors.secretario)).rejects.toMatchObject({ code: 'failed-precondition' });
    await h.call('news.pin', { tenantId: h.tenantId, id: ext.id, pinned: true }, h.actors.secretario);
    expect((await all(h)).find(x => x.id === ext.id)!.pinned).toBe(true);
    await h.call('news.delete', { tenantId: h.tenantId, id: r.id }, h.actors.secretario);
    expect((await all(h)).some(x => x.id === r.id)).toBe(false);
  });

  it('sócio não atualiza, não publica, não configura e não esconde', async () => {
    const { h, port } = await setup();
    const { who } = await makeMember(h);
    await expect(h.call('news.refresh', { tenantId: h.tenantId }, who)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(h.call('news.post', { tenantId: h.tenantId, title: 'Minha notícia', summary: 'x', body: 'y', visibility: 'publico', pinned: false }, who)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(h.call('news.saveConfig', { tenantId: h.tenantId, enabled: false, keywords: [], includeRegion: false, blockedSources: [] }, who)).rejects.toMatchObject({ code: 'permission-denied' });
    await refresh(h);
    const ext = (await all(h))[0];
    await expect(h.call('news.hide', { tenantId: h.tenantId, id: ext.id, hidden: true }, who)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(h.call('news.refresh', { tenantId: h.tenantId }, h.actors.estranho)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(port.calls.length).toBe(4); // só a atualização da diretoria buscou
  });

  it('tesoureiro (só ver) não publica', async () => {
    const { h } = await setup();
    await expect(post(h).then(() => h.call('news.post', { tenantId: h.tenantId, title: 'Outra', summary: 'x', body: '', visibility: 'socios', pinned: false }, h.actors.tesoureiro))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
