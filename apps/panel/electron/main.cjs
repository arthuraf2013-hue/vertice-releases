// Vértice — painel desktop (Electron). Carrega o mesmo build do painel web.
// Serve o build por um protocolo próprio (app://vertice) em vez de file://,
// para o Firebase (Auth, Firestore, Storage) ver uma origem segura e estável.
//
// Atualização: o mesmo atualizador do player (updater.cjs, chave "painel" do player-update.json).
// Confere ao abrir e a cada hora e baixa sozinho, mas não fecha o painel no meio do trabalho:
// o botão no rodapé do menu ("Procurar atualização" / "Reiniciar e atualizar") instala na hora,
// e se a pessoa só fechar o painel a versão nova entra em silêncio.
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadDesktopConfig, configArg } = require('./desktop-config.cjs');
const pkg = require('../package.json');

// No instalador o updater.cjs vem copiado para cá; rodando do código-fonte, do player.
const { createUpdater } = require(fs.existsSync(path.join(__dirname, 'updater.cjs')) ? './updater.cjs' : '../../player/electron/updater.cjs');

let config = {};
let updater = null;

const DEV_URL = process.env.VERTICE_DEV_URL;
const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f4f6f9',
    title: 'Vértice',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [configArg(config), `--vx-version=${app.getVersion()}`],
    },
  });
  // Links externos (WhatsApp, downloads) abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL(DEV_URL || 'app://vertice/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    // Nunca servir nada fora da pasta do build.
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  config = loadDesktopConfig(app);
  createWindow();

  updater = createUpdater({
    url: config.updateUrl || pkg.vertice?.updateUrl,
    urls: config.updateUrl ? [] : pkg.vertice?.updateMirrors || [],
    chave: 'painel',
    nome: 'Vertice-Painel-Setup',
    autoInstall: false,
    primeiraChecagemMs: 15_000,
    onState: (s) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('vx:update', s);
    },
  });
  updater.start();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

ipcMain.handle('vx:update:check', () => updater?.check());
ipcMain.handle('vx:update:state', () => updater?.getState() || null);
ipcMain.handle('vx:update:install', () => updater?.install());

// Versão nova baixada e a pessoa fechou o painel: instala em silêncio (abre já atualizado da próxima vez).
app.on('will-quit', () => updater?.instalarAoSair());

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
