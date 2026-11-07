// Testes do atualizador do Windows sem Electron: `node --test apps/player/electron/updater.test.cjs`
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

/** Carrega updater.cjs com um "electron" e um child_process de mentira. */
function carregar({ version = '0.3.0', packaged = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-upd-'));
  const chamadas = { spawn: [], quit: 0 };
  const fakeElectron = {
    app: { getVersion: () => version, isPackaged: packaged, getPath: () => dir, quit: () => { chamadas.quit++; } },
    net: { fetch: (u, o) => fetch(u, o) },
  };
  const fakeChild = { spawn: (cmd, args) => { chamadas.spawn.push({ cmd, args }); return { unref() {} }; } };
  const original = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'electron') return fakeElectron;
    if (req === 'node:child_process') return fakeChild;
    return original.call(this, req, ...rest);
  };
  delete require.cache[require.resolve('./updater.cjs')];
  try {
    return { mod: require('./updater.cjs'), chamadas, dir };
  } finally {
    Module._load = original;
  }
}

function servidor(rotas) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const r = rotas[req.url.split('?')[0]];
      if (!r) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': r.type || 'application/octet-stream', 'Content-Length': r.body.length });
      res.end(r.body);
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('compara versões e só aceita nome de instalador seguro', () => {
  const { mod } = carregar();
  assert.equal(mod.compareVersions('0.3.1', '0.3.0'), 1);
  assert.equal(mod.compareVersions('0.3.0', '0.3.0'), 0);
  assert.equal(mod.compareVersions('0.2.9', '0.3.0'), -1);
  assert.equal(mod.nomeDoInstalador('https://x/y/Vertice-Player-Setup-0.3.1.exe', '0.3.1'), 'Vertice-Player-Setup-0.3.1.exe');
  assert.equal(mod.nomeDoInstalador('https://x/y/..%2F..%2Fevil.exe', '0.3.1'), 'Vertice-Player-Setup-0.3.1.exe');
});

test('versão nova: baixa, confere o SHA-512 e instala em silêncio', async () => {
  const exe = crypto.randomBytes(200_000);
  const sha512 = crypto.createHash('sha512').update(exe).digest('base64');
  const { s, base } = await servidor({
    '/setup.exe': { body: exe },
    '/player-update.json': { type: 'application/json', body: Buffer.from(JSON.stringify({ version: '0.3.1', windows: { version: '0.3.1', url: '', sha512, size: exe.length } })) },
  });
  // URL do instalador depende da porta: monta o manifesto de novo.
  const manifesto = { version: '0.3.1', windows: { version: '0.3.1', url: `${base}/setup.exe`, sha512, size: exe.length } };
  s.removeAllListeners('request');
  s.on('request', (req, res) => {
    const body = req.url.startsWith('/setup.exe') ? exe : Buffer.from(JSON.stringify(manifesto));
    res.writeHead(200, { 'Content-Length': body.length }).end(body);
  });
  const { mod, chamadas, dir } = carregar({ version: '0.3.0' });
  const estados = [];
  const up = mod.createUpdater({ url: `${base}/player-update.json`, onState: (st) => estados.push(st.status) });
  await up.check();
  await esperar(700);
  s.close();
  assert.deepEqual(chamadas.spawn.map((c) => c.args), [['/S', '--updated', '--force-run']]);
  assert.ok(chamadas.spawn[0].cmd.startsWith(path.join(dir, 'atualizacoes')));
  assert.equal(fs.readFileSync(chamadas.spawn[0].cmd).length, exe.length);
  assert.equal(chamadas.quit, 1);
  assert.deepEqual(estados.filter((e, i) => e !== estados[i - 1]), ['checking', 'downloading', 'installing']);
});

test('arquivo adulterado não instala; versão igual não baixa nada', async () => {
  const exe = crypto.randomBytes(5000);
  let manifesto;
  const { s, base } = await servidor({});
  s.removeAllListeners('request');
  s.on('request', (req, res) => {
    const body = req.url.startsWith('/setup.exe') ? exe : Buffer.from(JSON.stringify(manifesto));
    res.writeHead(200, { 'Content-Length': body.length }).end(body);
  });
  manifesto = { version: '0.3.1', windows: { url: `${base}/setup.exe`, sha512: 'errado' } };
  const a = carregar({ version: '0.3.0' });
  const up = a.mod.createUpdater({ url: `${base}/m.json`, onState: () => {} });
  const st = await up.check();
  assert.equal(st.status, 'error');
  assert.match(st.error, /não confere/);
  assert.equal(a.chamadas.spawn.length, 0);

  manifesto = { version: '0.3.0', windows: { url: `${base}/setup.exe` } };
  const b = carregar({ version: '0.3.0' });
  const st2 = await b.mod.createUpdater({ url: `${base}/m.json`, onState: () => {} }).check();
  s.close();
  assert.equal(st2.status, 'uptodate');
  assert.equal(b.chamadas.spawn.length, 0);
});

test('fora do instalador (npm run electron:start) não tenta atualizar', async () => {
  const { mod, chamadas } = carregar({ packaged: false });
  const st = await mod.createUpdater({ url: 'http://127.0.0.1:1/x', onState: () => {} }).check();
  assert.equal(st.status, 'dev');
  assert.equal(chamadas.spawn.length, 0);
});
