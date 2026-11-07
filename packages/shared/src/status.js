import { STATUS_WARN_MS, STATUS_OFFLINE_MS, PLAYER_MIN_VERSION } from './constants.js';

/** Compara versões semânticas simples ("1.2.10" > "1.2.9"). */
export function compareVersions(a = '0', b = '0') {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Situação de uma tela, na ordem de gravidade.
 * - idle: cadastrada mas nunca deu sinal.
 * - offline: mais de 60 min sem contato.
 * - warn: mais de 15 min sem contato, ou app abaixo da versão mínima.
 * - sync: online e baixando mídias.
 * - online.
 * @returns {{ key: 'idle'|'offline'|'warn'|'sync'|'online', reason: string }}
 */
export function screenStatus(screen, now = Date.now(), minVersion = PLAYER_MIN_VERSION) {
  const last = screen?.lastSeen;
  if (!last) return { key: 'idle', reason: 'Aguardando o primeiro contato' };
  const age = now - last;
  if (age > STATUS_OFFLINE_MS) return { key: 'offline', reason: 'Sem contato há mais de 60 min' };
  if (age > STATUS_WARN_MS) return { key: 'warn', reason: 'Sem contato há mais de 15 min' };
  if (screen.syncState?.status === 'syncing') {
    const { done = 0, total = 0 } = screen.syncState;
    return { key: 'sync', reason: total ? `Baixando mídias (${done}/${total})` : 'Baixando mídias' };
  }
  if (screen.appVersion && compareVersions(screen.appVersion, minVersion) < 0) {
    return { key: 'warn', reason: `App desatualizado (v${screen.appVersion})` };
  }
  return { key: 'online', reason: 'Conexão saudável' };
}

export const STATUS_LABEL = {
  online: 'Online',
  warn: 'Atenção',
  offline: 'Offline',
  sync: 'Sincronizando',
  idle: 'Aguardando',
};

/** Contagem por situação, para o card de saúde da rede. */
export function networkSummary(screens = [], now = Date.now()) {
  const out = { total: screens.length, online: 0, warn: 0, offline: 0, sync: 0, idle: 0 };
  for (const s of screens) out[screenStatus(s, now).key]++;
  // Sincronizando também é uma conexão saudável.
  out.healthy = out.online + out.sync;
  out.healthyPct = out.total ? Math.round((out.healthy / out.total) * 100) : 0;
  return out;
}
