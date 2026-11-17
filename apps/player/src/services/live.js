// Documentos "ao vivo" que alguns apps escutam (fila de senhas, cronômetro, placar da enquete).
// Guarda a última versão no aparelho: sem internet, a TV mostra o que já tinha.
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { fb, hasFirebase } from './firebase.js';
import { local } from './platform.js';

const toPlain = (v) => {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
};

/**
 * Escuta `companies/{empresa}/{col}/{id}` e chama `cb(dados)` (null = não existe).
 * Devolve a função para parar. Erro (sem permissão, sem rede) → tenta de novo em 30 s.
 */
export function watchLive(col, id, cb) {
  const companyId = local.get('pairing')?.companyId;
  const key = `live:${col}:${id}`;
  const cached = local.get(key);
  if (cached) cb(cached);
  if (!hasFirebase || !companyId || !id) return () => {};
  let off = null;
  let retry = null;
  let stopped = false;
  const listen = () => {
    const { db } = fb();
    off = onSnapshot(doc(db, 'companies', companyId, col, id), (s) => {
      const data = s.exists() ? toPlain(s.data()) : null;
      local.set(key, data);
      cb(data);
    }, (e) => {
      console.warn('[vx] live', col, e.code || e);
      off = null;
      if (!stopped) retry = setTimeout(listen, 30_000);
    });
  };
  listen();
  return () => { stopped = true; clearTimeout(retry); off?.(); };
}
