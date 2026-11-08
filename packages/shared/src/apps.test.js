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

import { qrMatrix, qrPath, pixPayload, crc16, wifiPayload, qrContent } from './qr.js';
import { sheetCsvUrl, parseCsv, sheetTable } from './apps.js';
import { studioFields, studioLines } from './studio.js';

describe('QR Code e Pix', () => {
  it('gera matriz quadrada e caminho SVG, inclusive com acento', () => {
    const m = qrMatrix('https://vetta.com.br/cardápio');
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((r) => r.length === m.length)).toBe(true);
    expect(m[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true]); // canto de localização
    expect(qrPath(m)).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    expect(qrMatrix('')).toBe(null);
  });

  it('CRC16 do BR Code confere com o valor de referência (123456789 → 29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('monta o Pix copia e cola com os campos do padrão e o CRC no fim', () => {
    const p = pixPayload({ key: 'loja@exemplo.com', name: 'Padaria São João', city: 'Recife', amount: 12.5 });
    expect(p.startsWith('000201')).toBe(true);
    expect(p).toContain('0014br.gov.bcb.pix0116loja@exemplo.com');
    expect(p).toContain('540512.50');
    expect(p).toContain('5916PADARIA SAO JOAO');
    expect(p).toContain('6006RECIFE');
    expect(p).toContain('62070503***');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    expect(pixPayload({ key: '' })).toBe('');
  });

  it('Wi-Fi escapa caracteres especiais', () => {
    expect(wifiPayload({ ssid: 'Loja;1', password: 'a:b' })).toBe('WIFI:T:WPA;S:Loja\\;1;P:a\\:b;;');
    expect(wifiPayload({ ssid: 'Aberta' })).toBe('WIFI:T:nopass;S:Aberta;;');
    expect(qrContent({ mode: 'link', url: ' https://x.com ' })).toBe('https://x.com');
    expect(qrContent({ mode: 'pix', pixKey: 'k@x.com', pixName: 'Loja', pixCity: 'Recife', pixAmount: '9,90' })).toContain('54049.90');
  });
});

describe('Google Sheets', () => {
  it('transforma o link da planilha no endereço do CSV', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42'))
      .toBe('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42');
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vQabc_def/pubhtml'))
      .toBe('https://docs.google.com/spreadsheets/d/e/2PACX-1vQabc_def/pub?output=csv');
    expect(sheetCsvUrl('https://exemplo.com/planilha')).toBe(null);
  });

  it('lê CSV com aspas, vírgula e quebra de linha dentro da célula', () => {
    expect(parseCsv('Nome,Obs\r\n"Silva, Ana","linha 1\nlinha 2"\n,\n')).toEqual([['Nome', 'Obs'], ['Silva, Ana', 'linha 1\nlinha 2']]);
  });

  it('monta a tabela com cabeçalho e limite de linhas', () => {
    const t = sheetTable('A;B\n1;2\n3\n5;6', { header: true, rows: 2 });
    expect(t).toEqual({ head: ['A', 'B'], rows: [['1', '2'], ['3', '']] });
  });
});

describe('Estúdio', () => {
  it('completa os campos com o exemplo do modelo e lê o cardápio', () => {
    expect(studioFields('offer', { product: 'Pão' })).toMatchObject({ product: 'Pão', badge: 'OFERTA' });
    expect(studioLines('Prato A | 10,00\n\n  | sem nome\nPrato B')).toEqual([{ name: 'Prato A', price: '10,00' }, { name: 'Prato B', price: '' }]);
  });

  it('peça com foto leva a foto para o cache da TV', () => {
    const media = [
      { id: 'foto', type: 'image', url: 'https://m/foto.jpg', sizeBytes: 100 },
      { id: 'peca', type: 'app', name: 'Oferta', app: { kind: 'studio', config: { template: 'offer', imageMediaId: 'foto' } } },
    ];
    const m = buildManifest({
      screen: { id: 't' }, media, playlists: [{ id: 'p', items: [{ mediaId: 'peca' }] }],
      schedules: [{ id: 's', status: 'published', screenIds: ['t'], fallbackPlaylistId: 'p', slots: [] }],
    });
    expect(m.fallback[0].app.image).toEqual({ mediaId: 'foto', url: 'https://m/foto.jpg' });
    expect(m.assets.map((a) => a.mediaId)).toEqual(['foto']);
  });
});

describe('anunciantes', () => {
  const docs = [
    { screenId: 't1', date: '2026-11-06', items: { a: { plays: 10, seconds: 100, adv: 'ANU1' }, b: { plays: 2, seconds: 30 }, c: { plays: 4, seconds: 40 } } },
  ];
  const advertiserOf = (id) => ({ c: 'ANU1', b: null }[id]);
  it('agrupa por anunciante, usando o anunciante atual da mídia quando o registro é antigo', () => {
    expect(aggregatePlays(docs, 'advertiser', { advertiserOf }).map((r) => [r.key, r.plays])).toEqual([['ANU1', 14], ['', 2]]);
  });
  it('filtra as exibições de um anunciante', () => {
    expect(aggregatePlays(docs, 'media', { advertiserOf, advertiser: 'ANU1' }).map((r) => r.key)).toEqual(['a', 'c']);
  });
  it('a mídia leva o anunciante para o manifesto', () => {
    const items = expandPlaylist({ id: 'p', items: [{ mediaId: 'x' }] }, new Map([['x', { id: 'x', type: 'image', url: 'u', advertiserId: 'ANU1' }]]));
    expect(items[0].advertiserId).toBe('ANU1');
  });
});

import { wallCrop, wallPosition, normalizeWall, wallCell } from './wall.js';

describe('video wall', () => {
  it('normaliza a grade e acha a célula da tela', () => {
    const w = normalizeWall({ rows: 2, cols: 9, cells: ['a', 'b'], bezel: 20 });
    expect([w.rows, w.cols, w.cells.length, w.bezel]).toEqual([2, 4, 8, 8]);
    expect(wallCell(w, 'b')).toEqual({ row: 0, col: 1 });
    expect(wallCell(w, 'z')).toBe(null);
  });

  it('recorta o pedaço de cada TV, compensando a moldura', () => {
    expect(wallCrop({ rows: 1, cols: 2, row: 0, col: 1 })).toEqual({ width: '200%', height: '100%', left: '-100%', top: '0%' });
    expect(wallCrop({ rows: 2, cols: 2, row: 1, col: 1, bezel: 5 })).toEqual({ width: '205%', height: '205%', left: '-105%', top: '-105%' });
  });

  it('todas as TVs acham o mesmo item e o mesmo segundo pelo relógio', () => {
    const items = [{ mediaId: 'a', durationSec: 10 }, { mediaId: 'b', type: 'video', durationSec: null }, { mediaId: 'c' }];
    // ciclo = 10 + 30 (vídeo sem duração) + 10 = 50 s
    expect(wallPosition(items, 1000 * (50 * 7 + 3))).toMatchObject({ index: 0, offset: 3, remaining: 7, cycle: 50, round: 7 });
    expect(wallPosition(items, 1000 * (50 * 7 + 12.5))).toMatchObject({ index: 1, offset: 2.5, remaining: 27.5 });
    expect(wallPosition(items, 1000 * (50 * 7 + 45))).toMatchObject({ index: 2, offset: 5 });
    expect(wallPosition([], 0)).toBe(null);
  });

  it('o manifesto da tela no wall leva a posição e a playlist do wall, no lugar da programação', () => {
    const media = [{ id: 'm1', type: 'image', url: 'u1' }, { id: 'm2', type: 'image', url: 'u2' }];
    const playlists = [{ id: 'own', items: [{ mediaId: 'm1' }] }, { id: 'wallp', items: [{ mediaId: 'm2' }] }];
    const schedules = [{ id: 's', status: 'published', screenIds: ['t1', 't2'], fallbackPlaylistId: 'own', slots: [{ playlistId: 'own', days: [1], start: '08:00', end: '10:00' }] }];
    const walls = [{ id: 'w', name: 'Vitrine', rows: 1, cols: 2, cells: ['t2', 't1'], playlistId: 'wallp', bezel: 2 }];
    const m = buildManifest({ screen: { id: 't1' }, schedules, playlists, media, walls });
    expect(m.wall).toEqual({ id: 'w', name: 'Vitrine', rows: 1, cols: 2, row: 0, col: 1, bezel: 2 });
    expect(m.slots).toEqual([]);
    expect(m.fallback.map((i) => i.mediaId)).toEqual(['m2']);
    const off = buildManifest({ screen: { id: 't1' }, schedules, playlists, media, walls: [{ ...walls[0], active: false }] });
    expect(off.wall).toBe(null);
    expect(off.fallback.map((i) => i.mediaId)).toEqual(['m1']);
  });
});
