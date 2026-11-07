// Estados de demonstração do player: abra com ?demo=pairing|play|overlay|sidebar|board|empty|offline
// Servem para conferir o visual sem TV e sem Firebase.
// Extras: &rot=90 &zoom=95 &x=2 &y=-1 &fit=blur &calib=1 &poster=1 (arte vertical 9:16)
import { ORDER_BOARD_DEFAULTS } from '@vertice/shared';

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
