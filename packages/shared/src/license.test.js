import { describe, it, expect } from 'vitest';
import { licenseState, nextPaidUntil, toMillis } from './index.js';

const DAY = 86400000;
const now = Date.UTC(2026, 10, 15, 12);

describe('licença', () => {
  it('conta antiga sem campos: ativa, sem bloqueio', () => {
    expect(licenseState({ name: 'x' }, now)).toMatchObject({ status: 'active', blocked: false, warn: false });
  });
  it('teste grátis: dias restantes, aviso nos 3 últimos e bloqueio no fim', () => {
    expect(licenseState({ status: 'trial', trialEndsAt: now + 10 * DAY }, now)).toMatchObject({ blocked: false, warn: false, daysLeft: 10 });
    expect(licenseState({ status: 'trial', trialEndsAt: now + 2 * DAY }, now)).toMatchObject({ blocked: false, warn: true, daysLeft: 2 });
    expect(licenseState({ status: 'trial', trialEndsAt: now - 1 }, now)).toMatchObject({ blocked: true });
    expect(licenseState({ status: 'trial' }, now)).toMatchObject({ blocked: true });
  });
  it('mensalidade: aviso 5 dias antes, tolerância depois do vencimento e bloqueio', () => {
    expect(licenseState({ status: 'active', paidUntil: now + 20 * DAY }, now)).toMatchObject({ blocked: false, warn: false });
    expect(licenseState({ status: 'active', paidUntil: now + 3 * DAY }, now)).toMatchObject({ blocked: false, warn: true, daysLeft: 3 });
    expect(licenseState({ status: 'active', paidUntil: now - 2 * DAY }, now)).toMatchObject({ blocked: false, overdue: true, daysLeft: 3 });
    expect(licenseState({ status: 'active', paidUntil: now - 5 * DAY }, now)).toMatchObject({ blocked: true });
    expect(licenseState({ status: 'active', paidUntil: now - 5 * DAY, graceDays: 10 }, now)).toMatchObject({ blocked: false });
    expect(licenseState({ status: 'active', paidUntil: now - DAY, graceDays: 0 }, now)).toMatchObject({ blocked: true });
  });
  it('suspensa ou cancelada: sempre bloqueada', () => {
    expect(licenseState({ status: 'suspended', paidUntil: now + 30 * DAY }, now).blocked).toBe(true);
    expect(licenseState({ status: 'canceled' }, now).blocked).toBe(true);
  });
  it('aceita Timestamp do Firestore', () => {
    expect(toMillis({ toMillis: () => 5 })).toBe(5);
    expect(toMillis({ seconds: 2, nanoseconds: 0 })).toBe(2000);
    expect(toMillis(new Date(7))).toBe(7);
  });
  it('próximo vencimento: soma um mês ao vencimento atual, respeitando fim de mês', () => {
    const jan31 = Date.UTC(2027, 0, 31, 12);
    expect(new Date(nextPaidUntil({ paidUntil: jan31 }, 1, jan31 - DAY)).getUTCDate()).toBe(28);
    const due = now + 2 * DAY;
    expect(new Date(nextPaidUntil({ paidUntil: due }, 1, now)).getUTCMonth()).toBe(11);
    // vencido há muito tempo: conta a partir de hoje
    expect(nextPaidUntil({ paidUntil: now - 90 * DAY }, 1, now)).toBeGreaterThan(now + 27 * DAY);
  });
});
