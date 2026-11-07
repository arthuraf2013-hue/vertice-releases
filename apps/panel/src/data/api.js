// Ponto único de acesso a dados. O resto do app não sabe se é Firebase ou demonstração.
import { createFirebaseBackend } from './firebase.js';
import { createDemoBackend } from './demo.js';

const env = import.meta.env;
// No painel Windows, vertice.config.json (lido pelo Electron) tem prioridade sobre o .env do build.
const desktop = (typeof window !== 'undefined' && window.vxDesktop?.config) || {};
const rt = desktop.firebase || {};
const config = {
  apiKey: rt.apiKey || env.VITE_FIREBASE_API_KEY,
  authDomain: rt.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: rt.projectId || env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: rt.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: rt.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: rt.appId || env.VITE_FIREBASE_APP_ID,
};
const mediaServerUrl = desktop.mediaServerUrl || env.VITE_MEDIA_SERVER_URL;
/** Onde editar a configuração no Windows (mostrado no aviso do modo demonstração). */
export const desktopConfigFile = desktop._file || null;

export const isDemo = env.MODE === 'demo' || env.VITE_DEMO === '1' || !config.apiKey;

export const api = isDemo ? createDemoBackend() : createFirebaseBackend(config, { emulator: env.VITE_FIREBASE_EMULATOR === '1', mediaServerUrl });

/** Links de download do player (configuráveis por ambiente). */
// O player (APK e Windows) é publicado pelo GitHub Actions; "latest" sempre aponta para a versão nova.
const RELEASES = 'https://github.com/arthuraf2013-hue/vertice-releases/releases/latest/download';
export const downloads = {
  android: env.VITE_DOWNLOAD_ANDROID || `${RELEASES}/Vertice-Player.apk`,
  playerWindows: env.VITE_DOWNLOAD_PLAYER_WINDOWS || `${RELEASES}/Vertice-Player-Setup.exe`,
  web: env.VITE_PLAYER_WEB_URL || 'https://vertice.vettasistemas.com.br/tv/',
  windows: env.VITE_DOWNLOAD_WINDOWS || 'https://vertice.vettasistemas.com.br/downloads/vertice-painel-setup.exe',
};

/** WhatsApp comercial da Vetta (só números, com DDI). */
export const supportWhatsApp = env.VITE_SUPPORT_WHATSAPP || '';
