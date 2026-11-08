// Atualização automática do Vértice Player no Windows.
//
// Lê o manifesto publicado pelo GitHub Actions (player-update.json), baixa o instalador novo,
// confere o SHA-512 e instala em silêncio (/S). O instalador fecha o player, atualiza e abre de
// novo sozinho (--force-run): a TV fica uns 15 segundos sem conteúdo e volta na versão nova.
// Não depende de pacotes de node_modules (o .exe só leva dist/ e electron/).
const { app, net } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PRIMEIRA_CHECAGEM_MS = 2 * 60 * 1000;
const INTERVALO_MS = 60 * 60 * 1000;

/** "0.3.1" > "0.3.0"? Igual ao compareVersions do @vertice/shared. */
function compareVersions(a = '0', b = '0') {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Nome de arquivo seguro para o instalador baixado. */
function nomeDoInstalador(url, version) {
  const base = decodeURIComponent(String(url).split('?')[0].split('/').pop() || '');
  return /^[A-Za-z0-9._-]{1,120}\.exe$/.test(base) ? base : `Vertice-Player-Setup-${version}.exe`;
}

/** Espera depois de falhas seguidas: 5, 10, 20, 40 e no máximo 60 minutos. */
const esperaDepoisDeFalhar = (n) => Math.min(60, 5 * 2 ** (n - 1)) * 60 * 1000;

/**
 * @param {{ url: string, urls?: string[], onState: (s: object) => void, beforeInstall?: () => Promise<void> | void }} opts
 *   urls: espelhos do manifesto (ramo "updates" no raw.githubusercontent e no jsDelivr).
 */
function createUpdater({ url, urls = [], onState, beforeInstall }) {
  const enderecos = [...new Set([url, ...urls].filter(Boolean))];
  let falhas = 0;
  let retentar = null;
  let state = { status: 'idle', current: app.getVersion(), available: null, lastCheck: null, error: null };
  let running = null;
  let timer = null;
  const set = (patch) => {
    state = { ...state, ...patch };
    try { onState?.(state); } catch { /* janela fechando */ }
  };
  const dir = () => path.join(app.getPath('userData'), 'atualizacoes');

  /** Lê o manifesto em todos os endereços e fica com o de versão mais nova. */
  async function lerManifesto() {
    const ler = async (u) => {
      const res = await net.fetch(`${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${u} respondeu ${res.status}`);
      return res.json();
    };
    const r = await Promise.allSettled(enderecos.map(ler));
    const ok = r.filter((x) => x.status === 'fulfilled' && typeof x.value?.version === 'string').map((x) => x.value);
    if (!ok.length) throw new Error(`Nenhum servidor de atualização respondeu (${enderecos.length} tentados).`);
    return ok.reduce((a, b) => (compareVersions(b.version, a.version) > 0 ? b : a));
  }

  /** Baixa do endereço principal; se falhar, dos espelhos (quando houver). */
  async function baixar(info) {
    const lista = [...new Set([info.url, ...(Array.isArray(info.mirrors) ? info.mirrors : [])].filter((u) => /^https?:\/\//.test(u)))];
    let erro = null;
    for (const u of lista) {
      try {
        return await baixarDe({ ...info, url: u });
      } catch (e) {
        erro = e;
        console.warn('[vx] atualização: falhou em', u, e.message || e);
      }
    }
    throw erro || new Error('Sem endereço para baixar.');
  }

  async function baixarDe(info) {
    await fsp.mkdir(dir(), { recursive: true });
    const final = path.join(dir(), nomeDoInstalador(info.url, info.version));
    const part = `${final}.part`;
    const res = await net.fetch(info.url, { cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error(`Download respondeu ${res.status}`);
    const hash = crypto.createHash('sha512');
    const total = Number(res.headers.get('content-length')) || info.size || 0;
    let recebido = 0;
    let ultimo = 0;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part);
      const reader = res.body.getReader();
      const bombear = async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            hash.update(value);
            recebido += value.length;
            if (!out.write(value)) await new Promise((r) => out.once('drain', r));
            if (total && Date.now() - ultimo > 1000) {
              ultimo = Date.now();
              set({ progress: Math.round((recebido / total) * 100) });
            }
          }
          out.end(resolve);
        } catch (e) {
          out.destroy();
          reject(e);
        }
      };
      out.on('error', reject);
      bombear();
    });
    const sha512 = hash.digest('base64');
    if (info.sha512 && sha512 !== info.sha512) {
      await fsp.rm(part, { force: true });
      throw new Error('O arquivo baixado não confere (SHA-512). Tento de novo mais tarde.');
    }
    await fsp.rename(part, final);
    return final;
  }

  async function instalar(arquivo) {
    set({ status: 'installing' });
    try { await beforeInstall?.(); } catch { /* segue */ }
    // /S = silencioso; --updated = atualização; --force-run = abre o player de novo no fim.
    const filho = spawn(arquivo, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' });
    filho.unref();
    setTimeout(() => app.quit(), 500);
  }

  /** Procura versão nova e, se houver, baixa e instala. `force` ignora o intervalo. */
  function check() {
    if (running) return running;
    running = (async () => {
      if (!app.isPackaged) {
        set({ status: 'dev', error: null, lastCheck: Date.now() });
        return state;
      }
      set({ status: 'checking', error: null });
      try {
        const m = await lerManifesto();
        const win = m.windows;
        const versao = win?.version || m.version;
        if (!win?.url || compareVersions(versao, app.getVersion()) <= 0) {
          falhas = 0;
          set({ status: 'uptodate', available: null, lastCheck: Date.now() });
          return state;
        }
        set({ status: 'downloading', available: versao, progress: 0, lastCheck: Date.now() });
        const arquivo = await baixar({ ...win, version: versao });
        falhas = 0;
        await instalar(arquivo);
      } catch (e) {
        console.error('[vx] atualização:', e.message || e);
        falhas += 1;
        set({ status: 'error', error: String(e.message || e), lastCheck: Date.now(), retryAt: Date.now() + esperaDepoisDeFalhar(falhas) });
        // Não espera a próxima hora: tenta de novo em 5, 10, 20… minutos.
        clearTimeout(retentar);
        retentar = setTimeout(check, esperaDepoisDeFalhar(falhas));
        retentar.unref?.(); // não segura o processo (testes); no Electron o app segue aberto
      }
      return state;
    })().finally(() => { running = null; });
    return running;
  }

  function start() {
    // Limpa instaladores antigos.
    fsp.rm(dir(), { recursive: true, force: true }).catch(() => {});
    setTimeout(check, PRIMEIRA_CHECAGEM_MS);
    timer = setInterval(check, INTERVALO_MS);
  }

  return { start, check, getState: () => state, stop: () => clearInterval(timer) };
}

module.exports = { createUpdater, compareVersions, nomeDoInstalador };
