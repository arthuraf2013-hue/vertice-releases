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
// Janela: sem moldura do Windows. Em tela cheia ela tem o tamanho exato do monitor; passando o
// mouse no topo aparece uma barra para arrastar o player até outro monitor (ao soltar, ele
// preenche o monitor onde o mouse estava). Reabre no mesmo monitor da última vez, e se aquele
// monitor estiver desligado abre no principal e volta para ele quando ligar (electron/janela.cjs).
//
// Parâmetros: --janela abre em janela (bom para testar no seu PC).
// Configuração: vertice.config.json (ao lado do .exe ou em %APPDATA%\\Vértice Player).
const { app, BrowserWindow, protocol, net, powerSaveBlocker, ipcMain, session, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const { loadDesktopConfig, configArg } = require('./desktop-config.cjs');
const { createUpdater } = require('./updater.cjs');
const { escolherPosicao, monitorDoEncaixe, monitorSalvo, mesmasMedidas, centralizar, lerEstado, lembrarJanela, PADRAO } = require('./janela.cjs');
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
let salvarJanela = () => {};
/** Tela cheia (sem moldura, do tamanho do monitor) ou janela comum. */
let telaCheia = true;
/** Monitor escolhido pela pessoa: { id, bounds }. Continua salvo se ele for desligado. */
let preferido = null;

const ARQUIVO_JANELA = () => path.join(app.getPath('userData'), 'janela.json');
const monitores = () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }));

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
  const salvo = lerEstado(ARQUIVO_JANELA());
  const pos = escolherPosicao(salvo, monitores(), screen.getPrimaryDisplay());
  telaCheia = pos.fullscreen && !WINDOWED;
  preferido = salvo?.displayBounds ? { id: salvo.displayId, bounds: salvo.displayBounds } : null;
  const inicio = telaCheia || !WINDOWED ? pos : { ...pos, ...centralizar(PADRAO, screen.getPrimaryDisplay().workArea) };
  win = new BrowserWindow({
    x: inicio.x,
    y: inicio.y,
    width: inicio.width,
    height: inicio.height,
    // Sem a moldura do Windows: a barra do topo (no player) faz o papel dela e some sozinha.
    frame: false,
    resizable: !telaCheia,
    maximizable: !telaCheia,
    fullscreenable: false,
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
  if (pos.maximized && !telaCheia) win.maximize();
  if (telaCheia) win.setAlwaysOnTop(true, 'screen-saver'); // por cima da barra de tarefas
  win.once('ready-to-show', () => {
    if (telaCheia) preencher(monitorAtual()); // DPI diferente entre monitores: confirma o tamanho
    win.show();
  });
  salvarJanela = lembrarJanela(win, screen, ARQUIVO_JANELA(), {
    telaCheia: () => telaCheia,
    preferido: () => (telaCheia ? preferido : null),
  });

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
    else if (k === 'j') setTelaCheia(!telaCheia);
    else return;
    e.preventDefault();
  });
  // A pessoa soltou a janela depois de arrastar (ou o Windows encaixou ela num canto):
  // em tela cheia, ela preenche o monitor onde o mouse estava.
  win.on('moved', () => soltou());
  win.on('resized', () => soltou());
  win.on('maximize', () => telaCheia && soltou());
  win.on('restore', () => {
    if (telaCheia) preencher(monitorAtual());
    avisarJanela();
  });

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

const monitorAtual = () => screen.getDisplayMatching(win.getBounds());

/** Ocupa o monitor inteiro (duas vezes: entre monitores com escala diferente a primeira erra). */
function preencher(monitor) {
  if (!win || win.isDestroyed() || !monitor) return;
  if (win.isMaximized()) win.unmaximize();
  win.setBounds(monitor.bounds);
  setTimeout(() => {
    if (win && !win.isDestroyed() && telaCheia && !mesmasMedidas(win.getBounds(), monitor.bounds)) win.setBounds(monitor.bounds);
  }, 120);
}

/** Fim de um arraste: decide o monitor e guarda a escolha. */
function soltou() {
  if (!win || win.isDestroyed()) return;
  if (!telaCheia) {
    const m = monitorAtual();
    preferido = { id: m.id, bounds: m.bounds };
    salvarJanela();
    return;
  }
  const alvo = monitorDoEncaixe(monitores(), screen.getCursorScreenPoint(), win.getBounds(), screen.getPrimaryDisplay());
  preferido = { id: alvo.id, bounds: alvo.bounds };
  preencher(alvo);
  setTimeout(salvarJanela, 300);
}

/** Monitor ligado, desligado ou com outra resolução. */
function monitoresMudaram(_e, mudou) {
  if (!win || win.isDestroyed()) return;
  if (telaCheia) {
    // Voltou o monitor que a pessoa escolheu (a TV ligou depois do PC): vai para ele.
    const lista = monitores();
    const salvo = preferido && monitorSalvo({ displayId: preferido.id, displayBounds: preferido.bounds }, lista);
    const alvo = salvo || monitorDoEncaixe(lista, null, win.getBounds(), screen.getPrimaryDisplay());
    if (salvo && mudou?.id === salvo.id) preferido = { id: salvo.id, bounds: salvo.bounds };
    if (!mesmasMedidas(win.getBounds(), alvo.bounds)) preencher(alvo);
  }
  avisarJanela();
}

function setTelaCheia(cheia) {
  if (!win || win.isDestroyed()) return;
  const monitor = monitorAtual();
  telaCheia = cheia;
  win.setResizable(!cheia);
  win.setMaximizable(!cheia);
  if (cheia) {
    preferido = { id: monitor.id, bounds: monitor.bounds };
    preencher(monitor);
    win.setAlwaysOnTop(true, 'screen-saver');
  } else {
    win.setAlwaysOnTop(false);
    win.setBounds(centralizar(PADRAO, monitor.workArea));
  }
  avisarJanela();
  setTimeout(salvarJanela, 300);
}

function estadoJanela() {
  if (!win || win.isDestroyed()) return { fullscreen: true, monitores: 1 };
  return { fullscreen: telaCheia, monitores: screen.getAllDisplays().length };
}

function avisarJanela() {
  if (win && !win.isDestroyed()) win.webContents.send('vx:janela', estadoJanela());
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
    salvarJanela(); // app.exit não passa pelo evento de fechar
    app.relaunch();
    app.exit(0);
  } else if (acao === 'quit') app.quit();
  else if (acao === 'minimize') win.minimize();
  else if (acao === 'window') setTelaCheia(false);
  else if (acao === 'fullscreen') setTelaCheia(true);
  else return false;
  return true;
});

ipcMain.handle('vx:janela', () => estadoJanela());

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

/** Texto de um endereço http(s) sem CORS (aplicativo Notícias). Até 2 MB, 15 s. */
ipcMain.handle('vx:fetch-text', async (_e, url) => {
  const u = new URL(String(url));
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('endereço inválido');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await net.fetch(u.toString(), { signal: ctl.signal, headers: { 'user-agent': 'VerticePlayer' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) throw new Error('resposta grande demais');
    return buf.toString('utf8');
  } finally {
    clearTimeout(t);
  }
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
  // Ligou/desligou um monitor ou mudou a resolução: o player continua ocupando o monitor certo.
  screen.on('display-added', monitoresMudaram);
  screen.on('display-removed', monitoresMudaram);
  screen.on('display-metrics-changed', monitoresMudaram);

  updater = createUpdater({
    url: config.updateUrl || pkg.vertice?.updateUrl,
    urls: config.updateUrl ? [] : pkg.vertice?.updateMirrors || [],
    onState: (s) => win && !win.isDestroyed() && win.webContents.send('vx:update', s),
  });
  updater.start();
});

app.on('window-all-closed', () => app.quit());
