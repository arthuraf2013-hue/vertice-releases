import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from 'firebase/firestore';

const env = import.meta.env;
// No Windows, vertice.config.json (lido pelo Electron) tem prioridade sobre o .env do build.
const runtime = (typeof window !== 'undefined' && window.vxDesktop?.config?.firebase) || {};
export const firebaseConfig = {
  apiKey: runtime.apiKey || env.VITE_FIREBASE_API_KEY,
  authDomain: runtime.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: runtime.projectId || env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: runtime.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: runtime.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: runtime.appId || env.VITE_FIREBASE_APP_ID,
};
export const hasFirebase = !!firebaseConfig.apiKey;

let _app, _auth, _db;
export function fb() {
  if (!_app) {
    _app = initializeApp(firebaseConfig);
    // A identidade anônima da TV precisa sobreviver a reinícios: é ela que fica pareada.
    _auth = initializeAuth(_app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    // Cache local: a TV abre com a última programação mesmo sem internet.
    _db = initializeFirestore(_app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
    if (env.VITE_FIREBASE_EMULATOR === '1') {
      connectAuthEmulator(_auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(_db, '127.0.0.1', 8080);
    }
  }
  return { app: _app, auth: _auth, db: _db };
}

/** Garante um usuário anônimo e devolve o uid (o mesmo a cada boot). */
export function ensureDeviceUser() {
  const { auth } = fb();
  return new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (u) {
        off();
        resolve(u.uid);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (e) {
        off();
        reject(e);
      }
    });
  });
}
