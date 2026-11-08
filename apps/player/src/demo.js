// Estados de demonstração do player: abra com ?demo=pairing|play|overlay|sidebar|board|empty|offline
// Servem para conferir o visual sem TV e sem Firebase.
// Extras: &rot=90 &zoom=95 &x=2 &y=-1 &fit=blur &calib=1 &poster=1 (arte vertical 9:16)
import { ORDER_BOARD_DEFAULTS, priceListForTv } from '@vertice/shared';

function art(over, title, price, tone = '#141b26', mid = '#293548') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="1920" height="1080">
<rect width="320" height="180" fill="${tone}"/><rect x="196" y="-20" width="150" height="220" rx="16" fill="${mid}"/>
<circle cx="262" cy="92" r="46" fill="#d9a84e"/>
<text x="20" y="54" font-family="Manrope,sans-serif" font-size="11" font-weight="700" letter-spacing="1.3" fill="#d9a84e">${over}</text>
<text x="20" y="88" font-family="Sora,sans-serif" font-size="24" font-weight="700" fill="#fff">${title}</text>
<text x="20" y="128" font-family="Sora,sans-serif" font-size="34" font-weight="700" fill="#fff">${price}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const items = [
  { key: 'p:0', mediaId: 'm1', name: 'Pão francês.png', type: 'image', url: art('OFERTA DA SEMANA', 'Pão francês', 'R$ 12,90'), durationSec: 8 },
  { key: 'p:1', mediaId: 'm3', name: 'Bolo de rolo.png', type: 'image', url: art('TRADIÇÃO PERNAMBUCANA', 'Bolo de rolo', 'R$ 38,00', '#3a1620', '#5c2232'), durationSec: 8 },
];
function poster() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 320" width="1080" height="1920">
<rect width="180" height="320" fill="#5c2232"/><circle cx="90" cy="150" r="62" fill="#d9a84e"/>
<text x="16" y="44" font-family="Manrope,sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#ffd9a0">COMBO DO DIA</text>
<text x="16" y="250" font-family="Sora,sans-serif" font-size="22" font-weight="700" fill="#fff">Cachorro-quente</text>
<text x="16" y="290" font-family="Sora,sans-serif" font-size="30" font-weight="700" fill="#fff">R$ 14,90</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
if (params.get('poster')) items.unshift({ key: 'p:x', mediaId: 'm9', name: 'Combo.png', type: 'image', url: poster(), durationSec: 8 });

if (params.get('az')) items[0] = { ...items[0], adjust: { zoom: Number(params.get('az')), offsetX: Number(params.get('ax') || 0), offsetY: Number(params.get('ay') || 0) } };

// &app=price|clock|ticker|weather|rss: a TV mostra só esse aplicativo (conferir o visual dos apps).
const DEMO_APPS = {
  price: { kind: 'price', config: { listId: 'pl1' }, data: priceListForTv({ title: 'Pães e salgados', subtitle: 'Saindo do forno agora', footer: 'Aceitamos Pix, cartão e vale-refeição', layout: params.get('layout') || 'list', items: [
    { name: 'Pão francês', unit: 'kg', price: 14.9, promoPrice: 12.9 }, { name: 'Pão de queijo', unit: 'kg', price: 59.9 }, { name: 'Pão integral', unit: 'un', price: 11.5 },
    { name: 'Coxinha de frango', unit: 'un', price: 7.5, highlight: true }, { name: 'Empada de camarão', unit: 'un', price: 9.9 }, { name: 'Bolo de rolo', unit: 'kg', price: 42, promoPrice: 38 },
    { name: 'Cuscuz recheado', unit: 'un', price: 14.5 }, { name: 'Café coado', unit: '200 ml', price: 4.5 }, { name: 'Suco de laranja', unit: '300 ml', price: 8 }, { name: 'Tapioca de queijo', unit: 'un', price: 10 },
  ] }) },
  clock: { kind: 'clock', config: { message: 'Pão quentinho saindo de hora em hora', showDate: true, theme: 'night' } },
  ticker: { kind: 'ticker', config: { title: 'Encomendas de Natal abertas', lines: ['Peça seu chester e panetone até 20/12', 'Aceitamos Pix e cartão', 'Wi-Fi: BoaMassa-Clientes'], speed: 'normal', theme: 'wine' } },
  weather: { kind: 'weather', config: { city: 'Recife, Pernambuco', lat: -8.05, lon: -34.88, days: 4, theme: 'brand' } },
  rss: { kind: 'rss', config: { url: 'https://g1.globo.com/rss/g1/pernambuco/', source: 'g1 Pernambuco', count: 5, theme: 'night' } },
  qr: { kind: 'qr', config: { mode: 'wifi', ssid: 'BoaMassa-Clientes', password: 'paoquentinho', title: 'Wi-Fi grátis para clientes', subtitle: 'Aponte a câmera do celular e conecte', theme: 'light' } },
  sheet: { kind: 'sheet', config: { url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0', title: 'Escala da semana', rows: 8, header: true, theme: 'night' } },
};
// Peças do Estúdio (&app=studio&tpl=offer|notice|menu|welcome|event), com uma "foto" desenhada.
const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><radialGradient id="g" cx=".4" cy=".4"><stop offset="0" stop-color="#F2C46B"/><stop offset=".6" stop-color="#B8642A"/><stop offset="1" stop-color="#3B1A0C"/></radialGradient></defs><rect width="1200" height="900" fill="url(#g)"/><circle cx="600" cy="470" r="250" fill="#E9B26A" stroke="#7A3B14" stroke-width="30"/><path d="M380 470 Q600 300 820 470" stroke="#7A3B14" stroke-width="18" fill="none"/></svg>')}`;
const STUDIO_DEMO = {
  offer: { template: 'offer', theme: 'wine', fields: { badge: 'SÓ HOJE', product: 'Bolo de rolo', detail: 'Feito hoje cedo, receita da casa', oldPrice: '42,00', price: '38,00', unit: 'kg', footnote: 'Válido enquanto durar o estoque' } },
  notice: { template: 'notice', theme: 'brand', fields: { icon: 'clock', overline: 'NOVO HORÁRIO', title: 'Abrimos aos domingos', text: 'A partir de 15/11, das 7h às 13h.' } },
  menu: { template: 'menu', theme: 'night', fields: {} },
  welcome: { template: 'welcome', theme: 'light', fields: {} },
  event: { template: 'event', theme: 'green', fields: {} },
};
if (params.get('app') === 'studio') {
  const cfg = STUDIO_DEMO[params.get('tpl')] || STUDIO_DEMO.offer;
  DEMO_APPS.studio = { kind: 'studio', config: cfg, ...(params.get('foto') !== '0' && cfg.template !== 'notice' ? { image: { mediaId: 'foto', url: PHOTO } } : {}) };
}
if (DEMO_APPS[params.get('app')]) {
  items.splice(0, items.length, { key: 'p:app', mediaId: 'app', name: 'App', type: 'app', url: null, app: DEMO_APPS[params.get('app')], durationSec: 3600 });
}

const allDay = { id: 'demo:0', priority: 0, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00', items };

const now = Date.now();
const MIN = 60_000;
const orders = [
  { id: 'o1', number: '137', customerName: 'Maria da Silva', status: 'ready', readyAt: now - 3 * MIN, createdAt: now - 14 * MIN },
  { id: 'o2', number: '138', customerName: 'João Pedro Lima', status: 'ready', readyAt: now - 5 * MIN, createdAt: now - 13 * MIN },
  { id: 'o3', number: '140', customerName: 'Ana Beatriz', status: 'preparing', createdAt: now - 8 * MIN },
  { id: 'o4', number: '141', customerName: 'Carlos Eduardo', status: 'preparing', createdAt: now - 6 * MIN },
  { id: 'o5', number: '142', customerName: 'Fernanda Rocha', status: 'preparing', createdAt: now - 4 * MIN },
  { id: 'o6', number: '143', customerName: 'Rafael Melo', status: 'preparing', createdAt: now - 2 * MIN },
];
/** Pedido que "fica pronto" 1 s depois de abrir (para ver o aviso e o destaque). */
export const demoReady = { id: 'o7', number: '139', customerName: 'Luiza Albuquerque', status: 'ready', readyAt: Date.now(), createdAt: now - 10 * MIN };

const cache = { src: (it) => it.url };

export function demoState(kind) {
  const network = { online: kind !== 'offline', type: 'wifi' };
  const base = { phase: 'paired', network, cache, cacheVersion: 0, sync: { status: 'synced', done: 2, total: 2 }, orders: [] };
  const manifest = (mode, slots = [allDay]) => ({
    screen: {
      id: 's1', code: 'VTX-0001', name: 'Caixa 1', unitId: null,
      display: { rotation: Number(params.get('rot') || 0), zoom: Number(params.get('zoom') || 100), offsetX: Number(params.get('x') || 0), offsetY: Number(params.get('y') || 0), fit: params.get('fit') || 'cover' },
      calibrateUntil: params.get('calib') ? Date.now() + 10 * MIN : 0,
    },
    company: { name: 'Padaria Boa Massa' },
    orderBoard: { ...ORDER_BOARD_DEFAULTS, mode },
    // &wall=2x2&cell=0,1&bezel=2: esta TV como uma célula de video wall (conferir o recorte).
    wall: params.get('wall') ? (() => {
      const [cols, rows] = params.get('wall').split('x').map(Number);
      const [row, col] = (params.get('cell') || '0,0').split(',').map(Number);
      return { id: 'w', name: 'Demo', rows, cols, row, col, bezel: Number(params.get('bezel') || 0) };
    })() : null,
    slots,
    fallback: [],
    assets: [],
  });
  switch (kind) {
    case 'pairing': return { ...base, phase: 'pairing', code: '4F7K2Q', codeExpiresAt: Date.now() + 27 * MIN, manifest: null };
    case 'offline': return { ...base, phase: 'error', manifest: null };
    case 'empty': return { ...base, manifest: manifest('off', []) };
    case 'overlay': return { ...base, manifest: manifest('overlay'), orders, addLater: true };
    case 'sidebar': return { ...base, manifest: manifest('sidebar'), orders, addLater: true };
    case 'board': return { ...base, manifest: manifest('full'), orders, addLater: true };
    default: return { ...base, manifest: manifest('off') };
  }
}
