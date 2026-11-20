// Dados de exemplo do modo demonstração: "Padaria Boa Massa", duas unidades em Recife.
import { ORDER_BOARD_DEFAULTS } from '@vertice/shared';
import { seedFinance } from './seedFinance.js';

/** Arte de oferta em SVG (substitui imagens reais na demonstração). */
export function offerArt({ over, title, price, unit = '', tone = 'navy', w = 1920, h = 1080 }) {
  const bg = { navy: '#060b1c', wine: '#3a1620', green: '#10261d', coffee: '#2a1c12' }[tone] || '#060b1c';
  const mid = { navy: '#0f1f4d', wine: '#5c2232', green: '#1d3f30', coffee: '#4a3220' }[tone] || '#0f1f4d';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="${w}" height="${h}">
<rect width="320" height="180" fill="${bg}"/>
<rect x="196" y="-20" width="150" height="220" rx="16" fill="${mid}"/>
<circle cx="262" cy="92" r="46" fill="#e8a93a"/>
<text x="20" y="54" font-family="Manrope,sans-serif" font-size="11" font-weight="700" letter-spacing="1.3" fill="#e8a93a">${over}</text>
<text x="20" y="88" font-family="Sora,sans-serif" font-size="${title.length > 14 ? 20 : 26}" font-weight="700" fill="#fff">${title}</text>
${price ? `<text x="20" y="128" font-family="Sora,sans-serif" font-size="34" font-weight="700" fill="#fff">${price}</text>` : ''}
${unit ? `<text x="${20 + price.length * 19}" y="128" font-family="Manrope,sans-serif" font-size="13" font-weight="600" fill="#c9d2de">${unit}</text>` : ''}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export function seedDemo({ set }) {
  const now = Date.now();
  const c = 'companies/demo';

  set('users/demo-owner', { companyId: 'demo', name: 'Cristina Albuquerque', email: 'cristina@boamassa.com.br' });
  set(c, {
    name: 'Padaria Boa Massa', cnpj: '12.345.678/0001-90', phone: '(81) 3333-4444', city: 'Recife',
    ownerUid: 'demo-owner', plan: 'pro', screenLimit: 15, storageQuotaMB: 10240,
    storageUsedBytes: 1.86 * 1024 ** 3, screenSeq: 6, screenCount: 6, createdAt: now - 40 * 24 * 60 * MIN,
    // ?licenca=vencida|teste|suspensa mostra os avisos de licença na demonstração.
    status: 'active', paidUntil: now + 12 * DAY,
    ...(typeof location !== 'undefined' ? ({
      vencida: { paidUntil: now - 2 * DAY },
      teste: { status: 'trial', trialEndsAt: now + 2 * DAY, paidUntil: null },
      suspensa: { status: 'suspended' },
    })[new URLSearchParams(location.search).get('licenca')] : null), graceDays: 5, monthlyPrice: 189.9, ownerEmail: 'cristina@boamassa.com.br',
    hours: { enabled: true, days: [1, 2, 3, 4, 5, 6], open: '06:00', close: '20:00', closedMode: 'clock', closedText: '', volumes: [{ start: '12:00', end: '14:00', level: 40 }], volume: 80 },
    catalog: { enabled: true, title: 'Anuncie nas TVs da Boa Massa', intro: 'Seu anúncio nas TVs das nossas padarias, visto por quem já está comprando.', whatsapp: '5581999990000',
      packages: [{ name: 'Básico', seconds: 15, insertionsPerDay: 60, days: 30, price: 290 }, { name: 'Destaque', seconds: 15, insertionsPerDay: 120, days: 30, price: 490 }] },
    alerts: { enabled: true, emails: ['cristina@boamassa.com.br'], whatsapps: ['5581999990000'], offlineMinutes: 15, quietStart: '22:00', quietEnd: '06:00' },
  });
  set(`${c}/payments/p1`, { amount: 189.9, paidAt: now - 18 * DAY, method: 'Pix', months: 1, paidUntil: now + 12 * DAY, by: 'Vetta Sistemas' });
  set(`${c}/payments/p2`, { amount: 189.9, paidAt: now - 48 * DAY, method: 'Pix', months: 1, paidUntil: now - 18 * DAY, by: 'Vetta Sistemas' });
  set('platform/settings', { signupOpen: true, trialDays: 14, graceDays: 5, supportWhatsApp: '5581999990000', supportEmail: 'contato@vettasistemas.com.br' });
  // Console da Vetta na demonstração: abra com ?vetta na URL.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('vetta')) {
    set('platformAdmins/demo-owner', { name: 'Vetta Sistemas' });
    // Base fictícia com 14 meses de história (MRR, faturas, recebimentos, telas): data/seedFinance.js.
    seedFinance({ set, now });
    set('mrrEvents/e-demo', { cid: 'demo', name: 'Padaria Boa Massa', type: 'new', from: 0, to: 189.9, delta: 189.9, at: now - 48 * DAY, plan: 'pro' });
  }
  set(`${c}/members/demo-owner`, { role: 'owner', name: 'Cristina Albuquerque', email: 'cristina@boamassa.com.br', joinedAt: now - 40 * 1440 * MIN });
  set(`${c}/members/u-lucas`, { role: 'editor', name: 'Lucas Ferraz', email: 'lucas@boamassa.com.br', joinedAt: now - 12 * 1440 * MIN });
  set(`${c}/members/u-joana`, { role: 'viewer', name: 'Joana Prado', email: 'joana@boamassa.com.br', joinedAt: now - 3 * 1440 * MIN });
  set('invites/caixa.cf@boamassa.com.br', { companyId: 'demo', companyName: 'Padaria Boa Massa', role: 'viewer', invitedAt: now - 2 * 60 * MIN, invitedBy: 'Cristina Albuquerque' });

  set(`${c}/units/u1`, { name: 'Boa Viagem', address: 'Av. Conselheiro Aguiar, 1200', city: 'Recife', geo: { lat: -8.1189, lon: -34.9008, city: 'Recife' }, catalog: { show: true, audience: 1400, description: 'Caixa, vitrine e balcão de café. Público família e trabalhadores da região.' } });
  set(`${c}/units/u2`, { name: 'Casa Forte', address: 'Praça de Casa Forte, 88', city: 'Recife', geo: { lat: -8.0322, lon: -34.9177, city: 'Recife' }, catalog: { show: true, audience: 900, description: 'Video wall na vitrine voltado para a praça.' },
    hours: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], open: '06:00', close: '21:00', closedMode: 'message', closedText: 'Estamos fechados. Até amanhã!', volumes: [], volume: 80 } });
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
      ...({ m2: { advertiserId: 'adv1' }, m5: { advertiserId: 'adv2' } }[id] || {}),
    });
  });

  set(`${c}/playlists/p1`, {
    name: 'Café da manhã', updatedAt: now - 2 * 1440 * MIN,
    items: [{ mediaId: 'm2', durationSec: 10 }, { mediaId: 'm4', durationSec: 10 }, { mediaId: 'm1', durationSec: 8 }, { mediaId: 'm7' }, { mediaId: 'price_pl1' }, { mediaId: 'app-clock' }],
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

  // Aplicativos e Price (Fase 2).
  set(`${c}/media/app-clock`, { type: 'app', name: 'Relógio da loja', app: { kind: 'clock', config: { message: 'Pão quentinho saindo de hora em hora', theme: 'night' } }, sizeBytes: 0, createdAt: now - 3 * 1440 * MIN, updatedAt: now - 3 * 1440 * MIN });
  set(`${c}/media/app-weather`, { type: 'app', name: 'Clima em Recife', app: { kind: 'weather', config: { city: 'Recife, Pernambuco', lat: -8.05389, lon: -34.88111, days: 4, theme: 'brand' } }, sizeBytes: 0, createdAt: now - 2 * 1440 * MIN });
  set(`${c}/media/app-ticker`, { type: 'app', name: 'Avisos do balcão', app: { kind: 'ticker', config: { title: 'Encomendas de Natal abertas', lines: ['Peça seu chester e panetone até 20/12', 'Aceitamos Pix e cartão', 'Wi-Fi: BoaMassa-Clientes'], speed: 'normal', theme: 'wine' } }, sizeBytes: 0, createdAt: now - 1440 * MIN });
  set(`${c}/priceLists/pl1`, {
    name: 'Pães e salgados', title: 'Pães e salgados', subtitle: 'Saindo do forno agora', footer: 'Aceitamos Pix, cartão e vale-refeição', theme: 'night', layout: 'list',
    updatedAt: now - 2 * 60 * MIN,
    items: [
      { name: 'Pão francês', unit: 'kg', price: 14.9, promoPrice: 12.9, highlight: false },
      { name: 'Pão de queijo', unit: 'kg', price: 59.9 },
      { name: 'Pão integral', unit: 'un', price: 11.5 },
      { name: 'Coxinha de frango', unit: 'un', price: 7.5, highlight: true },
      { name: 'Empada de camarão', unit: 'un', price: 9.9 },
      { name: 'Bolo de rolo', unit: 'kg', price: 42, promoPrice: 38 },
      { name: 'Cuscuz recheado', unit: 'un', price: 14.5 },
      { name: 'Café coado', unit: '200 ml', price: 4.5 },
      { name: 'Suco de laranja', unit: '300 ml', price: 8 },
      { name: 'Tapioca de queijo', unit: 'un', price: 10 },
    ],
  });
  // Mural de comentários com comentários esperando, aprovados e um oculto.
  const muralLink = 'https://vertice.vettasistemas.com.br/comentar?e=demo&m=app-mural';
  set(`${c}/media/app-mural`, { type: 'app', name: 'Mural do café da manhã', app: { kind: 'comments', config: { title: 'Deixe seu recado', question: 'O que você achou do nosso café da manhã?', showQr: true, rotateSec: 8, maxShown: 3, autoApprove: false, blockedWords: '', boardId: 'app-mural', link: muralLink, theme: 'brand' } }, sizeBytes: 0, createdAt: now - 5 * 1440 * MIN });
  set(`${c}/commentBoards/app-mural`, { title: 'Deixe seu recado', question: 'O que você achou do nosso café da manhã?', open: true, autoApprove: false, companyName: 'Padaria Boa Massa', theme: 'brand', updatedAt: now - 5 * 1440 * MIN });
  set(`${c}/commentSettings/app-mural`, { autoApprove: false, words: [], blockPattern: 'a^' });
  [
    ['cm1', 'Mariana', 'Atendimento nota 10! O cuscuz de domingo é o melhor da cidade.', 'pending', 6],
    ['cm2', 'João Pedro', 'Poderiam ter mais opções sem glúten no café da manhã?', 'pending', 18],
    ['cm3', '', 'Pão de queijo sempre quentinho, parabéns à equipe!', 'pending', 42],
    ['cm4', 'Carla', 'Equipe muito simpática, voltarei com a família.', 'approved', 180],
    ['cm5', 'Rafael', 'Melhor bolo de rolo de Recife.', 'approved', 300],
    ['cm6', 'x', 'Propaganda: compre seguidores em…', 'hidden', 600],
  ].forEach(([id, name, text, status, min]) => set(`${c}/commentBoards/app-mural/comments/${id}`, { name, text, status, createdAt: now - min * MIN, uid: `anon-${id}`, ...(status !== 'pending' ? { moderatedAt: now - (min - 5) * MIN } : {}) }));
  set(`${c}/media/price_pl1`, { type: 'app', name: 'Preços · Pães e salgados', app: { kind: 'price', config: { listId: 'pl1' } }, sizeBytes: 0, createdAt: now - 2 * 60 * MIN });

  // Estúdio (Fase 3).
  set(`${c}/media/st-offer`, { type: 'app', name: 'Oferta: bolo de rolo', sizeBytes: 0, createdAt: now - 3 * 60 * MIN, updatedAt: now - 3 * 60 * MIN,
    app: { kind: 'studio', config: { template: 'offer', theme: 'wine', imageMediaId: 'm3', fields: { badge: 'SÓ HOJE', product: 'Bolo de rolo', detail: 'Feito hoje cedo, receita da casa', oldPrice: '42,00', price: '38,00', unit: 'kg', footnote: 'Válido enquanto durar o estoque' } } } });
  set(`${c}/media/st-notice`, { type: 'app', name: 'Aviso: domingo', sizeBytes: 0, createdAt: now - 5 * 60 * MIN,
    app: { kind: 'studio', config: { template: 'notice', theme: 'brand', fields: { icon: 'clock', overline: 'NOVO HORÁRIO', title: 'Abrimos aos domingos', text: 'A partir de 15/11, das 7h às 13h.' } } } });

  // Video wall (Fase 3).
  set(`${c}/videowalls/vw1`, { name: 'Vitrine Casa Forte', rows: 1, cols: 2, cells: ['s4', 's5'], playlistId: 'p1', bezel: 1.5, active: true, createdAt: now - 6 * 1440 * MIN });

  // Anunciantes (Fase 3).
  const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  set(`${c}/advertisers/adv1`, { name: 'Café Serra Azul', doc: '12.345.678/0001-90', contact: 'Juliana Prado', phone: '(81) 99876-5432', email: 'marketing@serraazul.com.br', contractFrom: isoDay(now - 20 * 1440 * MIN), contractTo: isoDay(now + 40 * 1440 * MIN), notes: 'Plano Vitrine: 4 telas, 20 s por exibição.', createdAt: now - 20 * 1440 * MIN });
  set(`${c}/advertisers/adv2`, { name: 'Laticínios Bom Leite', doc: '98.765.432/0001-10', contact: 'Marcos Lima', phone: '(81) 3333-2211', contractFrom: isoDay(now - 50 * 1440 * MIN), contractTo: isoDay(now + 9 * 1440 * MIN), createdAt: now - 50 * 1440 * MIN });
  set(`${c}/advertisers/adv3`, { name: 'Academia Ritmo', contact: 'Paula', contractFrom: isoDay(now - 90 * 1440 * MIN), contractTo: isoDay(now - 5 * 1440 * MIN), createdAt: now - 90 * 1440 * MIN });

  // Exibições dos últimos 14 dias (Relatórios).
  const ADV = { m2: 'adv1', m5: 'adv2' };
  const plays = [['m1', 'Pão francês.png', 10], ['m2', 'Café + pão de queijo.png', 10], ['m3', 'Bolo de rolo.png', 10], ['m5', 'Vitrine de bolos.mp4', 20], ['m7', 'Institucional Boa Massa.mp4', 30], ['price_pl1', 'Preços · Pães e salgados', 15], ['app-clock', 'Relógio da loja', 10]];
  ['s1', 's2', 's4', 's6'].forEach((sid, si) => {
    for (let d = 0; d < 14; d++) {
      const dt = new Date(now - d * 1440 * MIN);
      const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const items = {};
      plays.forEach(([mid, name, sec], mi) => {
        if ((mi + si) % 5 === 4) return;
        const n = Math.round(70 + 40 * Math.sin(d + mi) + (6 - mi) * 12 - si * 8 - (d === 0 ? 40 : 0));
        items[mid] = { plays: Math.max(4, n), seconds: Math.max(4, n) * sec, name, ...(ADV[mid] ? { adv: ADV[mid] } : {}) };
      });
      set(`${c}/playStats/${sid}_${date}`, { screenId: sid, date, items, updatedAt: now - d * 1440 * MIN });
    }
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

  // ---------- Recursos novos (layouts, horário, senhas, cronômetro, enquete, fotos, mídia indoor, atividade) ----------
  set(`${c}/layouts/L1`, {
    name: 'Caixas com Wi-Fi e avisos', template: 'side', sideWidth: 30, zones: { side: { playlistId: 'p-lateral' } },
    bar: { enabled: true, lines: ['Encomendas de Natal abertas até 20/12', 'Pix, cartão e vale-refeição', 'Siga @padariaboamassa'], speed: 'normal', clock: true, date: true, logoMediaId: '', title: 'Boa Massa', theme: 'brand' },
    groupIds: ['g1'], screenIds: [], active: true, updatedAt: now - 2 * 60 * MIN, createdAt: now - 3 * DAY,
  });
  set(`${c}/media/app-wifi`, { type: 'app', name: 'Wi-Fi dos clientes', app: { kind: 'qr', config: { mode: 'wifi', ssid: 'BoaMassa-Clientes', password: 'paoquentinho', security: 'WPA', title: 'Wi-Fi grátis', subtitle: 'Aponte a câmera', theme: 'light' } }, sizeBytes: 0, createdAt: now - 3 * DAY });
  set(`${c}/playlists/p-lateral`, { name: 'Coluna do caixa', updatedAt: now - 3 * DAY, items: [{ mediaId: 'app-wifi', durationSec: 20 }, { mediaId: 'app-weather', durationSec: 12 }] });

  set(`${c}/media/app-senhas`, { type: 'app', name: 'Senhas da encomenda', app: { kind: 'queue', config: { title: 'Retirada de encomendas', types: [{ prefix: 'A', label: 'Normal' }, { prefix: 'P', label: 'Preferencial' }], counters: ['Balcão 1', 'Balcão 2'], digits: 3, voice: true, sound: true, queueId: 'app-senhas', theme: 'brand' } }, sizeBytes: 0, createdAt: now - 2 * DAY });
  set(`${c}/queues/app-senhas`, { title: 'Retirada de encomendas', types: [{ prefix: 'A', label: 'Normal' }, { prefix: 'P', label: 'Preferencial' }], counters: ['Balcão 1', 'Balcão 2'], digits: 3,
    seq: { A: 24, P: 7 }, current: { code: 'A024', prefix: 'A', number: 24, counter: 'Balcão 2', at: now - 40_000, n: 31 },
    history: [{ code: 'P007', prefix: 'P', number: 7, counter: 'Balcão 1', at: now - 3 * MIN }, { code: 'A023', prefix: 'A', number: 23, counter: 'Balcão 1', at: now - 6 * MIN }, { code: 'A022', prefix: 'A', number: 22, counter: 'Balcão 2', at: now - 9 * MIN }] });
  set(`${c}/media/app-timer`, { type: 'app', name: 'Cronômetro do aulão', app: { kind: 'timer', config: { mode: 'tabata', minutes: 12, rounds: 8, work: 20, rest: 10, prep: 10, title: 'Aulão de sábado', wod: 'Agachamento\nFlexão\nPrancha\nPolichinelo', starts: '', timerId: 'app-timer', beeps: true, theme: 'night' } }, sizeBytes: 0, createdAt: now - 1 * DAY });
  set(`${c}/timers/app-timer`, { title: 'Aulão de sábado', status: 'stopped', startedAt: null, pausedAt: null, pausedMs: 0 });
  set(`${c}/media/app-enquete`, { type: 'app', name: 'Enquete do bolo de sábado', app: { kind: 'poll', config: { question: 'Qual bolo você quer no sábado?', options: ['Chocolate com morango', 'Bolo de rolo', 'Cenoura com calda', 'Macaxeira'], showQr: true, showResults: true, pollId: 'app-enquete', link: 'https://vertice.vettasistemas.com.br/votar?e=demo&m=app-enquete', theme: 'brand' } }, sizeBytes: 0, createdAt: now - 1 * DAY });
  set(`${c}/polls/app-enquete`, { question: 'Qual bolo você quer no sábado?', options: ['Chocolate com morango', 'Bolo de rolo', 'Cenoura com calda', 'Macaxeira'], open: true, round: 0, companyName: 'Padaria Boa Massa', theme: 'brand' });
  set(`${c}/pollTallies/app-enquete`, { round: 0, counts: { o0: 42, o1: 27, o2: 18, o3: 9 }, total: 96 });
  set(`${c}/media/app-fotos`, { type: 'app', name: 'Fotos da festa de 10 anos', app: { kind: 'photowall', config: { title: 'Festa de 10 anos', question: 'Mande sua foto e apareça no telão!', showQr: true, rotateSec: 6, boardId: 'app-fotos', link: 'https://vertice.vettasistemas.com.br/comentar?e=demo&m=app-fotos', layout: 'mosaic', theme: 'night' } }, sizeBytes: 0, createdAt: now - 5 * 60 * MIN });
  set(`${c}/commentBoards/app-fotos`, { title: 'Festa de 10 anos', question: 'Mande sua foto e apareça no telão!', open: true, autoApprove: false, companyName: 'Padaria Boa Massa', theme: 'night', kind: 'photos' });
  const photo = (color, label) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/><circle cx="400" cy="250" r="110" fill="rgba(255,255,255,.35)"/><text x="400" y="520" text-anchor="middle" font-family="Sora,sans-serif" font-size="44" font-weight="700" fill="#fff">${label}</text></svg>`)}`;
  [['f1', 'Mariana', 'Que festa!', '#1160D6', 'pending', 3], ['f2', 'João', '', '#E8A93A', 'pending', 7], ['f3', 'Carla', 'Parabéns, Boa Massa!', '#2E8B57', 'approved', 15]]
    .forEach(([id, name, text, color, status, min]) => set(`${c}/commentBoards/app-fotos/comments/${id}`, { name, text, photo: photo(color, name), status, createdAt: now - min * MIN, uid: `an-${id}` }));

  set(`${c}/proposals/pr1`, { client: 'Farmácia Pague Bem', contact: 'Roberta', phone: '(81) 98888-1122', email: '', unitIds: ['u1', 'u2'], packageName: 'Destaque', seconds: 15, insertionsPerDay: 120,
    start: isoDay(now + 2 * DAY), end: isoDay(now + 31 * DAY), price: 490, discount: 40, status: 'sent', notes: 'Inclui a vitrine de Casa Forte.', createdAt: now - 1 * DAY, updatedAt: now - 1 * DAY });
  set(`${c}/proposals/pr2`, { client: 'Ótica Visão Clara', contact: 'Paulo', phone: '', email: '', unitIds: ['u1'], packageName: 'Básico', seconds: 15, insertionsPerDay: 60,
    start: isoDay(now + 7 * DAY), end: isoDay(now + 36 * DAY), price: 290, discount: 0, status: 'draft', notes: '', createdAt: now - 3 * 60 * MIN, updatedAt: now - 3 * 60 * MIN });

  [['au1', 'publish', 'Grade', 'Grade da semana', 'Lucas Ferraz', 35], ['au2', 'update', 'Tabela de preços', 'Pães e salgados', 'Cristina Albuquerque', 80], ['au3', 'create', 'Layout', 'Caixas com Wi-Fi e avisos', 'Lucas Ferraz', 125],
    ['au4', 'delete', 'Mídia', 'Promo Dia das Mães.png', 'Lucas Ferraz', 300], ['au5', 'approve', 'Comentário', '', 'Joana Prado', 410], ['au6', 'alert-off', 'Alerta urgente', 'Sem sistema', 'Cristina Albuquerque', 1440]]
    .forEach(([id, action, area, targetName, byName, min]) => set(`${c}/audit/${id}`, { action, area, targetId: id, targetName, fields: action === 'update' ? ['items'] : [], uid: 'x', byName, at: now - min * MIN }));

}
