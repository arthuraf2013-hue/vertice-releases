import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@vertice/shared/styles/fonts.css';
import '@vertice/shared/styles/tokens.css';
import '@vertice/shared/apps.css';
import './styles/app.css';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Painel instalável no celular (só na web com HTTPS; o painel Windows não precisa).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.vxDesktop) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
