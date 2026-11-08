// O "aparelho" por trás do player: Android (plugin VerticeHost), Windows (Electron) ou navegador.
// O menu do operador, o diagnóstico e a atualização automática só falam com este módulo.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { desktop, isNative } from './platform.js';

const Native = isNative ? registerPlugin('VerticeHost') : null;

/** android | electron | web */
export const shell = desktop ? 'electron' : isNative ? 'android' : 'web';

/** Atalhos de configuração do sistema mostrados no menu (chave → rótulo). */
export const SYSTEM_SETTINGS = shell === 'android'
  ? [
    ['wifi', 'Wi-Fi e rede'],
    ['tela', 'Tela e resolução'],
    ['som', 'Som'],
    ['data', 'Data e hora'],
    ['sobrepor', 'Permitir abrir sozinho ao ligar'],
    ['instalar', 'Permitir instalar atualizações'],
    ['inicial', 'Tela inicial padrão'],
    ['app', 'Permissões do Vértice Player'],
    ['geral', 'Todas as configurações'],
  ]
  : shell === 'electron'
    ? [
      ['wifi', 'Wi-Fi'],
      ['rede', 'Rede e internet'],
      ['tela', 'Tela e resolução'],
      ['som', 'Som'],
      ['energia', 'Energia e suspensão'],
      ['data', 'Data e hora'],
      ['geral', 'Configurações do Windows'],
    ]
    : [];

/** Ações do player disponíveis neste aparelho (o menu só mostra o que funciona aqui). */
export const can = {
  restart: shell !== 'web',
  quit: shell !== 'web',
  minimize: shell === 'electron',
  window: shell === 'electron',
  otherLauncher: shell === 'android',
  screenshot: shell !== 'web',
};

export const host = {
  reload() {
    if (shell === 'electron') return desktop.app('reload');
    location.reload();
    return Promise.resolve(true);
  },
  restart() {
    if (shell === 'electron') return desktop.app('restart');
    if (shell === 'android') return Native.restart();
    location.reload();
    return Promise.resolve(true);
  },
  quit() {
    if (shell === 'electron') return desktop.app('quit');
    if (shell === 'android') return Native.exit();
    return Promise.resolve(false);
  },
  minimize: () => (shell === 'electron' ? desktop.app('minimize') : Promise.resolve(false)),
  setFullscreen: (on) => (shell === 'electron' ? desktop.app(on ? 'fullscreen' : 'window') : Promise.resolve(false)),
  /** Electron: leva o player para o próximo monitor. */
  nextMonitor: () => (shell === 'electron' ? desktop.app('monitor') : Promise.resolve(false)),
  /** Electron: { fullscreen, monitores } e avisos quando muda. */
  windowState: () => (shell === 'electron' ? desktop.janela() : Promise.resolve({ fullscreen: true, monitores: 1 })),
  onWindowState: (cb) => (shell === 'electron' && desktop.onJanela ? desktop.onJanela(cb) : () => {}),
  otherLauncher: () => (shell === 'android' ? Native.otherLauncher() : Promise.resolve(false)),
  openSettings(chave) {
    if (shell === 'electron') return desktop.settings(chave);
    if (shell === 'android') return Native.openSettings({ screen: chave });
    return Promise.resolve(false);
  },

  /** { freeBytes, totalBytes, mediaBytes, mediaFiles } (o que o aparelho souber informar). */
  async storage() {
    try {
      if (shell === 'electron') return await desktop.storage();
      if (shell === 'android') return await Native.storage();
      const e = await navigator.storage?.estimate?.();
      return e ? { freeBytes: e.quota - e.usage, totalBytes: e.quota, mediaBytes: e.usage } : {};
    } catch {
      return {};
    }
  },

  /** Foto da tela como data URL JPEG (null onde não dá). */
  async screenshot() {
    if (shell === 'electron') return desktop.screenshot();
    if (shell === 'android') return (await Native.screenshot()).image;
    return null;
  },

  /** Informações do app nativo (Android): versão do APK, pode instalar, conteúdo aplicado. */
  async nativeInfo() {
    if (shell !== 'android') return null;
    try {
      return await Native.getInfo();
    } catch {
      return null;
    }
  },

  /** GET de texto sem CORS no Android (o GitHub não libera CORS para downloads). */
  async fetchText(url) {
    if (shell === 'android') {
      const r = await Native.fetchText({ url });
      return r.text;
    }
    if (shell === 'electron' && desktop.fetchText) return desktop.fetchText(url);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  native: Native,
  isNativePlatform: () => Capacitor.isNativePlatform(),
};
