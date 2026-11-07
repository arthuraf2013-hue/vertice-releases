import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';

/**
 * Assina com nova tentativa: logo após criar a conta ou parear, o painel já enxerga
 * os documentos (escrita local), mas o servidor pode recusar a leitura por alguns
 * instantes até confirmar o lote. Em vez de desistir, tenta de novo com espera crescente.
 */
function watchWithRetry(subscribe, onData, onGiveUp) {
  let off = null;
  let timer = null;
  let attempt = 0;
  let closed = false;
  const start = () => {
    off = subscribe(
      (data) => {
        attempt = 0;
        onData(data);
      },
      (err) => {
        off?.();
        if (closed) return;
        if (attempt >= 4) {
          console.warn('[vx] leitura recusada', err?.code || err);
          return onGiveUp();
        }
        timer = setTimeout(start, 600 * 2 ** attempt++);
      },
    );
  };
  start();
  return () => {
    closed = true;
    clearTimeout(timer);
    off?.();
  };
}

/** Documento em tempo real. `undefined` = carregando, `null` = não existe. */
export function useDoc(path) {
  const [state, setState] = useState(undefined);
  useEffect(() => {
    if (!path) return setState(null);
    setState(undefined);
    return watchWithRetry((ok, err) => api.watchDoc(path, ok, err), setState, () => setState(null));
  }, [path]);
  return state;
}

/** Coleção em tempo real. `q` = { where: [[campo, op, valor]], orderBy: [campo, dir], limit }. */
export function useCol(path, q) {
  const key = JSON.stringify(q || {});
  const [state, setState] = useState(undefined);
  useEffect(() => {
    if (!path) return setState([]);
    setState(undefined);
    return watchWithRetry((ok, err) => api.watchCol(path, JSON.parse(key), ok, err), setState, () => setState([]));
  }, [path, key]);
  return state;
}

/** Relógio que avança a cada `ms` (para os status "há 3 min" se atualizarem sozinhos). */
const clock = { now: Date.now(), subs: new Set() };
setInterval(() => {
  clock.now = Date.now();
  clock.subs.forEach((f) => f());
}, 30_000);
export function useNow() {
  return useSyncExternalStore(
    (f) => (clock.subs.add(f), () => clock.subs.delete(f)),
    () => clock.now,
  );
}

export function useById(list) {
  return useMemo(() => new Map((list || []).map((x) => [x.id, x])), [list]);
}
