// Simula o GerenciaAI usando o módulo real de integração.
import { createVerticeSync } from '../../integrations/gerenciaai/verticeSync.js';
const vx = createVerticeSync({
  firebaseConfig: { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-vertice', appId: '1:0:web:e2e' },
  terminal: 'Caixa 1', appVersion: '0.5.60', emulator: true,
});
vx.onState((s) => { document.getElementById('s').textContent = JSON.stringify(s); });
vx.start();
window.vx = vx;
