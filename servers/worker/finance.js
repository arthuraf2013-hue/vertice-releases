// Financeiro do Vértice no servidor (Admin SDK):
//
//   - a cada hora: gera a fatura da mensalidade alguns dias antes do vencimento e a cobrança no Asaas
//     (Pix, boleto ou cartão, o cliente escolhe), tenta de novo as que falharam, cancela faturas que
//     outro pagamento já cobriu, cancela as contas sem pagamento há N dias (90 por padrão) e os
//     cancelamentos agendados;
//   - o tempo todo: registra cada mudança de MRR (mrrEvents) e cada tela pareada ou removida
//     (licenseEvents), comparando o Firestore com o último estado visto;
//   - Asaas confirmou: a fatura fica paga, entra um recebimento e a empresa renova (store.js chama aqui);
//   - console da Vetta: gerar a cobrança, cancelar e dar baixa numa fatura (/v1/financeiro/...).
//
// As contas puras ficam no topo e são testadas sem rede (finance.test.js).
import { toMillis, nextPaidUntil, cleanDocument } from './store.js';

const DAY = 86_400_000;
export const DEFAULTS = { invoiceDaysBefore: 10, cancelAfterDays: 90, maxSyncAttempts: 6 };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/* ---------- Contas (iguais às de packages/shared/src/finance.js) ---------- */

export function mrrOf(c = {}) {
  const price = Number(c.monthlyPrice) || 0;
  return c.status === 'active' && toMillis(c.paidUntil) && price > 0 ? round2(price) : 0;
}

export function mrrMovement(from, to, { everPaid = false } = {}) {
  const a = round2(from);
  const b = round2(to);
  if (a === b) return null;
  if (a <= 0) return { type: everPaid ? 'reactivation' : 'new', delta: b };
  if (b <= 0) return { type: 'churn', delta: -a };
  return { type: b > a ? 'expansion' : 'contraction', delta: round2(b - a) };
}

/** Data no fuso de Recife, AAAA-MM-DD. */
export const ymd = (ms, tz = 'America/Recife') => new Date(ms).toLocaleDateString('sv-SE', { timeZone: tz });

/** Uma fatura por ciclo: o id é o vencimento (evita fatura dobrada se o serviço rodar duas vezes). */
export const cycleInvoiceId = (paidUntil, tz) => `m-${ymd(paidUntil, tz).replace(/-/g, '')}`;

/** Esta empresa precisa da fatura do próximo ciclo agora? */
export function needsCycleInvoice(c = {}, now = Date.now(), daysBefore = DEFAULTS.invoiceDaysBefore) {
  const due = toMillis(c.paidUntil);
  if (!due || mrrOf(c) <= 0 || toMillis(c.cancelAt) || c.autoInvoice === false) return false;
  return due - now <= daysBefore * DAY && due > now - 31 * DAY;
}

/** Fatura do próximo ciclo (o período vai do vencimento atual ao seguinte). */
export function cycleInvoice(c = {}, now = Date.now(), plans = {}) {
  const due = toMillis(c.paidUntil);
  const screens = Number(c.screenLimit) || 0;
  const plan = plans[c.plan]?.name || c.plan || '';
  const end = nextPaidUntil({ paidUntil: due }, 1, due);
  return {
    kind: 'mensalidade', status: 'open', createdBy: 'auto', months: 1,
    title: `Mensalidade · ${screens === 1 ? '1 tela' : `${screens} telas`}`,
    description: `Vértice${plan ? ` ${plan}` : ''} · ${new Date(due).toLocaleDateString('pt-BR')} a ${new Date(end).toLocaleDateString('pt-BR')}`,
    amount: round2(c.monthlyPrice), dueAt: due, periodStart: due, periodEnd: end, createdAt: now,
  };
}

/** Quando a conta é cancelada sozinha (null = não cancela). */
export function autoCancelAt(c = {}, cancelAfterDays = DEFAULTS.cancelAfterDays) {
  const due = toMillis(c.paidUntil);
  if (c.status !== 'active' || !due || mrrOf(c) <= 0 || !(cancelAfterDays > 0)) return null;
  const at = due + cancelAfterDays * DAY;
  const hold = toMillis(c.cancelHoldUntil);
  return hold && hold > at ? hold : at;
}

/** Evento do Asaas → situação da fatura (null = ignorar). */
export function invoiceStatusFor(event) {
  if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH'].includes(event)) return 'paid';
  if (event === 'PAYMENT_OVERDUE') return 'overdue';
  if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') return 'canceled';
  return null;
}

/** billingType do Asaas → texto do meio. */
export function methodName(billingType) {
  return { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito', UNDEFINED: 'Outro' }[billingType] || billingType || 'Outro';
}

/** O que muda quando uma fatura é paga: a fatura, o recebimento e a empresa. */
export function invoicePaidEffect(inv = {}, company = {}, { now = Date.now(), method = 'Outro', channel = 'Asaas' } = {}) {
  const months = Math.max(0, Math.min(36, Number(inv.months) || 0));
  const patch = {};
  if (months) {
    patch.paidUntil = nextPaidUntil(company, months, now);
    if (company.status !== 'active') patch.status = 'active';
  }
  return {
    invoice: { status: 'paid', paidAt: now, method, channel },
    payment: {
      amount: round2(inv.amount), months, method, channel, title: inv.title || 'Fatura', kind: inv.kind || 'avulsa',
      paidAt: now, paidUntil: patch.paidUntil || toMillis(company.paidUntil) || null, by: channel === 'Asaas' ? 'Asaas' : 'Vetta Sistemas',
    },
    company: patch,
  };
}

/** Compara o MRR de agora com o último visto e devolve os eventos a gravar. */
export function diffMrr(companies, state = {}, now = Date.now()) {
  const seen = state.mrr || {};
  const ever = { ...(state.everPaid || {}) };
  const events = [];
  const next = {};
  for (const c of companies) {
    const to = mrrOf(c);
    const from = seen[c.id] ?? 0;
    next[c.id] = to;
    const mv = mrrMovement(from, to, { everPaid: !!ever[c.id] });
    if (mv) events.push({ cid: c.id, name: c.name || c.id, ...mv, from: round2(from), to, screens: Number(c.screenLimit) || 0, plan: c.plan || null, at: now });
    if (to > 0) ever[c.id] = true;
  }
  // Empresa apagada que pagava: conta como cancelamento.
  for (const [cid, from] of Object.entries(seen)) {
    if (cid in next || !(from > 0)) continue;
    events.push({ cid, name: cid, type: 'churn', delta: -round2(from), from: round2(from), to: 0, screens: 0, at: now });
  }
  return { events, state: { mrr: next, everPaid: ever } };
}

/** Telas novas e removidas desde o último estado visto. */
export function diffScreens(screens, seen = {}, now = Date.now()) {
  const events = [];
  const next = {};
  for (const s of screens) {
    next[s.path] = { cid: s.cid, name: s.name || s.id };
    if (!seen[s.path]) events.push({ cid: s.cid, screenId: s.id, screenName: s.name || s.id, type: 'activated', at: s.pairedAt || now });
  }
  for (const [p, info] of Object.entries(seen)) {
    if (!next[p]) events.push({ cid: info.cid, screenId: p.split('/').pop(), screenName: info.name, type: 'removed', at: now });
  }
  return { events, state: next };
}

/* ---------- Servidor ---------- */

export function startFinance({ db, auth, FieldValue, Timestamp, log = console.log, env = process.env, asaas, tz = 'America/Recife', plans = {}, notify }) {
  const KEY = env.ASAAS_API_KEY || '';
  const ts = (ms) => (ms == null ? null : Timestamp.fromMillis(ms));
  const settings = async () => ({ ...DEFAULTS, ...((await db.doc('platform/settings').get()).data() || {}) });

  /* ----- Cobrança no Asaas ----- */

  async function ensureCustomer(cid, company) {
    if (company.asaasCustomerId) return company.asaasCustomerId;
    const doc = cleanDocument(company.cpfCnpj || company.cnpj || company.asaasDocument || '');
    if (!doc) throw new Error('Cadastre o CPF ou CNPJ do cliente para cobrar pelo Asaas.');
    const found = await asaas('GET', `/customers?cpfCnpj=${doc}`);
    const id = found?.data?.[0]?.id || (await asaas('POST', '/customers', {
      name: company.legalName || company.name, cpfCnpj: doc, email: company.ownerEmail || undefined,
      mobilePhone: company.phone || undefined, externalReference: cid, notificationDisabled: false,
    })).id;
    await db.doc(`companies/${cid}`).update({ asaasCustomerId: id, asaasDocument: doc });
    return id;
  }

  /** Cria (ou recria) a cobrança da fatura no Asaas. Falhou: guarda o motivo na fatura. */
  async function chargeInvoice(cid, iid) {
    const ref = db.doc(`companies/${cid}/invoices/${iid}`);
    const [inv, comp] = await Promise.all([ref.get(), db.doc(`companies/${cid}`).get()]);
    if (!inv.exists) throw new Error('Fatura não encontrada.');
    const i = inv.data();
    if (i.status !== 'open') throw new Error('Só dá para cobrar uma fatura em aberto.');
    if (i.asaasPaymentId) return { invoiceUrl: i.invoiceUrl };
    if (!KEY) throw new Error('O Asaas não está ligado no servidor.');
    try {
      const customer = await ensureCustomer(cid, comp.data() || {});
      const due = Math.max(toMillis(i.dueAt) || 0, Date.now() + DAY);
      const pay = await asaas('POST', '/payments', {
        customer, billingType: 'UNDEFINED', value: round2(i.amount), dueDate: ymd(due, tz),
        description: `${i.title}${i.description ? ` · ${i.description}` : ''}`.slice(0, 500), externalReference: `${cid}/inv/${iid}`,
      });
      await ref.update({
        asaasPaymentId: pay.id, invoiceUrl: pay.invoiceUrl || null, bankSlipUrl: pay.bankSlipUrl || null,
        syncedAt: FieldValue.serverTimestamp(), syncError: FieldValue.delete(),
      });
      log('fatura-cobrada', cid, iid, pay.id);
      return { invoiceUrl: pay.invoiceUrl };
    } catch (e) {
      await ref.update({ syncError: { message: e.message, at: Timestamp.now(), attempts: (i.syncError?.attempts || 0) + 1 } });
      log('fatura-erro', cid, iid, e.message);
      throw e;
    }
  }

  async function cancelInvoice(cid, iid, reason = 'console') {
    const ref = db.doc(`companies/${cid}/invoices/${iid}`);
    const i = (await ref.get()).data();
    if (!i) throw new Error('Fatura não encontrada.');
    if (i.status !== 'open') return;
    if (i.asaasPaymentId && KEY) {
      try { await asaas('DELETE', `/payments/${i.asaasPaymentId}`); } catch (e) { log('fatura-cancelar-asaas', cid, iid, e.message); }
    }
    await ref.update({ status: 'canceled', canceledAt: FieldValue.serverTimestamp(), cancelReason: reason });
  }

  /** Aplica o pagamento de uma fatura (webhook do Asaas ou baixa no console). Idempotente. */
  async function applyInvoicePaid(cid, iid, { method = 'Outro', channel = 'Asaas', paidAt = Date.now() } = {}) {
    const ref = db.doc(`companies/${cid}/invoices/${iid}`);
    const cRef = db.doc(`companies/${cid}`);
    let done = false;
    await db.runTransaction(async (tx) => {
      const [inv, c] = await Promise.all([tx.get(ref), tx.get(cRef)]);
      if (!inv.exists || inv.data().status === 'paid') return;
      const eff = invoicePaidEffect(inv.data(), c.data() || {}, { now: paidAt, method, channel });
      tx.update(ref, { ...eff.invoice, paidAt: ts(paidAt), syncError: FieldValue.delete() });
      tx.set(db.doc(`companies/${cid}/payments/inv-${iid}`), {
        ...eff.payment, paidAt: ts(paidAt), paidUntil: ts(eff.payment.paidUntil), invoiceId: iid, createdAt: FieldValue.serverTimestamp(),
      });
      if (Object.keys(eff.company).length) tx.update(cRef, { ...eff.company, ...(eff.company.paidUntil ? { paidUntil: ts(eff.company.paidUntil) } : {}) });
      done = true;
    });
    if (done) log('fatura-paga', cid, iid, method);
    return done;
  }

  /** Webhook do Asaas com externalReference "empresa/inv/fatura" (chamado por store.js). */
  async function onInvoiceEvent(body) {
    const [cid, , iid] = String(body.payment?.externalReference || '').split('/');
    if (!ID.test(cid || '') || !ID.test(iid || '')) return false;
    const status = invoiceStatusFor(body.event);
    if (!status) return true;
    const ref = db.doc(`companies/${cid}/invoices/${iid}`);
    if (status === 'paid') {
      const at = toMillis(body.payment?.clientPaymentDate || body.payment?.paymentDate) || Date.now();
      await applyInvoicePaid(cid, iid, { method: methodName(body.payment?.billingType), channel: 'Asaas', paidAt: Math.min(at + 12 * 3600_000, Date.now()) });
    } else if (status === 'overdue') {
      await ref.update({ asaasStatus: 'OVERDUE', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
    } else {
      const snap = await ref.get();
      if (snap.exists && snap.data().status === 'open') await ref.update({ status: 'canceled', canceledAt: FieldValue.serverTimestamp(), cancelReason: body.event === 'PAYMENT_REFUNDED' ? 'estorno' : 'apagada no Asaas' });
    }
    return true;
  }

  /* ----- Tarefa de hora em hora ----- */

  async function cancelCompany(doc, reason) {
    const c = doc.data();
    await doc.ref.update({ status: 'canceled', canceledAt: FieldValue.serverTimestamp(), cancelReason: reason, cancelAt: FieldValue.delete() });
    const open = await doc.ref.collection('invoices').where('status', '==', 'open').get();
    for (const i of open.docs) await cancelInvoice(doc.id, i.id, 'conta cancelada').catch(() => {});
    log('conta-cancelada', doc.id, reason);
    if (notify) {
      await notify(doc.id, c, {
        subject: `Vértice: assinatura de ${c.name} cancelada`,
        text: reason === 'pedido'
          ? 'O cancelamento que você pediu foi concluído. As telas param de exibir na próxima conexão. Para voltar, é só falar com a Vetta Sistemas.'
          : 'A assinatura foi cancelada porque a mensalidade ficou muito tempo sem pagamento. Para reativar, pague a fatura em aberto ou fale com a Vetta Sistemas.',
      }).catch((e) => log('aviso-cancelamento', doc.id, e.message));
    }
  }

  async function runInvoices(now = Date.now()) {
    const s = await settings();
    const companies = await db.collection('companies').get();
    for (const doc of companies.docs) {
      const c = doc.data();
      const cid = doc.id;
      // Cancelamento pedido pelo cliente (agendado no console).
      if (c.status !== 'canceled' && toMillis(c.cancelAt) && toMillis(c.cancelAt) <= now) { await cancelCompany(doc, 'pedido'); continue; }
      // Cancelamento automático por falta de pagamento.
      const auto = autoCancelAt(c, Number(s.cancelAfterDays));
      if (auto && auto <= now) { await cancelCompany(doc, 'inadimplencia'); continue; }
      // Fatura que outro pagamento (Loja, baixa à mão) já cobriu: cancela para não cobrar duas vezes.
      const paidUntil = toMillis(c.paidUntil);
      const open = await doc.ref.collection('invoices').where('status', '==', 'open').get();
      for (const i of open.docs) {
        const d = i.data();
        if (d.kind === 'mensalidade' && toMillis(d.periodStart) && paidUntil && toMillis(d.periodStart) < paidUntil - DAY) {
          await cancelInvoice(cid, i.id, 'coberta por outro pagamento').catch((e) => log('fatura-coberta', cid, i.id, e.message));
        }
      }
      // Fatura do próximo ciclo.
      if (s.autoInvoice !== false && needsCycleInvoice(c, now, Number(s.invoiceDaysBefore))) {
        const iid = cycleInvoiceId(paidUntil, tz);
        const ref = doc.ref.collection('invoices').doc(iid);
        const created = await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return false;
          const inv = cycleInvoice(c, now, plans);
          tx.set(ref, { ...inv, dueAt: ts(inv.dueAt), periodStart: ts(inv.periodStart), periodEnd: ts(inv.periodEnd), createdAt: FieldValue.serverTimestamp() });
          return true;
        });
        if (created) {
          log('fatura-gerada', cid, iid);
          if (KEY) await chargeInvoice(cid, iid).catch(() => {});
        }
      }
    }
    // De novo as cobranças que falharam (até N tentativas, uma por hora).
    if (KEY) {
      const failed = await db.collectionGroup('invoices').where('status', '==', 'open').get();
      for (const i of failed.docs) {
        const d = i.data();
        if (d.asaasPaymentId || !d.syncError || (d.syncError.attempts || 0) >= DEFAULTS.maxSyncAttempts) continue;
        await chargeInvoice(i.ref.parent.parent.id, i.id).catch(() => {});
      }
    }
  }

  /* ----- Movimentos de MRR e de telas (ouvindo o Firestore) ----- */

  const stateRef = db.doc('workerState/finance');
  let mrrState = null;
  let screenState = null;
  let saving = Promise.resolve();
  const save = (patch) => { saving = saving.then(() => stateRef.set(patch, { merge: true })).catch((e) => log('estado-financeiro', e.message)); };

  async function watch() {
    const snap = await stateRef.get();
    mrrState = snap.get('mrrState') || null;
    screenState = snap.get('screens') || null;

    db.collection('companies').onSnapshot(async (q) => {
      const companies = q.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!mrrState) {
        // Primeira vez: a base que já paga entra como "novo cliente" na data em que a empresa foi criada.
        const { state } = diffMrr(companies, {});
        const batch = db.batch();
        for (const c of companies) {
          const v = mrrOf(c);
          if (v > 0) batch.set(db.collection('mrrEvents').doc(), { cid: c.id, name: c.name || c.id, type: 'new', delta: v, from: 0, to: v, screens: Number(c.screenLimit) || 0, plan: c.plan || null, at: ts(toMillis(c.paidSince) || toMillis(c.createdAt) || Date.now()), backfill: true });
        }
        await batch.commit();
        mrrState = state;
        save({ mrrState });
        log('mrr', 'histórico iniciado com', Object.values(state.mrr).filter((v) => v > 0).length, 'contas pagantes');
        return;
      }
      const { events, state } = diffMrr(companies, mrrState);
      mrrState = state;
      if (!events.length) return;
      const batch = db.batch();
      for (const e of events) batch.set(db.collection('mrrEvents').doc(), { ...e, at: ts(e.at) });
      await batch.commit();
      save({ mrrState });
      for (const e of events) log('mrr', e.type, e.cid, e.delta);
    }, (e) => log('mrr-escuta', e.message));

    db.collectionGroup('screens').onSnapshot(async (q) => {
      const screens = q.docs.map((d) => ({ id: d.id, path: d.ref.path, cid: d.ref.parent.parent.id, name: d.get('name'), pairedAt: toMillis(d.get('pairedAt')) || toMillis(d.get('createdAt')) }));
      const { events, state } = diffScreens(screens, screenState || {});
      const initial = !screenState;
      screenState = state;
      if (events.length) {
        // Na primeira vez, as telas que já existem entram com a data em que foram pareadas.
        for (let i = 0; i < events.length; i += 400) {
          const batch = db.batch();
          for (const e of events.slice(i, i + 400)) batch.set(db.collection('licenseEvents').doc(), { ...e, at: ts(e.at || Date.now()), ...(initial ? { backfill: true } : {}) });
          await batch.commit();
        }
      }
      save({ screens: screenState });
    }, (e) => log('telas-escuta', e.message));
  }

  /* ----- Rotas do console (/v1/financeiro/...) ----- */

  async function isVetta(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return false;
    try {
      const { uid } = await auth.verifyIdToken(m[1]);
      return (await db.doc(`platformAdmins/${uid}`).get()).exists;
    } catch { return false; }
  }

  async function route(req, res, pathname, { send, readJson }) {
    if (pathname === '/v1/financeiro/saude') return send(res, 200, { ok: true, asaas: !!KEY }), true;
    const m = /^\/v1\/financeiro\/([^/]+)\/faturas\/([^/]+)\/(cobrar|cancelar|baixa)$/.exec(pathname);
    if (!m || req.method !== 'POST') return false;
    const [, cid, iid, action] = m;
    if (!ID.test(cid) || !ID.test(iid)) return send(res, 400, { error: 'Fatura inválida.' }), true;
    if (!(await isVetta(req))) return send(res, 403, { error: 'Só a Vetta Sistemas pode fazer isso.' }), true;
    try {
      if (action === 'cobrar') return send(res, 200, await chargeInvoice(cid, iid)), true;
      if (action === 'cancelar') { await cancelInvoice(cid, iid, 'console'); return send(res, 200, { ok: true }), true; }
      const body = await readJson(req).catch(() => ({}));
      const inv = (await db.doc(`companies/${cid}/invoices/${iid}`).get()).data();
      if (!inv) return send(res, 404, { error: 'Fatura não encontrada.' }), true;
      const paidAt = toMillis(body.paidAt) || Date.now();
      // Baixa no console de uma fatura que tem cobrança no Asaas: avisa o Asaas para não cobrar de novo.
      if (inv.asaasPaymentId && KEY) {
        await asaas('POST', `/payments/${inv.asaasPaymentId}/receiveInCash`, { paymentDate: ymd(paidAt, tz), value: round2(inv.amount), notifyCustomer: false });
      }
      await applyInvoicePaid(cid, iid, { method: String(body.method || 'Outro').slice(0, 40), channel: 'Manual', paidAt });
      return send(res, 200, { ok: true }), true;
    } catch (e) {
      return send(res, 502, { error: e.message }), true;
    }
  }

  return { runInvoices, watch, route, onInvoiceEvent, chargeInvoice, cancelInvoice, applyInvoicePaid };
}
