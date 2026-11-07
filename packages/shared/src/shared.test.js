import { describe, it, expect } from 'vitest';
import {
  screenStatus, networkSummary, compareVersions,
  generatePairingCode, normalizePairingCode, isValidPairingCode, screenCode,
  buildManifest, resolveNow, slotMatches, localISODate,
  formatCustomerName, formatOrderNumber, boardOrders, newlyReady,
  STATUS_WARN_MS, STATUS_OFFLINE_MS, PAIRING_ALPHABET,
} from './index.js';

const NOW = new Date(2026, 10, 6, 20, 0).getTime(); // sexta, 20:00

describe('status da tela', () => {
  it('segue os limites de 15 e 60 minutos', () => {
    expect(screenStatus({}, NOW).key).toBe('idle');
    expect(screenStatus({ lastSeen: NOW - 60_000 }, NOW).key).toBe('online');
    expect(screenStatus({ lastSeen: NOW - STATUS_WARN_MS - 1 }, NOW).key).toBe('warn');
    expect(screenStatus({ lastSeen: NOW - STATUS_OFFLINE_MS - 1 }, NOW).key).toBe('offline');
  });
  it('mostra sincronizando e app desatualizado', () => {
    expect(screenStatus({ lastSeen: NOW, syncState: { status: 'syncing', done: 1, total: 3 } }, NOW).key).toBe('sync');
    expect(screenStatus({ lastSeen: NOW, appVersion: '0.0.9' }, NOW, '0.1.0').key).toBe('warn');
  });
  it('resume a rede', () => {
    const s = networkSummary([{ lastSeen: NOW }, { lastSeen: NOW - STATUS_OFFLINE_MS * 2 }, {}], NOW);
    expect(s).toMatchObject({ total: 3, online: 1, offline: 1, idle: 1, healthyPct: 33 });
  });
  it('compara versões', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
});

describe('pareamento', () => {
  it('gera códigos só com o alfabeto legível', () => {
    for (let i = 0; i < 200; i++) {
      const c = generatePairingCode();
      expect(c).toHaveLength(6);
      expect([...c].every((ch) => PAIRING_ALPHABET.includes(ch))).toBe(true);
    }
  });
  it('normaliza o que o usuário digita', () => {
    expect(normalizePairingCode('4f7-k2q')).toBe('4F7K2Q');
    expect(isValidPairingCode('4F7K2Q')).toBe(true);
    expect(isValidPairingCode('4F7K20')).toBe(false);
    expect(screenCode(4)).toBe('VTX-0004');
  });
});

describe('manifesto', () => {
  const media = [
    { id: 'm1', name: 'oferta.jpg', type: 'image', url: 'https://x/m1', sizeBytes: 100 },
    { id: 'm2', name: 'video.mp4', type: 'video', url: 'https://x/m2', sizeBytes: 900, durationSec: 15.2 },
  ];
  const playlists = [
    { id: 'p1', name: 'Manhã', items: [{ mediaId: 'm1', durationSec: 8 }, { mediaId: 'm2' }] },
    { id: 'p2', name: 'Noite', items: [{ mediaId: 'm1', validTo: '2026-11-01' }] },
    { id: 'p3', name: 'Padrão', items: [{ mediaId: 'm1' }] },
  ];
  const screen = { id: 's1', code: 'VTX-0001', name: 'Caixa', groupIds: ['g1'] };
  const schedules = [
    { id: 'a', status: 'published', groupIds: ['g1'], priority: 0, fallbackPlaylistId: 'p3',
      slots: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00', playlistId: 'p1' },
              { days: [5], start: '18:00', end: '23:00', playlistId: 'p2' }] },
    { id: 'b', status: 'draft', screenIds: ['s1'], slots: [{ days: [5], start: '00:00', end: '24:00', playlistId: 'p1' }] },
  ];
  const m = buildManifest({ screen, schedules, playlists, media });

  it('compila só grades publicadas que valem para a tela', () => {
    expect(m.slots.map((s) => s.scheduleId)).toEqual(['a', 'a']);
    expect(m.slots[0].items[1].durationSec).toBe(16); // vídeo arredonda para cima
    expect(m.assets).toHaveLength(2);
    expect(m.totalBytes).toBe(1000);
  });
  it('resolve o slot da hora e cai no padrão quando o item venceu', () => {
    expect(resolveNow(m, new Date(2026, 10, 6, 9, 0)).source).toBe('slot');
    // 20h de sexta: slot Noite, mas o item venceu em 01/11 → playlist padrão.
    expect(resolveNow(m, new Date(2026, 10, 6, 20, 0)).source).toBe('fallback');
    expect(resolveNow(null).source).toBe('empty');
  });
  it('atravessa a meia-noite', () => {
    const slot = { days: [5], start: '22:00', end: '02:00' };
    expect(slotMatches(slot, new Date(2026, 10, 6, 23, 0))).toBe(true); // sexta 23h
    expect(slotMatches(slot, new Date(2026, 10, 7, 1, 0))).toBe(true); // sábado 1h
    expect(slotMatches(slot, new Date(2026, 10, 7, 23, 0))).toBe(false); // sábado 23h
  });
  it('data local não sofre com fuso', () => {
    expect(localISODate(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06');
  });
});

describe('pedidos', () => {
  it('formata o nome com privacidade', () => {
    expect(formatCustomerName('MARIA DA SILVA', 'first-initial')).toBe('Maria S.');
    expect(formatCustomerName('joão', 'first-initial')).toBe('João');
    expect(formatCustomerName('ana paula souza', 'full')).toBe('Ana Paula Souza');
    expect(formatCustomerName('Ana', 'none')).toBe('');
    expect(formatOrderNumber(7)).toBe('007');
    expect(formatOrderNumber('A12')).toBe('A12');
  });
  it('monta o painel e anuncia só os novos prontos', () => {
    const orders = [
      { id: '1', status: 'preparing', createdAt: 2 },
      { id: '2', status: 'preparing', createdAt: 1 },
      { id: '3', status: 'ready', readyAt: NOW - 60_000 },
      { id: '4', status: 'ready', readyAt: NOW - 20 * 60_000 },
      { id: '5', status: 'delivered' },
    ];
    const b = boardOrders(orders, { now: NOW, readyTtlMin: 10 });
    expect(b.preparing.map((o) => o.id)).toEqual(['2', '1']);
    expect(b.ready.map((o) => o.id)).toEqual(['3']);
    const seen = new Set();
    expect(newlyReady(b.ready, seen).map((o) => o.id)).toEqual(['3']);
    expect(newlyReady(b.ready, seen)).toEqual([]);
  });
});

describe('posição da tela e ajustes de mídia', async () => {
  const { screenDisplay, expandPlaylist } = await import('./index.js');
  it('converte telas antigas e limita os valores', () => {
    expect(screenDisplay({ orientation: 'portrait' }).rotation).toBe(90);
    expect(screenDisplay({}).rotation).toBe(0);
    expect(screenDisplay({ display: { rotation: 270, zoom: 300, offsetX: -50, fit: 'xyz' } }))
      .toEqual({ rotation: 270, zoom: 120, offsetX: -10, offsetY: 0, fit: 'cover' });
  });
  it('manifesto leva rotação e orientação', () => {
    const m = buildManifest({ screen: { id: 's', display: { rotation: 180 } }, schedules: [], playlists: [], media: [] });
    expect(m.screen.display.rotation).toBe(180);
    expect(m.screen.orientation).toBe('landscape');
  });
  it('playlist > mídia > padrão, e validade nas duas janelas', () => {
    const media = new Map([
      ['a', { id: 'a', type: 'image', url: 'u', defaultDurationSec: 7, fit: 'blur', validFrom: '2026-11-01', validTo: '2026-11-30' }],
      ['b', { id: 'b', type: 'video', url: 'v', durationSec: 12.2, muted: true }],
    ]);
    const [a1, a2, b] = expandPlaylist({ id: 'p', items: [
      { mediaId: 'a' },
      { mediaId: 'a', durationSec: 15, fit: 'contain', validFrom: '2026-11-10', validTo: '2026-12-31' },
      { mediaId: 'b' },
    ] }, media);
    expect([a1.durationSec, a1.fit, a1.validFrom, a1.validTo]).toEqual([7, 'blur', '2026-11-01', '2026-11-30']);
    expect([a2.durationSec, a2.fit, a2.validFrom, a2.validTo]).toEqual([15, 'contain', '2026-11-10', '2026-11-30']);
    expect([b.durationSec, b.muted, b.fit]).toEqual([13, true, null]);
  });
});

describe('ajuste por mídia numa tela', () => {
  it('vale mais que playlist e mídia, e só nesta tela', () => {
    const media = [{ id: 'a', type: 'image', url: 'u', fit: 'contain' }];
    const playlists = [{ id: 'p', items: [{ mediaId: 'a', fit: 'blur' }] }];
    const schedules = [{ id: 'g', status: 'published', screenIds: ['s1', 's2'], fallbackPlaylistId: 'p', slots: [] }];
    const s1 = { id: 's1', mediaOverrides: { a: { fit: 'cover', zoom: 130, offsetX: -5 } }, pin: { mediaId: 'a', until: 99 } };
    const m1 = buildManifest({ screen: s1, schedules, playlists, media });
    const m2 = buildManifest({ screen: { id: 's2' }, schedules, playlists, media });
    expect(m1.fallback[0]).toMatchObject({ fit: 'cover', adjust: { zoom: 130, offsetX: -5, offsetY: 0 } });
    expect(m1.screen.pin).toEqual({ mediaId: 'a', until: 99 });
    expect(m2.fallback[0].fit).toBe('blur');
    expect(m2.fallback[0].adjust).toBeUndefined();
  });
});
