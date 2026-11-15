import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuiet, screenTransitions, billingNotices, offlineMessage } from './rules.js';

const at = (iso) => Date.parse(iso); // horários em UTC; Recife = UTC-3

test('silêncio: faixa normal e faixa que vira a noite, no fuso da loja', () => {
  assert.equal(inQuiet('22:00', '06:00', 'America/Recife', at('2026-11-15T02:00:00Z')), true);  // 23:00 local
  assert.equal(inQuiet('22:00', '06:00', 'America/Recife', at('2026-11-15T08:30:00Z')), true);  // 05:30 local
  assert.equal(inQuiet('22:00', '06:00', 'America/Recife', at('2026-11-15T09:30:00Z')), false); // 06:30 local
  assert.equal(inQuiet('22:00', '06:00', 'America/Recife', at('2026-11-15T15:00:00Z')), false); // 12:00 local
  assert.equal(inQuiet('12:00', '14:00', 'America/Recife', at('2026-11-15T16:00:00Z')), true);  // 13:00 local
  assert.equal(inQuiet('', '', 'America/Recife'), false);
});

test('telas: avisa uma vez quando cai e uma vez quando volta', () => {
  const now = at('2026-11-15T15:00:00Z');
  const screens = [
    { id: 'a', name: 'Caixa', lastSeen: now - 20 * 60000 },
    { id: 'b', name: 'Vitrine', lastSeen: now - 60000 },
    { id: 'c', name: 'Nova', lastSeen: null },
  ];
  let r = screenTransitions(screens, {}, { offlineMinutes: 15, now });
  assert.deepEqual(r.down.map((s) => s.id), ['a']);
  assert.deepEqual(r.next, { a: 'offline', b: 'online' });
  r = screenTransitions(screens, r.next, { offlineMinutes: 15, now: now + 60000 });
  assert.equal(r.down.length, 0);
  screens[0].lastSeen = now + 60000;
  r = screenTransitions(screens, r.next, { offlineMinutes: 15, now: now + 90000 });
  assert.deepEqual(r.up.map((s) => s.id), ['a']);
  const msg = offlineMessage({ name: 'Padaria' }, [screens[1]], [], now + 40 * 60000);
  assert.match(msg.subject, /Vitrine parou \(Padaria\)/);
});

test('cobrança: teste acabando, vencimento, atraso e bloqueio com chaves que não repetem', () => {
  const now = at('2026-11-15T15:00:00Z');
  const DAY = 86400000;
  assert.match(billingNotices({ name: 'X', status: 'trial', trialEndsAt: now + 2 * DAY }, { now })[0].key, /^trial-3:/);
  assert.match(billingNotices({ name: 'X', status: 'trial', trialEndsAt: now - 1 }, { now })[0].key, /^trial-end:/);
  assert.equal(billingNotices({ name: 'X', status: 'trial', trialEndsAt: now + 9 * DAY }, { now }).length, 0);
  assert.match(billingNotices({ name: 'X', status: 'active', paidUntil: now + 3 * DAY, monthlyPrice: 189.9 }, { now })[0].text, /R\$ 189,90/);
  assert.match(billingNotices({ name: 'X', status: 'active', paidUntil: now - DAY }, { now })[0].key, /^overdue:/);
  assert.match(billingNotices({ name: 'X', status: 'active', paidUntil: now - 6 * DAY }, { now })[0].key, /^blocked:/);
  assert.equal(billingNotices({ name: 'X', status: 'active' }, { now }).length, 0); // sem vencimento (cortesia)
  assert.equal(billingNotices({ name: 'X', status: 'suspended', paidUntil: now - 9 * DAY }, { now }).length, 0);
});
