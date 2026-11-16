// Mural de comentários: a TV escuta os comentários aprovados do mural e guarda os últimos no
// aparelho (sem internet, continua mostrando o que já tinha).
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { commentsForTv, sampleComments } from '@vertice/shared';
import { fb, hasFirebase } from './firebase.js';
import { local } from './platform.js';

const isDemo = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
const ms = (v) => (v instanceof Timestamp ? v.toMillis() : Number(v) || null);

/** Chama `cb(lista)` com os aprovados (mais novos primeiro). Devolve a função para parar. */
export function watchComments(boardId, cb) {
  if (isDemo() || !hasFirebase) {
    cb(sampleComments());
    return () => {};
  }
  const companyId = local.get('pairing')?.companyId;
  const key = `comments:${boardId}`;
  const cached = local.get(key);
  cb(cached || []);
  if (!companyId || !boardId) return () => {};
  let off = null;
  let retry = null;
  let stopped = false;
  const listen = () => {
    const { db } = fb();
    const q = query(
      collection(db, 'companies', companyId, 'commentBoards', boardId, 'comments'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    off = onSnapshot(q, (s) => {
      const list = commentsForTv(s.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: ms(d.get('createdAt')) })));
      local.set(key, list);
      cb(list);
    }, (e) => {
      console.warn('[vx] comments', e.code || e);
      off = null;
      if (!stopped) retry = setTimeout(listen, 30_000);
    });
  };
  listen();
  return () => { stopped = true; clearTimeout(retry); off?.(); };
}
