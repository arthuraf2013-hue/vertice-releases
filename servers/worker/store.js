// Loja do Vértice: cobrança automática pelo Asaas (Pix, boleto ou cartão, o cliente escolhe na fatura).
//
//   POST /v1/loja/{empresa}/comprar   (painel, com o login do admin da empresa) → cria o pedido e a cobrança
//   POST /v1/asaas/webhook            (Asaas, com o token do webhook)            → pagamento confirmado: aplica
//
// Pagou: renova a assinatura (meses), soma espaço ou registra o serviço. Na primeira mensalidade paga de
// quem veio por indicação, o padrinho ganha 12 meses. As contas puras ficam aqui e são testadas sem rede.
import http from 'node:http';
import crypto from 'node:crypto';

export const ASAAS_URL = { sandbox: 'https://api-sandbox.asaas.com/v3', production: 'https://api.asaas.com/v3' };
export const REFERRAL_REWARD_MONTHS = 12;
const DAY = 86_400_000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/* ---------- Contas (iguais às do pacote shared) ---------- */

export function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
}

/** Novo "pago até": N meses depois do vencimento atual (ou de hoje, se venceu há mais de um mês). */
export function nextPaidUntil(company, months = 1, now = Date.now()) {
  const current = toMillis(company?.paidUntil);
  const from = current && current > now - 31 * DAY ? current : now;
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d.getTime();
}

export function storePrice(item = {}, now = new Date()) {
  const promo = Number(item.promoPrice);
  const until = item.promoUntil ? new Date(`${item.promoUntil}T23:59:59`) : null;
  const onPromo = Number.isFinite(promo) && promo > 0 && promo < Number(item.price) && (!until || until >= now);
  return onPromo ? promo : Number(item.price) || 0;
}

/** O que muda na empresa quando o pedido é pago. */
export function storeEffect(item = {}, company = {}, now = Date.now()) {
  if (item.kind === 'months') {
    const months = Math.max(1, Math.min(36, Number(item.months) || 1));
    return { status: 'active', paidUntil: nextPaidUntil(company, months, now) };
  }
  if (item.kind === 'storage') return { storageQuotaMB: (Number(company.storageQuotaMB) || 0) + (Number(item.storageMB) || 0) };
  return {};
}

/** Mesmo código de indicação do painel (FNV-1a sobre "vertice:{id}"). */
function seedOf(text = '') {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function referralCode(companyId = '') {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = seedOf(`vertice:${companyId}`);
  let s = '';
  for (let i = 0; i < 6; i++) { s += abc[n % abc.length]; n = Math.floor(n / abc.length) || seedOf(`${s}${companyId}`); }
  return s;
}

/** CPF (11) ou CNPJ (14) só com números, ou null. Confere os dígitos verificadores. */
export function cleanDocument(v = '') {
  const d = String(v).replace(/\D/g, '');
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return null;
    const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]) ? d : null;
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return null;
    const calc = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]) ? d : null;
  }
  return null;
}

/** Evento do Asaas → situação do pedido (null = ignorar). */
export function orderStatusFor(event) {
  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') return 'paid';
  if (event === 'PAYMENT_OVERDUE') return 'expired';
  if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') return 'canceled';
  return null;
}

/** Vencimento da fatura: hoje + N dias, no formato do Asaas. */
export const dueDate = (days = 3, now = Date.now()) => new Date(now + days * DAY).toISOString().slice(0, 10);

/* ---------- Servidor ---------- */

/** Cliente da API do Asaas (chave e ambiente do .env). */
export function asaasClient(env = process.env) {
  const KEY = env.ASAAS_API_KEY || '';
  const BASE = env.ASAAS_URL || ASAAS_URL[env.ASAAS_ENV === 'production' ? 'production' : 'sandbox'];
  return async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { access_token: KEY, 'Content-Type': 'application/json', 'User-Agent': 'Vertice' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.errors?.[0]?.description || `Asaas respondeu ${r.status}`);
    return j;
  };
}

/** billingType do Asaas → texto do meio de pagamento. */
const METHOD = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito' };

export function startStore({ db, auth, FieldValue, Timestamp, log = console.log, env = process.env, asaas = asaasClient(env), finance = null }) {
  const KEY = env.ASAAS_API_KEY || '';
  const HOOK = env.ASAAS_WEBHOOK_TOKEN || '';
  const PORT = Number(env.STORE_PORT || 8788);
  const ORIGINS = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const readJson = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 64_000) { reject(new Error('grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

  async function catalog() {
    const snap = await db.doc('platform/store').get();
    return (snap.exists ? snap.data().items : null) || [];
  }

  async function checkout(req, res, cid) {
    if (!KEY) return send(res, 503, { error: 'A loja ainda não está ligada. Fale com a Vetta Sistemas.' });
    if (!ID.test(cid)) return send(res, 400, { error: 'Empresa inválida.' });
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return send(res, 401, { error: 'Faça login no painel.' });
    let uid;
    try { uid = (await auth.verifyIdToken(m[1])).uid; } catch { return send(res, 401, { error: 'Sessão expirada. Entre de novo.' }); }
    const member = await db.doc(`companies/${cid}/members/${uid}`).get();
    if (!['admin', 'owner'].includes(member.data()?.role)) return send(res, 403, { error: 'Só o administrador da empresa pode comprar.' });
    let input;
    try { input = await readJson(req); } catch { return send(res, 400, { error: 'Pedido inválido.' }); }
    const item = (await catalog()).find((it) => it.id === input.itemId && it.active !== false);
    if (!item) return send(res, 404, { error: 'Este item não está mais à venda.' });
    const value = Math.round(storePrice(item) * 100) / 100;
    if (!(value >= 5)) return send(res, 400, { error: 'Preço inválido.' });
    const doc = cleanDocument(input.cpfCnpj);
    if (!doc) return send(res, 400, { error: 'CPF ou CNPJ inválido.' });
    const name = String(input.name || '').trim().slice(0, 100);
    const email = String(input.email || '').trim().slice(0, 120);
    if (!name) return send(res, 400, { error: 'Informe o nome para a nota.' });

    const cRef = db.doc(`companies/${cid}`);
    const company = (await cRef.get()).data() || {};
    let customer = company.asaasCustomerId;
    try {
      if (!customer || company.asaasDocument !== doc) {
        const found = await asaas('GET', `/customers?cpfCnpj=${doc}`);
        customer = found?.data?.[0]?.id || (await asaas('POST', '/customers', { name, cpfCnpj: doc, email: email || undefined, externalReference: cid, notificationDisabled: false })).id;
        await cRef.update({ asaasCustomerId: customer, asaasDocument: doc });
      }
      const oRef = db.collection(`companies/${cid}/storeOrders`).doc();
      const pay = await asaas('POST', '/payments', {
        customer, billingType: 'UNDEFINED', value, dueDate: dueDate(3), description: `Vértice · ${item.name}`.slice(0, 500),
        externalReference: `${cid}/${oRef.id}`,
      });
      await oRef.set({
        itemId: item.id, item: { name: item.name, kind: item.kind, months: item.months || null, storageMB: item.storageMB || null }, value,
        status: 'pending', paymentId: pay.id, invoiceUrl: pay.invoiceUrl || null, byUid: uid, createdAt: FieldValue.serverTimestamp(),
      });
      log('loja', cid, item.id, value, pay.id);
      return send(res, 200, { orderId: oRef.id, invoiceUrl: pay.invoiceUrl });
    } catch (e) {
      log('loja-erro', cid, e.message);
      return send(res, 502, { error: `Não foi possível gerar a cobrança: ${e.message}` });
    }
  }

  /** Indicação: na primeira assinatura paga, o padrinho ganha meses (uma vez por empresa indicada). */
  async function rewardReferral(cid, company) {
    if (!company.referredBy || company.referralRewarded) return;
    const all = await db.collection('companies').select('paidUntil', 'referralRewards').get();
    const sponsor = all.docs.find((d) => d.id !== cid && referralCode(d.id) === company.referredBy);
    if (!sponsor) return;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(sponsor.ref)).data() || {};
      tx.update(sponsor.ref, { paidUntil: Timestamp.fromMillis(nextPaidUntil(s, REFERRAL_REWARD_MONTHS)), referralRewards: FieldValue.increment(1) });
      tx.update(db.doc(`companies/${cid}`), { referralRewarded: true });
    });
    log('indicacao', cid, '→', sponsor.id);
  }

  async function webhook(req, res) {
    const token = String(req.headers['asaas-access-token'] || '');
    const ok = HOOK && token.length === HOOK.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(HOOK));
    if (!ok) return send(res, 401, { error: 'token' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'json' }); }
    // Fatura do financeiro ("empresa/inv/fatura"): quem trata é finance.js.
    const ref = String(body.payment?.externalReference || '').split('/');
    if (ref.length === 3 && ref[1] === 'inv') {
      if (finance) await finance.onInvoiceEvent(body);
      return send(res, 200, { ok: true });
    }
    const status = orderStatusFor(body.event);
    const [cid, oid] = ref;
    if (!status || !ID.test(cid || '') || !ID.test(oid || '')) return send(res, 200, { ignored: true });
    const oRef = db.doc(`companies/${cid}/storeOrders/${oid}`);
    const cRef = db.doc(`companies/${cid}`);
    let applied = false;
    let company = null;
    await db.runTransaction(async (tx) => {
      const [o, c] = await Promise.all([tx.get(oRef), tx.get(cRef)]);
      if (!o.exists || o.data().status === 'paid') return;
      if (status !== 'paid') { tx.update(oRef, { status, updatedAt: FieldValue.serverTimestamp() }); return; }
      company = c.data() || {};
      const eff = storeEffect(o.data().item, company);
      const patch = { ...eff, ...(eff.paidUntil ? { paidUntil: Timestamp.fromMillis(eff.paidUntil) } : {}) };
      if (Object.keys(patch).length) tx.update(cRef, patch);
      tx.update(oRef, { status: 'paid', paidAt: FieldValue.serverTimestamp(), billingType: body.payment?.billingType || null });
      // Recebimento (aparece no financeiro da Vetta e no histórico do cliente).
      const it = o.data().item || {};
      tx.set(db.doc(`companies/${cid}/payments/loja-${oid}`), {
        amount: Number(o.data().value) || 0, months: it.kind === 'months' ? Number(it.months) || 1 : 0, method: METHOD[body.payment?.billingType] || 'Outro',
        channel: 'Asaas', kind: 'loja', title: it.name || 'Loja', orderId: oid, by: 'Loja',
        paidAt: FieldValue.serverTimestamp(), paidUntil: eff.paidUntil ? Timestamp.fromMillis(eff.paidUntil) : (company.paidUntil || null), createdAt: FieldValue.serverTimestamp(),
      });
      applied = o.data().item?.kind === 'months';
    });
    if (applied && company) await rewardReferral(cid, company).catch((e) => log('indicacao-erro', cid, e.message));
    log('asaas', body.event, cid, oid);
    return send(res, 200, { ok: true });
  }

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      const { pathname } = new URL(req.url, 'http://x');
      let m = /^\/v1\/loja\/([^/]+)\/comprar$/.exec(pathname);
      if (m && req.method === 'POST') return await checkout(req, res, m[1]);
      if (pathname === '/v1/asaas/webhook' && req.method === 'POST') return await webhook(req, res);
      if (pathname === '/v1/loja/saude') return send(res, 200, { ok: true, asaas: !!KEY, env: env.ASAAS_ENV || 'sandbox' });
      if (finance && pathname.startsWith('/v1/financeiro/') && await finance.route(req, res, pathname, { send, readJson })) return undefined;
      m = null;
      send(res, 404, { error: 'Não encontrado' });
    } catch (e) {
      log('loja-falha', e.message);
      if (!res.headersSent) send(res, 500, { error: 'Erro na loja.' });
    }
  });
  server.listen(PORT, '127.0.0.1', () => log(`Loja ouvindo em 127.0.0.1:${PORT} · Asaas ${KEY ? (env.ASAAS_ENV || 'sandbox') : 'desligado'}`));
  return server;
}
