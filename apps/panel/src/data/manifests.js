import { buildManifest } from '@vertice/shared';
import { api } from './api.js';

/**
 * Recompila o manifesto das telas afetadas e grava em `companies/{cid}/manifests/{screenId}`.
 * Chamado depois de: publicar/despublicar grade, salvar playlist, excluir mídia,
 * mudar grupos/orientação/painel de pedidos de uma tela e parear tela nova.
 * Sem argumento `screenIds`, recompila todas as telas da empresa.
 */
export async function rebuildManifests(cid, screenIds = null) {
  const base = `companies/${cid}`;
  const [company, screens, schedules, playlists, media, priceLists] = await Promise.all([
    api.getDoc(base),
    api.getCol(`${base}/screens`),
    api.getCol(`${base}/schedules`, { where: [['status', '==', 'published']] }),
    api.getCol(`${base}/playlists`),
    api.getCol(`${base}/media`),
    api.getCol(`${base}/priceLists`),
  ]);
  const targets = screenIds ? screens.filter((s) => screenIds.includes(s.id)) : screens;
  const ops = targets.map((screen) => ({
    op: 'set',
    path: `${base}/manifests/${screen.id}`,
    data: { ...buildManifest({ screen, schedules, playlists, media, company, priceLists }), generatedAt: api.NOW },
  }));
  if (ops.length) await api.batch(ops);
  return ops.length;
}

/** Telas afetadas por uma playlist (via grades publicadas que a usam). */
export async function screensUsingPlaylist(cid, playlistId) {
  const base = `companies/${cid}`;
  const [screens, schedules] = await Promise.all([
    api.getCol(`${base}/screens`),
    api.getCol(`${base}/schedules`, { where: [['status', '==', 'published']] }),
  ]);
  const using = schedules.filter(
    (s) => s.fallbackPlaylistId === playlistId || (s.slots || []).some((sl) => sl.playlistId === playlistId),
  );
  const ids = new Set();
  for (const s of using) {
    for (const scr of screens) {
      if ((s.screenIds || []).includes(scr.id) || (s.groupIds || []).some((g) => (scr.groupIds || []).includes(g))) ids.add(scr.id);
    }
  }
  return [...ids];
}
