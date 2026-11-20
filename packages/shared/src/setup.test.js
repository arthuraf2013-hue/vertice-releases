import { describe, it, expect } from 'vitest';
import { setupSteps, shouldAutoOpenSetup, SETUP_AUTO_VISITS, PLANS } from './index.js';

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

  it('plano Start tem 1 GB de mídias', () => {
    expect(PLANS.start.storageMB).toBe(1024);
  });
});
