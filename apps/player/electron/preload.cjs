// Ponte mínima entre o player (página) e o Windows.
const { contextBridge, ipcRenderer } = require('electron');

function readArg(name) {
  try {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    // atob devolve bytes em latin1: decodifica como UTF-8 para manter acentos.
    if (arg) return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(arg.slice(name.length + 3)), (c) => c.charCodeAt(0))));
  } catch { /* segue sem */ }
  return {};
}
const info = readArg('vx-info');
const config = readArg('vx-config');

contextBridge.exposeInMainWorld('vxDesktop', {
  info,
  config,
  media: {
    has: (name, sizeBytes) => ipcRenderer.invoke('vx:media:has', name, sizeBytes),
    download: (name, url) => ipcRenderer.invoke('vx:media:download', name, url),
    prune: (keepIds) => ipcRenderer.invoke('vx:media:prune', keepIds),
  },
  /** Menu do operador: reload | restart | quit | minimize | window | fullscreen | monitor. */
  app: (acao) => ipcRenderer.invoke('vx:app', acao),
  janela: () => ipcRenderer.invoke('vx:janela'),
  onJanela: (cb) => {
    const f = (_e, s) => cb(s);
    ipcRenderer.on('vx:janela', f);
    return () => ipcRenderer.removeListener('vx:janela', f);
  },
  /** Abre uma tela de configurações do Windows (lista fechada no processo principal). */
  settings: (chave) => ipcRenderer.invoke('vx:settings', chave),
  storage: () => ipcRenderer.invoke('vx:storage'),
  screenshot: () => ipcRenderer.invoke('vx:screenshot'),
  update: {
    check: () => ipcRenderer.invoke('vx:update:check'),
    state: () => ipcRenderer.invoke('vx:update:state'),
    onState: (cb) => {
      const f = (_e, s) => cb(s);
      ipcRenderer.on('vx:update', f);
      return () => ipcRenderer.removeListener('vx:update', f);
    },
  },
});
