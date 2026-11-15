// Teste da troca de endereço das mídias contra o emulador do Firestore:
//   firebase emulators:exec --only firestore --project demo-vertice "node servers/worker/migrar.test.mjs"
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import assert from 'node:assert/strict';

process.env.GCLOUD_PROJECT = 'demo-vertice';
initializeApp({ projectId: 'demo-vertice' });
const db = getFirestore();
const VELHO = 'http://192.168.0.10:8787';
const NOVO = 'https://midias.exemplo.com.br';
const fb = 'https://firebasestorage.googleapis.com/v0/b/x/o/companies%2Fc1%2Fmedia%2Fa.png?alt=media';
const quando = Timestamp.fromMillis(1700000000000);
await db.doc('companies/c1').set({ name: 'Padaria', paidUntil: quando });
await db.doc('companies/c1/media/a').set({ name: 'Oferta', url: `${VELHO}/m/c1/a.mp4`, createdAt: quando });
await db.doc('companies/c1/media/b').set({ name: 'Logo', url: fb });
await db.doc('companies/c1/media/c').set({ name: 'Já novo', url: `${NOVO}/m/c1/c.png` });
await db.doc('companies/c1/manifests/s1').set({
  updatedAt: quando,
  assets: [{ mediaId: 'a', url: `${VELHO}/m/c1/a.mp4` }, { mediaId: 'b', url: fb }],
  zones: { main: { items: [{ url: 'http://localhost:8787/m/c1/a.mp4', note: 'veja http://192.168.0.10:8787/m/c1/a.mp4' }] } },
});

const run = (...a) => execFileSync(process.execPath, ['servers/worker/migrar-midias.mjs', ...a], { env: { ...process.env, FIREBASE_PROJECT_ID: 'demo-vertice' } }).toString();

// Sem --aplicar: só relata.
let out = run(NOVO);
assert.match(out, /2 documento\(s\)/);
assert.match(out, /192\.168\.0\.10:8787/);
assert.match(out, /localhost:8787/);
assert.equal((await db.doc('companies/c1/media/a').get()).data().url, `${VELHO}/m/c1/a.mp4`);

out = run(`${NOVO}/`, '--aplicar');
assert.match(out, /Trocados/);
const a = (await db.doc('companies/c1/media/a').get()).data();
assert.equal(a.url, `${NOVO}/m/c1/a.mp4`);
assert.ok(a.createdAt instanceof Timestamp && a.createdAt.toMillis() === quando.toMillis());
assert.equal((await db.doc('companies/c1/media/b').get()).data().url, fb);
const m = (await db.doc('companies/c1/manifests/s1').get()).data();
assert.equal(m.assets[0].url, `${NOVO}/m/c1/a.mp4`);
assert.equal(m.assets[1].url, fb);
assert.equal(m.zones.main.items[0].url, `${NOVO}/m/c1/a.mp4`);
assert.equal(m.zones.main.items[0].note, 'veja http://192.168.0.10:8787/m/c1/a.mp4'); // texto livre não é link
assert.equal(m.updatedAt.toMillis(), quando.toMillis());

// De novo: nada a fazer.
assert.match(run(NOVO, '--aplicar'), /Nada a trocar/);
// Endereço inválido.
assert.throws(() => execFileSync(process.execPath, ['servers/worker/migrar-midias.mjs', 'midias.exemplo.com.br'], { stdio: 'pipe' }));
console.log('MIGRAÇÃO DE MÍDIAS OK');
