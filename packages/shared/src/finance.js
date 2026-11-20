// Financeiro da plataforma (console da Vetta): MRR, retenção, caixa, cobrança e licenças (telas).
//
// Tudo é calculado a partir de:
//   companies              plano, mensalidade, situação, "pago até", cancelamento agendado
//   companies/*/invoices   faturas (mensalidade gerada pelo servidor, avulsa ou do console)
//   companies/*/payments   recebimentos (Asaas, Loja ou registrados à mão)
//   companies/*/storeOrders pedidos da Loja (viram faturas e recebimentos na leitura)
//   mrrEvents              cada mudança de MRR de uma empresa (escrito pelo servidor)
//   licenseEvents          telas pareadas e removidas (escrito pelo servidor)
// As funções são puras: recebem listas e "agora", devolvem números. Testadas em finance.test.js.
import { toMillis, licenseState } from './license.js';

const DAY = 86_400_000;
export const DEFAULT_CANCEL_AFTER_DAYS = 90;
export const DEFAULT_INVOICE_DAYS_BEFORE = 10;
/** "Perto do cancelamento": faltam até estes dias para o cancelamento automático. */
export const NEAR_CANCEL_DAYS = 15;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (list, f = (x) => x) => round2(list.reduce((a, x) => a + (Number(f(x)) || 0), 0));
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ---------- Meios de pagamento ---------- */

export const PAYMENT_METHODS = [
  { key: 'pix', label: 'Pix', color: 'var(--series-1)' },
  { key: 'boleto', label: 'Boleto', color: 'var(--series-2)' },
  { key: 'cartao', label: 'Cartão de crédito', color: 'var(--series-3)' },
  { key: 'outro', label: 'Outro', color: 'var(--series-4)' },
];
/** Texto livre ("Pix", "PIX", "BOLETO", "CREDIT_CARD", "Cartão"…) → chave do meio. */
export function methodKey(m = '') {
  const s = String(m).toLowerCase();
  if (s.includes('pix')) return 'pix';
  if (s.includes('boleto') || s === 'bank_slip') return 'boleto';
  if (s.includes('cart') || s.includes('credit') || s.includes('debit')) return 'cartao';
  return 'outro';
}
export const methodLabel = (m) => PAYMENT_METHODS.find((x) => x.key === methodKey(m))?.label || 'Outro';

/* ---------- Contas ---------- */

/** MRR contratado da empresa: mensalidade de quem está ativo e paga (cortesia e teste valem zero). */
export function mrrOf(c = {}) {
  const price = Number(c.monthlyPrice) || 0;
  return c.status === 'active' && toMillis(c.paidUntil) && price > 0 ? round2(price) : 0;
}

/** Tipo da conta: pagante, teste, cortesia, pausada (suspensa à mão) ou cancelada. */
export function accountKind(c = {}) {
  if (c.status === 'canceled') return 'canceled';
  if (c.status === 'trial') return 'trial';
  if (c.status === 'suspended') return 'paused';
  return mrrOf(c) > 0 ? 'paying' : 'courtesy';
}

/**
 * Situação de cobrança da empresa.
 * stage: canceled | scheduled (cancelamento pedido) | near (perto do cancelamento automático)
 *        | suspended (bloqueada por falta de pagamento) | overdue (vencida, ainda na tolerância) | ok
 */
export function collectionState(c = {}, now = Date.now(), settings = {}) {
  const cancelAfter = Number(settings.cancelAfterDays ?? DEFAULT_CANCEL_AFTER_DAYS);
  const paidUntil = toMillis(c.paidUntil);
  const cancelAt = toMillis(c.cancelAt);
  const lic = licenseState(c, now);
  const daysUnpaid = paidUntil && paidUntil < now ? Math.floor((now - paidUntil) / DAY) : 0;
  const hold = toMillis(c.cancelHoldUntil);
  let autoCancelAt = paidUntil && c.status === 'active' && mrrOf(c) > 0 && cancelAfter > 0 ? paidUntil + cancelAfter * DAY : null;
  if (autoCancelAt && hold && hold > autoCancelAt) autoCancelAt = hold;
  const daysToCancel = autoCancelAt ? Math.ceil((autoCancelAt - now) / DAY) : null;
  let stage = 'ok';
  if (c.status === 'canceled') stage = 'canceled';
  else if (cancelAt) stage = 'scheduled';
  else if (daysUnpaid > 0 && autoCancelAt && daysToCancel <= NEAR_CANCEL_DAYS) stage = 'near';
  else if (daysUnpaid > 0 && lic.blocked) stage = 'suspended';
  else if (daysUnpaid > 0) stage = 'overdue';
  return { stage, daysUnpaid, autoCancelAt, daysToCancel, cancelAt, blocked: lic.blocked };
}
export const COLLECTION_LABEL = {
  ok: 'Em dia', overdue: 'Vencida', suspended: 'Suspensa', near: 'Perto do cancelamento',
  scheduled: 'Cancelamento agendado', canceled: 'Cancelada',
};

/* ---------- Faturas e recebimentos ---------- */

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Situação de uma fatura: paid | canceled | overdue | open, com dias de atraso. */
export function invoiceState(inv = {}, now = Date.now()) {
  const due = toMillis(inv.dueAt);
  if (inv.status === 'paid') return { key: 'paid', daysLate: 0 };
  if (inv.status === 'canceled') return { key: 'canceled', daysLate: 0 };
  if (due && due < startOfDay(now)) return { key: 'overdue', daysLate: Math.floor((startOfDay(now) - startOfDay(due)) / DAY) };
  return { key: 'open', daysLate: 0, daysToDue: due ? Math.round((startOfDay(due) - startOfDay(now)) / DAY) : null };
}
export const INVOICE_KIND_LABEL = { mensalidade: 'Mensalidade', contratacao: 'Contratação', loja: 'Loja', avulsa: 'Avulsa' };

/** Pedido da Loja visto como fatura (o cliente gera a cobrança na Loja; vence em 3 dias). */
export function orderAsInvoice(o = {}, cid) {
  const created = toMillis(o.createdAt);
  const status = o.status === 'paid' ? 'paid' : o.status === 'canceled' ? 'canceled' : 'open';
  return {
    id: `loja-${o.id}`, cid, kind: 'loja', title: o.item?.name || 'Pedido da Loja', amount: Number(o.value) || 0,
    dueAt: created ? created + 3 * DAY : null, createdAt: created, status, paidAt: toMillis(o.paidAt),
    method: o.billingType || null, channel: 'Asaas', invoiceUrl: o.invoiceUrl || null, orderId: o.id,
  };
}

/** Recebimentos de todas as fontes, sem repetir pedido da Loja que já virou pagamento. */
export function receipts({ payments = [], orders = [] } = {}) {
  const fromOrders = new Set(payments.map((p) => p.orderId).filter(Boolean));
  const list = payments.map((p) => ({
    id: p.id, cid: p.cid, at: toMillis(p.paidAt), amount: Number(p.amount) || 0, method: methodKey(p.method),
    channel: p.channel || (p.by === 'Vetta Sistemas' ? 'Manual' : p.by || 'Manual'),
    title: p.title || (p.months ? `Mensalidade · ${p.months === 1 ? '1 mês' : `${p.months} meses`}` : 'Pagamento'),
    kind: p.kind || 'mensalidade', invoiceId: p.invoiceId || null,
  }));
  for (const o of orders) {
    if (o.status !== 'paid' || fromOrders.has(o.id)) continue;
    list.push({ id: `loja-${o.id}`, cid: o.cid, at: toMillis(o.paidAt) || toMillis(o.createdAt), amount: Number(o.value) || 0, method: methodKey(o.billingType), channel: 'Asaas', title: o.item?.name || 'Loja', kind: 'loja' });
  }
  return list.filter((r) => r.at).sort((a, b) => b.at - a.at);
}

/** Divisão por meio de pagamento, com valor, quantidade e fatia (0–1). */
export function methodSplit(list = []) {
  const total = sum(list, (r) => r.amount);
  return PAYMENT_METHODS.map((m) => {
    const rows = list.filter((r) => r.method === m.key);
    const amount = sum(rows, (r) => r.amount);
    return { ...m, amount, count: rows.length, share: total ? amount / total : 0 };
  });
}

/* ---------- Tempo ---------- */

/** Os últimos N meses (o atual por último), com início e fim. */
export function lastMonths(n = 12, now = Date.now()) {
  const out = [];
  const d = new Date(now);
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime() - 1;
    const m = new Date(start).getMonth();
    out.push({ start, end: Math.min(end, now), label: MONTHS_PT[m], current: i === 0, key: `${new Date(start).getFullYear()}-${String(m + 1).padStart(2, '0')}` });
  }
  return out;
}
export const monthLabel = (ms) => MONTHS_PT[new Date(ms).getMonth()];

/* ---------- MRR ---------- */

/** Tipo de uma mudança de MRR (o servidor usa a mesma regra ao gravar mrrEvents). */
export function mrrMovement(from, to, { everPaid = false } = {}) {
  const a = round2(from);
  const b = round2(to);
  if (a === b) return null;
  if (a <= 0) return { type: everPaid ? 'reactivation' : 'new', delta: b };
  if (b <= 0) return { type: 'churn', delta: -a };
  return { type: b > a ? 'expansion' : 'contraction', delta: round2(b - a) };
}
export const MOVEMENT_LABEL = {
  new: 'Novo cliente', reactivation: 'Reativação', expansion: 'Expansão', contraction: 'Contração', churn: 'Cancelamento',
};

const evAt = (e) => toMillis(e.at);

/** MRR em cada instante, voltando a partir do MRR de hoje e desfazendo os eventos posteriores. */
export function mrrAt(currentMrr, events, t) {
  return round2(currentMrr - sum(events.filter((e) => evAt(e) > t), (e) => e.delta));
}
/** Contas pagantes em cada instante (mesma ideia, pela passagem de 0 para >0 e de volta). */
export function payingAt(currentCount, events, t) {
  let n = currentCount;
  for (const e of events) {
    if (evAt(e) <= t) continue;
    if ((e.from || 0) <= 0 && (e.to || 0) > 0) n -= 1;
    if ((e.from || 0) > 0 && (e.to || 0) <= 0) n += 1;
  }
  return n;
}

/** Soma dos movimentos num período. */
export function movementsIn(events, from, to) {
  const inRange = events.filter((e) => { const t = evAt(e); return t >= from && t <= to; });
  const of = (type) => inRange.filter((e) => e.type === type);
  const r = {
    newMrr: sum(of('new'), (e) => e.delta), newCount: of('new').length,
    reactivation: sum(of('reactivation'), (e) => e.delta), reactivationCount: of('reactivation').length,
    expansion: sum(of('expansion'), (e) => e.delta),
    contraction: -sum(of('contraction'), (e) => e.delta),
    churn: -sum(of('churn'), (e) => e.delta), churnCount: of('churn').length,
  };
  r.in = round2(r.newMrr + r.reactivation + r.expansion);
  r.out = round2(r.contraction + r.churn);
  r.net = round2(r.in - r.out);
  return r;
}

/**
 * Painel de receita recorrente e retenção.
 * Retenção usa os 3 últimos meses fechados; NRR/GRR usam 12 meses e pedem histórico desse tamanho.
 */
export function recurringMetrics({ companies = [], events = [], now = Date.now() }) {
  const mrr = sum(companies, mrrOf);
  const kinds = companies.map(accountKind);
  const paying = kinds.filter((k) => k === 'paying').length;
  const months = lastMonths(13, now);
  const current = months[months.length - 1];
  const prev = months[months.length - 2];
  const thisMonth = movementsIn(events, current.start, now);
  const prevMrr = mrrAt(mrr, events, prev.end);

  // Três meses fechados: churn de contas e de receita, e quick ratio.
  const closed = months.slice(-4, -1);
  let accChurn = 0; let revChurn = 0; let n = 0; let qIn = 0; let qOut = 0;
  for (const m of closed) {
    const startMrr = mrrAt(mrr, events, m.start - 1);
    const startCount = payingAt(paying, events, m.start - 1);
    const mv = movementsIn(events, m.start, m.end);
    qIn += mv.in; qOut += mv.out;
    if (startCount > 0 && startMrr > 0) { accChurn += mv.churnCount / startCount; revChurn += mv.out / startMrr; n += 1; }
  }
  const churnAccounts = n ? accChurn / n : null;
  const churnRevenue = n ? revChurn / n : null;
  const quickRatio = qOut > 0 ? qIn / qOut : qIn > 0 ? Infinity : null;

  // NRR e GRR em 12 meses, só das contas que já pagavam no começo da janela.
  const windowStart = months[0].start - 1;
  const firstEvent = events.length ? Math.min(...events.map(evAt).filter(Boolean)) : null;
  let nrr = null; let grr = null;
  if (firstEvent && firstEvent <= windowStart) {
    const byCid = new Map();
    for (const c of companies) byCid.set(c.id, mrrOf(c));
    const startOf = (cid) => mrrAt(byCid.get(cid) || 0, events.filter((e) => e.cid === cid), windowStart);
    const cids = [...new Set([...byCid.keys(), ...events.map((e) => e.cid)])].filter((cid) => startOf(cid) > 0);
    const base = sum(cids, startOf);
    if (base > 0) {
      const after = events.filter((e) => cids.includes(e.cid) && evAt(e) > windowStart);
      const exp = sum(after.filter((e) => e.delta > 0), (e) => e.delta);
      const loss = -sum(after.filter((e) => e.delta < 0), (e) => e.delta);
      nrr = (base + exp - loss) / base;
      grr = Math.max(0, base - loss) / base;
    }
  }

  const arpa = paying ? mrr / paying : 0;
  return {
    mrr, arr: round2(mrr * 12), prevMrr, growth: prevMrr > 0 ? (mrr - prevMrr) / prevMrr : null,
    thisMonth, quickRatio, churnAccounts, churnRevenue, nrr, grr,
    paying, trial: kinds.filter((k) => k === 'trial').length, courtesy: kinds.filter((k) => k === 'courtesy').length,
    paused: kinds.filter((k) => k === 'paused').length, canceled: kinds.filter((k) => k === 'canceled').length,
    arpa: round2(arpa), ltv: churnAccounts > 0 ? round2(arpa / churnAccounts) : null,
  };
}

/** MRR no fim de cada um dos últimos N meses (o atual vale hoje). */
export function mrrByMonth({ companies = [], events = [], now = Date.now(), months = 12 }) {
  const mrr = sum(companies, mrrOf);
  return lastMonths(months, now).map((m) => ({ ...m, value: m.current ? mrr : mrrAt(mrr, events, m.end) }));
}

/** MRR dia a dia (fim de cada dia) e o recebido no dia, nos últimos N dias. */
export function mrrByDay({ companies = [], events = [], receipts: rec = [], now = Date.now(), days = 90 }) {
  const mrr = sum(companies, mrrOf);
  const today = startOfDay(now);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = today - i * DAY;
    const end = i === 0 ? now : start + DAY - 1;
    out.push({ start, end, value: i === 0 ? mrr : mrrAt(mrr, events, end), received: sum(rec.filter((r) => r.at >= start && r.at <= end), (r) => r.amount) });
  }
  return out;
}

/* ---------- Caixa e cobrança ---------- */

/** Números de caixa: faturado, recebido, previsão, vencido, inadimplência e prazo médio. */
export function cashMetrics({ invoices = [], receipts: rec = [], now = Date.now() }) {
  const n = new Date(now);
  const monthStart = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  const nextMonth = new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime();
  const live = invoices.filter((i) => i.status !== 'canceled');
  const billed = live.filter((i) => { const d = toMillis(i.dueAt); return d >= monthStart && d < nextMonth; });
  const billedTotal = sum(billed, (i) => i.amount);
  const billedPaid = sum(billed.filter((i) => i.status === 'paid'), (i) => i.amount);
  const received = sum(rec.filter((r) => r.at >= monthStart && r.at <= now), (r) => r.amount);
  const states = live.map((i) => ({ i, s: invoiceState(i, now) }));
  const open = states.filter((x) => x.s.key === 'open');
  const overdue = states.filter((x) => x.s.key === 'overdue');
  const in30 = open.filter((x) => toMillis(x.i.dueAt) <= now + 30 * DAY);
  const in7 = open.filter((x) => toMillis(x.i.dueAt) <= now + 7 * DAY);
  const last90 = live.filter((i) => { const d = toMillis(i.dueAt); return d >= now - 90 * DAY && d <= now; });
  const overdueTotal = sum(overdue, (x) => x.i.amount);
  const paid90 = invoices.filter((i) => i.status === 'paid' && toMillis(i.paidAt) >= now - 90 * DAY && toMillis(i.createdAt));
  const lag = paid90.length ? paid90.reduce((a, i) => a + Math.max(0, toMillis(i.paidAt) - toMillis(i.createdAt)), 0) / paid90.length / DAY : null;
  return {
    billed: billedTotal, billedPaidShare: billedTotal ? billedPaid / billedTotal : null, received,
    forecast30: sum(in30, (x) => x.i.amount), dueIn7: sum(in7, (x) => x.i.amount),
    openTotal: sum(open, (x) => x.i.amount), openCount: open.length,
    overdue: overdueTotal, overdueCount: overdue.length, overdueClients: new Set(overdue.map((x) => x.i.cid)).size,
    receivable: round2(sum(open, (x) => x.i.amount) + overdueTotal),
    delinquency: sum(last90, (i) => i.amount) ? overdueTotal / sum(last90, (i) => i.amount) : null,
    avgDaysToPay: lag == null ? null : Math.round(lag),
  };
}

/** Recebido em cada um dos últimos N meses. */
export function receivedByMonth(rec = [], now = Date.now(), months = 12) {
  return lastMonths(months, now).map((m) => ({ ...m, value: sum(rec.filter((r) => r.at >= m.start && r.at <= m.end), (r) => r.amount) }));
}

/* ---------- Licenças (telas) ---------- */

/** Telas contratadas, em uso e livres de cada empresa. */
export function licenseRow(c = {}, used = 0) {
  const live = c.status !== 'canceled';
  const contracted = live ? Number(c.screenLimit) || 0 : 0;
  const free = Math.max(0, contracted - used);
  let state = 'livres';
  if (!contracted) state = 'sem';
  else if (used > contracted) state = 'acima';
  else if (!free) state = 'cheio';
  else if (!used) state = 'nenhuma';
  return { contracted, used, free, state };
}
export const LICENSE_ROW_LABEL = {
  livres: 'Com telas livres', cheio: 'Todas em uso', nenhuma: 'Nenhuma pareada', acima: 'Acima do contratado', sem: 'Sem telas contratadas',
};
