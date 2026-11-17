// Ponto único de acesso a dados. O resto do app não sabe se é Firebase ou demonstração.
import { createFirebaseBackend } from './firebase.js';
import { createDemoBackend } from './demo.js';
import { auditEntry } from '@vertice/shared';

const env = import.meta.env;
// No painel Windows, vertice.config.json (lido pelo Electron) tem prioridade sobre o .env do build.
const desktop = (typeof window !== 'undefined' && window.vxDesktop?.config) || {};
const rt = desktop.firebase || {};
const config = {
  apiKey: rt.apiKey || env.VITE_FIREBASE_API_KEY,
  authDomain: rt.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: rt.projectId || env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: rt.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: rt.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: rt.appId || env.VITE_FIREBASE_APP_ID,
};
const mediaServerUrl = desktop.mediaServerUrl || env.VITE_MEDIA_SERVER_URL;
/** Onde editar a configuração no Windows (mostrado no aviso do modo demonstração). */
export const desktopConfigFile = desktop._file || null;

export const isDemo = env.MODE === 'demo' || env.VITE_DEMO === '1' || !config.apiKey;

const raw = isDemo ? createDemoBackend() : createFirebaseBackend(config, { emulator: env.VITE_FIREBASE_EMULATOR === '1', mediaServerUrl });

/* ---------- Registro de atividades ----------
 * Toda gravação do painel em áreas que importam (mídias, playlists, grades, telas, preços, usuários,
 * alerta…) vira uma linha em companies/{id}/audit, gravada logo depois. Se o registro falhar, a
 * gravação continua valendo (o registro nunca trava o trabalho). */
let actor = { uid: null, name: '', companyId: null };
export function setAuditActor(a) { actor = { ...actor, ...a }; }

async function audit(list) {
  if (!actor.uid) return;
  for (const { op, path, data } of list.slice(0, 20)) {
    const e = auditEntry(op, path, data);
    if (!e) continue;
    const cid = path.startsWith('companies/') ? path.split('/')[1] : actor.companyId;
    if (!cid) continue;
    try {
      if (op === 'delete' && !e.targetName) {
        const prev = data?.__prev;
        e.targetName = String(prev?.name || prev?.title || prev?.question || prev?.client || '').slice(0, 80);
      }
      await raw.add(`companies/${cid}/audit`, { ...e, uid: actor.uid, byName: actor.name || '', at: raw.NOW });
    } catch (err) {
      console.warn('[vx] registro de atividade', err?.code || err);
    }
  }
}
const audited = (path) => !!auditEntry('delete', path) || /^companies\/[^/]+$/.test(path);
async function prevOf(path) {
  try { return audited(path) ? await raw.getDoc(path) : null; } catch { return null; }
}
const clean = (data) => (data && typeof data === 'object' ? Object.fromEntries(Object.entries(data).filter(([k]) => k !== '__merge')) : data);

export const api = {
  ...raw,
  async set(path, data, merge = false) {
    const r = await raw.set(path, data, merge);
    audit([{ op: merge ? 'update' : 'set', path, data }]);
    return r;
  },
  async update(path, data) {
    const r = await raw.update(path, data);
    audit([{ op: 'update', path, data }]);
    return r;
  },
  async add(colPath, data) {
    const id = await raw.add(colPath, data);
    audit([{ op: 'set', path: `${colPath}/${id}`, data }]);
    return id;
  },
  async remove(path) {
    const prev = await prevOf(path);
    const r = await raw.remove(path);
    audit([{ op: 'delete', path, data: { __prev: prev } }]);
    return r;
  },
  async batch(ops) {
    const dels = ops.filter((o) => o.op === 'delete' && audited(o.path)).slice(0, 10);
    const prevs = new Map(await Promise.all(dels.map(async (o) => [o.path, await prevOf(o.path)])));
    const r = await raw.batch(ops);
    audit(ops.map((o) => ({ op: o.op === 'set' && o.merge ? 'update' : o.op, path: o.path, data: o.op === 'delete' ? { __prev: prevs.get(o.path) } : o.data })));
    return r;
  },
};

/** Links de download do player (configuráveis por ambiente). */
// O player (APK e Windows) é publicado pelo GitHub Actions; "latest" sempre aponta para a versão nova.
const RELEASES = 'https://github.com/arthuraf2013-hue/vertice-releases/releases/latest/download';
export const downloads = {
  android: env.VITE_DOWNLOAD_ANDROID || `${RELEASES}/Vertice-Player.apk`,
  playerWindows: env.VITE_DOWNLOAD_PLAYER_WINDOWS || `${RELEASES}/Vertice-Player-Setup.exe`,
  web: env.VITE_PLAYER_WEB_URL || 'https://vertice.vettasistemas.com.br/tv/',
  windows: env.VITE_DOWNLOAD_WINDOWS || `${RELEASES}/Vertice-Painel-Setup.exe`,
};

/** WhatsApp comercial da Vetta (só números, com DDI). */
export const supportWhatsApp = env.VITE_SUPPORT_WHATSAPP || '';
