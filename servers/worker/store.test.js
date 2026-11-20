import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextPaidUntil, storePrice, storeEffect, referralCode, cleanDocument, orderStatusFor, dueDate } from './store.js';

test('renovação soma meses a partir do vencimento (ou de hoje, se venceu há tempo)', () => {
  const now = Date.UTC(2026, 10, 18, 12);
  const paid = Date.UTC(2026, 10, 30, 12);
  assert.equal(new Date(nextPaidUntil({ paidUntil: paid }, 12, now)).getUTCFullYear(), 2027);
  assert.equal(new Date(nextPaidUntil({ paidUntil: paid }, 1, now)).getUTCMonth(), 11);
  const old = Date.UTC(2026, 0, 1);
  assert.equal(new Date(nextPaidUntil({ paidUntil: old }, 1, now)).getUTCMonth(), 11);
});

test('promoção vale só dentro do prazo e se for menor que o preço', () => {
  const it = { price: 1078.8, promoPrice: 958.8, promoUntil: '2026-11-30' };
  assert.equal(storePrice(it, new Date('2026-11-20T10:00:00')), 958.8);
  assert.equal(storePrice(it, new Date('2026-12-01T10:00:00')), 1078.8);
  assert.equal(storePrice({ price: 50, promoPrice: 60 }), 50);
});

test('efeito do pedido: meses renovam e ativam; espaço soma; serviço não mexe', () => {
  const now = Date.UTC(2026, 10, 18);
  const e = storeEffect({ kind: 'months', months: 6 }, { status: 'trial' }, now);
  assert.equal(e.status, 'active');
  assert.ok(e.paidUntil > now + 150 * 86_400_000);
  assert.deepEqual(storeEffect({ kind: 'storage', storageMB: 5120 }, { storageQuotaMB: 1024 }), { storageQuotaMB: 6144 });
  assert.deepEqual(storeEffect({ kind: 'service' }, {}), {});
});

test('código de indicação é estável, com 6 caracteres sem confusão', () => {
  assert.equal(referralCode('abc'), referralCode('abc'));
  assert.match(referralCode('abc'), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(referralCode('abc'), referralCode('abd'));
  assert.equal(referralCode('abc'), 'ZHNCDM'); // igual ao do painel (shared/more.js)
});

test('CPF e CNPJ com dígito verificador', () => {
  assert.equal(cleanDocument('529.982.247-25'), '52998224725');
  assert.equal(cleanDocument('529.982.247-26'), null);
  assert.equal(cleanDocument('11.222.333/0001-81'), '11222333000181');
  assert.equal(cleanDocument('11.111.111/1111-11'), null);
  assert.equal(cleanDocument('123'), null);
});

test('eventos do Asaas viram situação do pedido', () => {
  assert.equal(orderStatusFor('PAYMENT_RECEIVED'), 'paid');
  assert.equal(orderStatusFor('PAYMENT_CONFIRMED'), 'paid');
  assert.equal(orderStatusFor('PAYMENT_OVERDUE'), 'expired');
  assert.equal(orderStatusFor('PAYMENT_CREATED'), null);
  assert.match(dueDate(3, Date.UTC(2026, 10, 18)), /^2026-11-21$/);
});
