// Simula o GerenciaAI usando o módulo real de integração.
// window.__conexaoSalva (injetada pelo teste) = cópia guardada pelo processo principal do
// GerenciaAI: a janela restaura antes de criar o módulo, igual ao verticeClient.js de lá.
import { createVerticeSync, precisaRestaurar, restaurarConexaoSalva } from '../../integrations/gerenciaai/verticeSync.js';

const firebaseConfig = { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-vertice', appId: '1:0:web:e2e' };

(async () => {
  const salva = window.__conexaoSalva || null;
  const local = JSON.parse(localStorage.getItem('vertice:device') || 'null');
  window.restaurou = precisaRestaurar(local, salva) ? await restaurarConexaoSalva({ firebaseConfig, salva }) : false;
  const vx = createVerticeSync({
    firebaseConfig, terminal: 'Caixa 1', appVersion: '0.5.60', emulator: true,
    onConexao: (c) => { window.conexao = c; },
  });
  vx.onState((s) => { document.getElementById('s').textContent = JSON.stringify(s); });
  vx.start();
  window.vx = vx;
})();
