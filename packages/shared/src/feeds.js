import { driveSource } from './extras.js';
/**
 * FONTES DOS APLICATIVOS: de onde cada app busca os dados e como transforma a resposta no que a
 * TV desenha. Funções puras (sem navegador, sem rede): a TV baixa o texto e chama `parse`; os
 * testes chamam `parse` com respostas gravadas. Cada fonte tem também um `sample` para a prévia
 * do painel quando o navegador não deixa ler a fonte de outro site (CORS).
 *
 * Fontes escolhidas (gratuitas; detalhes e limites em docs/APPS.md):
 *   Open-Meteo (tempo, ar, sol)  sem chave para uso não comercial; uso comercial pede chave (apikey)
 *   TheSportsDB (futebol)        chave pública "123", resultados limitados; chave paga libera tudo
 *   AwesomeAPI (cotações)        sem chave; sem chave a resposta vem com cache de 1 minuto
 *   Banco Central / SGS          sem chave; dados abertos (ODbL)
 *   BrasilAPI (feriados)         sem chave
 *   Wikipédia (hoje na história) sem chave; texto CC BY-SA, a tela mostra a fonte
 *   RSS e ICS                    o endereço que o cliente informar
 */

import { parseFeed } from './apps.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ---------------- utilidades ---------------- */

const pad = (n) => String(n).padStart(2, '0');
const json = (t) => (t == null ? null : typeof t === 'string' ? JSON.parse(t) : t);
const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "AAAA-MM-DD" → Date local à meia-noite. */
const fromIso = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const daysBetween = (a, b) => Math.round((fromIso(isoDay(b)) - fromIso(isoDay(a))) / DAY);

/** Base do Open-Meteo: com chave (uso comercial) usa os servidores "customer-". */
export function openMeteoUrl(host, path, params, apikey = '') {
  const q = new URLSearchParams(params);
  if (apikey) q.set('apikey', apikey);
  return `https://${apikey ? `customer-${host}` : host}${path}?${q}`;
}

/* ---------------- Chuva nas próximas horas (Open-Meteo) ---------------- */

export const rainSource = {
  ttl: 30 * MIN,
  urls: (c, { apikey } = {}) => (c.lat == null ? [] : [openMeteoUrl('api.open-meteo.com', '/v1/forecast', {
    latitude: String(c.lat), longitude: String(c.lon),
    hourly: 'precipitation_probability,precipitation,temperature_2m,weather_code',
    forecast_hours: String(Math.min(24, Math.max(6, Number(c.hours) || 12))),
    timezone: 'auto',
  }, apikey)]),
  parse([t], c) {
    const h = json(t)?.hourly;
    if (!h?.time?.length) throw new Error('resposta sem previsão por hora');
    const hours = h.time.map((time, i) => ({
      time: time.slice(11, 16),
      prob: num(h.precipitation_probability?.[i]) ?? 0,
      mm: Math.round((num(h.precipitation?.[i]) ?? 0) * 10) / 10,
      temp: Math.round(num(h.temperature_2m?.[i]) ?? 0),
      code: h.weather_code?.[i],
    }));
    const peak = hours.reduce((a, b) => (b.prob > a.prob ? b : a), hours[0]);
    const firstRain = hours.find((x) => x.prob >= 50);
    let headline = 'Sem chuva prevista nas próximas horas';
    if (firstRain) headline = firstRain === hours[0] ? 'Chuva agora ou a qualquer momento' : `Chance de chuva a partir das ${firstRain.time}`;
    else if (peak.prob >= 25) headline = `Pode chover perto das ${peak.time}`;
    return { city: c.city || '', headline, umbrella: !!firstRain, hours };
  },
  sample: (c) => ({
    city: c.city || 'Recife, Pernambuco',
    headline: 'Chance de chuva a partir das 16:00',
    umbrella: true,
    hours: [10, 10, 15, 20, 30, 45, 70, 80, 60, 35, 20, 10].map((prob, i) => ({ time: `${pad(11 + i)}:00`, prob, mm: prob > 50 ? 2.4 : 0, temp: 29 - Math.floor(i / 3), code: prob > 50 ? 61 : 2 })),
  }),
};

/* ---------------- Qualidade do ar e UV (Open-Meteo Air Quality) ---------------- */

/** Faixas do índice de qualidade do ar (escala americana, a mais usada nos apps). */
export function aqiLevel(aqi) {
  const a = num(aqi);
  if (a == null) return { label: 'Sem dado', tone: 'muted', tip: '' };
  if (a <= 50) return { label: 'Boa', tone: 'good', tip: 'Ar limpo. Ótimo para atividades ao ar livre.' };
  if (a <= 100) return { label: 'Moderada', tone: 'ok', tip: 'Pessoas muito sensíveis devem evitar esforço prolongado ao ar livre.' };
  if (a <= 150) return { label: 'Ruim para sensíveis', tone: 'warn', tip: 'Crianças, idosos e quem tem asma: reduza o esforço ao ar livre.' };
  if (a <= 200) return { label: 'Ruim', tone: 'bad', tip: 'Evite esforço prolongado ao ar livre.' };
  return { label: 'Muito ruim', tone: 'bad', tip: 'Fique em ambientes fechados sempre que puder.' };
}

export function uvLevel(uv) {
  const u = num(uv);
  if (u == null) return { label: 'Sem dado', tone: 'muted', tip: '' };
  if (u < 3) return { label: 'Baixo', tone: 'good', tip: 'Sem cuidados especiais.' };
  if (u < 6) return { label: 'Moderado', tone: 'ok', tip: 'Use protetor solar e boné.' };
  if (u < 8) return { label: 'Alto', tone: 'warn', tip: 'Protetor, chapéu e sombra entre 10h e 16h.' };
  if (u < 11) return { label: 'Muito alto', tone: 'bad', tip: 'Evite o sol entre 10h e 16h.' };
  return { label: 'Extremo', tone: 'bad', tip: 'Evite o sol. Protetor e roupas que cubram a pele.' };
}

export const airSource = {
  ttl: 60 * MIN,
  urls: (c, { apikey } = {}) => (c.lat == null ? [] : [openMeteoUrl('air-quality-api.open-meteo.com', '/v1/air-quality', {
    latitude: String(c.lat), longitude: String(c.lon), current: 'us_aqi,pm2_5,pm10,uv_index', timezone: 'auto',
  }, apikey)]),
  parse([t], c) {
    const cur = json(t)?.current;
    if (!cur) throw new Error('resposta sem dados do ar');
    const aqi = num(cur.us_aqi);
    const uv = num(cur.uv_index);
    return {
      city: c.city || '',
      aqi: aqi == null ? null : Math.round(aqi),
      pm25: num(cur.pm2_5) == null ? null : Math.round(num(cur.pm2_5)),
      pm10: num(cur.pm10) == null ? null : Math.round(num(cur.pm10)),
      uv: uv == null ? null : Math.round(uv * 10) / 10,
      air: aqiLevel(aqi),
      uvInfo: uvLevel(uv),
    };
  },
  sample: (c) => ({ city: c.city || 'Recife, Pernambuco', aqi: 32, pm25: 8, pm10: 15, uv: 9.1, air: aqiLevel(32), uvInfo: uvLevel(9.1) }),
};

/* ---------------- Sol e lua ---------------- */

const SYNODIC = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // lua nova de referência

/** Fase da lua numa data (cálculo local, sem internet). */
export function moonPhase(date = new Date()) {
  const age = ((((date.getTime() - NEW_MOON_REF) / DAY) % SYNODIC) + SYNODIC) % SYNODIC;
  const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2) * 100);
  let name;
  if (age < 1.85 || age >= 27.68) name = 'Lua nova';
  else if (age < 5.54) name = 'Lua crescente';
  else if (age < 9.23) name = 'Quarto crescente';
  else if (age < 12.92) name = 'Crescente gibosa';
  else if (age < 16.61) name = 'Lua cheia';
  else if (age < 20.30) name = 'Minguante gibosa';
  else if (age < 23.99) name = 'Quarto minguante';
  else name = 'Lua minguante';
  // Próxima lua cheia (idade 14,77).
  const toFull = ((14.765 - age) + SYNODIC) % SYNODIC;
  return { age: Math.round(age * 10) / 10, illum, name, waxing: age < SYNODIC / 2, nextFull: new Date(date.getTime() + toFull * DAY) };
}

export const sunSource = {
  ttl: 6 * HOUR,
  urls: (c, { apikey } = {}) => (c.lat == null ? [] : [openMeteoUrl('api.open-meteo.com', '/v1/forecast', {
    latitude: String(c.lat), longitude: String(c.lon), daily: 'sunrise,sunset,daylight_duration,uv_index_max', timezone: 'auto', forecast_days: '2',
  }, apikey)]),
  parse([t], c, now = Date.now()) {
    const d = json(t)?.daily;
    if (!d?.sunrise?.length) throw new Error('resposta sem nascer do sol');
    const secs = num(d.daylight_duration?.[0]) ?? 0;
    return {
      city: c.city || '',
      sunrise: String(d.sunrise[0]).slice(11, 16),
      sunset: String(d.sunset[0]).slice(11, 16),
      daylight: `${Math.floor(secs / 3600)}h${pad(Math.round((secs % 3600) / 60))}`,
      uvMax: num(d.uv_index_max?.[0]),
      tomorrowSunrise: d.sunrise[1] ? String(d.sunrise[1]).slice(11, 16) : null,
      moon: moonPhase(new Date(now)),
    };
  },
  sample: (c, now = Date.now()) => ({ city: c.city || 'Recife, Pernambuco', sunrise: '05:01', sunset: '17:32', daylight: '12h31', uvMax: 11.2, tomorrowSunrise: '05:01', moon: moonPhase(new Date(now)) }),
};

/* ---------------- Futebol (TheSportsDB) ---------------- */

/** Campeonatos com id conferido no TheSportsDB. "year": temporada pelo ano (calendário brasileiro). */
export const LEAGUES = {
  4351: { label: 'Brasileirão Série A', year: true },
  4404: { label: 'Brasileirão Série B', year: true },
  4501: { label: 'Copa Libertadores', year: true },
  4328: { label: 'Premier League (Inglaterra)' },
  4335: { label: 'La Liga (Espanha)' },
  4332: { label: 'Serie A (Itália)' },
  4331: { label: 'Bundesliga (Alemanha)' },
  4480: { label: 'Liga dos Campeões da UEFA' },
  4625: { label: 'Brasileirão Série C', year: true },
  5079: { label: 'Brasileirão Série D', year: true },
  // Estaduais (ids conferidos no TheSportsDB em 11/2026).
  5768: { label: 'Pernambucano', year: true, state: true },
  5767: { label: 'Paulista', year: true, state: true },
  5688: { label: 'Carioca', year: true, state: true },
  5763: { label: 'Mineiro', year: true, state: true },
  5691: { label: 'Gaúcho', year: true, state: true },
  5684: { label: 'Baiano', year: true, state: true },
  5689: { label: 'Cearense', year: true, state: true },
  5766: { label: 'Paranaense', year: true, state: true },
  5687: { label: 'Catarinense', year: true, state: true },
  5760: { label: 'Goiano', year: true, state: true },
  5764: { label: 'Paraense', year: true, state: true },
  5765: { label: 'Paraibano', year: true, state: true },
  5770: { label: 'Potiguar', year: true, state: true },
  5677: { label: 'Alagoano', year: true, state: true },
  5773: { label: 'Sergipano', year: true, state: true },
  5769: { label: 'Piauiense', year: true, state: true },
  5761: { label: 'Maranhense', year: true, state: true },
  5679: { label: 'Amazonense', year: true, state: true },
  5686: { label: 'Capixaba', year: true, state: true },
  5685: { label: 'Brasiliense', year: true, state: true },
  5762: { label: 'Mato-grossense', year: true, state: true },
  5774: { label: 'Sul-mato-grossense', year: true, state: true },
};

/** Temporada no formato do TheSportsDB: "2026" (ano) ou "2026-2027" (europeia, vira em julho). */
export function leagueSeason(leagueId, now = new Date(), override = '') {
  if (override) return String(override).trim();
  const y = now.getFullYear();
  if (LEAGUES[leagueId]?.year) return String(y);
  return now.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const sportsBase = (key) => `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key || '123')}`;
const sameTeam = (a, b) => String(a || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .includes(String(b || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());

/** Horário do jogo (o TheSportsDB manda em UTC) no fuso da TV. */
function matchWhen(e) {
  const ts = e.strTimestamp ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? e.strTimestamp : `${e.strTimestamp}Z`) : NaN;
  if (Number.isFinite(ts)) return ts;
  if (e.dateEvent && e.strTime) return Date.parse(`${e.dateEvent}T${String(e.strTime).slice(0, 8)}Z`);
  return e.dateEvent ? fromIso(e.dateEvent).getTime() : null;
}

function toMatch(e) {
  const hs = num(e.intHomeScore);
  const as = num(e.intAwayScore);
  const status = String(e.strStatus || '').toUpperCase();
  const live = /^(1H|2H|HT|ET|P|LIVE|BT)$/.test(status) || /IN PLAY/.test(status);
  const done = !live && hs != null && as != null && status !== 'NS';
  return {
    id: e.idEvent,
    home: e.strHomeTeam || '',
    away: e.strAwayTeam || '',
    homeScore: hs,
    awayScore: as,
    at: matchWhen(e),
    round: e.intRound ? Number(e.intRound) : null,
    venue: e.strVenue || '',
    live,
    done,
  };
}

export const matchesSource = {
  ttl: 10 * MIN,
  urls: (c) => {
    const id = encodeURIComponent(c.leagueId || 4351);
    return [`${sportsBase(c.apiKey)}/eventspastleague.php?id=${id}`, `${sportsBase(c.apiKey)}/eventsnextleague.php?id=${id}`];
  },
  parse([past, next], c) {
    const p = json(past)?.events || [];
    const n = json(next)?.events || [];
    if (!p.length && !n.length && past == null && next == null) throw new Error('sem resposta');
    let list = [...p, ...n].map(toMatch).filter((m) => m.home && m.away);
    if (c.team) list = list.filter((m) => sameTeam(m.home, c.team) || sameTeam(m.away, c.team));
    const seen = new Set();
    list = list.filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).sort((a, b) => (a.at || 0) - (b.at || 0));
    const results = list.filter((m) => m.done).slice(-Math.max(1, Number(c.results ?? 3)));
    const upcoming = list.filter((m) => !m.done).slice(0, Math.max(1, Number(c.upcoming ?? 5)));
    return { league: LEAGUES[c.leagueId]?.label || c.leagueName || 'Campeonato', team: c.team || '', results, upcoming };
  },
  sample: (c, now = Date.now()) => ({
    league: LEAGUES[c.leagueId]?.label || 'Brasileirão Série A',
    team: c.team || '',
    results: [
      { id: 'r1', home: 'Sport', away: 'Náutico', homeScore: 2, awayScore: 1, at: now - 3 * DAY, done: true },
      { id: 'r2', home: 'Santa Cruz', away: 'Fortaleza', homeScore: 0, awayScore: 0, at: now - 2 * DAY, done: true },
    ],
    upcoming: [
      { id: 'u1', home: 'Bahia', away: 'Sport', at: now + 2 * HOUR, venue: 'Arena Fonte Nova', live: false },
      { id: 'u2', home: 'Náutico', away: 'Ceará', at: now + DAY + 3 * HOUR, venue: 'Aflitos', live: false },
      { id: 'u3', home: 'Vitória', away: 'Santa Cruz', at: now + 3 * DAY, venue: 'Barradão', live: false },
    ],
  }),
};

export const standingsSource = {
  ttl: 30 * MIN,
  urls: (c, { now = new Date() } = {}) => [`${sportsBase(c.apiKey)}/lookuptable.php?l=${encodeURIComponent(c.leagueId || 4351)}&s=${encodeURIComponent(leagueSeason(c.leagueId || 4351, now, c.season))}`],
  parse([t], c) {
    const rows = json(t)?.table || [];
    if (!rows.length) throw new Error('tabela vazia');
    const list = rows.map((r) => ({
      pos: Number(r.intRank),
      team: r.strTeam,
      played: num(r.intPlayed) ?? 0,
      win: num(r.intWin) ?? 0,
      draw: num(r.intDraw) ?? 0,
      loss: num(r.intLoss) ?? 0,
      gd: num(r.intGoalDifference) ?? 0,
      pts: num(r.intPoints) ?? 0,
    })).sort((a, b) => a.pos - b.pos);
    const top = Math.max(4, Math.min(20, Number(c.rows) || 10));
    let shown = list.slice(0, top);
    // Time escolhido fora do recorte: entra no fim, com a posição dele.
    const mine = c.team ? list.find((r) => sameTeam(r.team, c.team)) : null;
    if (mine && !shown.includes(mine)) shown = [...shown.slice(0, top - 1), mine];
    return { league: LEAGUES[c.leagueId]?.label || c.leagueName || 'Campeonato', team: mine?.team || '', rows: shown, total: list.length };
  },
  sample: (c) => ({
    league: LEAGUES[c.leagueId]?.label || 'Brasileirão Série A',
    team: c.team || '',
    total: 20,
    rows: ['Fortaleza', 'Bahia', 'Sport', 'Ceará', 'Vitória', 'Náutico', 'Santa Cruz', 'CRB'].slice(0, Math.max(4, Math.min(8, Number(c.rows) || 8)))
      .map((team, i) => ({ pos: i + 1, team, played: 30, win: 18 - i, draw: 6, loss: 6 + i, gd: 20 - 3 * i, pts: 60 - 3 * i })),
  }),
};

/* ---------------- Notícias em rotação (vários feeds RSS) ---------------- */

/**
 * Feeds conferidos. A tela mostra só o título e a fonte. A Agência Brasil autoriza reprodução com
 * indicação da fonte para fins jornalísticos; uso comercial de cada portal depende dos termos dele.
 */
export const NEWS_FEEDS = [
  { label: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml' },
  { label: 'g1 Brasil', url: 'https://g1.globo.com/rss/g1/' },
  { label: 'g1 Pernambuco', url: 'https://g1.globo.com/rss/g1/pernambuco/' },
  { label: 'g1 Economia', url: 'https://g1.globo.com/rss/g1/economia/' },
];

/**
 * Portais e editorias com feed conferido (11/2026). A TV mostra só manchete e fonte.
 * Cada portal tem os próprios termos de uso: a Agência Brasil autoriza com crédito; os demais,
 * confira antes de exibir em ponto comercial.
 */
export const NEWS_PUBLISHERS = {
  g1: { label: 'g1', color: '#C4170C', feeds: {
    'Últimas': 'https://g1.globo.com/rss/g1/', Política: 'https://g1.globo.com/rss/g1/politica/', Economia: 'https://g1.globo.com/rss/g1/economia/',
    Educação: 'https://g1.globo.com/rss/g1/educacao/', Tecnologia: 'https://g1.globo.com/rss/g1/tecnologia/', Mundo: 'https://g1.globo.com/rss/g1/mundo/',
    Saúde: 'https://g1.globo.com/rss/g1/ciencia-e-saude/', Pernambuco: 'https://g1.globo.com/rss/g1/pernambuco/',
  } },
  uol: { label: 'UOL', color: '#1A1A1A', feeds: {
    Notícias: 'https://rss.uol.com.br/feed/noticias.xml', Economia: 'https://rss.uol.com.br/feed/economia.xml',
    Tecnologia: 'https://rss.uol.com.br/feed/tecnologia.xml', Esporte: 'https://rss.uol.com.br/feed/esporte.xml',
  } },
  ge: { label: 'ge', color: '#06AA48', feeds: { 'Últimas': 'https://ge.globo.com/rss/ge/', Futebol: 'https://ge.globo.com/rss/ge/futebol/', Pernambuco: 'https://ge.globo.com/rss/ge/pe/' } },
  agenciabrasil: { label: 'Agência Brasil', color: '#00508C', feeds: {
    'Últimas': 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml', Geral: 'https://agenciabrasil.ebc.com.br/rss/geral/feed.xml',
    Economia: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', Política: 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml',
    Saúde: 'https://agenciabrasil.ebc.com.br/rss/saude/feed.xml', Educação: 'https://agenciabrasil.ebc.com.br/rss/educacao/feed.xml',
    'Direitos humanos': 'https://agenciabrasil.ebc.com.br/rss/direitos-humanos/feed.xml', Internacional: 'https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml',
    Esportes: 'https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml', Cultura: 'https://agenciabrasil.ebc.com.br/rss/cultura/feed.xml',
  } },
  canaltech: { label: 'Canaltech', color: '#0B9ED9', feeds: { Tecnologia: 'https://canaltech.com.br/rss/' } },
  vatican: { label: 'Vatican News', color: '#8A6D3B', feeds: { Notícias: 'https://www.vaticannews.va/pt.rss.xml' } },
  folha: { label: 'Folha', color: '#1A1A1A', feeds: { 'Em cima da hora': 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml' } },
  cnn: { label: 'CNN Brasil', color: '#CC0000', feeds: { 'Últimas': 'https://www.cnnbrasil.com.br/feed/' } },
  canalrural: { label: 'Canal Rural', color: '#2E7D32', feeds: { Agro: 'https://www.canalrural.com.br/feed/' } },
};

/** Lista de feeds de um portal: editorias escolhidas (até 4) ou as primeiras. */
export function publisherFeeds(key, editorias = []) {
  const p = NEWS_PUBLISHERS[key];
  if (!p) return [];
  const names = (editorias.length ? editorias : Object.keys(p.feeds).slice(0, 1)).filter((n) => p.feeds[n]).slice(0, 4);
  return names.map((n) => ({ label: Object.keys(p.feeds).length > 1 ? `${p.label} · ${n}` : p.label, url: p.feeds[n] }));
}

/** Manchetes intercaladas de vários feeds (uma de cada, em rodízio), sem repetir título. */
export function mergeFeeds(feeds, max = 12) {
  const lists = feeds.filter(Boolean).map((f) => (f.items || []).map((it) => ({ ...it, source: f.label || f.source || '' })));
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < max && lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const it = l[i];
      if (!it || seen.has(it.title.toLowerCase())) continue;
      seen.add(it.title.toLowerCase());
      out.push(it);
      if (out.length >= max) break;
    }
  }
  return out;
}

const feedList = (c) => (Array.isArray(c.feeds) ? c.feeds : []).filter((f) => /^https?:\/\//.test(f?.url || '')).slice(0, 4);

export const headlinesSource = {
  ttl: 15 * MIN,
  urls: (c) => feedList(c).map((f) => f.url),
  parse(texts, c) {
    const feeds = feedList(c).map((f, i) => {
      if (texts[i] == null) return null;
      try { return { label: f.label || '', ...parseFeed(texts[i], 10) }; } catch { return null; }
    });
    const items = mergeFeeds(feeds.map((f) => f && { ...f, label: f.label || f.source }), 12);
    if (!items.length) throw new Error('nenhuma manchete');
    return { items };
  },
  sample: (c) => {
    const names = feedList(c).map((f) => f.label).filter(Boolean);
    const src = (i) => names[i % (names.length || 1)] || 'Agência Brasil';
    return { items: [
      'As manchetes dos feeds escolhidos aparecem aqui, uma de cada vez',
      'A tela alterna entre as fontes, sem repetir a mesma notícia',
      'Sem internet, a TV mostra as últimas manchetes que conseguiu ler',
      'A fonte de cada manchete aparece em cima do título',
    ].map((title, i) => ({ title, source: src(i) })) };
  },
};

/* ---------------- Cotações (AwesomeAPI) ---------------- */

export const CURRENCIES = {
  USD: 'Dólar',
  EUR: 'Euro',
  GBP: 'Libra',
  ARS: 'Peso argentino',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
};

export const currencySource = {
  ttl: 15 * MIN,
  urls: (c) => {
    const codes = (c.codes?.length ? c.codes : ['USD', 'EUR', 'BTC']).filter((k) => CURRENCIES[k]).slice(0, 6);
    return [`https://economia.awesomeapi.com.br/json/last/${codes.map((k) => `${k}-BRL`).join(',')}`];
  },
  parse([t], c) {
    const j = json(t) || {};
    const codes = (c.codes?.length ? c.codes : ['USD', 'EUR', 'BTC']).filter((k) => CURRENCIES[k]);
    const rows = codes.map((k) => {
      const q = j[`${k}BRL`];
      if (!q) return null;
      return { code: k, name: CURRENCIES[k], bid: num(q.bid), pct: num(q.pctChange), at: q.create_date || null };
    }).filter((r) => r && r.bid != null);
    if (!rows.length) throw new Error('sem cotações');
    return { rows, updated: rows[0].at };
  },
  sample: () => ({
    updated: null,
    rows: [{ code: 'USD', name: 'Dólar', bid: 5.4321, pct: -0.42 }, { code: 'EUR', name: 'Euro', bid: 6.1234, pct: 0.18 }, { code: 'BTC', name: 'Bitcoin', bid: 512345, pct: 2.1 }],
  }),
};

/** Valor de moeda para a TV: até 4 casas abaixo de R$ 10, 2 casas acima, sem casas acima de 10 mil. */
export function formatQuote(v) {
  const n = num(v);
  if (n == null) return '—';
  const digits = n >= 10000 ? 0 : n >= 10 ? 2 : 4;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/* ---------------- Indicadores econômicos (Banco Central, SGS) ---------------- */

/** Séries do SGS. ipca12 soma os 12 últimos meses do IPCA mensal (série 433). */
export const INDICATORS = {
  selic: { label: 'Selic (meta)', serie: 432, last: 1, unit: '% ao ano' },
  ipca12: { label: 'IPCA em 12 meses', serie: 433, last: 12, unit: '%' },
  ipca: { label: 'IPCA do mês', serie: 433, last: 1, unit: '%' },
  cdi: { label: 'CDI', serie: 4389, last: 1, unit: '% ao ano' },
  dolarPtax: { label: 'Dólar PTAX (venda)', serie: 1, last: 1, unit: 'R$' },
};

const indicatorKeys = (c) => (c.items?.length ? c.items : ['selic', 'ipca12', 'cdi']).filter((k) => INDICATORS[k]).slice(0, 5);

export const indicatorsSource = {
  ttl: 6 * HOUR,
  urls: (c) => indicatorKeys(c).map((k) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${INDICATORS[k].serie}/dados/ultimos/${INDICATORS[k].last}?formato=json`),
  parse(texts, c) {
    const rows = indicatorKeys(c).map((k, i) => {
      const list = (() => { try { return json(texts[i]) || []; } catch { return []; } })();
      if (!Array.isArray(list) || !list.length) return null;
      const def = INDICATORS[k];
      const vals = list.map((x) => num(x.valor)).filter((v) => v != null);
      if (!vals.length) return null;
      const value = k === 'ipca12'
        ? Math.round((vals.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 10000) / 100
        : vals[vals.length - 1];
      return { key: k, label: def.label, unit: def.unit, value, date: list[list.length - 1].data };
    }).filter(Boolean);
    if (!rows.length) throw new Error('sem indicadores');
    return { rows };
  },
  sample: () => ({ rows: [
    { key: 'selic', label: 'Selic (meta)', unit: '% ao ano', value: 15, date: '05/11/2026' },
    { key: 'ipca12', label: 'IPCA em 12 meses', unit: '%', value: 4.68, date: '01/10/2026' },
    { key: 'cdi', label: 'CDI', unit: '% ao ano', value: 14.9, date: '13/11/2026' },
  ] }),
};

/* ---------------- Feriados (BrasilAPI + datas da loja) ---------------- */

/** "25/12 Natal" ou "2026-12-08 Nossa Senhora da Conceição" → { md|date, name }. */
export function parseExtraDates(text = '') {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30).map((l) => {
    let m = /^(\d{4})-(\d{2})-(\d{2})\s*[-–—:]?\s*(.+)$/.exec(l);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, name: m[4].trim().slice(0, 60) };
    m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–—:]?\s*(.+)$/.exec(l);
    if (m) {
      const md = `${pad(m[2])}-${pad(m[1])}`;
      return m[3] ? { date: `${m[3]}-${md}`, name: m[4].trim().slice(0, 60) } : { md, name: m[4].trim().slice(0, 60) };
    }
    return null;
  }).filter(Boolean);
}

/** Próximas datas a partir de hoje, misturando a lista nacional com as da loja. */
export function upcomingDates(national = [], extra = [], now = new Date(), count = 5) {
  const today = fromIso(isoDay(now));
  const y = today.getFullYear();
  const all = [
    ...national.map((h) => ({ date: h.date, name: h.name, local: false })),
    ...extra.flatMap((e) => (e.date ? [{ date: e.date, name: e.name, local: true }] : [y, y + 1].map((yy) => ({ date: `${yy}-${e.md}`, name: e.name, local: true })))),
  ];
  const seen = new Set();
  return all
    .filter((h) => fromIso(h.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((h) => (seen.has(h.date + h.name) ? false : seen.add(h.date + h.name)))
    .slice(0, count)
    .map((h) => ({ ...h, inDays: daysBetween(today, fromIso(h.date)) }));
}

export const holidaysSource = {
  ttl: 24 * HOUR,
  urls: (c, { now = new Date() } = {}) => {
    const y = now.getFullYear();
    return [`https://brasilapi.com.br/api/feriados/v1/${y}`, `https://brasilapi.com.br/api/feriados/v1/${y + 1}`];
  },
  parse(texts, c, now = Date.now()) {
    const national = texts.flatMap((t) => { try { const j = json(t); return Array.isArray(j) ? j : []; } catch { return []; } })
      .map((h) => ({ date: String(h.date).slice(0, 10), name: h.name }));
    const extra = parseExtraDates(c.extra);
    if (!national.length && !extra.length) throw new Error('sem feriados');
    return { items: upcomingDates(national, extra, new Date(now), Number(c.count) || 5) };
  },
  sample: (c, now = Date.now()) => {
    const y = new Date(now).getFullYear();
    const base = [
      { date: `${y}-11-20`, name: 'Dia Nacional de Zumbi e da Consciência Negra' },
      { date: `${y}-12-25`, name: 'Natal' },
      { date: `${y + 1}-01-01`, name: 'Confraternização Universal' },
      { date: `${y + 1}-02-16`, name: 'Carnaval' },
      { date: `${y + 1}-04-03`, name: 'Sexta-feira Santa' },
    ];
    return { items: upcomingDates(base, parseExtraDates(c.extra), new Date(now), Number(c.count) || 5) };
  },
};

/* ---------------- Hoje na história (Wikipédia) ---------------- */

export const onThisDaySource = {
  ttl: 6 * HOUR,
  urls: (c, { now = new Date() } = {}) => [`https://pt.wikipedia.org/api/rest_v1/feed/onthisday/events/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`],
  parse([t], c, now = Date.now()) {
    const ev = json(t)?.events || [];
    const items = ev
      .map((e) => ({ year: Number(e.year), text: String(e.text || '').replace(/\s+/g, ' ').trim() }))
      .filter((e) => e.text && e.text.length <= 220 && Number.isFinite(e.year))
      .sort((a, b) => b.year - a.year);
    if (!items.length) throw new Error('sem eventos');
    // Um recorte que muda a cada dia, sem ficar só nos anos mais recentes.
    const d = new Date(now);
    const pick = [];
    const step = Math.max(1, Math.floor(items.length / 4));
    for (let i = (d.getDate() % step); i < items.length && pick.length < Math.max(1, Math.min(4, Number(c.count) || 3)); i += step) pick.push(items[i]);
    return { date: `${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}`, items: pick.sort((a, b) => a.year - b.year) };
  },
  sample: (c, now = Date.now()) => ({
    date: new Date(now).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }),
    items: [
      { year: 1889, text: 'Proclamação da República no Brasil.' },
      { year: 1955, text: 'Os acontecimentos do dia aparecem aqui, tirados da Wikipédia.' },
      { year: 2001, text: 'A cada dia, a tela mostra fatos diferentes.' },
    ],
  }),
};

/* ---------------- Agenda (calendário .ics) ---------------- */

/** Converte DTSTART do iCalendar (data, data e hora local ou UTC) em milissegundos. */
function icsTime(value, params = '') {
  const v = String(value).trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return { at: null, allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (h == null || /VALUE=DATE(?!-)/.test(params)) return { at: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  if (z) return { at: Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false };
  // Com TZID, considera o horário local da TV (as lojas e a agenda costumam estar no mesmo fuso).
  return { at: new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)).getTime(), allDay: false };
}

const icsText = (s = '') => String(s).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/**
 * Próximos eventos de um calendário .ics (Google Agenda "endereço público em formato iCal",
 * Outlook, prefeitura). Eventos repetidos semanalmente ou anualmente entram na próxima ocorrência.
 */
export function parseIcs(text = '', now = Date.now(), max = 6) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(';');
      const value = line.slice(i + 1);
      if (name === 'DTSTART') Object.assign(cur, icsTime(value, params.join(';')));
      else if (name === 'SUMMARY') cur.title = icsText(value);
      else if (name === 'LOCATION') cur.place = icsText(value);
      else if (name === 'RRULE') cur.rrule = value;
      else if (name === 'STATUS') cur.status = value;
    }
  }
  const today0 = fromIso(isoDay(new Date(now))).getTime();
  const out = [];
  for (const e of events) {
    if (!e.title || e.at == null || e.status === 'CANCELLED') continue;
    let at = e.at;
    const from = e.allDay ? today0 : now - 2 * HOUR;
    const freq = /FREQ=(WEEKLY|YEARLY|DAILY|MONTHLY)/.exec(e.rrule || '')?.[1];
    const until = /UNTIL=(\d{8})/.exec(e.rrule || '')?.[1];
    if (freq && at < from) {
      // Repetição: avança até a próxima ocorrência que ainda não passou.
      const d = new Date(at);
      let guard = 0;
      while (d.getTime() < from && guard++ < 2000) {
        if (freq === 'DAILY') d.setDate(d.getDate() + 1);
        else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7);
        else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + 1);
        else d.setFullYear(d.getFullYear() + 1);
      }
      at = d.getTime();
      if (until && isoDay(d).replace(/-/g, '') > until) continue;
    }
    if (at >= from) out.push({ title: e.title.slice(0, 80), place: (e.place || '').slice(0, 60), at, allDay: !!e.allDay });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}

export const agendaSource = {
  ttl: 30 * MIN,
  urls: (c) => {
    const u = String(c.url || '').trim().replace(/^webcal:/i, 'https:');
    return /^https?:\/\//.test(u) ? [u] : [];
  },
  parse([t], c, now = Date.now()) {
    if (!/BEGIN:VCALENDAR/.test(String(t))) throw new Error('não é um calendário .ics');
    return { title: c.title || 'Agenda', items: parseIcs(t, now, Math.max(2, Math.min(8, Number(c.count) || 5))) };
  },
  sample: (c, now = Date.now()) => {
    const d = new Date(now);
    const at = (days, h) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, h).getTime();
    return { title: c.title || 'Agenda', items: [
      { title: 'Degustação de vinhos', place: 'Loja Centro', at: at(0, 18) },
      { title: 'Feira de artesanato', place: 'Praça principal', at: at(2, 9) },
      { title: 'Aula de culinária', place: 'Espaço gourmet', at: at(5, 15) },
      { title: 'Black Friday', place: '', at: at(9, 0), allDay: true },
    ] };
  },
};

/* ---------------- Apps que não usam internet ---------------- */

/** Contagem regressiva até uma data/hora. */
export function countdownParts(target, now = Date.now()) {
  const t = typeof target === 'number' ? target : Date.parse(target);
  if (!Number.isFinite(t)) return null;
  const ms = Math.max(0, t - now);
  return {
    done: ms === 0,
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / HOUR),
    minutes: Math.floor((ms % HOUR) / MIN),
    seconds: Math.floor((ms % MIN) / 1000),
  };
}

/** Fusos do relógio mundial (nome na tela → fuso IANA). */
export const WORLD_ZONES = {
  'America/Sao_Paulo': 'Brasília',
  'America/Manaus': 'Manaus',
  'America/Noronha': 'Fernando de Noronha',
  'America/New_York': 'Nova York',
  'America/Los_Angeles': 'Los Angeles',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'America/Santiago': 'Santiago',
  'Europe/Lisbon': 'Lisboa',
  'Europe/London': 'Londres',
  'Europe/Paris': 'Paris',
  'Europe/Rome': 'Roma',
  'Asia/Dubai': 'Dubai',
  'Asia/Tokyo': 'Tóquio',
  'Asia/Shanghai': 'Xangai',
  'Australia/Sydney': 'Sydney',
};

/** Hora num fuso: { time: "14:05", day: -1|0|1 (em relação à TV), offset: "-3" }. */
export function zoneTime(zone, now = Date.now()) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(fmt.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    const there = `${p.year}-${p.month}-${p.day}`;
    const here = isoDay(new Date(now));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const offsetH = Math.round((asUtc - Math.floor(now / MIN) * MIN) / HOUR * 2) / 2;
    return { time: `${p.hour}:${p.minute}`, hour: +p.hour, day: there === here ? 0 : there > here ? 1 : -1, offset: offsetH >= 0 ? `+${offsetH}` : String(offsetH) };
  } catch {
    return null;
  }
}

/** "Ana Souza 12/03" (ou "12/03 Ana") → aniversariantes do mês, ordenados pelo dia. */
export function parseBirthdays(text = '') {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200).map((l) => {
    const m = /(\d{1,2})\/(\d{1,2})/.exec(l);
    if (!m) return null;
    const name = l.replace(m[0], '').replace(/[-–—:;,]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const day = +m[1];
    const month = +m[2];
    if (!name || day < 1 || day > 31 || month < 1 || month > 12) return null;
    return { name, day, month };
  }).filter(Boolean);
}

export function birthdaysOf(list, now = new Date(), scope = 'month') {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const items = list.filter((b) => b.month === m && (scope !== 'today' || b.day === d)).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  return items.map((b) => ({ ...b, today: b.day === d }));
}

/** Ditados populares (domínio público). Usados quando o cliente não escreve as próprias frases. */
export const PROVERBS = [
  'Devagar se vai ao longe.',
  'Quem planta colhe.',
  'A união faz a força.',
  'Água mole em pedra dura, tanto bate até que fura.',
  'De grão em grão, a galinha enche o papo.',
  'Quem não arrisca não petisca.',
  'Mais vale um pássaro na mão do que dois voando.',
  'Gentileza gera gentileza.',
  'Quem tem boca vai a Roma.',
  'Depois da tempestade vem a bonança.',
  'O que é do homem o bicho não come.',
  'Antes tarde do que nunca.',
  'Cada dia é uma nova chance.',
  'Quem espera sempre alcança.',
];

/** Frase do dia: muda à meia-noite e não repete enquanto houver frases novas na lista. */
export function quoteOfDay(custom = '', now = new Date()) {
  const own = String(custom).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 365);
  const list = own.length ? own : PROVERBS;
  const day = Math.floor(fromIso(isoDay(now)).getTime() / DAY);
  const raw = list[((day % list.length) + list.length) % list.length];
  // "Frase — Autor" vira texto e autor.
  const m = /^(.*?)\s+[—–-]\s+([^—–-]{2,40})$/.exec(raw);
  return m ? { text: m[1], author: m[2] } : { text: raw, author: own.length ? '' : 'Ditado popular' };
}

/* ---------------- Registro: que fonte cada app usa ---------------- */

export const APP_SOURCES = {
  rain: rainSource,
  air: airSource,
  sunmoon: sunSource,
  matches: matchesSource,
  standings: standingsSource,
  headlines: headlinesSource,
  currency: currencySource,
  indicators: indicatorsSource,
  holidays: holidaysSource,
  onthisday: onThisDaySource,
  agenda: agendaSource,
  drive: driveSource,
};

/** Chave de cache (muda quando muda o que se busca). */
export function sourceCacheKey(kind, urls) {
  return `app:${kind}:${urls.join('|')}`;
}
