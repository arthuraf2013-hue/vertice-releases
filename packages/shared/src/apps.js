/**
 * APLICATIVOS: conteúdo que se monta sozinho na TV (relógio, clima, avisos, notícias, site,
 * YouTube e tabela de preços). Cada aplicativo é guardado como uma mídia do tipo "app"
 * (`media/{id}` com `app: { kind, config }`), então entra nas playlists como qualquer imagem.
 */

export const APP_KINDS = {
  clock: {
    label: 'Relógio',
    icon: 'clock',
    group: 'Informação',
    desc: 'Hora e data grandes, com uma mensagem opcional.',
    defaultSec: 10,
    defaults: { message: '', showDate: true, showSeconds: false, theme: 'night' },
  },
  ticker: {
    label: 'Avisos',
    icon: 'megaphone',
    group: 'Informação',
    desc: 'Um título em destaque e uma faixa de avisos correndo na tela.',
    defaultSec: 20,
    defaults: { title: 'Avisos', lines: ['Bem-vindo!'], speed: 'normal', theme: 'brand' },
  },
  weather: {
    label: 'Clima',
    icon: 'sun',
    group: 'Informação',
    desc: 'Temperatura agora e previsão dos próximos dias, por cidade.',
    defaultSec: 12,
    defaults: { city: '', lat: null, lon: null, days: 4, theme: 'night' },
  },
  rss: {
    label: 'Notícias',
    icon: 'news',
    group: 'Informação',
    desc: 'Manchetes de um feed RSS (portal de notícias, blog, prefeitura).',
    defaultSec: 20,
    defaults: { url: '', source: '', count: 5, theme: 'night' },
  },
  web: {
    label: 'Site',
    icon: 'globe',
    group: 'Web',
    desc: 'Uma página da internet na tela. Alguns sites não deixam ser exibidos dentro de outro app.',
    defaultSec: 30,
    defaults: { url: '', reloadMin: 0 },
  },
  youtube: {
    label: 'YouTube',
    icon: 'play',
    group: 'Web',
    desc: 'Um vídeo do YouTube, sem som por padrão. Precisa de internet na TV.',
    defaultSec: 60,
    defaults: { url: '', muted: true },
  },
  qr: {
    label: 'QR Code',
    icon: 'qr',
    group: 'Vendas',
    desc: 'Link, Wi-Fi ou Pix copia e cola num QR grande, com título. Gerado na própria TV.',
    defaultSec: 15,
    defaults: { mode: 'link', url: '', ssid: '', password: '', security: 'WPA', pixKey: '', pixName: '', pixCity: '', pixAmount: '', pixMessage: '', text: '', title: 'Aponte a câmera do celular', subtitle: '', theme: 'light' },
  },
  sheet: {
    label: 'Google Sheets',
    icon: 'sheet',
    group: 'Informação',
    desc: 'Uma tabela de uma planilha do Google. Mudou a planilha, a TV atualiza sozinha.',
    defaultSec: 20,
    defaults: { url: '', title: '', rows: 10, header: true, theme: 'night' },
  },
  studio: {
    label: 'Peça do Estúdio',
    icon: 'palette',
    group: 'Vendas',
    desc: 'Criada no Estúdio a partir de um modelo.',
    defaultSec: 12,
    defaults: { template: 'offer', theme: 'brand', colors: null, imageMediaId: '', fields: {} },
    managed: true, // criada e editada no Estúdio
  },
  price: {
    label: 'Tabela de preços',
    icon: 'tag',
    group: 'Vendas',
    desc: 'Criada em Price. Mudou o preço, todas as telas atualizam.',
    defaultSec: 15,
    defaults: { listId: '' },
    managed: true, // criada e editada pela página Price, não pelo catálogo
  },
};

export const APP_THEMES = {
  night: { label: 'Noite', bg: '#0E1A2B', fg: '#F4F1EA', accent: '#E3A72F' },
  brand: { label: 'Vértice', bg: '#13294B', fg: '#FFFFFF', accent: '#E3A72F' },
  light: { label: 'Claro', bg: '#F4F1EA', fg: '#0E1A2B', accent: '#B8401F' },
  wine: { label: 'Vinho', bg: '#3B1020', fg: '#FBEFE6', accent: '#F2B544' },
  green: { label: 'Verde', bg: '#0F3B2E', fg: '#F1F7EF', accent: '#F2C14E' },
};

export const TICKER_SPEEDS = { slow: 70, normal: 110, fast: 160 }; // pixels por segundo

/** App normalizado (tipo conhecido e configuração completa com os padrões). */
export function normalizeApp(app) {
  const def = APP_KINDS[app?.kind];
  if (!def) return null;
  return { kind: app.kind, config: { ...def.defaults, ...(app.config || {}) } };
}

export const appTheme = (key) => APP_THEMES[key] || APP_THEMES.night;

/** Duração padrão de um app na playlist. */
export const appDefaultSeconds = (kind) => APP_KINDS[kind]?.defaultSec || 15;

/* ---------------- YouTube ---------------- */

/** Id do vídeo a partir de qualquer link do YouTube (watch, youtu.be, shorts, embed) ou do próprio id. */
export function youtubeId(input = '') {
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/.exec(s);
  return m ? m[1] : null;
}

export function youtubeEmbedUrl(input, { muted = true } = {}) {
  const id = youtubeId(input);
  if (!id) return null;
  const q = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', controls: '0', loop: '1', playlist: id, modestbranding: '1', rel: '0', playsinline: '1' });
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}

/** Link começando com http(s), ou null. */
export function safeHttpUrl(input = '') {
  try {
    const u = new URL(String(input).trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ---------------- Notícias (RSS/Atom) ---------------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : all;
      }
      return ENTITIES[e.toLowerCase()] ?? all;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Manchetes de um feed RSS 2.0 ou Atom. Não depende do navegador (roda no teste e na TV).
 * @returns {{ source: string, items: { title: string, date: string|null }[] }}
 */
export function parseFeed(xml = '', max = 10) {
  const text = String(xml);
  const blocks = text.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const head = text.split(/<(?:item|entry)[\s>]/i)[0];
  const tag = (src, name) => {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(src);
    return m ? decode(m[1]) : '';
  };
  const items = [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    if (!title) continue;
    items.push({ title, date: tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published') || null });
    if (items.length >= max) break;
  }
  return { source: tag(head, 'title'), items };
}

/* ---------------- Clima (Open-Meteo, sem chave) ---------------- */

export function weatherUrl(lat, lon, days = 4) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,is_day,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: String(Math.min(7, Math.max(1, days + 1))),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function geocodeUrl(name) {
  const q = new URLSearchParams({ name, count: '6', language: 'pt', format: 'json' });
  return `https://geocoding-api.open-meteo.com/v1/search?${q}`;
}

/** Código do tempo (WMO) → descrição e ícone. */
export function weatherLabel(code) {
  const c = Number(code);
  if (c === 0) return { text: 'Céu limpo', icon: 'sun' };
  if (c <= 2) return { text: 'Poucas nuvens', icon: 'cloudSun' };
  if (c === 3) return { text: 'Nublado', icon: 'cloud' };
  if (c === 45 || c === 48) return { text: 'Neblina', icon: 'cloud' };
  if (c >= 51 && c <= 57) return { text: 'Garoa', icon: 'rain' };
  if (c >= 61 && c <= 67) return { text: 'Chuva', icon: 'rain' };
  if (c >= 71 && c <= 77) return { text: 'Neve', icon: 'cloud' };
  if (c >= 80 && c <= 82) return { text: 'Pancadas de chuva', icon: 'rain' };
  if (c >= 95) return { text: 'Trovoadas', icon: 'storm' };
  return { text: '—', icon: 'cloud' };
}

/** Resposta do Open-Meteo → o que a tela mostra. */
export function summarizeWeather(json, days = 4) {
  if (!json?.current) return null;
  const d = json.daily || {};
  const list = (d.time || []).slice(1, 1 + days).map((date, i) => ({
    date,
    code: d.weather_code?.[i + 1],
    max: Math.round(d.temperature_2m_max?.[i + 1]),
    min: Math.round(d.temperature_2m_min?.[i + 1]),
  }));
  return {
    temp: Math.round(json.current.temperature_2m),
    code: json.current.weather_code,
    humidity: json.current.relative_humidity_2m ?? null,
    max: Math.round(d.temperature_2m_max?.[0]),
    min: Math.round(d.temperature_2m_min?.[0]),
    days: list,
  };
}

/* ---------------- Google Sheets ---------------- */

/**
 * Link de planilha do Google → endereço do CSV.
 * Aceita o link de compartilhar (".../d/{id}/edit#gid=0", precisa estar como "qualquer pessoa com o link")
 * e o link de "Publicar na Web" (".../d/e/{id}/pubhtml" ou "pub?output=csv").
 */
export function sheetCsvUrl(input = '') {
  const s = String(input).trim();
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(s)) return null;
  const gid = (/[#&?]gid=(\d+)/.exec(s) || [])[1];
  const pub = /\/d\/e\/([\w-]+)/.exec(s);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  const id = /\/d\/([\w-]{20,})/.exec(s);
  if (!id) return null;
  return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

/** CSV → linhas (aceita aspas, ";" ou ",", e quebra de linha dentro de célula). */
export function parseCsv(text = '') {
  const src = String(text).replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c));
}

/** Tabela pronta para a TV: cabeçalho opcional, até N linhas e 6 colunas. */
export function sheetTable(csv, { header = true, rows = 10 } = {}) {
  const all = parseCsv(csv).map((r) => r.slice(0, 6).map((c) => c.slice(0, 80)));
  const cols = Math.max(0, ...all.map((r) => r.length));
  const pad = (r) => [...r, ...Array(cols - r.length).fill('')];
  const head = header && all.length ? pad(all[0]) : null;
  const body = all.slice(header ? 1 : 0, (header ? 1 : 0) + Math.max(1, Math.min(30, Number(rows) || 10))).map(pad);
  return { head, rows: body };
}

/* ---------------- Price ---------------- */

export const PRICE_LAYOUTS = { list: 'Lista', cards: 'Cartões' };

/** "12,90" | "12.90" | "R$ 1.234,50" | 12.9 → 12.9 (ou null). */
export function parsePrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** 12.9 → "12,90". */
export function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const HEADER_WORDS = {
  name: ['produto', 'nome', 'item', 'descricao', 'descrição'],
  unit: ['unidade', 'unid', 'un', 'medida'],
  price: ['preco', 'preço', 'valor', 'price'],
  promo: ['oferta', 'promocao', 'promoção', 'promo', 'preco oferta', 'preço oferta', 'por'],
  group: ['categoria', 'grupo', 'secao', 'seção'],
};
const norm = (s) => String(s || '').trim().toLowerCase();

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Planilha (CSV do Excel/Google Sheets, separada por ";" ou ",") → linhas da tabela de preços.
 * Reconhece o cabeçalho (Produto; Unidade; Preço; Oferta; Categoria) em qualquer ordem.
 * Sem cabeçalho, assume: produto, preço, unidade.
 * @returns {{ rows: object[], skipped: number }}
 */
export function parsePriceCsv(text = '') {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: 0 };
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  let cols = { name: 0, price: 1, unit: 2, promo: -1, group: -1 };
  const first = splitCsvLine(lines[0], sep).map(norm);
  const found = {};
  for (const [key, words] of Object.entries(HEADER_WORDS)) {
    const i = first.findIndex((h) => words.includes(h));
    if (i >= 0) found[key] = i;
  }
  let start = 0;
  if (found.name != null && found.price != null) {
    cols = { name: found.name, price: found.price, unit: found.unit ?? -1, promo: found.promo ?? -1, group: found.group ?? -1 };
    start = 1;
  }
  const rows = [];
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const c = splitCsvLine(line, sep);
    const name = (c[cols.name] || '').slice(0, 60);
    const price = parsePrice(c[cols.price]);
    if (!name || price == null) { skipped++; continue; }
    const promoPrice = cols.promo >= 0 ? parsePrice(c[cols.promo]) : null;
    rows.push({
      name,
      unit: cols.unit >= 0 ? (c[cols.unit] || '').slice(0, 12) : '',
      price,
      promoPrice: promoPrice != null && promoPrice < price ? promoPrice : null,
      group: cols.group >= 0 ? (c[cols.group] || '').slice(0, 30) : '',
      highlight: false,
      hidden: false,
    });
  }
  return { rows, skipped };
}

/** O que vai para a TV: só os itens visíveis, já com o preço que vale. */
export function priceListForTv(list) {
  if (!list) return null;
  const items = (list.items || [])
    .filter((it) => !it.hidden && it.name && parsePrice(it.price) != null)
    .slice(0, 60)
    .map((it) => {
      const price = parsePrice(it.price);
      const promo = parsePrice(it.promoPrice);
      const onSale = promo != null && promo < price;
      return {
        name: String(it.name).slice(0, 60),
        unit: String(it.unit || '').slice(0, 12),
        group: String(it.group || '').slice(0, 30),
        price: onSale ? promo : price,
        oldPrice: onSale ? price : null,
        highlight: !!it.highlight || onSale,
      };
    });
  return {
    title: list.title || list.name || 'Preços',
    subtitle: list.subtitle || '',
    footer: list.footer || '',
    theme: list.theme || 'night',
    layout: PRICE_LAYOUTS[list.layout] ? list.layout : 'list',
    currency: list.currency || 'R$',
    items,
  };
}

/** Id da mídia que representa uma tabela de preços nas playlists. */
export const priceMediaId = (listId) => `price_${listId}`;

/* ---------------- Relatórios ---------------- */

/** "YYYY-MM-DD" de N dias atrás (fuso local). */
export function daysAgoISO(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Anunciante de uma exibição: o que a TV gravou ou, para registros antigos, o da mídia hoje. */
export const playAdvertiser = (mediaId, v, advertiserOf) => v?.adv || advertiserOf?.(mediaId) || '';

/**
 * Soma os registros diários das telas (`playStats/{tela}_{dia}`).
 * @param {object[]} docs  [{ screenId, date, items: { [mediaId]: { plays, seconds, name, adv? } } }]
 * @param {'media'|'screen'|'day'|'advertiser'} by
 * @param {{ advertiserOf?: (mediaId:string) => string|null, advertiser?: string }} opts
 *   advertiserOf: anunciante atual da mídia; advertiser: soma só as exibições desse anunciante.
 */
export function aggregatePlays(docs = [], by = 'media', { advertiserOf, advertiser } = {}) {
  const map = new Map();
  for (const d of docs) {
    for (const [mediaId, v] of Object.entries(d.items || {})) {
      const adv = playAdvertiser(mediaId, v, advertiserOf);
      if (advertiser != null && adv !== advertiser) continue;
      const key = by === 'screen' ? d.screenId : by === 'day' ? d.date : by === 'advertiser' ? adv : mediaId;
      const row = map.get(key) || { key, plays: 0, seconds: 0, name: '', screens: new Set(), media: new Set(), days: new Set() };
      row.plays += Number(v.plays) || 0;
      row.seconds += Number(v.seconds) || 0;
      if (by === 'media' && v.name) row.name = v.name;
      row.screens.add(d.screenId);
      row.media.add(mediaId);
      row.days.add(d.date);
      map.set(key, row);
    }
  }
  return [...map.values()]
    .map((r) => ({ key: r.key, name: r.name, plays: r.plays, seconds: Math.round(r.seconds), screens: r.screens.size, media: r.media.size, days: r.days.size }))
    .sort((a, b) => (by === 'day' ? a.key.localeCompare(b.key) : b.plays - a.plays));
}

/** Linhas → CSV para Excel (separador ";", com BOM para acentos). */
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(';'));
  return `﻿${[head, ...body].join('\r\n')}`;
}
