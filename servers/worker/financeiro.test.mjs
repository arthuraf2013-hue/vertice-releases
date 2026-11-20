// Financeiro contra os emuladores (Firestore e Auth) e um Asaas de mentira:
//   firebase emulators:exec --only firestore,auth --project demo-vertice "node servers/worker/financeiro.test.mjs"
import http from 'node:http';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { startStore, asaasClient } from './store.js';
import { startFinance } from './finance.js';

process.env.GCLOUD_PROJECT = 'demo-vertice';
initializeApp({ projectId: 'demo-vertice' });
const db = getFirestore();
const auth = getAuth();
const DAY = 86_400_000;
const now = Date.now();
const ms = (v) => (v?.toMillis ? v.toMillis() : v);
const wait = (t) => new Promise((r) => setTimeout(r, t));

// Asaas de mentira.
const seen = [];
let pay = 0;
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/customers?')) return res.end(JSON.stringify({ data: [] }));
    if (req.url === '/customers') return res.end(JSON.stringify({ id: 'cus_fin' }));
    if (req.url === '/payments' && req.method === 'POST') { pay += 1; return res.end(JSON.stringify({ id: `pay_${pay}`, invoiceUrl: `https://asaas.test/i/pay_${pay}` })); }
    if (/^\/payments\/[^/]+\/receiveInCash$/.test(req.url)) return res.end(JSON.stringify({ ok: true }));
    if (/^\/payments\/[^/]+$/.test(req.url) && req.method === 'DELETE') return res.end(JSON.stringify({ deleted: true }));
    res.statusCode = 404; res.end('{}');
  });
}).listen(0);
await new Promise((r) => fake.once('listening', r));

const env = { ASAAS_API_KEY: 'chave-teste', ASAAS_URL: `http://127.0.0.1:${fake.address().port}`, ASAAS_WEBHOOK_TOKEN: 'w'.repeat(40), STORE_PORT: '18789' };
const asaas = asaasClient(env);
const notices = [];
const finance = startFinance({ db, auth, FieldValue, Timestamp, env, asaas, log: () => {}, plans: { start: { name: 'Start' } }, notify: async (cid, c, n) => { notices.push([cid, n.subject]); } });
const server = startStore({ db, auth, FieldValue, Timestamp, log: () => {}, env, asaas, finance });
await new Promise((r) => server.once('listening', r));
const base = 'http://127.0.0.1:18789';

// Empresas:
//   vence  → vence em 5 dias, com CNPJ: ganha fatura e cobrança no Asaas
//   semdoc → vence em 5 dias, sem CPF/CNPJ: fatura com falha de sincronização
//   velha  → sem pagar há 95 dias: cancelada sozinha
//   pedido → cancelamento agendado para ontem
//   longe  → vence em 25 dias: nada ainda
const T = (d) => Timestamp.fromMillis(now + d * DAY);
const company = (extra) => ({ status: 'active', monthlyPrice: 99.9, screenLimit: 3, plan: 'start', createdAt: T(-200), ...extra });
await db.doc('companies/vence').set(company({ name: 'Padaria', paidUntil: T(5), cpfCnpj: '11.222.333/0001-81', ownerEmail: 'a@a.com' }));
await db.doc('companies/semdoc').set(company({ name: 'Sem documento', paidUntil: T(5) }));
await db.doc('companies/velha').set(company({ name: 'Velha', paidUntil: T(-95) }));
await db.doc('companies/pedido').set(company({ name: 'Pedido', paidUntil: T(20), cancelAt: T(-1) }));
await db.doc('companies/longe').set(company({ name: 'Longe', paidUntil: T(25) }));
await db.doc('companies/longe/screens/t1').set({ name: 'Caixa', pairedAt: T(-30) });
await db.doc('platform/settings').set({ invoiceDaysBefore: 10, cancelAfterDays: 90 });

// Histórico de MRR e de telas: começa com a base atual.
await finance.watch();
await wait(1500);
let ev = (await db.collection('mrrEvents').get()).docs.map((d) => d.data());
assert.equal(ev.length, 5, 'a base pagante entra como novos clientes');
assert.ok(ev.every((e) => e.backfill && e.type === 'new'));
let lic = (await db.collection('licenseEvents').get()).docs.map((d) => d.data());
assert.deepEqual(lic.map((e) => [e.type, e.cid, e.screenName]), [['activated', 'longe', 'Caixa']]);

// Hora em hora.
await finance.runInvoices();
const inv = (cid) => db.collection(`companies/${cid}/invoices`).get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
const [v] = await inv('vence');
assert.equal(v.status, 'open');
assert.equal(v.amount, 99.9);
assert.equal(v.asaasPaymentId, 'pay_1');
assert.equal(v.invoiceUrl, 'https://asaas.test/i/pay_1');
const charge = seen.find((s) => s.url === '/payments' && s.method === 'POST');
assert.equal(charge.body.externalReference, `vence/inv/${v.id}`);
assert.equal(charge.body.billingType, 'UNDEFINED');
const [sd] = await inv('semdoc');
assert.match(sd.syncError.message, /CPF ou CNPJ/);
assert.equal((await db.doc('companies/velha').get()).get('status'), 'canceled');
assert.equal((await db.doc('companies/velha').get()).get('cancelReason'), 'inadimplencia');
assert.equal((await db.doc('companies/pedido').get()).get('status'), 'canceled');
assert.equal((await inv('longe')).length, 0);
assert.equal(notices.length, 2, 'dono avisado dos dois cancelamentos');

// Rodar de novo não duplica a fatura.
await finance.runInvoices();
assert.equal((await inv('vence')).length, 1);
assert.equal(seen.filter((s) => s.url === '/payments' && s.method === 'POST').length, 1);

// Asaas confirma o pagamento: fatura paga, recebimento e renovação.
const before = ms((await db.doc('companies/vence').get()).get('paidUntil'));
const hook = (event, ref, billingType = 'PIX') => fetch(`${base}/v1/asaas/webhook`, { method: 'POST', headers: { 'asaas-access-token': 'w'.repeat(40), 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payment: { externalReference: ref, billingType } }) });
assert.equal((await hook('PAYMENT_RECEIVED', `vence/inv/${v.id}`)).status, 200);
const paid = (await db.doc(`companies/vence/invoices/${v.id}`).get()).data();
assert.equal(paid.status, 'paid');
assert.equal(paid.method, 'Pix');
const receipt = (await db.doc(`companies/vence/payments/inv-${v.id}`).get()).data();
assert.equal(receipt.amount, 99.9);
assert.equal(receipt.channel, 'Asaas');
const after = ms((await db.doc('companies/vence').get()).get('paidUntil'));
assert.ok(after > before + 27 * DAY, 'renovou um mês');
// Webhook repetido não paga duas vezes.
await hook('PAYMENT_RECEIVED', `vence/inv/${v.id}`);
assert.equal(ms((await db.doc('companies/vence').get()).get('paidUntil')), after);

// Console: só a Vetta chama as rotas.
const user = await auth.createUser({ email: 'vetta@vetta.com', password: 'segredo123' });
const other = await auth.createUser({ email: 'x@x.com', password: 'segredo123' });
await db.doc(`platformAdmins/${user.uid}`).set({ name: 'Vetta' });
const token = async (email) => (await (await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123', returnSecureToken: true }) })).json()).idToken;
const call = (path, t, body = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
assert.equal((await call(`/v1/financeiro/semdoc/faturas/${sd.id}/cobrar`, await token('x@x.com'))).status, 403);

// Depois de cadastrar o CNPJ, a cobrança sai.
await db.doc('companies/semdoc').update({ cpfCnpj: '11222333000181' });
const r = await call(`/v1/financeiro/semdoc/faturas/${sd.id}/cobrar`, await token('vetta@vetta.com'));
assert.equal(r.status, 200);
assert.match((await r.json()).invoiceUrl, /asaas\.test/);
assert.equal((await db.doc(`companies/semdoc/invoices/${sd.id}`).get()).get('syncError'), undefined);

// Baixa à mão de fatura cobrada no Asaas: avisa o Asaas e renova.
const b = await call(`/v1/financeiro/semdoc/faturas/${sd.id}/baixa`, await token('vetta@vetta.com'), { method: 'Transferência' });
assert.equal(b.status, 200);
assert.ok(seen.some((s) => /receiveInCash$/.test(s.url)));
assert.equal((await db.doc(`companies/semdoc/invoices/${sd.id}`).get()).get('channel'), 'Manual');

// Cancelar uma fatura avulsa no console apaga a cobrança no Asaas.
await db.doc('companies/longe/invoices/av1').set({ kind: 'avulsa', title: 'Instalação', amount: 150, status: 'open', dueAt: T(3), createdAt: T(0), asaasPaymentId: 'pay_x' });
assert.equal((await call('/v1/financeiro/longe/faturas/av1/cancelar', await token('vetta@vetta.com'))).status, 200);
assert.equal((await db.doc('companies/longe/invoices/av1').get()).get('status'), 'canceled');
assert.ok(seen.some((s) => s.method === 'DELETE' && s.url === '/payments/pay_x'));

// Movimentos: os dois cancelamentos viraram churn; aumento de mensalidade vira expansão; tela removida.
await db.doc('companies/longe').update({ monthlyPrice: 149.9 });
await db.doc('companies/longe/screens/t1').delete();
await wait(1500);
ev = (await db.collection('mrrEvents').get()).docs.map((d) => d.data()).filter((e) => !e.backfill);
const types = ev.map((e) => `${e.cid}:${e.type}`).sort();
assert.deepEqual(types, ['longe:expansion', 'pedido:churn', 'velha:churn']);
lic = (await db.collection('licenseEvents').get()).docs.map((d) => d.data()).filter((e) => e.type === 'removed');
assert.deepEqual(lic.map((e) => e.screenName), ['Caixa']);

console.log('FINANCEIRO OK');
server.close(); fake.close();
process.exit(0);
