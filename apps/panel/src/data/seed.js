// Dados de exemplo do modo demonstração: "Padaria Boa Massa", duas unidades em Recife.
import { ORDER_BOARD_DEFAULTS } from '@vertice/shared';

/** Arte de oferta em SVG (substitui imagens reais na demonstração). */
export function offerArt({ over, title, price, unit = '', tone = 'navy', w = 1920, h = 1080 }) {
  const bg = { navy: '#141b26', wine: '#3a1620', green: '#10261d', coffee: '#2a1c12' }[tone] || '#141b26';
  const mid = { navy: '#293548', wine: '#5c2232', green: '#1d3f30', coffee: '#4a3220' }[tone] || '#293548';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="${w}" height="${h}">
<rect width="320" height="180" fill="${bg}"/>
<rect x="196" y="-20" width="150" height="220" rx="16" fill="${mid}"/>
<circle cx="262" cy="92" r="46" fill="#d9a84e"/>
<text x="20" y="54" font-family="Manrope,sans-serif" font-size="11" font-weight="700" letter-spacing="1.3" fill="#d9a84e">${over}</text>
<text x="20" y="88" font-family="Sora,sans-serif" font-size="${title.length > 14 ? 20 : 26}" font-weight="700" fill="#fff">${title}</text>
${price ? `<text x="20" y="128" font-family="Sora,sans-serif" font-size="34" font-weight="700" fill="#fff">${price}</text>` : ''}
${unit ? `<text x="${20 + price.length * 19}" y="128" font-family="Manrope,sans-serif" font-size="13" font-weight="600" fill="#c9d2de">${unit}</text>` : ''}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MIN = 60_000;

export function seedDemo({ set }) {
  const now = Date.now();
  const c = 'companies/demo';

  set('users/demo-owner', { companyId: 'demo', name: 'Cristina Albuquerque', email: 'cristina@boamassa.com.br' });
  set(c, {
    name: 'Padaria Boa Massa', cnpj: '12.345.678/0001-90', phone: '(81) 3333-4444', city: 'Recife',
    ownerUid: 'demo-owner', plan: 'pro', screenLimit: 15, storageQuotaMB: 10240,
    storageUsedBytes: 1.86 * 1024 ** 3, screenSeq: 6, createdAt: now - 40 * 24 * 60 * MIN,
  });
  set(`${c}/members/demo-owner`, { role: 'owner', name: 'Cristina Albuquerque', email: 'cristina@boamassa.com.br', joinedAt: now - 40 * 1440 * MIN });
  set(`${c}/members/u-lucas`, { role: 'editor', name: 'Lucas Ferraz', email: 'lucas@boamassa.com.br', joinedAt: now - 12 * 1440 * MIN });
  set(`${c}/members/u-joana`, { role: 'viewer', name: 'Joana Prado', email: 'joana@boamassa.com.br', joinedAt: now - 3 * 1440 * MIN });
  set('invites/caixa.cf@boamassa.com.br', { companyId: 'demo', companyName: 'Padaria Boa Massa', role: 'viewer', invitedAt: now - 2 * 60 * MIN, invitedBy: 'Cristina Albuquerque' });

  set(`${c}/units/u1`, { name: 'Boa Viagem', address: 'Av. Conselheiro Aguiar, 1200' });
  set(`${c}/units/u2`, { name: 'Casa Forte', address: 'Praça de Casa Forte, 88' });
  set(`${c}/groups/g1`, { name: 'Caixas', color: 'data-1' });
  set(`${c}/groups/g2`, { name: 'Vitrines', color: 'data-2' });
  set(`${c}/groups/g3`, { name: 'Cozinha e retirada', color: 'data-3' });

  const media = [
    ['m1', 'Pão francês.png', 'image', { over: 'OFERTA DA SEMANA', title: 'Pão francês', price: 'R$ 12,90', unit: '/kg' }, 0.42],
    ['m2', 'Café + pão de queijo.png', 'image', { over: 'COMBO DA MANHÃ', title: 'Café + pão de queijo', price: 'R$ 9,90', tone: 'coffee' }, 0.38],
    ['m3', 'Bolo de rolo.png', 'image', { over: 'TRADIÇÃO PERNAMBUCANA', title: 'Bolo de rolo', price: 'R$ 38,00', unit: '/kg', tone: 'wine' }, 0.51],
    ['m4', 'Cuscuz recheado.png', 'image', { over: 'SÓ ATÉ 10H', title: 'Cuscuz recheado', price: 'R$ 14,50', tone: 'green' }, 0.33],
    ['m5', 'Vitrine de bolos.mp4', 'video', { over: 'VÍDEO · 0:20', title: 'Vitrine de bolos', price: '', tone: 'wine' }, 48.2, 20],
    ['m6', 'Sexta da pizza.png', 'image', { over: 'TODA SEXTA', title: 'Pizza brotinho', price: 'R$ 19,90', tone: 'wine' }, 0.47],
    ['m7', 'Institucional Boa Massa.mp4', 'video', { over: 'VÍDEO · 0:30', title: 'Boa Massa desde 1998', price: '' }, 72.5, 30],
    ['m8', 'Encomendas de Natal.png', 'image', { over: 'ENCOMENDAS ABERTAS', title: 'Chester e panetone', price: '', tone: 'green' }, 0.6],
  ];
  media.forEach(([id, name, type, art, mb, dur], i) => {
    const url = offerArt(art);
    set(`${c}/media/${id}`, {
      name, type, url, thumbUrl: url, sizeBytes: Math.round(mb * 1024 * 1024),
      ext: name.split('.').pop(), width: 1920, height: 1080, durationSec: dur || null,
      storagePath: `companies/demo/media/${id}`, createdAt: now - (i + 1) * 1440 * MIN * 2, createdBy: 'Cristina Albuquerque',
    });
  });

  set(`${c}/playlists/p1`, {
    name: 'Café da manhã', updatedAt: now - 2 * 1440 * MIN,
    items: [{ mediaId: 'm2', durationSec: 10 }, { mediaId: 'm4', durationSec: 10 }, { mediaId: 'm1', durationSec: 8 }, { mediaId: 'm7' }],
  });
  set(`${c}/playlists/p2`, {
    name: 'Tarde e lanches', updatedAt: now - 1440 * MIN,
    items: [{ mediaId: 'm1', durationSec: 10 }, { mediaId: 'm3', durationSec: 10 }, { mediaId: 'm5' }, { mediaId: 'm8', durationSec: 12, validFrom: '2026-11-15', validTo: '2026-12-24' }],
  });
  set(`${c}/playlists/p3`, {
    name: 'Sexta da pizza', updatedAt: now - 5 * 60 * MIN,
    items: [{ mediaId: 'm6', durationSec: 12 }, { mediaId: 'm5' }],
  });
  set(`${c}/playlists/p4`, { name: 'Institucional', updatedAt: now - 9 * 1440 * MIN, items: [{ mediaId: 'm7' }, { mediaId: 'm3', durationSec: 10 }] });

  set(`${c}/schedules/sc1`, {
    name: 'Grade da semana', status: 'published', priority: 0, groupIds: ['g1', 'g2', 'g3'], screenIds: [],
    fallbackPlaylistId: 'p4', publishedAt: now - 1440 * MIN, updatedAt: now - 1440 * MIN,
    slots: [
      { days: [1, 2, 3, 4, 5, 6], start: '06:00', end: '11:00', playlistId: 'p1' },
      { days: [1, 2, 3, 4, 5, 6], start: '11:00', end: '21:00', playlistId: 'p2' },
      { days: [0], start: '07:00', end: '13:00', playlistId: 'p1' },
    ],
  });
  set(`${c}/schedules/sc2`, {
    name: 'Sexta da pizza', status: 'published', priority: 10, groupIds: ['g2'], screenIds: [],
    publishedAt: now - 5 * 60 * MIN, updatedAt: now - 5 * 60 * MIN,
    slots: [{ days: [5], start: '17:00', end: '22:00', playlistId: 'p3' }],
  });
  set(`${c}/schedules/sc3`, {
    name: 'Natal 2026', status: 'draft', priority: 20, groupIds: ['g1', 'g2'], screenIds: [],
    updatedAt: now - 3 * 60 * MIN,
    slots: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '21:00', playlistId: 'p2' }],
  });

  const screens = [
    ['s1', 'VTX-0001', 'Caixa 1', 'u1', ['g1'], { lastSeen: now - 1 * MIN, simulate: 'live', nowPlaying: { mediaId: 'm1', name: 'Pão francês.png' } }, { mode: 'sidebar' }],
    ['s2', 'VTX-0002', 'Vitrine principal', 'u1', ['g2'], { lastSeen: now - 2 * MIN, simulate: 'live', syncState: { status: 'syncing', done: 3, total: 5 }, nowPlaying: { mediaId: 'm3', name: 'Bolo de rolo.png' } }, { mode: 'off' }],
    ['s3', 'VTX-0003', 'Retirada de pedidos', 'u1', ['g3'], { lastSeen: now - 1 * MIN, simulate: 'live', nowPlaying: null }, { mode: 'full' }],
    ['s4', 'VTX-0004', 'Caixa 2', 'u2', ['g1'], { lastSeen: now - 27 * MIN, nowPlaying: { mediaId: 'm2', name: 'Café + pão de queijo.png' } }, { mode: 'overlay' }],
    ['s5', 'VTX-0005', 'Vitrine Casa Forte', 'u2', ['g2'], { lastSeen: now - 3 * 60 * MIN - 12 * MIN, nowPlaying: { mediaId: 'm5', name: 'Vitrine de bolos.mp4' } }, { mode: 'off' }],
    ['s6', 'VTX-0006', 'Totem da entrada', 'u2', [], { lastSeen: now - 4 * MIN, simulate: 'live', appVersion: '0.0.9', orientation: 'portrait', nowPlaying: { mediaId: 'm7', name: 'Institucional Boa Massa.mp4' } }, { mode: 'off' }],
  ];
  screens.forEach(([id, code, name, unitId, groupIds, extra, ob]) => {
    set(`${c}/screens/${id}`, {
      code, name, unitId, groupIds, orientation: 'landscape', platform: id === 's6' ? 'android-tv' : 'android',
      appVersion: '0.3.0', resolution: '1920×1080', deviceUid: `dev-${id}`, pairedAt: now - 30 * 1440 * MIN,
      orderBoard: { ...ORDER_BOARD_DEFAULTS, ...ob }, ...extra,
    });
  });

  set(`${c}/integrations/int-gerencia`, {
    name: 'GerenciaAI · Caixa 1', type: 'gerenciaai', unitId: 'u1', deviceUid: 'int-gerencia',
    pairedAt: now - 6 * 1440 * MIN, lastSeen: now - 1 * MIN,
  });

  const orders = [
    ['o1', '137', 'Maria da Silva', 'ready', 2],
    ['o2', '138', 'João Pedro Lima', 'ready', 5],
    ['o3', '139', 'Ana Beatriz Costa', 'preparing'],
    ['o4', '140', 'Carlos Eduardo', 'preparing'],
  ];
  orders.forEach(([id, number, customerName, status, readyAgo], i) => {
    set(`${c}/orders/${id}`, {
      number, customerName, status, unitId: 'u1', source: 'gerenciaai', terminal: 'Caixa 1',
      createdAt: now - (12 - i) * MIN, readyAt: readyAgo ? now - readyAgo * MIN : null,
    });
  });
}
