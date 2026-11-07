// O "cérebro" do player: pareamento por código, manifesto, pedidos e sinal de vida.
import {
  doc, collection, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { generatePairingCode, PAIRING_KIND, PAIRING_TTL_MS, HEARTBEAT_MS } from '@vertice/shared';
import { fb, ensureDeviceUser } from './firebase.js';
import { initPlatform, resolution, watchNetwork, local } from './platform.js';
import { MediaCache } from './cache.js';

const toMs = (v) => {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(toMs);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = toMs(v[k]);
    return o;
  }
  return v;
};

export function createDevice(onChange) {
  const cache = new MediaCache();
  let state = {
    phase: 'boot', // boot | pairing | paired | error
    uid: null,
    code: null,
    codeExpiresAt: null,
    companyId: null,
    screenId: null,
    manifest: local.get('manifest'),
    orders: [],
    sync: { status: 'synced', done: 0, total: 0 },
    network: { online: navigator.onLine, type: 'wifi' },
    error: null,
    cacheVersion: 0,
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  let info = {};
  let nowPlaying = null;
  let pairingTimer = null;
  let offManifest = null;
  let offOrders = null;
  let ordersKey = null;
  let hbTimer = null;
  let lastSyncSent = null;
  let offCommand = null;
  const commandSubs = new Set();

  async function start() {
    info = await initPlatform();
    watchNetwork((network) => set({ network }));
    const saved = local.get('pairing');
    if (saved) {
      // Abre tocando, mesmo offline: último manifesto salvo + mídias já baixadas.
      set({ phase: 'paired', ...saved });
      if (state.manifest) runSync(state.manifest);
    }
    let uid;
    for (let attempt = 0; ; attempt++) {
      try {
        uid = await ensureDeviceUser();
        break;
      } catch (e) {
        // Primeiro boot sem internet: espera e tenta de novo.
        if (!saved) set({ phase: 'error', error: 'offline' });
        await new Promise((r) => setTimeout(r, Math.min(30_000, 3000 * (attempt + 1))));
      }
    }
    set({ uid });
    subscribeDevice();
  }

  /**
   * Ouve o registro deste aparelho (devices/{uid}). Só confia em respostas do servidor:
   * offline, quem mantém a TV tocando é o pareamento salvo localmente.
   * includeMetadataChanges: a confirmação do servidor às vezes chega só como metadado.
   */
  let offDevice = null;
  function subscribeDevice() {
    offDevice?.();
    const { db } = fb();
    offDevice = onSnapshot(doc(db, 'devices', state.uid), { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.fromCache) return;
      if (snap.exists()) {
        const d = snap.data();
        if (d.kind === PAIRING_KIND.SCREEN) onPaired(d.companyId, d.targetId);
      } else if (!(state.phase === 'pairing' && !state.companyId)) {
        // Não existe no servidor: desconectada no painel (ou nunca pareou).
        onUnpaired();
      }
    }, (e) => {
      console.warn('[vx] devices', e.code || e);
      setTimeout(subscribeDevice, 10_000);
    });
  }

  /**
   * Leitura recusada (manifesto ou sinal de vida) costuma significar que a tela foi
   * desconectada. Recria o listener do aparelho do zero: um listener antigo pode ficar
   * com o dado velho e até contaminar leituras "do servidor" feitas por cima dele.
   */
  let lastVerify = 0;
  function verifyPairing() {
    if (!state.uid || Date.now() - lastVerify < 10_000) return;
    lastVerify = Date.now();
    subscribeDevice();
  }

  /* ---------- Pareamento ---------- */
  async function startPairing() {
    stopPairing();
    const { db } = fb();
    for (let i = 0; i < 6; i++) {
      const code = generatePairingCode();
      const expiresAt = Date.now() + PAIRING_TTL_MS;
      try {
        await setDoc(doc(db, 'pairings', code), {
          code,
          kind: PAIRING_KIND.SCREEN,
          uid: state.uid,
          platform: info.platform || 'web',
          model: info.model || null,
          appVersion: info.appVersion,
          claimed: false,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(expiresAt),
        });
        set({ phase: 'pairing', code, codeExpiresAt: expiresAt, error: null });
        pairingTimer = setTimeout(async () => {
          await deleteDoc(doc(db, 'pairings', code)).catch(() => {});
          if (state.phase === 'pairing') startPairing();
        }, PAIRING_TTL_MS);
        return;
      } catch (e) {
        // Código já usado por outra TV (as regras recusam sobrescrever): tenta outro.
        if (e.code !== 'permission-denied') {
          set({ phase: 'error', error: 'offline' });
          setTimeout(startPairing, 10_000);
          return;
        }
      }
    }
  }
  function stopPairing() {
    clearTimeout(pairingTimer);
  }

  function onPaired(companyId, screenId) {
    stopPairing();
    local.set('pairing', { companyId, screenId });
    if (state.companyId === companyId && state.screenId === screenId && offManifest) {
      if (state.phase !== 'paired') set({ phase: 'paired' });
      return;
    }
    set({ phase: 'paired', companyId, screenId, code: null });
    const { db } = fb();
    offManifest?.();
    offManifest = onSnapshot(doc(db, 'companies', companyId, 'manifests', screenId), (snap) => {
      const manifest = snap.exists() ? toMs(snap.data()) : null;
      local.set('manifest', manifest);
      set({ manifest });
      if (manifest) runSync(manifest);
      watchOrders(manifest);
    }, (e) => {
      console.warn('[vx] manifest', e.code || e);
      offManifest = null;
      verifyPairing();
    });
    heartbeat();
    clearInterval(hbTimer);
    hbTimer = setInterval(heartbeat, HEARTBEAT_MS);
    watchCommands(companyId, screenId);
  }

  /* ---------- Comandos do painel (screens/{id}/live/command) ---------- */
  /**
   * O painel grava { id, type, at } em live/command. A TV executa cada id uma vez só e responde
   * em live/diagnostics.ack. Ao abrir, lê a última resposta para não repetir um comando antigo.
   */
  async function watchCommands(companyId, screenId) {
    offCommand?.();
    offCommand = null;
    const { db } = fb();
    const live = (name) => doc(db, 'companies', companyId, 'screens', screenId, 'live', name);
    let handled = local.get('lastCommand');
    try {
      const d = await getDoc(live('diagnostics'));
      handled = d.data()?.ack?.id || handled;
    } catch { /* sem internet: vale o que ficou salvo */ }
    if (state.screenId !== screenId) return;
    let first = true;
    offCommand = onSnapshot(live('command'), (snap) => {
      const c = snap.data();
      const novo = c?.id && c.id !== handled;
      // Na primeira leitura só executa se ninguém respondeu ainda e o comando é recente.
      const recente = !first || (c?.at && Math.abs(Date.now() - toMs(c.at)) < 5 * 60_000);
      first = false;
      if (!novo || !recente || snap.metadata.hasPendingWrites) return;
      handled = c.id;
      local.set('lastCommand', c.id);
      commandSubs.forEach((f) => f({ id: c.id, type: c.type, at: toMs(c.at) }));
    }, (e) => console.warn('[vx] comandos', e.code || e));
  }

  /** Grava um documento em screens/{id}/live (diagnóstico, foto da tela). */
  async function writeLive(name, data) {
    if (!state.companyId || !state.screenId) throw new Error('Tela não pareada');
    const { db } = fb();
    await setDoc(doc(db, 'companies', state.companyId, 'screens', state.screenId, 'live', name), { ...data, at: serverTimestamp() }, { merge: true });
  }

  function onUnpaired() {
    offManifest?.();
    offOrders?.();
    offCommand?.();
    offCommand = null;
    offManifest = offOrders = null;
    ordersKey = null;
    clearInterval(hbTimer);
    local.set('pairing', null);
    local.set('manifest', null);
    cache.sync([], null); // apaga mídias da empresa anterior
    set({ companyId: null, screenId: null, manifest: null, orders: [] });
    startPairing();
  }

  /* ---------- Mídias ---------- */
  function runSync(manifest) {
    cache.sync(manifest.assets || [], (sync) => {
      set({ sync, cacheVersion: state.cacheVersion + 1 });
      // Avisa o painel na hora em que começa/termina de baixar (não espera o próximo minuto).
      if (sync.status !== lastSyncSent) {
        lastSyncSent = sync.status;
        heartbeat();
      }
    });
  }

  /* ---------- Pedidos (GerenciaAI) ---------- */
  function watchOrders(manifest) {
    const mode = manifest?.orderBoard?.mode || 'off';
    const key = mode === 'off' ? null : state.companyId;
    if (key === ordersKey) return;
    offOrders?.();
    offOrders = null;
    ordersKey = key;
    if (!key) return set({ orders: [] });
    const { db } = fb();
    const q = query(collection(db, 'companies', state.companyId, 'orders'), where('status', 'in', ['preparing', 'ready']));
    offOrders = onSnapshot(q, (s) => set({ orders: s.docs.map((d) => ({ id: d.id, ...toMs(d.data()) })) }), (e) => console.warn('[vx] orders', e));
  }

  /* ---------- Sinal de vida ---------- */
  async function heartbeat() {
    if (!state.companyId || !state.screenId) return;
    const { db } = fb();
    try {
      await updateDoc(doc(db, 'companies', state.companyId, 'screens', state.screenId), {
        lastSeen: serverTimestamp(),
        appVersion: info.appVersion,
        platform: info.platform || 'web',
        model: info.model || null,
        resolution: resolution(),
        nowPlaying,
        syncState: state.sync,
      });
    } catch (e) {
      console.warn('[vx] heartbeat', e.code || e);
      if (e.code === 'permission-denied' || e.code === 'not-found') verifyPairing();
    }
  }

  return {
    start,
    cache,
    getState: () => state,
    /** O player avisa o que está no ar (vai no próximo sinal de vida). */
    setNowPlaying(item) {
      nowPlaying = item ? { mediaId: item.mediaId, name: item.name } : null;
    },
    /** Comandos vindos do painel. Devolve a função que para de ouvir. */
    onCommand(fn) {
      commandSubs.add(fn);
      return () => commandSubs.delete(fn);
    },
    writeLive,
  };
}
