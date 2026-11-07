// Vértice Player para Windows (Electron).
// Roda o mesmo build do APK em tela cheia, como um aparelho dedicado:
// - abre sozinho quando o Windows liga e não deixa o monitor apagar;
// - esconde o cursor e bloqueia navegação para fora do player;
// - guarda as mídias em disco (%APPDATA%\Vértice Player\media), não na memória;
// - se a página travar ou cair, recarrega sozinho.
//
// Menu do operador: qualquer toque, movimento do mouse ou tecla mostra o botão "Menu" na tela
// (recarregar, reiniciar, sair da tela cheia, fechar, configurações do Windows, diagnóstico).
// Atalhos (teclado conectado ao PC da TV), para quem já conhece:
//   Ctrl+Shift+J  alterna tela cheia / janela (para testes)
//   Ctrl+Shift+R  recarrega o player
//   Ctrl+Shift+Q  fecha o player
//
// Atualização automática: ver electron/updater.cjs (instala em silêncio quando sai versão nova).
//
// Parâmetros: --janela abre em janela (bom para testar no seu PC).
// Configuração: vertice.config.json (ao lado do .exe ou em %APPDATA%\\Vértice Player).
const { app, BrowserWindow, protocol, net, powerSaveBlocker, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const { loadDesktopConfig, configArg } = require('./desktop-config.cjs');
const { createUpdater } = require('./updater.cjs');
const pkg = require('../package.json');

const DEV_URL = process.env.VERTICE_DEV_URL;
const DIST = path.join(__dirname, '..', 'dist');
const WINDOWED = process.argv.includes('--janela') || !!DEV_URL;

// Uma instância só: se abrirem de novo, foca a que já está rodando.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Vídeo com som começa sem clique; TV não tem ninguém para clicar.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Evita que o Chromium economize recursos quando a janela "parece" escondida.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'vxmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true } },
]);

const MEDIA_DIR = () => path.join(app.getPath('userData'), 'media');
const SAFE_NAME = /^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9]{1,8}$/;

let win = null;
let config = {};
let updater = null;

function deviceInfo() {
  return {
    platform: process.platform === 'win32' ? 'windows' : process.platform,
    model: os.hostname(),
    osVersion: `${os.type()} ${os.release()}`,
    appVersion: app.getVersion(),
    shell: 'electron',
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: !WINDOWED,
    kiosk: !WINDOWED,
    frame: WINDOWED,
    autoHideMenuBar: true,
    backgroundColor: '#0b1017',
    title: 'Vértice Player',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      additionalArguments: [`--vx-info=${Buffer.from(JSON.stringify(deviceInfo())).toString('base64')}`, configArg(config)],
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());

  // Nada de abrir janelas nem sair do player.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault();
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control || !input.shift) return;
    const k = input.key.toLowerCase();
    if (k === 'q') app.quit();
    else if (k === 'r') win.webContents.reloadIgnoringCache();
    else if (k === 'j') setTelaCheia(!win.isKiosk());
    else return;
    e.preventDefault();
  });
  win.on('enter-full-screen', avisarJanela);
  win.on('leave-full-screen', avisarJanela);
  win.on('restore', avisarJanela);

  // Recuperação: página caiu ou travou → recarrega.
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error('[vx] renderer caiu:', d.reason);
    setTimeout(() => win && !win.isDestroyed() && win.reload(), 3000);
  });
  let hang = null;
  win.on('unresponsive', () => {
    hang = setTimeout(() => win && !win.isDestroyed() && win.webContents.forcefullyCrashRenderer(), 30000);
  });
  win.on('responsive', () => clearTimeout(hang));

  win.loadURL(DEV_URL || 'app://vertice/index.html');
}

/* ---------- Menu do operador ---------- */

function setTelaCheia(cheia) {
  if (!win || win.isDestroyed()) return;
  win.setKiosk(cheia);
  win.setFullScreen(cheia);
  avisarJanela();
}

function avisarJanela() {
  if (win && !win.isDestroyed()) win.webContents.send('vx:janela', { fullscreen: win.isKiosk() || win.isFullScreen() });
}

// Só estes endereços do Windows podem ser abertos pelo menu (nada de URL vinda da página).
const CONFIG_WINDOWS = {
  geral: 'ms-settings:',
  tela: 'ms-settings:display',
  rede: 'ms-settings:network-status',
  wifi: 'ms-settings:network-wifi',
  som: 'ms-settings:sound',
  energia: 'ms-settings:powersleep',
  data: 'ms-settings:dateandtime',
  atualizacoes: 'ms-settings:windowsupdate',
};

ipcMain.handle('vx:app', (_e, acao) => {
  if (!win || win.isDestroyed()) return false;
  if (acao === 'reload') win.webContents.reloadIgnoringCache();
  else if (acao === 'restart') {
    app.relaunch();
    app.exit(0);
  } else if (acao === 'quit') app.quit();
  else if (acao === 'minimize') {
    // Em quiosque o Windows não minimiza: sai da tela cheia antes.
    setTelaCheia(false);
    win.minimize();
  } else if (acao === 'window') setTelaCheia(false);
  else if (acao === 'fullscreen') setTelaCheia(true);
  else return false;
  return true;
});

ipcMain.handle('vx:janela', () => ({ fullscreen: !!win && !win.isDestroyed() && (win.isKiosk() || win.isFullScreen()) }));

ipcMain.handle('vx:settings', async (_e, chave) => {
  const alvo = CONFIG_WINDOWS[chave];
  if (!alvo) return false;
  // As configurações abrem por cima: sai da tela cheia para a pessoa ver a janela.
  setTelaCheia(false);
  await shell.openExternal(alvo);
  return true;
});

async function tamanhoDaPasta(dir) {
  let bytes = 0;
  let arquivos = 0;
  try {
    for (const f of await fsp.readdir(dir)) {
      const st = await fsp.stat(path.join(dir, f)).catch(() => null);
      if (st?.isFile()) {
        bytes += st.size;
        arquivos++;
      }
    }
  } catch { /* pasta ainda não existe */ }
  return { bytes, arquivos };
}

ipcMain.handle('vx:storage', async () => {
  const pasta = app.getPath('userData');
  let livre = null;
  let total = null;
  try {
    const st = await fsp.statfs(pasta);
    livre = st.bavail * st.bsize;
    total = st.blocks * st.bsize;
  } catch { /* Windows antigo */ }
  const media = await tamanhoDaPasta(MEDIA_DIR());
  return { freeBytes: livre, totalBytes: total, mediaBytes: media.bytes, mediaFiles: media.arquivos };
});

/** Foto da tela para o painel (JPEG pequeno, cabe num documento do Firestore). */
ipcMain.handle('vx:screenshot', async () => {
  if (!win || win.isDestroyed()) return null;
  const img = await win.webContents.capturePage();
  const { width } = img.getSize();
  const menor = width > 960 ? img.resize({ width: 960, quality: 'good' }) : img;
  return `data:image/jpeg;base64,${menor.toJPEG(62).toString('base64')}`;
});

ipcMain.handle('vx:update:check', () => updater?.check());
ipcMain.handle('vx:update:state', () => updater?.getState() || null);

/* ---------- Cache de mídias em disco ---------- */

function mediaFile(name) {
  if (!SAFE_NAME.test(name)) throw new Error('nome inválido');
  return path.join(MEDIA_DIR(), name);
}

ipcMain.handle('vx:media:has', async (_e, name, sizeBytes) => {
  try {
    const st = await fsp.stat(mediaFile(name));
    if (sizeBytes && Math.abs(st.size - sizeBytes) > 1024) return null;
    return `vxmedia://local/${name}`;
  } catch {
    return null;
  }
});

ipcMain.handle('vx:media:download', async (_e, name, url) => {
  if (!/^https?:\/\//.test(url)) throw new Error('URL inválida');
  await fsp.mkdir(MEDIA_DIR(), { recursive: true });
  const final = mediaFile(name);
  const part = `${final}.part`;
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  // Grava como .part e só renomeia no fim: arquivo pela metade nunca toca.
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(part);
    Readable.fromWeb(res.body).on('error', reject).pipe(out).on('finish', resolve).on('error', reject);
  });
  await fsp.rename(part, final);
  return `vxmedia://local/${name}`;
});

ipcMain.handle('vx:media:prune', async (_e, keepIds) => {
  const keep = new Set(keepIds);
  let files = [];
  try {
    files = await fsp.readdir(MEDIA_DIR());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const f of files) {
    const id = f.split('.')[0];
    if (!keep.has(id) || f.endsWith('.part')) {
      await fsp.rm(path.join(MEDIA_DIR(), f), { force: true });
      removed++;
    }
  }
  return removed;
});

const MIME = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** Serve vxmedia://local/arquivo com suporte a Range (o vídeo pede pedaços). */
async function serveMedia(req) {
  const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
  let file;
  try {
    file = mediaFile(name);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  let st;
  try {
    st = await fsp.stat(file);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Length': String(st.size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
  });
}

/* ---------- Início ---------- */

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  protocol.handle('vxmedia', serveMedia);

  // O player não precisa de câmera, microfone, localização etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  // Monitor nunca apaga enquanto o player estiver aberto.
  powerSaveBlocker.start('prevent-display-sleep');

  // Abre junto com o Windows (só na versão instalada).
  if (app.isPackaged && process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: true, args: [] });
  }

  config = loadDesktopConfig(app);
  createWindow();

  updater = createUpdater({
    url: config.updateUrl || pkg.vertice?.updateUrl,
    onState: (s) => win && !win.isDestroyed() && win.webContents.send('vx:update', s),
  });
  updater.start();
});

app.on('window-all-closed', () => app.quit());
