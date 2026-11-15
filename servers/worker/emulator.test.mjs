// Teste do serviço contra o emulador do Firestore:
//   firebase emulators:exec --only firestore --project demo-vertice "node servers/worker/emulator.test.mjs"
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import assert from 'node:assert/strict';

process.env.GCLOUD_PROJECT = 'demo-vertice';
initializeApp({ projectId: 'demo-vertice' });
const db = getFirestore();
const now = Date.now();
const DAY = 86400000;
await db.doc('companies/c1').set({
  name: 'Padaria', status: 'active', paidUntil: Timestamp.fromMillis(now + 2 * DAY), monthlyPrice: 99.9, ownerEmail: 'dono@padaria.com', screenCount: 0,
  alerts: { enabled: true, emails: ['gerente@padaria.com'], whatsapps: [], offlineMinutes: 15 },
});
await db.doc('companies/c1/screens/s1').set({ name: 'Caixa', lastSeen: Timestamp.fromMillis(now - 30 * 60000) });
await db.doc('companies/c1/screens/s2').set({ name: 'Vitrine', lastSeen: Timestamp.fromMillis(now - 60000) });
await db.doc('companies/c1/alertTests/t1').set({ at: Timestamp.now(), by: 'dono' });

const run = () => execFileSync(process.execPath, ['servers/worker/worker.js', '--once'], { env: { ...process.env, FIREBASE_PROJECT_ID: 'demo-vertice' }, stdio: 'pipe' }).toString();
run();
let log = (await db.collection('companies/c1/alertLog').get()).docs.map((d) => d.data());
assert.deepEqual(log.map((l) => l.kind).sort(), ['cobranca', 'offline', 'teste']);
assert.match(log.find((l) => l.kind === 'offline').text, /Caixa parou/);
assert.equal(log.find((l) => l.kind === 'offline').result.email, 'e-mail não configurado no servidor');
assert.equal((await db.doc('companies/c1/alertTests/t1').get()).exists, false);
const c = (await db.doc('companies/c1').get()).data();
assert.equal(c.screenCount, 2);
assert.ok(Object.keys(c.notices).some((k) => k.startsWith('due-5')));
// Segunda rodada: nada repete.
run();
log = (await db.collection('companies/c1/alertLog').get()).docs.map((d) => d.data());
assert.equal(log.length, 3);
// A tela volta: avisa que voltou.
await db.doc('companies/c1/screens/s1').update({ lastSeen: Timestamp.now() });
run();
log = (await db.collection('companies/c1/alertLog').get()).docs.map((d) => d.data());
assert.ok(log.some((l) => l.kind === 'online' && /Caixa.*voltou/.test(l.text)));
console.log('SERVIÇO DE ALERTAS OK');
