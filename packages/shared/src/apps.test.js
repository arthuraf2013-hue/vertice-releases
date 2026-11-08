import { describe, it, expect } from 'vitest';
import {
  youtubeId, youtubeEmbedUrl, parseFeed, parsePrice, formatMoney, parsePriceCsv, priceListForTv,
  summarizeWeather, aggregatePlays, toCsv, normalizeApp, safeHttpUrl, priceMediaId,
} from './apps.js';
import { buildManifest, expandPlaylist } from './manifest.js';

describe('aplicativos', () => {
  it('reconhece o id do YouTube em qualquer formato de link', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=3', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ']) {
      expect(youtubeId(u)).toBe('dQw4w9WgXcQ');
    }
    expect(youtubeId('https://vimeo.com/123')).toBe(null);
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toContain('mute=1');
  });

  it('só aceita link http(s)', () => {
    expect(safeHttpUrl('https://g1.globo.com')).toBe('https://g1.globo.com/');
    expect(safeHttpUrl('javascript:alert(1)')).toBe(null);
  });

  it('completa a configuração com os padrões e recusa tipo desconhecido', () => {
    expect(normalizeApp({ kind: 'clock', config: { message: 'Oi' } }).config).toMatchObject({ message: 'Oi', showDate: true });
    expect(normalizeApp({ kind: 'xyz' })).toBe(null);
  });

  it('lê manchetes de RSS e Atom, com CDATA e acentos', () => {
    const rss = `<?xml version="1.0"?><rss><channel><title>Portal &amp; Cia</title>
      <item><title><![CDATA[Prefeitura anuncia <b>obras</b>]]></title><pubDate>Sat, 07 Nov 2026</pubDate></item>
      <item><title>Chuva em Recife &#8211; alerta</title></item></channel></rss>`;
    const f = parseFeed(rss);
    expect(f.source).toBe('Portal & Cia');
    expect(f.items.map((i) => i.title)).toEqual(['Prefeitura anuncia obras', 'Chuva em Recife – alerta']);
    const atom = '<feed><title>Blog</title><entry><title>Post 1</title><updated>2026-11-07</updated></entry></feed>';
    expect(parseFeed(atom).items[0]).toEqual({ title: 'Post 1', date: '2026-11-07' });
  });

  it('resume a previsão do Open-Meteo', () => {
    const w = summarizeWeather({
      current: { temperature_2m: 28.6, weather_code: 2, relative_humidity_2m: 70 },
      daily: { time: ['d0', 'd1', 'd2'], weather_code: [2, 61, 0], temperature_2m_max: [31.2, 29, 30], temperature_2m_min: [24, 23.5, 24] },
    }, 2);
    expect(w).toMatchObject({ temp: 29, max: 31, min: 24, humidity: 70 });
    expect(w.days).toEqual([{ date: 'd1', code: 61, max: 29, min: 24 }, { date: 'd2', code: 0, max: 30, min: 24 }]);
  });
});

describe('price', () => {
  it('entende preço brasileiro', () => {
    expect(parsePrice('12,90')).toBe(12.9);
    expect(parsePrice('R$ 1.234,50')).toBe(1234.5);
    expect(parsePrice('7.5')).toBe(7.5);
    expect(parsePrice('')).toBe(null);
    expect(formatMoney(1234.5)).toBe('1.234,50');
  });

  it('importa planilha com cabeçalho em qualquer ordem e pula linhas ruins', () => {
    const csv = '﻿Preço;Produto;Unidade;Oferta\n12,90;Pão francês;kg;9,90\n;Sem preço;un;\n38,00;"Bolo de rolo; fatia";kg;40\n';
    const { rows, skipped } = parsePriceCsv(csv);
    expect(skipped).toBe(1);
    expect(rows[0]).toMatchObject({ name: 'Pão francês', unit: 'kg', price: 12.9, promoPrice: 9.9 });
    expect(rows[1]).toMatchObject({ name: 'Bolo de rolo; fatia', price: 38, promoPrice: null }); // oferta maior não vale
  });

  it('sem cabeçalho assume produto, preço, unidade', () => {
    expect(parsePriceCsv('Café,4.50,un').rows[0]).toMatchObject({ name: 'Café', price: 4.5, unit: 'un' });
  });

  it('para a TV vai só o visível, com o preço de oferta valendo', () => {
    const tv = priceListForTv({ title: 'Padaria', items: [
      { name: 'Pão', price: 12.9, promoPrice: 9.9 },
      { name: 'Oculto', price: 1, hidden: true },
      { name: 'Café', price: '4,50' },
    ] });
    expect(tv.items).toEqual([
      { name: 'Pão', unit: '', group: '', price: 9.9, oldPrice: 12.9, highlight: true },
      { name: 'Café', unit: '', group: '', price: 4.5, oldPrice: null, highlight: false },
    ]);
  });
});

describe('aplicativos no manifesto', () => {
  const media = [
    { id: 'img', type: 'image', url: 'https://x/img.jpg', name: 'Oferta' },
    { id: 'clk', type: 'app', name: 'Relógio', app: { kind: 'clock' } },
    { id: priceMediaId('L1'), type: 'app', name: 'Preços', app: { kind: 'price', config: { listId: 'L1' } } },
    { id: priceMediaId('L2'), type: 'app', name: 'Vazia', app: { kind: 'price', config: { listId: 'L2' } } },
  ];
  const playlists = [{ id: 'p', items: media.map((m) => ({ mediaId: m.id })) }];
  const schedules = [{ id: 's', status: 'published', screenIds: ['t1'], fallbackPlaylistId: 'p', slots: [] }];
  const priceLists = [{ id: 'L1', title: 'Pães', items: [{ name: 'Pão', price: 10 }] }, { id: 'L2', items: [] }];

  it('app entra sem arquivo para baixar; tabela leva os preços e tabela vazia fica de fora', () => {
    const m = buildManifest({ screen: { id: 't1' }, schedules, playlists, media, priceLists });
    expect(m.fallback.map((i) => i.mediaId)).toEqual(['img', 'clk', 'price_L1']);
    expect(m.fallback[1]).toMatchObject({ type: 'app', url: null, durationSec: 10, app: { kind: 'clock' } });
    expect(m.fallback[2].app.data.items[0]).toMatchObject({ name: 'Pão', price: 10 });
    expect(m.assets.map((a) => a.mediaId)).toEqual(['img']);
  });

  it('no editor de playlist (sem tabelas) a duração do app conta', () => {
    const items = expandPlaylist(playlists[0], new Map(media.map((x) => [x.id, x])));
    expect(items.find((i) => i.mediaId === 'clk').durationSec).toBe(10);
  });
});

describe('relatórios', () => {
  const docs = [
    { screenId: 't1', date: '2026-11-06', items: { a: { plays: 10, seconds: 100, name: 'Pão' }, b: { plays: 2, seconds: 30, name: 'Bolo' } } },
    { screenId: 't2', date: '2026-11-07', items: { a: { plays: 5, seconds: 50, name: 'Pão' } } },
  ];
  it('soma por mídia, tela e dia', () => {
    expect(aggregatePlays(docs, 'media')[0]).toMatchObject({ key: 'a', name: 'Pão', plays: 15, seconds: 150, screens: 2, days: 2 });
    expect(aggregatePlays(docs, 'screen').map((r) => [r.key, r.plays])).toEqual([['t1', 12], ['t2', 5]]);
    expect(aggregatePlays(docs, 'day').map((r) => r.key)).toEqual(['2026-11-06', '2026-11-07']);
  });
  it('gera CSV com BOM e escapa ";"', () => {
    const csv = toCsv([{ n: 'a;b', v: 1 }], [{ label: 'Nome', value: 'n' }, { label: 'Valor', value: (r) => r.v * 2 }]);
    expect(csv).toBe('﻿Nome;Valor\r\n"a;b";2');
  });
});
