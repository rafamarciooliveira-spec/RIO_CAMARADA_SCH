/** Leitura de RSS/Atom sem DOM e montagem das buscas de notícias. */
import { describe, expect, it } from 'vitest';
import { buildNewsQuery, decodeEntities, googleNewsRssUrl, parseFeed } from '../../src/shared/rss.ts';

const GOOGLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<generator>NFE/5.0</generator><title>"tiro esportivo" Santa Catarina - Google Notícias</title>
<link>https://news.google.com/search?q=tiro</link>
<!-- <item><title>Comentado</title><link>https://x.com/c</link></item> -->
<item>
  <title>Clube de tiro de Blumenau vence estadual &amp; leva tr&#xEA;s medalhas - NSC Total</title>
  <link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link>
  <guid isPermaLink="false">CBMiAAA</guid>
  <pubDate>Mon, 02 Nov 2026 14:30:00 GMT</pubDate>
  <description>&lt;a href="https://news.google.com/rss/articles/CBMiAAA"&gt;Texto da matéria que não deve ser guardado&lt;/a&gt;</description>
  <source url="https://www.nsctotal.com.br">NSC Total</source>
</item>
<item>
  <title><![CDATA[Festa do Tiro reúne 5 mil pessoas em Pomerode]]></title>
  <link>https://g1.globo.com/sc/noticia/festa.ghtml</link>
  <pubDate>Sun, 01 Nov 2026 10:00:00 -0300</pubDate>
</item>
<item>
  <title>Sem link não entra</title>
</item>
<item>
  <title>Link perigoso</title>
  <link>javascript:alert(1)</link>
</item>
<item>
  <title>Repetida</title>
  <link>https://g1.globo.com/sc/noticia/festa.ghtml</link>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed da federação</title>
  <entry>
    <title type="html">Calend&aacute;rio 2027 &quot;oficial&quot;</title>
    <link rel="alternate" href="https://federacao.example.org/noticias/calendario"/>
    <link rel="edit" href="https://federacao.example.org/edit/1"/>
    <id>tag:federacao,2026:1</id>
    <updated>2026-10-30T12:00:00Z</updated>
    <author><name>Federação Catarinense</name></author>
    <summary>Resumo que não guardamos</summary>
  </entry>
  <entry>
    <title>Sem autor</title>
    <link href="https://www.exemplo.org/a"/>
    <published>2026-10-29T08:00:00-03:00</published>
  </entry>
</feed>`;

describe('parseFeed (RSS do Google Notícias)', () => {
  const items = parseFeed(GOOGLE);

  it('extrai só título, link, fonte e data dos itens válidos', () => {
    expect(items.length).toBe(2);
    expect(Object.keys(items[0]).sort()).toEqual(['publishedAt', 'source', 'title', 'url']);
    expect(JSON.stringify(items)).not.toContain('não deve ser guardado');
  });

  it('decodifica entidades e tira o nome do veículo repetido no título', () => {
    expect(items[0].title).toBe('Clube de tiro de Blumenau vence estadual & leva três medalhas');
    expect(items[0].source).toBe('NSC Total');
    expect(items[0].url).toBe('https://news.google.com/rss/articles/CBMiAAA?oc=5');
    expect(items[0].publishedAt).toBe('2026-11-02T14:30:00.000Z');
  });

  it('lê CDATA, usa o domínio como fonte e ignora comentário, link perigoso e repetido', () => {
    expect(items[1].title).toBe('Festa do Tiro reúne 5 mil pessoas em Pomerode');
    expect(items[1].source).toBe('g1.globo.com');
    expect(items[1].publishedAt).toBe('2026-11-01T13:00:00.000Z');
    expect(items.some(i => i.title === 'Comentado' || i.title === 'Link perigoso')).toBe(false);
  });

  it('respeita o limite', () => {
    expect(parseFeed(GOOGLE, 1).length).toBe(1);
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('<html>não é feed</html>')).toEqual([]);
  });
});

describe('parseFeed (Atom)', () => {
  const items = parseFeed(ATOM);
  it('usa o link alternate, o autor como fonte e a data de atualização', () => {
    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      title: 'Calendário 2027 "oficial"',
      url: 'https://federacao.example.org/noticias/calendario',
      source: 'Federação Catarinense',
      publishedAt: '2026-10-30T12:00:00.000Z',
    });
    expect(items[1].source).toBe('exemplo.org');
    expect(items[1].publishedAt).toBe('2026-10-29T11:00:00.000Z');
  });
});

describe('decodeEntities', () => {
  it('nomeadas, decimais e hexadecimais; desconhecidas ficam como estão', () => {
    expect(decodeEntities('S&atilde;o Jos&#233; &#x26; &quot;cia&quot; &foo;')).toBe('São José & "cia" &foo;');
    expect(decodeEntities('&#0; &#xD800;')).toBe('&#0; &#xD800;');
  });
});

describe('buildNewsQuery', () => {
  it('uma busca por palavra-chave, com aspas e o nome do estado', () => {
    expect(buildNewsQuery(['tiro esportivo', 'bolão'], { city: 'Blumenau', state: 'SC' }, true)).toEqual([
      '"tiro esportivo" Santa Catarina',
      'bolão Santa Catarina',
    ]);
  });

  it('sem região, sem repetição e no máximo 4', () => {
    const q = buildNewsQuery(['a b', 'A B', 'c d', '"e f"', 'g h', 'i j', 'x'], { city: 'X', state: 'SC' }, false);
    expect(q).toEqual(['"a b"', '"c d"', '"e f"', '"g h"']);
    expect(buildNewsQuery(['folclore'], undefined, true)).toEqual(['folclore']);
  });

  it('endereço do RSS em português do Brasil', () => {
    expect(googleNewsRssUrl('"tiro esportivo" Santa Catarina')).toBe(
      'https://news.google.com/rss/search?q=%22tiro%20esportivo%22%20Santa%20Catarina&hl=pt-BR&gl=BR&ceid=BR:pt-419'
    );
  });
});
