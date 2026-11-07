import { Capacitor } from '@capacitor/core';
import pkg from '../../package.json';

export const APP_VERSION = pkg.version;
export const isNative = Capacitor.isNativePlatform();
/** Player instalado no Windows (Electron): ponte exposta pelo preload. */
export const desktop = typeof window !== 'undefined' ? window.vxDesktop || null : null;

/** Mantém a tela acesa e coleta dados do aparelho para o painel. */
export async function initPlatform() {
  const info = { platform: isNative ? Capacitor.getPlatform() : 'web', model: null, appVersion: APP_VERSION };
  if (desktop) {
    // No Windows o Electron já impede o monitor de apagar.
    const d = desktop.info || {};
    return { ...info, platform: d.platform || 'windows', model: d.model || null, osVersion: d.osVersion, appVersion: d.appVersion || APP_VERSION };
  }
  if (!isNative) return info;
  try {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await KeepAwake.keepAwake();
  } catch (e) {
    console.warn('[vx] keep-awake indisponível', e);
  }
  try {
    const { Device } = await import('@capacitor/device');
    const d = await Device.getInfo();
    info.model = [d.manufacturer, d.model].filter(Boolean).join(' ');
    info.platform = d.isVirtual ? 'android-emulador' : /tv|box/i.test(d.model || '') ? 'android-tv' : d.platform;
    info.osVersion = d.osVersion;
  } catch { /* opcional */ }
  try {
    const { App } = await import('@capacitor/app');
    const a = await App.getInfo();
    // A versão que vale é a do conteúdo (ele se atualiza sem reinstalar o APK); a do APK vai à parte.
    info.appVersion = APP_VERSION;
    info.nativeVersion = a.version || null;
    // Botão "voltar" do controle não fecha o player.
    App.addListener('backButton', () => {});
  } catch { /* opcional */ }
  return info;
}

export function resolution() {
  const dpr = window.devicePixelRatio || 1;
  return `${Math.round(screen.width * dpr)}×${Math.round(screen.height * dpr)}`;
}

/** Estado da rede (nome do Wi-Fi não é exposto pelo Android sem permissão de localização). */
export async function watchNetwork(cb) {
  if (isNative) {
    try {
      const { Network } = await import('@capacitor/network');
      const s = await Network.getStatus();
      cb({ online: s.connected, type: s.connectionType });
      const h = await Network.addListener('networkStatusChange', (st) => cb({ online: st.connected, type: st.connectionType }));
      return () => h.remove();
    } catch { /* cai no navegador */ }
  }
  const emit = () => cb({ online: navigator.onLine, type: navigator.connection?.type || (navigator.onLine ? 'wifi' : 'none') });
  emit();
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  return () => {
    window.removeEventListener('online', emit);
    window.removeEventListener('offline', emit);
  };
}

/** Pequena persistência local (sobrevive a reinício, funciona offline). */
export const local = {
  get(k, fallback = null) {
    try {
      const v = localStorage.getItem(`vx:${k}`);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      if (v === null || v === undefined) localStorage.removeItem(`vx:${k}`);
      else localStorage.setItem(`vx:${k}`, JSON.stringify(v));
    } catch { /* cheio ou indisponível */ }
  },
};
