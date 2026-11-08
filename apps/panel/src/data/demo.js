// Backend de demonstração: tudo em memória, com dados de exemplo e telas "vivas".
// Usado quando não há configuração do Firebase (ou com `vite --mode demo`).
// Serve para prévias, apresentações comerciais e para desenvolver sem internet.
import {
  PAIRING_KIND, ORDER_BOARD_DEFAULTS, screenCode, normalizePairingCode, isValidPairingCode, buildManifest,
} from '@vertice/shared';
import { seedDemo } from './seed.js';

const NOW = Symbol('now');
const DELETE = Symbol('delete');
const INC = (n) => ({ __inc: n });

export function createDemoBackend() {
  /** path → objeto */
  const store = new Map();
  const listeners = new Set(); // { path, isCol, q, cb }
  let user = null;
  const authCbs = new Set();
  let idn = 0;

  const newId = () => `d${Date.now().toString(36)}${(idn++).toString(36)}`;
  const parent = (path) => path.split('/').slice(0, -1).join('/');
  const clone = (v) => (v === undefined ? v : structuredClone(v));

  const apply = (prev, data) => {
    const next = { ...(prev || {}) };
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      // Suporte a "a.b" como no Firestore.
      const keys = k.split('.');
      let o = next;
      for (const kk of keys.slice(0, -1)) o = o[kk] = { ...(o[kk] || {}) };
      const last = keys[keys.length - 1];
      if (v === DELETE) delete o[last];
      else if (v === NOW) o[last] = Date.now();
      else if (v && typeof v === 'object' && '__inc' in v) o[last] = (o[last] || 0) + v.__inc;
      else o[last] = clone(v);
    }
    return next;
  };

  const matchQ = (d, q = {}) =>
    (q.where || []).every(([f, op, val]) => {
      const v = f.split('.').reduce((o, k) => o?.[k], d);
      if (op === '==') return v === val;
      if (op === '!=') return v !== val;
      if (op === 'in') return val.includes(v);
      if (op === 'array-contains') return Array.isArray(v) && v.includes(val);
      if (op === 'array-contains-any') return Array.isArray(v) && v.some((x) => val.includes(x));
      if (op === '>=') return v >= val;
      if (op === '<=') return v <= val;
      if (op === '>') return v > val;
      if (op === '<') return v < val;
      return true;
    });

  const readCol = (path, q = {}) => {
    let docs = [];
    for (const [p, d] of store) if (parent(p) === path && matchQ(d, q)) docs.push({ id: p.split('/').pop(), ...clone(d) });
    if (q.orderBy) {
      const [f, dir] = q.orderBy;
      docs.sort((a, b) => ((a[f] ?? 0) > (b[f] ?? 0) ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    }
    if (q.limit) docs = docs.slice(0, q.limit);
    return docs;
  };
  const readDoc = (path) => (store.has(path) ? { id: path.split('/').pop(), ...clone(store.get(path)) } : null);

  let pending = false;
  const notify = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      for (const l of listeners) l.cb(l.isCol ? readCol(l.path, l.q) : readDoc(l.path));
    });
  };

  const write = (path, data, { merge = false, update = false } = {}) => {
    if (update && !store.has(path)) throw new Error(`Documento não existe: ${path}`);
    store.set(path, apply(merge || update ? store.get(path) : {}, data));
    notify();
    if (/\/screens\/[^/]+\/live\/command$/.test(path)) setTimeout(() => simulateTv(path, store.get(path)), 900);
  };

  /** Simula a TV respondendo ao controle remoto (só no modo demonstração). */
  function simulateTv(cmdPath, cmd) {
    const live = cmdPath.replace(/\/command$/, '');
    const msg = {
      identify: 'Código mostrado na TV por 15 segundos.', menu: 'Menu aberto na TV.', reload: 'Recarregando.',
      restart: 'Reiniciando o player.', update: 'Versão mais recente', screenshot: 'Foto da tela enviada.', diagnostics: 'Diagnóstico atualizado.',
    }[cmd.type];
    if (cmd.type === 'screenshot' && typeof document !== 'undefined') {
      const cv = document.createElement('canvas');
      cv.width = 960;
      cv.height = 540;
      const g = cv.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, '#293548');
      grad.addColorStop(1, '#141b26');
      g.fillStyle = grad;
      g.fillRect(0, 0, 960, 540);
      g.fillStyle = '#0b1017';
      g.fillRect(700, 0, 260, 540);
      g.fillStyle = '#d9a84e';
      g.font = '700 22px sans-serif';
      g.fillText('OFERTA DA SEMANA', 48, 120);
      g.fillStyle = '#eef2f7';
      g.font = '700 64px sans-serif';
      g.fillText('Pão francês', 48, 200);
      g.fillText('R$ 12,90 /kg', 48, 280);
      g.fillStyle = '#d9a84e';
      g.font = '700 18px sans-serif';
      g.fillText('PRONTOS', 724, 48);
      g.fillStyle = '#eef2f7';
      g.font = '700 44px sans-serif';
      ['139', '137', '138'].forEach((n, i) => g.fillText(n, 724, 120 + i * 80));
      const image = cv.toDataURL('image/jpeg', 0.7);
      store.set(`${live}/screenshot`, { image, at: Date.now() });
      store.set(`${live.replace(/\/live$/, '')}/captures/${Date.now()}`, { image, at: Date.now() });
    }
    store.set(`${live}/diagnostics`, {
      ...(store.get(`${live}/diagnostics`) || {}),
      at: Date.now(), appVersion: '0.3.0', nativeVersion: '0.3.0', shell: 'android', platform: 'Android 11', model: 'Amlogic X96 Max',
      resolution: '1920×1080', uptimeMin: 1324, online: true, networkType: 'wifi',
      latency: { internet: 48, firebase: 61, mediaServer: 22 },
      storage: { freeBytes: 9.2e9, totalBytes: 27.5e9, mediaBytes: 734e6, mediaFiles: 12 },
      sync: { status: 'synced', done: 12, total: 12 }, phase: 'paired',
      update: { status: 'uptodate', label: 'Versão mais recente', lastCheck: Date.now() - 20 * 60_000 },
      errors: [{ at: Date.now() - 42 * 60_000, level: 'warn', msg: '[vx] falha ao baixar m9 (internet caiu por 2 min)' }],
      ack: { id: cmd.id, type: cmd.type, ok: true, message: msg, doneAt: Date.now() },
    });
    notify();
  }

  // Dados de exemplo.
  seedDemo({ set: (p, d) => store.set(p, apply({}, d)), NOW });
  // Manifestos de exemplo (no Firebase eles são compilados pelo painel ao publicar).
  for (const [path, company] of [...store.entries()].filter(([p]) => /^companies\/[^/]+$/.test(p))) {
    const col = (name) => [...store.entries()].filter(([p]) => p.startsWith(`${path}/${name}/`) && p.split('/').length === 4).map(([p, d]) => ({ id: p.split('/').pop(), ...d }));
    const schedules = col('schedules').filter((x) => x.status === 'published');
    for (const screen of col('screens')) {
      store.set(`${path}/manifests/${screen.id}`, buildManifest({ screen, schedules, playlists: col('playlists'), media: col('media'), company, priceLists: col('priceLists'), walls: col('videowalls') }));
    }
  }
  const companyId = 'demo';

  // Simula as TVs: as online renovam o sinal de vida e "trocam de mídia".
  setInterval(() => {
    for (const [p, d] of store) {
      if (/^companies\/demo\/screens\/[^/]+$/.test(p) && d.simulate === 'live') {
        store.set(p, { ...d, lastSeen: Date.now() });
      }
    }
    notify();
  }, 20_000);

  // Simula o GerenciaAI: de tempos em tempos um pedido fica pronto.
  const names = ['Maria Silva', 'João Pedro Lima', 'Ana Beatriz', 'Carlos Souza', 'Fernanda Rocha', 'Rafael Melo'];
  let orderSeq = 140;
  setInterval(() => {
    const prep = readCol(`companies/${companyId}/orders`, { where: [['status', '==', 'preparing']] });
    if (prep.length) {
      const o = prep.sort((a, b) => a.createdAt - b.createdAt)[0];
      write(`companies/${companyId}/orders/${o.id}`, { status: 'ready', readyAt: NOW }, { update: true });
    }
    const id = newId();
    write(`companies/${companyId}/orders/${id}`, {
      number: String(++orderSeq), customerName: names[orderSeq % names.length], status: 'preparing',
      unitId: 'u1', source: 'gerenciaai', terminal: 'Caixa 1', createdAt: NOW,
    });
  }, 25_000);

  return {
    kind: 'demo',
    NOW,
    DELETE,
    inc: INC,

    auth: {
      onChange(cb) {
        authCbs.add(cb);
        // Entra direto com a usuária de demonstração.
        queueMicrotask(() => cb(user));
        return () => authCbs.delete(cb);
      },
      async signIn(email) {
        user = { uid: 'demo-owner', email: email || 'cristina@boamassa.com.br', name: 'Cristina Albuquerque' };
        authCbs.forEach((cb) => cb(user));
      },
      async signUp({ name, email }) {
        user = { uid: 'demo-owner', email, name };
        authCbs.forEach((cb) => cb(user));
      },
      async signOut() {
        user = null;
        authCbs.forEach((cb) => cb(user));
      },
      async resetPassword() {},
    },

    watchDoc(path, cb) {
      const l = { path, isCol: false, cb };
      listeners.add(l);
      queueMicrotask(() => cb(readDoc(path)));
      return () => listeners.delete(l);
    },
    watchCol(path, q, cb) {
      const l = { path, isCol: true, q, cb };
      listeners.add(l);
      queueMicrotask(() => cb(readCol(path, q)));
      return () => listeners.delete(l);
    },
    getDoc: async (path) => readDoc(path),
    getCol: async (path, q) => readCol(path, q),
    newId: () => newId(),
    set: async (path, data, merge = false) => write(path, data, { merge }),
    update: async (path, data) => write(path, data, { update: true }),
    async add(colPath, data) {
      const id = newId();
      write(`${colPath}/${id}`, data);
      return id;
    },
    async remove(path) {
      store.delete(path);
      notify();
    },
    async batch(ops) {
      for (const o of ops) {
        if (o.op === 'delete') store.delete(o.path);
        else write(o.path, o.data, { merge: o.merge, update: o.op === 'update' });
      }
      notify();
    },

    async claimPairing({ companyId: cid, code, kind, name, unitId = null }) {
      code = normalizePairingCode(code);
      await new Promise((r) => setTimeout(r, 700));
      if (!isValidPairingCode(code)) throw new Error('Código não encontrado. Confira o que aparece na tela.');
      const company = readDoc(`companies/${cid}`);
      if (kind === PAIRING_KIND.SCREEN) {
        const used = readCol(`companies/${cid}/screens`).length;
        if (used >= company.screenLimit) throw new Error(`Seu plano permite ${company.screenLimit} telas. Fale com a Vetta para ampliar.`);
        const seq = (company.screenSeq || 0) + 1;
        const id = newId();
        write(`companies/${cid}/screens/${id}`, {
          code: screenCode(seq), name: name || screenCode(seq), unitId, groupIds: [], orientation: 'landscape',
          orderBoard: ORDER_BOARD_DEFAULTS, deviceUid: `dev-${id}`, platform: 'android', appVersion: '0.1.0',
          pairedAt: NOW, lastSeen: NOW, simulate: 'live',
        });
        write(`companies/${cid}`, { screenSeq: seq }, { update: true });
        return { id };
      }
      const id = `int-${newId()}`;
      write(`companies/${cid}/integrations/${id}`, {
        name: name || 'GerenciaAI', type: 'gerenciaai', unitId, deviceUid: id, pairedAt: NOW, lastSeen: NOW,
      });
      return { id };
    },

    async upload(path, file, onProgress) {
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 80));
        onProgress?.(i / 10);
      }
      return { url: URL.createObjectURL(file) };
    },
    async deleteFile() {},
  };
}
