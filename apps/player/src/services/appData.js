// Dados de fora que alguns aplicativos precisam (clima e notícias), com cache no aparelho:
// sem internet, a TV mostra a última previsão/manchetes que conseguiu.
import { useEffect, useState } from 'react';
import { weatherUrl, summarizeWeather, parseFeed, safeHttpUrl, sheetCsvUrl, sheetTable } from '@vertice/shared';
import { local } from './platform.js';
import { host } from './host.js';

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
    const res = await fetch(weatherUrl(cfg.lat, cfg.lon, days));
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

/** { weather, feed, table, status } para o aplicativo que está na tela. */
export function useAppData(app) {
  const [s, setS] = useState({ weather: null, feed: null, table: null, status: 'loading' });
  const kind = app?.kind;
  const key = JSON.stringify(app?.config || {});
  useEffect(() => {
    let alive = true;
    const done = (patch) => alive && setS((x) => ({ ...x, ...patch }));
    if (kind === 'weather') loadWeather(app.config).then((weather) => done({ weather, status: null }), () => done({ status: 'error' }));
    else if (kind === 'rss') loadFeed(app.config).then((feed) => done({ feed, status: null }), () => done({ status: 'error' }));
    else if (kind === 'sheet') loadSheet(app.config).then((table) => done({ table, status: null }), () => done({ status: 'error' }));
    else done({ status: null });
    return () => { alive = false; };
  }, [kind, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}
