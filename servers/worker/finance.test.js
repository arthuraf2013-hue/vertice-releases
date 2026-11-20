import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mrrOf, mrrMovement, cycleInvoiceId, needsCycleInvoice, cycleInvoice, autoCancelAt, invoiceStatusFor,
  methodName, invoicePaidEffect, diffMrr, diffScreens,
} from './finance.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 15);
const active = { status: 'active', monthlyPrice: 99.9, screenLimit: 3, plan: 'start' };

test('MRR e tipo do movimento (iguais ao pacote shared)', () => {
  assert.equal(mrrOf({ ...active, paidUntil: NOW }), 99.9);
  assert.equal(mrrOf({ ...active }), 0);
  assert.deepEqual(mrrMovement(0, 50), { type: 'new', delta: 50 });
  assert.equal(mrrMovement(0, 50, { everPaid: true }).type, 'reactivation');
  assert.deepEqual(mrrMovement(50, 0), { type: 'churn', delta: -50 });
});

test('fatura do ciclo: só perto do vencimento, uma por vencimento', () => {
  const c = { ...active, paidUntil: NOW + 8 * DAY };
  assert.equal(needsCycleInvoice(c, NOW, 10), true);
  assert.equal(needsCycleInvoice({ ...c, paidUntil: NOW + 20 * DAY }, NOW, 10), false);
  assert.equal(needsCycleInvoice({ ...c, cancelAt: NOW + DAY }, NOW, 10), false);
  assert.equal(needsCycleInvoice({ ...c, autoInvoice: false }, NOW, 10), false);
  assert.equal(needsCycleInvoice({ ...c, status: 'trial' }, NOW, 10), false);
  assert.equal(cycleInvoiceId(c.paidUntil), 'm-20261128');
  const inv = cycleInvoice(c, NOW, { start: { name: 'Start' } });
  assert.equal(inv.amount, 99.9);
  assert.equal(inv.title, 'Mensalidade · 3 telas');
  assert.equal(inv.dueAt, c.paidUntil);
  assert.ok(inv.periodEnd > inv.periodStart + 27 * DAY);
  assert.match(inv.description, /Start/);
});

test('cancelamento automático depois de N dias, com adiamento', () => {
  const c = { ...active, paidUntil: NOW - 10 * DAY };
  assert.equal(autoCancelAt(c, 90), c.paidUntil + 90 * DAY);
  assert.equal(autoCancelAt({ ...c, cancelHoldUntil: c.paidUntil + 120 * DAY }, 90), c.paidUntil + 120 * DAY);
  assert.equal(autoCancelAt({ ...c, status: 'trial' }, 90), null);
  assert.equal(autoCancelAt(c, 0), null);
});

test('eventos do Asaas e meios', () => {
  assert.equal(invoiceStatusFor('PAYMENT_RECEIVED_IN_CASH'), 'paid');
  assert.equal(invoiceStatusFor('PAYMENT_OVERDUE'), 'overdue');
  assert.equal(invoiceStatusFor('PAYMENT_REFUNDED'), 'canceled');
  assert.equal(invoiceStatusFor('PAYMENT_CREATED'), null);
  assert.equal(methodName('PIX'), 'Pix');
  assert.equal(methodName('CREDIT_CARD'), 'Cartão de crédito');
});

test('fatura paga: renova um mês a partir do vencimento e reativa', () => {
  const company = { ...active, status: 'canceled', paidUntil: NOW + 5 * DAY };
  const eff = invoicePaidEffect({ amount: 99.9, months: 1, title: 'Mensalidade', kind: 'mensalidade' }, company, { now: NOW, method: 'Pix' });
  assert.equal(eff.company.status, 'active');
  assert.equal(new Date(eff.company.paidUntil).getUTCDate(), new Date(company.paidUntil).getUTCDate());
  assert.ok(eff.company.paidUntil > company.paidUntil + 27 * DAY);
  assert.equal(eff.payment.amount, 99.9);
  assert.equal(eff.payment.method, 'Pix');
  // Fatura avulsa sem meses não mexe no vencimento.
  assert.deepEqual(invoicePaidEffect({ amount: 50, months: 0 }, company, { now: NOW }).company, {});
});

test('diferença de MRR vira eventos, com reativação e empresa apagada', () => {
  const first = diffMrr([{ id: 'a', name: 'A', ...active, paidUntil: NOW }], {}, NOW);
  assert.equal(first.events[0].type, 'new');
  const up = diffMrr([{ id: 'a', ...active, monthlyPrice: 150, paidUntil: NOW }], first.state, NOW);
  assert.deepEqual([up.events[0].type, up.events[0].delta], ['expansion', 50.1]);
  const off = diffMrr([{ id: 'a', ...active, status: 'canceled', paidUntil: NOW }], up.state, NOW);
  assert.equal(off.events[0].type, 'churn');
  const back = diffMrr([{ id: 'a', ...active, paidUntil: NOW }], off.state, NOW);
  assert.equal(back.events[0].type, 'reactivation');
  const gone = diffMrr([], back.state, NOW);
  assert.deepEqual([gone.events[0].type, gone.events[0].delta], ['churn', -99.9]);
  assert.equal(diffMrr([{ id: 'a', ...active, paidUntil: NOW }], back.state, NOW).events.length, 0);
});

test('telas pareadas e removidas', () => {
  const s1 = diffScreens([{ id: 't1', path: 'companies/a/screens/t1', cid: 'a', name: 'Caixa', pairedAt: NOW - DAY }], {}, NOW);
  assert.deepEqual(s1.events.map((e) => [e.type, e.at]), [['activated', NOW - DAY]]);
  const s2 = diffScreens([], s1.state, NOW);
  assert.deepEqual(s2.events.map((e) => [e.type, e.cid, e.screenName]), [['removed', 'a', 'Caixa']]);
});
