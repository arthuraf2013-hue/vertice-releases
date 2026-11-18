// Estados de demonstração do player: abra com ?demo=pairing|play|overlay|sidebar|board|empty|offline|blocked
// Servem para conferir o visual sem TV e sem Firebase.
// Extras: &rot=90 &zoom=95 &x=2 &y=-1 &fit=blur &calib=1 &poster=1 (arte vertical 9:16)
import { ORDER_BOARD_DEFAULTS, priceListForTv } from '@vertice/shared';

function art(over, title, price, tone = '#060b1c', mid = '#0f1f4d') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="1920" height="1080">
<rect width="320" height="180" fill="${tone}"/><rect x="196" y="-20" width="150" height="220" rx="16" fill="${mid}"/>
<circle cx="262" cy="92" r="46" fill="#e8a93a"/>
<text x="20" y="54" font-family="Manrope,sans-serif" font-size="11" font-weight="700" letter-spacing="1.3" fill="#e8a93a">${over}</text>
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
<rect width="180" height="320" fill="#5c2232"/><circle cx="90" cy="150" r="62" fill="#e8a93a"/>
<text x="16" y="44" font-family="Manrope,sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#ffd9a0">COMBO DO DIA</text>
<text x="16" y="250" font-family="Sora,sans-serif" font-size="22" font-weight="700" fill="#fff">Cachorro-quente</text>
<text x="16" y="290" font-family="Sora,sans-serif" font-size="30" font-weight="700" fill="#fff">R$ 14,90</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
if (params.get('poster')) items.unshift({ key: 'p:x', mediaId: 'm9', name: 'Combo.png', type: 'image', url: poster(), durationSec: 8 });

if (params.get('az')) items[0] = { ...items[0], adjust: { zoom: Number(params.get('az')), offsetX: Number(params.get('ax') || 0), offsetY: Number(params.get('ay') || 0) } };

// &app=price|clock|ticker|weather|rss|rain|air|...|comments: a TV mostra só esse aplicativo (conferir o visual dos apps).
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
  rain: { kind: 'rain', config: { city: 'Recife, Pernambuco', lat: -8.05, lon: -34.88, hours: 12, theme: 'night' } },
  air: { kind: 'air', config: { city: 'Recife, Pernambuco', lat: -8.05, lon: -34.88, theme: 'night' } },
  sunmoon: { kind: 'sunmoon', config: { city: 'Recife, Pernambuco', lat: -8.05, lon: -34.88, theme: 'night' } },
  matches: { kind: 'matches', config: { leagueId: 4351, team: '', results: 2, upcoming: 3, theme: 'green' } },
  standings: { kind: 'standings', config: { leagueId: 4351, team: 'Sport', rows: 8, theme: 'green' } },
  headlines: { kind: 'headlines', config: { feeds: [{ label: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml' }], everySec: 8, theme: 'night' } },
  currency: { kind: 'currency', config: { codes: ['USD', 'EUR', 'BTC'], theme: 'night' } },
  indicators: { kind: 'indicators', config: { items: ['selic', 'ipca12', 'cdi'], theme: 'brand' } },
  holidays: { kind: 'holidays', config: { extra: '08/12 Nossa Senhora da Conceição (Recife)', count: 5, theme: 'brand' } },
  countdown: { kind: 'countdown', config: { title: 'Black Friday começa em', target: `${new Date().getFullYear()}-11-27T08:00`, theme: 'wine' } },
  birthdays: { kind: 'birthdays', config: { title: 'Aniversariantes do mês', list: `Ana Souza ${new Date().getDate()}/${new Date().getMonth() + 1}\nBruno Lima 03/${new Date().getMonth() + 1}\nCarla Mendes 21/${new Date().getMonth() + 1}\nDiego Alves 28/${new Date().getMonth() + 1}`, theme: 'wine' } },
  onthisday: { kind: 'onthisday', config: { count: 3, theme: 'light' } },
  agenda: { kind: 'agenda', config: { url: 'https://calendar.google.com/calendar/ical/x/public/basic.ics', title: 'Próximos eventos', theme: 'night' } },
  worldclock: { kind: 'worldclock', config: { zones: ['America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Asia/Tokyo'], theme: 'night' } },
  quote: { kind: 'quote', config: { title: 'Frase do dia', list: '', theme: 'light' } },
  comments: { kind: 'comments', config: { title: 'Deixe seu recado', question: 'O que você achou do nosso atendimento?', showQr: true, rotateSec: 8, maxShown: 3, boardId: 'demo', link: 'https://vertice.vettasistemas.com.br/comentar?e=demo&m=demo', theme: 'brand' } },
  queue: { kind: 'queue', config: { title: 'Acompanhe sua senha', types: [{ prefix: 'A', label: 'Normal' }, { prefix: 'P', label: 'Preferencial' }], counters: ['Guichê 1', 'Guichê 2', 'Guichê 3'], queueId: 'demo', theme: 'brand' } },
  timer: { kind: 'timer', config: { mode: params.get('mode') || 'amrap', minutes: 12, rounds: 8, work: 40, rest: 20, prep: 10, title: 'WOD de hoje', wod: '10 burpees\n15 kettlebell swings 24/16 kg\n20 air squats\n200 m corrida', timerId: 'demo', theme: 'night' } },
  poll: { kind: 'poll', config: { question: 'Qual sabor de bolo você quer no sábado?', options: ['Chocolate com morango', 'Bolo de rolo', 'Cenoura com calda', 'Macaxeira'], showQr: true, showResults: true, pollId: 'demo', link: 'https://vertice.vettasistemas.com.br/votar?e=demo&m=demo', theme: 'brand' } },
  photowall: { kind: 'photowall', config: { title: 'Festa de 10 anos', question: 'Mande sua foto e apareça no telão!', showQr: true, rotateSec: 6, boardId: 'demo', link: 'https://vertice.vettasistemas.com.br/comentar?e=demo&m=demo', layout: params.get('layout') === 'single' ? 'single' : 'mosaic', theme: 'night' } },
  drive: { kind: 'drive', config: { url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp', seconds: 6, theme: 'night' } },
  stream: { kind: 'stream', config: { url: 'https://example.com/live/index.m3u8', title: 'Canal da loja' } },
  sheet: { kind: 'sheet', config: { url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0', title: 'Escala da semana', rows: 8, header: true, mode: params.get('mode') || 'table', theme: 'night' } },
  lottery: { kind: 'lottery', config: { games: ['megasena', 'lotofacil', 'quina'], everySec: 8, theme: 'night' } },
  horoscope: { kind: 'horoscope', config: { everySec: 4, theme: 'night' } },
  quiz: { kind: 'quiz', config: { title: 'Quiz do dia', perDay: 5, thinkSec: 10, revealSec: 5, useBank: true, theme: 'brand' } },
  agro: { kind: 'agro', config: { title: 'Cotações do agro', items: [2, 12, 77, 23, 53, 124, 130, 3], theme: 'green' } },
  tribute: { kind: 'tribute', config: { name: 'Ana Souza', role: 'Equipe financeira', message: 'Feliz aniversário! Que seu novo ano seja incrível.', template: params.get('tpl') || 'confete' } },
  classes: { kind: 'classes', config: { title: 'Aulas de hoje', list: 'todo dia 06:00-07:00 Funcional | Prof. Rafa | Sala 1\ntodo dia 07:00-08:00 Spinning | Prof. Ana | Sala 2\ntodo dia 12:00-13:00 Pilates | Carla | Sala 3\ntodo dia 18:00-19:00 Muay thai | Diego | Tatame\ntodo dia 19:00-20:00 Zumba | Bia | Sala 1\ntodo dia 20:00-21:00 Alongamento | Edu | Sala 2', theme: 'night' } },
  fitness: { kind: 'fitness', config: { back: params.get('back') || 'iron', count: 3, everySec: 8 } },
  room: { kind: 'room', config: { name: 'Sala Capibaribe', url: 'https://example.com/sala.ics', theme: 'night' } },
  survey: { kind: 'survey', config: { title: 'Sua opinião importa', subtitle: 'Leva menos de 1 minuto', questions: [{ type: 'nps', text: 'De 0 a 10, quanto você recomendaria a gente a um amigo?' }, { type: 'stars', text: 'Como foi o atendimento hoje?' }], link: 'https://vertice.vettasistemas.com.br/pesquisa?e=demo&m=demo', theme: 'brand' } },
  radio: { kind: 'radio', config: { url: 'https://example.com/radio.mp3', name: 'Rádio Boa Massa', slogan: 'A trilha do seu café da manhã', theme: 'night' } },
  clock2: { kind: 'clock', config: { style: 'both', showSeconds: true, dateFormat: 'full', message: 'Bom dia! Pão quentinho até as 10h', theme: 'brand' } },
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
    // &zonas=side|split|lshape|full &barra=1: layout em zonas e barra inferior.
    layout: params.get('zonas') || params.get('barra') ? demoLayout() : null,
    // &fechado=black|clock|message: fora do expediente.
    hours: params.get('fechado') ? { enabled: true, days: [], open: '08:00', close: '18:00', closedMode: params.get('fechado'), closedText: 'Estamos fechados. Até amanhã!', volumes: [], volume: 100 } : null,
    // &alerta=red|amber|blue: alerta urgente por cima de tudo.
    alert: params.get('alerta') ? { id: 'a1', active: true, title: params.get('alerta') === 'blue' ? 'Loja fechando' : 'Atenção', text: params.get('alerta') === 'blue' ? 'Encerramos o atendimento em 15 minutos. Obrigado pela visita!' : 'Por favor, siga as orientações da equipe e mantenha a calma.', theme: params.get('alerta'), sound: false, startedAt: Date.now() - 2 * MIN, until: Date.now() + 28 * MIN, screenIds: null } : null,
  });
  switch (kind) {
    case 'pairing': return { ...base, phase: 'pairing', code: '4F7K2Q', codeExpiresAt: Date.now() + 27 * MIN, manifest: null };
    case 'offline': return { ...base, phase: 'error', manifest: null };
    case 'empty': return { ...base, manifest: manifest('off', []) };
    case 'blocked': return { ...base, manifest: manifest('off'), licenseBlocked: true };
    case 'overlay': return { ...base, manifest: manifest('overlay'), orders, addLater: true };
    case 'sidebar': return { ...base, manifest: manifest('sidebar'), orders, addLater: true };
    case 'board': return { ...base, manifest: manifest('full'), orders, addLater: true };
    default: return { ...base, manifest: manifest('off') };
  }
}

function appItem(key, app, sec = 30) {
  return { key, mediaId: key, name: key, type: 'app', url: null, app, durationSec: sec };
}
function demoLayout() {
  const t = params.get('zonas') || 'full';
  return {
    id: 'L', name: 'Demo', template: t, sideWidth: 30,
    zones: {
      ...(t === 'side' || t === 'lshape' ? { side: [appItem('z-qr', { kind: 'qr', config: { mode: 'wifi', ssid: 'BoaMassa-Clientes', password: 'x', title: 'Wi-Fi grátis', subtitle: 'Aponte a câmera', theme: 'light' } }, 3600)] } : {}),
      ...(t === 'split' ? { second: [appItem('z-q', DEMO_APPS.queue, 3600)] } : {}),
      ...(t === 'lshape' ? { foot: [appItem('z-tk', { kind: 'clock', config: { message: '', showDate: true, theme: 'brand' } }, 3600)] } : {}),
    },
    bar: params.get('barra') ? { enabled: true, lines: ['Encomendas de Natal abertas até 20/12', 'Pix, cartão e vale-refeição', 'Siga @padariaboamassa'], speed: 'normal', clock: true, date: true, title: 'Boa Massa', theme: params.get('barra') === '1' ? 'brand' : params.get('barra'), logo: null } : null,
  };
}
