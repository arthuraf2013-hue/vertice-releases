import { createRoot } from 'react-dom/client';
import '@vertice/shared/styles/fonts.css';
import '@vertice/shared/styles/tokens.css';
import '@vertice/shared/apps.css';
import './styles.css';
import { App } from './App.jsx';
import { captureErrors } from './services/diagnostics.js';

// Guarda os últimos avisos para o diagnóstico (menu do operador e painel).
captureErrors();

// Sem StrictMode de propósito: em desenvolvimento ele monta duas vezes e criaria dois pareamentos.
createRoot(document.getElementById('root')).render(<App />);

// Player travado é pior que player reiniciado: recarrega se algo quebrar de vez.
window.addEventListener('error', (e) => {
  console.error('[vx] erro fatal', e.error || e.message);
  setTimeout(() => location.reload(), 15_000);
});
