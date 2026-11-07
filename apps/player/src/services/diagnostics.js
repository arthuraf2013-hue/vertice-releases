// Diagnóstico da TV: o que o operador vê no menu e o que vai para o painel.
import { host, shell } from './host.js';
import { APP_VERSION } from './platform.js';

const MAX_ERROS = 15;
const erros = [];
const inicio = Date.now();

/** Guarda os últimos avisos e erros do player (sem dados de clientes: só a mensagem, curta). */
export function captureErrors() {
  if (captureErrors.on) return;
  captureErrors.on = true;
  const guardar = (nivel, args) => {
    const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'object' ? safeJson(a) : String(a))).join(' ');
    erros.unshift({ at: Date.now(), level: nivel, msg: msg.slice(0, 200) });
    erros.length = Math.min(erros.length, MAX_ERROS);
  };
  for (const nivel of ['warn', 'error']) {
    const orig = console[nivel].bind(console);
    console[nivel] = (...args) => {
      guardar(nivel, args);
      orig(...args);
    };
  }
  window.addEventListener('unhandledrejection', (e) => guardar('error', [e.reason || 'Promessa rejeitada']));
}

function safeJson(o) {
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}

export const recentErrors = () => erros.slice();

/** Tempo de resposta de um endereço (ms) ou null se não respondeu. */
async function latencia(url, timeout = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const t0 = performance.now();
  try {
    await fetch(`${url}${url.includes('?') ? '&' : '?'}vx=${Date.now()}`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Coleta tudo de uma vez.
 * @param {object} state  estado do player (device.getState())
 * @param {object} extra  { update } estado da atualização
 */
export async function collectDiagnostics(state, extra = {}) {
  const mediaUrl = state.manifest?.assets?.[0]?.url;
  const [internet, firebase, servidor, storage, nativo] = await Promise.all([
    latencia('https://www.gstatic.com/generate_204'),
    latencia('https://firestore.googleapis.com/'),
    mediaUrl ? latencia(new URL(mediaUrl).origin + '/') : Promise.resolve(undefined),
    host.storage(),
    host.nativeInfo(),
  ]);
  const dpr = window.devicePixelRatio || 1;
  return {
    appVersion: APP_VERSION,
    nativeVersion: nativo?.versionName || (shell === 'electron' ? window.vxDesktop?.info?.appVersion : null) || null,
    shell,
    platform: nativo ? `Android ${nativo.sdk}` : (window.vxDesktop?.info?.osVersion || navigator.userAgent.slice(0, 80)),
    model: nativo?.model || window.vxDesktop?.info?.model || null,
    resolution: `${Math.round(screen.width * dpr)}×${Math.round(screen.height * dpr)}`,
    uptimeMin: Math.round((Date.now() - inicio) / 60000),
    online: state.network?.online !== false,
    networkType: state.network?.type || null,
    latency: { internet, firebase, mediaServer: servidor ?? null },
    storage: {
      freeBytes: num(storage.freeBytes),
      totalBytes: num(storage.totalBytes),
      mediaBytes: num(storage.mediaBytes),
      mediaFiles: num(storage.mediaFiles),
    },
    sync: state.sync || null,
    phase: state.phase,
    update: extra.update || null,
    errors: recentErrors().slice(0, 10),
  };
}

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null);

/** "1,2 GB" */
export function formatBytes(b) {
  if (!Number.isFinite(b) || b === null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 && i ? 1 : 0 })} ${u[i]}`;
}
