// Dados do financeiro da Vetta: lê tudo uma vez (empresas, telas, faturas, recebimentos, pedidos da Loja e
// históricos) e entrega listas prontas para as abas. As contas ficam em @vertice/shared (finance.js).
import { useEffect, useMemo, useState } from 'react';
import {
  toMillis, licenseState, screenStatus, mrrOf, accountKind, collectionState, invoiceState, orderAsInvoice, receipts as joinReceipts,
} from '@vertice/shared';
import { useSession } from '../../session.jsx';
import { useCol, useNow } from '../../data/hooks.js';
import { api } from '../../data/api.js';

/** Consulta de grupo (todas as empresas); cada item ganha o id da empresa em `cid`. */
function useGroup(name) {
  const [rows, setRows] = useState(null);
  useEffect(() => api.watchGroup(name, (list) => setRows(list.map((d) => ({ ...d, cid: d.path?.split('/')[1] }))), () => setRows([])), [name]);
  return rows;
}

const norm = (d, keys) => {
  const o = { ...d };
  for (const k of keys) if (k in o) o[k] = toMillis(o[k]);
  return o;
};

export function useFinance() {
  const { settings } = useSession();
  const now = useNow();
  const companies = useCol('companies');
  const screens = useGroup('screens');
  const payments = useGroup('payments');
  const invoices = useGroup('invoices');
  const orders = useGroup('storeOrders');
  const mrrEvents = useCol('mrrEvents');
  const licenseEvents = useCol('licenseEvents');
  // O relógio anda a cada segundo; o financeiro só precisa mudar de minuto em minuto.
  const minute = Math.floor(now / 60_000) * 60_000;

  return useMemo(() => {
    if (!companies || !screens || !payments || !invoices || !orders || !mrrEvents || !licenseEvents) return null;
    const names = new Map(companies.map((c) => [c.id, c.name || c.id]));

    // Telas por empresa (contratadas x em uso x online agora).
    const screensBy = new Map();
    for (const s of screens) {
      const r = screensBy.get(s.cid) || { total: 0, online: 0 };
      r.total += 1;
      if (!['offline', 'warn', 'idle'].includes(screenStatus(s, minute).key)) r.online += 1;
      screensBy.set(s.cid, r);
    }

    // Faturas (as da Loja entram como faturas também).
    const invoiceList = [
      ...invoices.map((i) => norm(i, ['dueAt', 'createdAt', 'paidAt', 'periodStart', 'periodEnd', 'canceledAt'])),
      ...orders.map((o) => orderAsInvoice({ ...o, paidAt: toMillis(o.paidAt), createdAt: toMillis(o.createdAt) }, o.cid)),
    ].map((i) => ({ ...i, name: names.get(i.cid) || i.cid, state: invoiceState(i, minute) }));

    const receiptList = joinReceipts({ payments, orders: orders.map((o) => ({ ...o })) })
      .map((r) => ({ ...r, name: names.get(r.cid) || r.cid }));

    const events = mrrEvents.map((e) => ({ ...norm(e, ['at']), name: names.get(e.cid) || e.name || e.cid })).sort((a, b) => b.at - a.at);
    const activations = licenseEvents.map((e) => ({ ...norm(e, ['at']), name: names.get(e.cid) || e.cid })).sort((a, b) => b.at - a.at);

    // Empresas com tudo que as abas mostram.
    const lastPay = new Map();
    for (const r of receiptList) if (!lastPay.has(r.cid)) lastPay.set(r.cid, r);
    const byCid = new Map();
    for (const i of invoiceList) {
      const list = byCid.get(i.cid) || [];
      list.push(i);
      byCid.set(i.cid, list);
    }
    const rows = companies.map((c0) => {
      const c = norm(c0, ['paidUntil', 'trialEndsAt', 'createdAt', 'cancelAt', 'cancelHoldUntil', 'canceledAt']);
      const inv = byCid.get(c.id) || [];
      const open = inv.filter((i) => i.state.key === 'open');
      const overdue = inv.filter((i) => i.state.key === 'overdue');
      const failing = inv.filter((i) => (i.state.key === 'open' || i.state.key === 'overdue') && i.syncError);
      const sc = screensBy.get(c.id) || { total: 0, online: 0 };
      const nextDue = [...open, ...overdue].map((i) => i.dueAt).filter(Boolean).sort((a, b) => a - b)[0] || (c.status === 'trial' ? c.trialEndsAt : c.paidUntil) || null;
      return {
        ...c,
        lic: licenseState(c, minute),
        mrr: mrrOf(c),
        kind: accountKind(c),
        coll: collectionState(c, minute, settings),
        invoices: inv,
        openAmount: Math.round([...open, ...overdue].reduce((a, i) => a + i.amount, 0) * 100) / 100,
        overdueAmount: Math.round(overdue.reduce((a, i) => a + i.amount, 0) * 100) / 100,
        openCount: open.length + overdue.length,
        overdueCount: overdue.length,
        failing,
        lastPayment: lastPay.get(c.id) || null,
        nextDue,
        screensUsed: sc.total,
        screensOnline: sc.online,
        doc: c.cpfCnpj || c.cnpj || c.asaasDocument || '',
      };
    });

    return { now: minute, settings, companies: rows, invoices: invoiceList, receipts: receiptList, events, activations, byId: new Map(rows.map((r) => [r.id, r])) };
  }, [companies, screens, payments, invoices, orders, mrrEvents, licenseEvents, minute, settings]);
}

/* ---------- Formatação ---------- */

export const day = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR') : '—');
/** CPF/CNPJ com pontuação. */
export function formatDoc(v = '') {
  const d = String(v).replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v || '';
}
export const pct = (v, digits = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`);

/** Período escolhido nos filtros → começo em ms. */
export const PERIODS = [
  { value: '7', label: 'Últimos 7 dias' }, { value: '30', label: 'Últimos 30 dias' }, { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Últimos 12 meses' }, { value: 'all', label: 'Todo o período' },
];
export const periodStart = (p, now) => (p === 'all' ? 0 : now - Number(p) * 86_400_000);

/** Baixa um CSV. */
export function downloadCsv(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
