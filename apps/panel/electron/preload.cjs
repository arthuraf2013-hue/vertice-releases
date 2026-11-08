// Repassa ao painel a configuração do vertice.config.json (projeto Firebase e servidor de mídias)
// e o atualizador do painel instalado no Windows.
const { contextBridge, ipcRenderer } = require('electron');

let config = {};
try {
  const arg = process.argv.find((a) => a.startsWith('--vx-config='));
  if (arg) config = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(arg.slice(12)), (c) => c.charCodeAt(0))));
} catch { /* segue com o .env do build */ }

const version = (process.argv.find((a) => a.startsWith('--vx-version=')) || '').slice(13);

contextBridge.exposeInMainWorld('vxDesktop', {
  config,
  version,
  update: {
    check: () => ipcRenderer.invoke('vx:update:check'),
    state: () => ipcRenderer.invoke('vx:update:state'),
    install: () => ipcRenderer.invoke('vx:update:install'),
    onState: (cb) => {
      const f = (_e, s) => cb(s);
      ipcRenderer.on('vx:update', f);
      return () => ipcRenderer.removeListener('vx:update', f);
    },
  },
});
