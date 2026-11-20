// Loja contra os emuladores (Firestore e Auth) e um Asaas de mentira:
//   firebase emulators:exec --only firestore,auth --project demo-vertice "node servers/worker/loja.test.mjs"
import http from 'node:http';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { startStore, referralCode } from './store.js';

process.env.GCLOUD_PROJECT = 'demo-vertice';
initializeApp({ projectId: 'demo-vertice' });
const db = getFirestore();
const auth = getAuth();
const DAY = 86_400_000;
const now = Date.now();

// Asaas de mentira: guarda o que recebeu.
const seen = [];
const asaas = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, key: req.headers.access_token, body: body ? JSON.parse(body) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/customers?')) return res.end(JSON.stringify({ data: [] }));
    if (req.url === '/customers') return res.end(JSON.stringify({ id: 'cus_1' }));
    if (req.url === '/payments') return res.end(JSON.stringify({ id: 'pay_1', invoiceUrl: 'https://asaas.test/i/pay_1' }));
    res.statusCode = 404; res.end('{}');
  });
}).listen(0);
await new Promise((r) => asaas.once('listening', r));

const PORT = 18788;
const server = startStore({
  db, auth, FieldValue, Timestamp, log: () => {},
  env: { ASAAS_API_KEY: 'chave-teste', ASAAS_URL: `http://127.0.0.1:${asaas.address().port}`, ASAAS_WEBHOOK_TOKEN: 't'.repeat(40), STORE_PORT: String(PORT) },
});
await new Promise((r) => server.once('listening', r));

// Empresas: a madrinha (s1) e a indicada (c1), cujo dono compra o plano anual.
await db.doc('companies/s1').set({ name: 'Madrinha', paidUntil: Timestamp.fromMillis(now + 10 * DAY) });
await db.doc('companies/c1').set({ name: 'Padaria', status: 'trial', referredBy: referralCode('s1'), storageQuotaMB: 1024 });
await db.doc('platform/store').set({ items: [
  { id: 'anual', kind: 'months', name: 'Plano anual', price: 1078.8, promoPrice: 958.8, months: 12 },
  { id: 'espaco', kind: 'storage', name: '+5 GB', price: 49.9, storageMB: 5120 },
] });
const user = await auth.createUser({ email: 'dono@padaria.com', password: 'segredo123' });
await db.doc(`companies/c1/members/${user.uid}`).set({ role: 'owner' });
const editor = await auth.createUser({ email: 'ed@padaria.com', password: 'segredo123' });
await db.doc(`companies/c1/members/${editor.uid}`).set({ role: 'editor' });

const idToken = async (email) => {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123', returnSecureToken: true }),
  });
  return (await r.json()).idToken;
};
const buy = (token, body) => fetch(`http://127.0.0.1:${PORT}/v1/loja/c1/comprar`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const hook = (event, ref, token = 't'.repeat(40)) => fetch(`http://127.0.0.1:${PORT}/v1/asaas/webhook`, { method: 'POST', headers: { 'asaas-access-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payment: { id: 'pay_1', externalReference: ref, billingType: 'PIX' } }) });

// Editor não compra; CPF inválido recusado; dono compra com o preço da promoção.
assert.equal((await buy(await idToken('ed@padaria.com'), { itemId: 'anual', cpfCnpj: '52998224725', name: 'Padaria' })).status, 403);
const owner = await idToken('dono@padaria.com');
assert.equal((await buy(owner, { itemId: 'anual', cpfCnpj: '123', name: 'Padaria' })).status, 400);
const r = await buy(owner, { itemId: 'anual', cpfCnpj: '529.982.247-25', name: 'Padaria', email: 'dono@padaria.com' });
assert.equal(r.status, 200);
const { orderId, invoiceUrl } = await r.json();
assert.equal(invoiceUrl, 'https://asaas.test/i/pay_1');
const pay = seen.find((s) => s.url === '/payments');
assert.equal(pay.key, 'chave-teste');
assert.equal(pay.body.value, 958.8);
assert.equal(pay.body.billingType, 'UNDEFINED');
assert.equal(pay.body.externalReference, `c1/${orderId}`);
assert.equal((await db.doc('companies/c1').get()).data().asaasCustomerId, 'cus_1');

// Webhook com token errado é recusado; confirmado aplica 12 meses e premia a madrinha uma vez só.
assert.equal((await hook('PAYMENT_RECEIVED', `c1/${orderId}`, 'errado')).status, 401);
assert.equal((await hook('PAYMENT_CREATED', `c1/${orderId}`)).status, 200);
assert.equal((await db.doc(`companies/c1/storeOrders/${orderId}`).get()).data().status, 'pending');
assert.equal((await hook('PAYMENT_RECEIVED', `c1/${orderId}`)).status, 200);
const c1 = (await db.doc('companies/c1').get()).data();
assert.equal(c1.status, 'active');
assert.ok(c1.paidUntil.toMillis() > now + 360 * DAY);
assert.equal(c1.referralRewarded, true);
assert.equal((await db.doc(`companies/c1/storeOrders/${orderId}`).get()).data().status, 'paid');
const receiptDoc = (await db.doc(`companies/c1/payments/loja-${orderId}`).get()).data();
assert.equal(receiptDoc.amount, 958.8);
assert.equal(receiptDoc.months, 12);
assert.equal(receiptDoc.channel, 'Asaas');
const s1 = (await db.doc('companies/s1').get()).data();
assert.equal(s1.referralRewards, 1);
assert.ok(s1.paidUntil.toMillis() > now + 370 * DAY);
// Aviso repetido do Asaas não aplica de novo.
await hook('PAYMENT_CONFIRMED', `c1/${orderId}`);
assert.equal((await db.doc('companies/c1').get()).data().paidUntil.toMillis(), c1.paidUntil.toMillis());
assert.equal((await db.doc('companies/s1').get()).data().referralRewards, 1);

// Espaço extra soma no plano.
const r2 = await buy(owner, { itemId: 'espaco', cpfCnpj: '52998224725', name: 'Padaria' });
const o2 = (await r2.json()).orderId;
await hook('PAYMENT_CONFIRMED', `c1/${o2}`);
assert.equal((await db.doc('companies/c1').get()).data().storageQuotaMB, 1024 + 5120);

server.close();
asaas.close();
console.log('LOJA OK');
process.exit(0);
