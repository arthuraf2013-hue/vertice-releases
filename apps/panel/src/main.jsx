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
