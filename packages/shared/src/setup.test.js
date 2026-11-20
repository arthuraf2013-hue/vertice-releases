import { describe, it, expect } from 'vitest';
import { setupSteps, shouldAutoOpenSetup, SETUP_AUTO_VISITS, PLANS, pickHint, onStepPage } from './index.js';

describe('guia da primeira tela', () => {
  it('conta vazia: nada feito, o próximo passo é instalar o player', () => {
    const p = setupSteps({});
    expect(p.total).toBe(5);
    expect(p.done).toBe(0);
    expect(p.next.id).toBe('player');
    expect(p.complete).toBe(false);
  });

  it('tela pareada conta como player instalado', () => {
    const p = setupSteps({ screens: [{ id: 's1' }] });
    expect(p.steps.filter((s) => s.done).map((s) => s.id)).toEqual(['player', 'pair']);
    expect(p.next.id).toBe('media');
  });

  it('só programação publicada conclui o último passo', () => {
    const base = { screens: [{}], media: [{}], playlists: [{}] };
    expect(setupSteps({ ...base, schedules: [{ status: 'draft' }] }).next.id).toBe('publish');
    const p = setupSteps({ ...base, schedules: [{ status: 'published' }] });
    expect(p.complete).toBe(true);
    expect(p.next).toBe(null);
  });

  it('abre sozinho só nas primeiras entradas e enquanto falta algo', () => {
    const falta = setupSteps({});
    expect(shouldAutoOpenSetup({ visits: 1 }, falta)).toBe(true);
    expect(shouldAutoOpenSetup({ visits: SETUP_AUTO_VISITS }, falta)).toBe(true);
    expect(shouldAutoOpenSetup({ visits: SETUP_AUTO_VISITS + 1 }, falta)).toBe(false);
    expect(shouldAutoOpenSetup({ visits: 1, hidden: true }, falta)).toBe(false);
    const pronto = setupSteps({ screens: [{}], media: [{}], playlists: [{}], schedules: [{ status: 'published' }] });
    expect(shouldAutoOpenSetup({ visits: 1 }, pronto)).toBe(false);
  });

  it('"Já instalei" conclui o passo do player antes do pareamento', () => {
    const p = setupSteps({ playerConfirmed: true });
    expect(p.next.id).toBe('pair');
  });

  it('a dica acompanha o que já está aberto na página', () => {
    const pair = setupSteps({}).steps.find((s) => s.id === 'pair');
    const page = (...on) => (sel) => on.some((x) => sel.startsWith(`[data-guide="${x}"]`));
    expect(pickHint(pair, page('pair-open')).text).toMatch(/Parear tela/);
    expect(pickHint(pair, page('pair-open', 'pair-code')).text).toMatch(/Digite/);
    expect(pickHint(pair, page('pair-open', 'pair-code', 'pair-submit')).text).toMatch(/Conectar tela/);
    expect(pickHint(pair, page())).toBe(null);
  });

  it('na grade, só aponta Publicar depois de escolher a tela', () => {
    const pub = setupSteps({}).steps.find((s) => s.id === 'publish');
    const without = (sel) => sel.startsWith('[data-guide="schedule-publish"]') || sel === '[data-guide="schedule-targets"]';
    expect(pickHint(pub, without).target).toBe('[data-guide="schedule-targets"]');
    const withScreen = (sel) => without(sel) || sel.includes('aria-pressed');
    expect(pickHint(pub, withScreen).target).toBe('[data-guide="schedule-publish"]');
  });

  it('reconhece a página do passo mesmo com busca na URL', () => {
    const pair = setupSteps({}).steps.find((s) => s.id === 'pair');
    expect(onStepPage(pair, '/telas')).toBe(true);
    expect(onStepPage(pair, '/telas/')).toBe(true);
    expect(onStepPage(pair, '/midias')).toBe(false);
  });

  it('plano Start tem 1 GB de mídias', () => {
    expect(PLANS.start.storageMB).toBe(1024);
  });
});
