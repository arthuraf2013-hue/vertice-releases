// Atualização automática do player, vista do lado da página.
// - Windows: quem baixa e instala é o processo do Electron (electron/updater.cjs); aqui só mostramos.
// - Android: conteúdo novo (HTML/JS) entra em silêncio; APK novo instala sozinho quando o Android
//   deixa, senão espera um "Instalar" do operador (menu ou comando "Atualizar agora" do painel).
// - Navegador: recarrega quando a versão publicada muda.
import { planUpdate } from '@vertice/shared';
import pkg from '../../package.json';
import { host, shell } from './host.js';
import { APP_VERSION, desktop } from './platform.js';

const UPDATE_URL = pkg.vertice?.updateUrl || '';
const PRIMEIRA_MS = 90_000;
const INTERVALO_MS = 60 * 60_000;
const INTERVALO_WEB_MS = 30 * 60_000;
const CONFIRMA_MS = 25_000;

export function createUpdater() {
  let state = { status: 'idle', current: APP_VERSION, available: null, lastCheck: null, error: null, apk: null };
  const subs = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    subs.forEach((f) => f(state));
  };
  let running = null;

  async function checkAndroid(interactive) {
    const info = await host.nativeInfo();
    const manifest = JSON.parse(await host.fetchText(`${UPDATE_URL}?t=${Date.now()}`));
    const plan = planUpdate(manifest, {
      shell: 'android', version: APP_VERSION, nativeVersion: info?.versionName, badWeb: info?.badWeb || [],
    });
    const apk = plan.apk ? { available: plan.apk.version || manifest.version, status: info?.apkStatus || null } : null;
    if (plan.web) {
      set({ status: 'applying', available: plan.web.version, apk, lastCheck: Date.now() });
      // O player recarrega na versão nova logo em seguida.
      await host.native.applyWebBundle({ url: plan.web.url, sha256: plan.web.sha256, version: plan.web.version });
      return;
    }
    if (plan.apk) {
      set({ status: 'downloading', available: apk.available, apk, lastCheck: Date.now() });
      const r = await host.native.installApk({ url: plan.apk.url, sha256: plan.apk.sha256, interactive });
      const depois = await host.nativeInfo();
      const st = r?.status === 'needs-permission' ? 'needs-permission' : depois?.apkStatus || r?.status || 'installing';
      set({ status: st.startsWith('error') ? 'error' : st, error: st.startsWith('error') ? st.slice(7) : null, apk: { ...apk, status: st } });
      return;
    }
    set({ status: 'uptodate', available: null, apk: null, lastCheck: Date.now() });
  }

  async function checkWeb() {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const plan = planUpdate(await res.json(), { shell: 'web', version: APP_VERSION });
    if (plan.reload) {
      set({ status: 'applying', lastCheck: Date.now() });
      setTimeout(() => location.reload(), 1500);
    } else set({ status: 'uptodate', lastCheck: Date.now() });
  }

  /** Procura atualização agora. interactive = o operador pediu (pode abrir telas do Android). */
  function check({ interactive = false } = {}) {
    if (running) return running;
    running = (async () => {
      if (shell === 'electron') {
        await desktop.update.check();
        return state;
      }
      if (shell === 'android' && !UPDATE_URL) return set({ status: 'error', error: 'Endereço de atualização não configurado.' });
      set({ status: 'checking', error: null });
      try {
        if (shell === 'android') await checkAndroid(interactive);
        else await checkWeb();
      } catch (e) {
        set({ status: 'error', error: String(e?.message || e).slice(0, 160), lastCheck: Date.now() });
      }
      return state;
    })().finally(() => { running = null; });
    return running;
  }

  function start() {
    if (shell === 'electron') {
      desktop.update.state().then((s) => s && set(s)).catch(() => {});
      desktop.update.onState((s) => set(s));
      return;
    }
    if (shell === 'android') {
      // Esta versão abriu: confirma para o Android não voltar à anterior.
      setTimeout(() => host.native.markReady().catch(() => {}), CONFIRMA_MS);
      host.nativeInfo().then((i) => i?.apkStatus && set({ apk: { status: i.apkStatus } }));
    }
    // Em desenvolvimento (vite dev) não há version.json nem manifesto.
    if (import.meta.env.DEV) return set({ status: 'dev' });
    setTimeout(check, PRIMEIRA_MS);
    setInterval(check, shell === 'web' ? INTERVALO_WEB_MS : INTERVALO_MS);
  }

  return {
    start,
    check,
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      fn(state);
      return () => subs.delete(fn);
    },
  };
}

/** Texto curto do estado da atualização para o menu e o painel. */
export function updateLabel(s) {
  if (!s) return '';
  const versao = s.available ? ` ${s.available}` : '';
  switch (s.status) {
    case 'checking': return 'Procurando atualização…';
    case 'uptodate': return 'Versão mais recente';
    case 'downloading': return `Baixando a versão${versao}${s.progress ? ` (${s.progress}%)` : ''}…`;
    case 'applying': return `Aplicando a versão${versao}…`;
    case 'installing': return `Instalando a versão${versao}…`;
    case 'needs-permission': return 'Libere "Instalar atualizações" para atualizar o app';
    case 'needs-confirmation':
    case 'waiting-confirmation': return `Versão${versao} pronta: toque em "Atualizar agora" e confirme "Instalar"`;
    case 'installed': return 'Atualização instalada';
    case 'error': return `Não atualizou: ${s.error || 'erro desconhecido'}`;
    case 'dev': return 'Modo de desenvolvimento';
    default: return 'Atualização automática ligada';
  }
}
