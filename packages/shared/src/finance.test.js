import { describe, it, expect } from 'vitest';
import {
  mrrOf, accountKind, collectionState, invoiceState, orderAsInvoice, receipts, methodSplit, methodKey,
  mrrMovement, mrrAt, payingAt, movementsIn, recurringMetrics, mrrByMonth, mrrByDay, cashMetrics,
  receivedByMonth, licenseRow, lastMonths,
} from './index.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 20, 12).getTime(); // 20/11/2026
const ago = (d) => NOW - d * DAY;

describe('contas', () => {
  it('MRR só de quem está ativo, com vencimento e mensalidade', () => {
    expect(mrrOf({ status: 'active', paidUntil: NOW, monthlyPrice: 99.9 })).toBe(99.9);
    expect(mrrOf({ status: 'active', monthlyPrice: 99.9 })).toBe(0); // cortesia (sem vencimento)
    expect(mrrOf({ status: 'trial', paidUntil: NOW, monthlyPrice: 99.9 })).toBe(0);
    expect(mrrOf({ status: 'suspended', paidUntil: NOW, monthlyPrice: 99.9 })).toBe(0);
  });
  it('tipo de conta', () => {
    expect(accountKind({ status: 'active', paidUntil: NOW, monthlyPrice: 10 })).toBe('paying');
    expect(accountKind({ status: 'active' })).toBe('courtesy');
    expect(accountKind({ status: 'trial' })).toBe('trial');
    expect(accountKind({ status: 'suspended' })).toBe('paused');
    expect(accountKind({ status: 'canceled' })).toBe('canceled');
  });
});

describe('cobrança', () => {
  const base = { status: 'active', monthlyPrice: 99.9, graceDays: 5 };
  it('em dia, vencida, suspensa e perto do cancelamento', () => {
    expect(collectionState({ ...base, paidUntil: NOW + 5 * DAY }, NOW).stage).toBe('ok');
    expect(collectionState({ ...base, paidUntil: ago(2) }, NOW).stage).toBe('overdue');
    const s = collectionState({ ...base, paidUntil: ago(30) }, NOW);
    expect(s.stage).toBe('suspended');
    expect(s.daysUnpaid).toBe(30);
    expect(s.daysToCancel).toBe(60);
    expect(collectionState({ ...base, paidUntil: ago(80) }, NOW).stage).toBe('near');
  });
  it('prazo do cancelamento automático vem das configurações e pode ser adiado', () => {
    expect(collectionState({ ...base, paidUntil: ago(30) }, NOW, { cancelAfterDays: 40 }).stage).toBe('near');
    const held = collectionState({ ...base, paidUntil: ago(80), cancelHoldUntil: NOW + 40 * DAY }, NOW);
    expect(held.stage).toBe('suspended');
    expect(held.daysToCancel).toBe(40);
  });
  it('cancelamento agendado e cancelada', () => {
    expect(collectionState({ ...base, paidUntil: NOW + DAY, cancelAt: NOW + 10 * DAY }, NOW).stage).toBe('scheduled');
    expect(collectionState({ ...base, status: 'canceled' }, NOW).stage).toBe('canceled');
  });
});

describe('faturas e recebimentos', () => {
  it('situação da fatura', () => {
    expect(invoiceState({ status: 'open', dueAt: ago(3) }, NOW)).toMatchObject({ key: 'overdue', daysLate: 3 });
    expect(invoiceState({ status: 'open', dueAt: NOW }, NOW).key).toBe('open');
    expect(invoiceState({ status: 'paid', dueAt: ago(3) }, NOW).key).toBe('paid');
  });
  it('pedido da Loja vira fatura e recebimento, sem repetir', () => {
    const o = { id: 'o1', cid: 'c1', status: 'paid', value: 49.9, createdAt: ago(2), paidAt: ago(1), billingType: 'PIX', item: { name: 'Renovação' } };
    expect(orderAsInvoice(o, 'c1')).toMatchObject({ kind: 'loja', status: 'paid', amount: 49.9 });
    expect(receipts({ orders: [o] })).toHaveLength(1);
    expect(receipts({ orders: [o], payments: [{ id: 'p', cid: 'c1', orderId: 'o1', amount: 49.9, paidAt: ago(1), method: 'Pix' }] })).toHaveLength(1);
  });
  it('meios de pagamento', () => {
    expect(['PIX', 'BOLETO', 'CREDIT_CARD', 'Dinheiro'].map(methodKey)).toEqual(['pix', 'boleto', 'cartao', 'outro']);
    const split = methodSplit([{ method: 'pix', amount: 75 }, { method: 'boleto', amount: 25 }]);
    expect(split.find((m) => m.key === 'pix').share).toBe(0.75);
  });
});

describe('MRR', () => {
  it('tipo do movimento', () => {
    expect(mrrMovement(0, 50)).toEqual({ type: 'new', delta: 50 });
    expect(mrrMovement(0, 50, { everPaid: true }).type).toBe('reactivation');
    expect(mrrMovement(50, 80)).toEqual({ type: 'expansion', delta: 30 });
    expect(mrrMovement(80, 50)).toEqual({ type: 'contraction', delta: -30 });
    expect(mrrMovement(50, 0)).toEqual({ type: 'churn', delta: -50 });
    expect(mrrMovement(50, 50)).toBe(null);
  });

  // Histórico: A entra há 200 dias (100), B entra há 40 dias (50) e expande há 10 (para 80),
  // C entra há 150 dias (60) e cancela há 45 dias.
  const events = [
    { cid: 'A', type: 'new', from: 0, to: 100, delta: 100, at: ago(200) },
    { cid: 'C', type: 'new', from: 0, to: 60, delta: 60, at: ago(150) },
    { cid: 'C', type: 'churn', from: 60, to: 0, delta: -60, at: ago(45) },
    { cid: 'B', type: 'new', from: 0, to: 50, delta: 50, at: ago(40) },
    { cid: 'B', type: 'expansion', from: 50, to: 80, delta: 30, at: ago(10) },
  ];
  const companies = [
    { id: 'A', status: 'active', paidUntil: NOW, monthlyPrice: 100 },
    { id: 'B', status: 'active', paidUntil: NOW, monthlyPrice: 80 },
    { id: 'C', status: 'canceled', monthlyPrice: 60 },
  ];

  it('volta no tempo desfazendo os eventos', () => {
    expect(mrrAt(180, events, NOW)).toBe(180);
    expect(mrrAt(180, events, ago(20))).toBe(150);
    expect(mrrAt(180, events, ago(100))).toBe(160);
    expect(mrrAt(180, events, ago(300))).toBe(0);
    expect(payingAt(2, events, ago(100))).toBe(2);
    expect(payingAt(2, events, ago(300))).toBe(0);
  });

  it('movimentos de um período', () => {
    const m = movementsIn(events, ago(50), NOW);
    expect(m).toMatchObject({ newMrr: 50, newCount: 1, expansion: 30, churn: 60, churnCount: 1, in: 80, out: 60, net: 20 });
  });

  it('indicadores de receita recorrente', () => {
    const r = recurringMetrics({ companies, events, now: NOW });
    expect(r.mrr).toBe(180);
    expect(r.arr).toBe(2160);
    expect(r.paying).toBe(2);
    expect(r.canceled).toBe(1);
    expect(r.arpa).toBe(90);
    expect(r.churnAccounts).toBeGreaterThan(0);
    // Começo da janela de 12 meses é antes do primeiro evento: sem histórico.
    expect(r.nrr).toBe(null);
  });

  it('NRR e GRR com mais de 12 meses de histórico', () => {
    const old = [{ cid: 'A', type: 'new', from: 0, to: 100, delta: 100, at: ago(500) }, { cid: 'A', type: 'expansion', from: 100, to: 120, delta: 20, at: ago(30) }];
    const r = recurringMetrics({ companies: [{ id: 'A', status: 'active', paidUntil: NOW, monthlyPrice: 120 }], events: old, now: NOW });
    expect(r.nrr).toBeCloseTo(1.2);
    expect(r.grr).toBe(1);
  });

  it('séries por mês e por dia', () => {
    const months = mrrByMonth({ companies, events, now: NOW });
    expect(months).toHaveLength(12);
    expect(months.at(-1).value).toBe(180);
    const days = mrrByDay({ companies, events, now: NOW, days: 30, receipts: [{ at: NOW - 1000, amount: 10 }] });
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toMatchObject({ value: 180, received: 10 });
    expect(days[0].value).toBe(150);
  });
});

describe('caixa', () => {
  const m = lastMonths(1, NOW)[0];
  const invoices = [
    { cid: 'A', status: 'paid', amount: 100, dueAt: m.start + 2 * DAY, createdAt: m.start - 8 * DAY, paidAt: m.start - 2 * DAY },
    { cid: 'B', status: 'open', amount: 50, dueAt: ago(5), createdAt: ago(15) },
    { cid: 'C', status: 'open', amount: 80, dueAt: NOW + 5 * DAY, createdAt: ago(5) },
    { cid: 'D', status: 'canceled', amount: 999, dueAt: NOW, createdAt: ago(5) },
  ];
  it('faturado, previsão, vencido e prazo médio', () => {
    const c = cashMetrics({ invoices, receipts: [{ at: ago(1), amount: 30 }], now: NOW });
    expect(c.billed).toBe(230);
    expect(c.forecast30).toBe(80);
    expect(c.dueIn7).toBe(80);
    expect(c.overdue).toBe(50);
    expect(c.overdueClients).toBe(1);
    expect(c.receivable).toBe(130);
    expect(c.received).toBe(30);
    expect(c.avgDaysToPay).toBe(6);
  });
  it('recebido por mês', () => {
    const r = receivedByMonth([{ at: ago(1), amount: 30 }, { at: ago(40), amount: 20 }], NOW, 3);
    expect(r.map((x) => x.value)).toEqual([0, 20, 30]);
  });
});

describe('licenças (telas)', () => {
  it('contratadas, em uso e livres', () => {
    expect(licenseRow({ status: 'active', screenLimit: 3 }, 1)).toMatchObject({ contracted: 3, used: 1, free: 2, state: 'livres' });
    expect(licenseRow({ status: 'active', screenLimit: 3 }, 3).state).toBe('cheio');
    expect(licenseRow({ status: 'active', screenLimit: 3 }, 0).state).toBe('nenhuma');
    expect(licenseRow({ status: 'active', screenLimit: 3 }, 4).state).toBe('acima');
    expect(licenseRow({ status: 'canceled', screenLimit: 3 }, 0).state).toBe('sem');
  });
});
