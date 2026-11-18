// Dados de fora que alguns aplicativos precisam (clima e notícias), com cache no aparelho:
// sem internet, a TV mostra a última previsão/manchetes que conseguiu.
import { useEffect, useState } from 'react';
import {
  weatherUrl, summarizeWeather, parseFeed, safeHttpUrl, sheetCsvUrl, sheetTable, APP_SOURCES, sourceCacheKey,
} from '@vertice/shared';
import { local } from './platform.js';
import { host } from './host.js';
import { watchComments } from './comments.js';
import { watchLive } from './live.js';
import { clockOffset } from './clock.js';
import { sampleQueue, sampleTally, samplePhotos, spokenTicket, normalizeQueueConfig } from '@vertice/shared';
import { dingDong, speak } from './speak.js';

// Open-Meteo pede chave para uso comercial (servidor "customer-"). Vem do PLAYER_ENV na publicação.
const OPEN_METEO_KEY = import.meta.env.VITE_OPEN_METEO_KEY || '';
// Chave da API do Google (opcional) para listar pastas do Drive; sem ela usa a página pública da pasta.
const DRIVE_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

const WEATHER_TTL = 30 * 60_000;
const FEED_TTL = 15 * 60_000;
const SHEET_TTL = 5 * 60_000;

async function cached(key, ttl, load) {
  const c = local.get(key);
  if (c && Date.now() - c.at < ttl) return c.data;
  try {
    const data = await load();
    local.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    if (c) return c.data; // velho, mas melhor que nada
    throw e;
  }
}

export function loadWeather(cfg) {
  if (cfg.lat == null || cfg.lon == null) return Promise.reject(new Error('cidade não escolhida'));
  const days = Math.min(6, Math.max(1, Number(cfg.days) || 4));
  return cached(`app:w:${cfg.lat},${cfg.lon},${days}`, WEATHER_TTL, async () => {
    const res = await fetch(weatherUrl(cfg.lat, cfg.lon, days, OPEN_METEO_KEY));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return summarizeWeather(await res.json(), days);
  });
}

export function loadFeed(cfg) {
  const url = safeHttpUrl(cfg.url);
  if (!url) return Promise.reject(new Error('endereço inválido'));
  return cached(`app:rss:${url}`, FEED_TTL, async () => parseFeed(await host.fetchText(url), 10));
}

export function loadSheet(cfg) {
  const url = sheetCsvUrl(cfg.url);
  if (!url) return Promise.reject(new Error('link de planilha inválido'));
  return cached(`app:sheet:${url}:${cfg.rows}:${cfg.header}`, SHEET_TTL, async () => sheetTable(await host.fetchText(url), { header: cfg.header !== false, rows: cfg.rows }));
}

/**
 * Apps com fonte própria (feeds.js): baixa todos os endereços, aceita falha parcial (um portal fora
 * do ar não derruba os outros) e guarda o resultado para mostrar sem internet.
 */
const isDemo = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export function loadSource(kind, cfg) {
  const src = APP_SOURCES[kind];
  // Demonstração (?demo=play&app=...): dados de exemplo, sem internet.
  if (isDemo()) return Promise.resolve(src.sample(cfg, Date.now()));
  const urls = src.urls(cfg, { apikey: OPEN_METEO_KEY, driveKey: DRIVE_KEY, now: new Date() });
  if (!urls.length) return Promise.reject(new Error('configuração incompleta'));
  return cached(sourceCacheKey(kind, urls), src.ttl, async () => {
    const res = await Promise.allSettled(urls.map((u) => host.fetchText(u)));
    if (res.every((r) => r.status === 'rejected')) throw res[0].reason;
    return src.parse(res.map((r) => (r.status === 'fulfilled' ? r.value : null)), cfg, Date.now());
  });
}

/** { weather, feed, table, data, comments, status } para o aplicativo que está na tela. */
export function useAppData(app) {
  const [s, setS] = useState({ weather: null, feed: null, table: null, data: null, comments: null, status: 'loading' });
  const kind = app?.kind;
  const key = JSON.stringify(app?.config || {});
  useEffect(() => {
    let alive = true;
    const done = (patch) => alive && setS((x) => ({ ...x, ...patch }));
    const demo = isDemo();
    if (kind === 'queue') {
      if (demo) { done({ data: sampleQueue(), status: null }); return () => { alive = false; }; }
      const cfg = normalizeQueueConfig(app.config);
      let last = null;
      const off = watchLive('queues', app.config.queueId, (q) => {
        const n = q?.current?.n;
        // Chamada nova (não a que já estava quando o app abriu): toca e fala.
        if (last != null && n != null && n !== last && Date.now() - (q.current.at || 0) < 60_000) {
          if (cfg.sound !== false) dingDong();
          if (cfg.voice !== false) setTimeout(() => speak(spokenTicket(q.current)), cfg.sound !== false ? 1400 : 0);
        }
        last = n ?? last ?? 0;
        done({ data: q || {}, status: null });
      });
      return () => { alive = false; off(); };
    }
    if (kind === 'timer') {
      if (demo) { done({ data: { demoElapsed: 10 + 7 * 60 + 23 }, status: null }); return () => { alive = false; }; }
      const off = watchLive('timers', app.config.timerId, (state) => done({ data: { state: state || {}, offset: clockOffset() }, status: null }));
      return () => { alive = false; off(); };
    }
    if (kind === 'poll') {
      if (demo) { done({ data: { tally: sampleTally((app.config.options || []).length || 3) }, status: null }); return () => { alive = false; }; }
      const off = watchLive('pollTallies', app.config.pollId, (tally) => done({ data: { tally }, status: null }));
      return () => { alive = false; off(); };
    }
    if (kind === 'photowall') {
      if (demo) { done({ comments: samplePhotos(), status: null }); return () => { alive = false; }; }
      const off = watchComments(app.config.boardId, (comments) => done({ comments, status: null }));
      return () => { alive = false; off(); };
    }
    if (kind === 'comments') {
      const off = watchComments(app.config.boardId, (comments) => done({ comments, status: null }));
      return () => { alive = false; off(); };
    }
    if (APP_SOURCES[kind]) {
      const load = () => loadSource(kind, app.config).then((data) => done({ data, status: null }), () => done({ status: 'error' }));
      load();
      // App que fica muito tempo na tela (zona fixa): atualiza no ritmo da fonte.
      const t = setInterval(load, Math.max(60_000, APP_SOURCES[kind].ttl));
      return () => { alive = false; clearInterval(t); };
    }
    if (kind === 'weather') loadWeather(app.config).then((weather) => done({ weather, status: null }), () => done({ status: 'error' }));
    else if (kind === 'rss') loadFeed(app.config).then((feed) => done({ feed, status: null }), () => done({ status: 'error' }));
    else if (kind === 'sheet' && demo) done({ table: sheetTable('Loja,Vendas,Meta\nCentro,"R$ 48.200","R$ 45.000"\nBoa Viagem,"R$ 41.900","R$ 44.000"\nCasa Forte,"R$ 37.350","R$ 35.000"\nOlinda,"R$ 29.800","R$ 30.000"\nCaruaru,"R$ 26.400","R$ 22.000"\nPetrolina,"R$ 21.100","R$ 24.000"', { header: true, rows: 10 }), status: null });
    else if (kind === 'sheet') loadSheet(app.config).then((table) => done({ table, status: null }), () => done({ status: 'error' }));
    else done({ status: null });
    return () => { alive = false; };
  }, [kind, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}
