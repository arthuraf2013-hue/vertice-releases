// Versões e atualização automática do player.
// O GitHub Actions publica um manifesto (player-update.json) em cada versão; cada TV lê esse
// manifesto e decide sozinha o que baixar. Funções puras: usadas pelo player e testadas aqui.
import { compareVersions } from './status.js';

/** "0.3.1" → 301. Também é o versionCode do APK (sempre crescente). */
export function versionCode(version) {
  const [a = 0, b = 0, c = 0] = String(version || '0').split('.').map((n) => parseInt(n, 10) || 0);
  return a * 10000 + b * 100 + c;
}

/**
 * O que esta TV deve atualizar.
 * @param {object} manifest  player-update.json
 * @param {{shell:'android'|'electron'|'web', version:string, nativeVersion?:string, badWeb?:string[]}} atual
 *   version = versão do conteúdo (web) que está rodando; nativeVersion = versão do APK instalado.
 * @returns {{web?:object, apk?:object, windows?:object, reload?:boolean}}
 */
export function planUpdate(manifest, { shell, version, nativeVersion, badWeb = [] }) {
  if (!manifest || !manifest.version) return {};
  const plan = {};
  if (shell === 'electron') {
    if (manifest.windows?.url && compareVersions(manifest.version, version) > 0) plan.windows = manifest.windows;
    return plan;
  }
  if (shell === 'android') {
    const nativeCode = versionCode(nativeVersion || version);
    const apk = manifest.android;
    const web = manifest.web;
    // O APK só é reinstalado quando a parte nativa mudou (o conteúdo novo exige um APK mais novo).
    // Nas outras versões basta o conteúdo, que entra em silêncio, sem pedir "Instalar".
    const precisaApk = !web?.url || nativeCode < Number(web.minNativeCode || 0);
    if (apk?.url && Number(apk.versionCode) > nativeCode && precisaApk) plan.apk = apk;
    // Conteúdo novo só vai por cima de um APK que já tem tudo o que ele usa (minNativeCode).
    if (web?.url && compareVersions(web.version, version) > 0 && nativeCode >= Number(web.minNativeCode || 0)
      && !badWeb.includes(web.version)) {
      plan.web = web;
    }
    return plan;
  }
  // Player web (Chromium em quiosque): basta recarregar a página publicada.
  if (compareVersions(manifest.version, version) > 0) plan.reload = true;
  return plan;
}

/* ---------------- Redundância da atualização ---------------- */

/**
 * Entre os manifestos que responderam (GitHub Releases e os espelhos), fica o de versão mais
 * nova: um espelho atrasado nunca faz a TV voltar de versão, e um servidor fora do ar não trava.
 */
export function newestManifest(list = []) {
  return list
    .filter((m) => m && typeof m === 'object' && typeof m.version === 'string')
    .reduce((best, m) => (!best || compareVersions(m.version, best.version) > 0 ? m : best), null);
}

/** Endereços para baixar um arquivo do manifesto: o principal e depois os espelhos, sem repetir. */
export function downloadUrls(asset) {
  if (!asset?.url) return [];
  return [...new Set([asset.url, ...(Array.isArray(asset.mirrors) ? asset.mirrors : [])].filter((u) => /^https?:\/\//.test(u)))];
}

/** Espera até tentar de novo depois de falhas seguidas: 5, 10, 20, 40 e no máximo 60 minutos. */
export function retryDelayMs(failures) {
  if (!failures) return 0;
  return Math.min(60, 5 * 2 ** (failures - 1)) * 60_000;
}
