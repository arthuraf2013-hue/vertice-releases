// Teste do servidor de mídias: foto do público (Foto no telão) e IA sem chave. `npm run test:midias`
import { spawn } from 'node:child_process';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-vertice/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const put = (p, fields) => fetch(`${FS}/${p}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields }) }).then((r) => r.status);
const srv = spawn('node', [new URL('./server.js', import.meta.url).pathname], { env: { ...process.env, FIREBASE_PROJECT_ID: 'demo-vertice', DATA_DIR: (await import('node:os')).tmpdir() + '/vx-midias-teste', PORT: '8790', PUBLIC_URL: 'http://m.local', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1200));
let ok = true;
const check = (name, cond) => { console.log(cond ? '✔' : '✗', name); ok = ok && cond; };
try {
  await put('companies/c1/commentBoards/b1', { title: { stringValue: 'F' }, open: { booleanValue: true }, kind: { stringValue: 'photos' } });
  await put('companies/c1/commentBoards/b2', { title: { stringValue: 'F' }, open: { booleanValue: false }, kind: { stringValue: 'photos' } });
  await put('companies/c1/commentBoards/b3', { title: { stringValue: 'T' }, open: { booleanValue: true } });
  const su = await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).json();
  const tok = su.idToken;
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 1)]);
  const up = (b, name, body = jpeg, type = 'image/jpeg', t = tok) => fetch(`http://127.0.0.1:8790/v1/public/c1/${b}/${name}`, { method: 'PUT', body, headers: { Authorization: `Bearer ${t}`, 'Content-Type': type } });
  let r = await up('b1', 'abc-1.jpg');
  const j = await r.json();
  check(`foto aceita (201) com link do mural: ${j.url}`, r.status === 201 && /\/m\/c1\/p-b1-abc-1\.jpg$/.test(j.url));
  check('arquivo baixa pelo /m', (await fetch(`http://127.0.0.1:8790${new URL(j.url).pathname}`)).status === 200);
  check('não-JPEG recusado (415)', (await up('b1', 'x.jpg', Buffer.from('<svg/>'))).status === 415);
  check('mural fechado recusa (403)', (await up('b2', 'y.jpg')).status === 403);
  check('mural de texto recusa (404)', (await up('b3', 'z.jpg')).status === 404);
  check('sem login recusa (401)', (await up('b1', 'w.jpg', jpeg, 'image/jpeg', 'x.y.z')).status === 401);
  await up('b1', 'abc-2.jpg'); await up('b1', 'abc-3.jpg');
  check('4ª foto em 10 min recusada (429)', (await up('b1', 'abc-4.jpg')).status === 429);
  const ai = await fetch('http://127.0.0.1:8790/v1/ai/c1/texto', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: '{}' });
  check('IA sem chave: 503 com aviso', ai.status === 503);
} finally { srv.kill(); }
process.exit(ok ? 0 : 1);
