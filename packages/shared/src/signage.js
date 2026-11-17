/**
 * Recursos de tela que valem por cima da programação:
 *  - LAYOUTS: a tela dividida em zonas (principal + lateral, duas metades, em L) e a barra inferior.
 *  - HORÁRIO DE FUNCIONAMENTO: fora do expediente a TV escurece; volume por faixa de horário.
 *  - ALERTA URGENTE: uma mensagem que toma as telas na hora, até acabar o prazo ou alguém encerrar.
 * Tudo é compilado no manifesto (a TV continua lendo um documento só e funciona sem internet).
 */
/** "08:30" → 510; "24:00" → 1440. */
const toMinutesSafe = (t) => { const [h, m] = String(t || '0:0').split(':').map((n) => parseInt(n, 10) || 0); return h * 60 + m; };

/* ---------------- Layouts (zonas) ---------------- */

/**
 * Modelos de layout. `zones` são as zonas extras (a principal é sempre a programação da tela).
 * Medidas em % do quadro deitado; em pé o player empilha as zonas.
 */
export const LAYOUT_TEMPLATES = {
  full: { label: 'Tela inteira', desc: 'Só a programação, com ou sem barra inferior.', zones: [] },
  side: { label: 'Principal + lateral', desc: 'Vídeos e ofertas à esquerda, uma coluna fixa à direita.', zones: ['side'] },
  split: { label: 'Duas metades', desc: 'Duas programações lado a lado, do mesmo tamanho.', zones: ['second'] },
  lshape: { label: 'Em L', desc: 'Principal grande, coluna à direita e faixa embaixo.', zones: ['side', 'foot'] },
};

export const ZONE_LABEL = { side: 'Coluna lateral', second: 'Segunda metade', foot: 'Faixa de baixo' };

export const BAR_THEMES = {
  brand: { label: 'Azul Vértice', bg: '#0A1A44', fg: '#FFFFFF', accent: '#E8A93A' },
  dark: { label: 'Preta', bg: '#05070D', fg: '#F2F4F8', accent: '#E8A93A' },
  light: { label: 'Clara', bg: '#F4F6FA', fg: '#0A1A44', accent: '#1160D6' },
  red: { label: 'Vermelha', bg: '#8E1B1B', fg: '#FFFFFF', accent: '#FFD166' },
};

export const BAR_DEFAULTS = { enabled: false, lines: [], speed: 'normal', clock: true, date: false, logoMediaId: '', title: '', theme: 'brand' };

export function normalizeBar(bar) {
  const b = { ...BAR_DEFAULTS, ...(bar || {}) };
  return {
    enabled: !!b.enabled,
    lines: (Array.isArray(b.lines) ? b.lines : String(b.lines || '').split('\n')).map((l) => String(l).trim()).filter(Boolean).slice(0, 12),
    speed: ['slow', 'normal', 'fast'].includes(b.speed) ? b.speed : 'normal',
    clock: b.clock !== false,
    date: !!b.date,
    logoMediaId: b.logoMediaId || '',
    title: String(b.title || '').slice(0, 30),
    theme: BAR_THEMES[b.theme] ? b.theme : 'brand',
  };
}

export function normalizeLayout(l) {
  if (!l) return null;
  const template = LAYOUT_TEMPLATES[l.template] ? l.template : 'full';
  const zones = {};
  for (const z of LAYOUT_TEMPLATES[template].zones) zones[z] = { playlistId: l.zones?.[z]?.playlistId || '' };
  return {
    id: l.id || '',
    name: l.name || '',
    template,
    zones,
    sideWidth: Math.min(40, Math.max(20, Number(l.sideWidth) || 30)),
    bar: normalizeBar(l.bar),
    screenIds: l.screenIds || [],
    groupIds: l.groupIds || [],
    active: l.active !== false,
  };
}

/** O layout que vale para a tela: ligado e marcado para ela (direto vale mais que por grupo; depois o mais novo). */
export function layoutForScreen(layouts = [], screen = {}) {
  const groups = new Set(screen.groupIds || []);
  const score = (l) => ((l.screenIds || []).includes(screen.id) ? 2 : (l.groupIds || []).some((g) => groups.has(g)) ? 1 : 0);
  return layouts
    .filter((l) => l.active !== false && score(l) > 0)
    .sort((a, b) => score(b) - score(a) || (num(b.updatedAt) - num(a.updatedAt)))[0] || null;
}

const num = (v) => (typeof v === 'number' ? v : v?.toMillis ? v.toMillis() : Number(v) || 0);

/* ---------------- Horário de funcionamento e volume ---------------- */

export const HOURS_DEFAULTS = {
  enabled: false,
  days: [1, 2, 3, 4, 5, 6],
  open: '08:00',
  close: '18:00',
  closedMode: 'black', // black = tela preta; clock = relógio discreto; message = aviso "Fechado"
  closedText: 'Estamos fechados. Até amanhã!',
  volumes: [], // [{ start: '12:00', end: '14:00', level: 30 }]
  volume: 100,
};

export function normalizeHours(h) {
  if (!h) return { ...HOURS_DEFAULTS };
  const x = { ...HOURS_DEFAULTS, ...h };
  return {
    enabled: !!x.enabled,
    days: (x.days || []).map(Number).filter((d) => d >= 0 && d <= 6),
    open: validTime(x.open) || '08:00',
    close: validTime(x.close) || '18:00',
    closedMode: ['black', 'clock', 'message'].includes(x.closedMode) ? x.closedMode : 'black',
    closedText: String(x.closedText || '').slice(0, 80),
    volumes: (x.volumes || [])
      .map((v) => ({ start: validTime(v.start), end: validTime(v.end), level: clampLevel(v.level) }))
      .filter((v) => v.start && v.end)
      .slice(0, 6),
    volume: clampLevel(x.volume ?? 100),
  };
}

const validTime = (t) => (/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(String(t || '')) ? t : null);
const clampLevel = (n) => Math.min(100, Math.max(0, Math.round(Number(n)) || 0));

/** Horário da unidade (se ligado) senão o da empresa. */
export function hoursFor(company, unit) {
  if (unit?.hours?.enabled) return normalizeHours(unit.hours);
  return normalizeHours(company?.hours);
}

function inRange(start, end, date) {
  const min = date.getHours() * 60 + date.getMinutes();
  const a = toMinutesSafe(start);
  const b = toMinutesSafe(end);
  if (a === b) return true; // 00:00–00:00 = o dia todo
  return a < b ? min >= a && min < b : min >= a || min < b;
}

/**
 * A loja está aberta agora? Sem horário ligado, sempre aberta.
 * Expediente que vira a meia-noite (18:00 → 02:00): a madrugada pertence ao dia de abertura.
 */
export function isOpen(hours, date = new Date()) {
  const h = normalizeHours(hours);
  if (!h.enabled) return true;
  const day = date.getDay();
  const min = date.getHours() * 60 + date.getMinutes();
  const a = toMinutesSafe(h.open);
  const b = toMinutesSafe(h.close);
  if (a === b) return h.days.includes(day);
  if (a < b) return h.days.includes(day) && min >= a && min < b;
  const yesterday = (day + 6) % 7;
  return (h.days.includes(day) && min >= a) || (h.days.includes(yesterday) && min < b);
}

/** Volume (0–100) para agora: a faixa que vale ou o volume geral. */
export function volumeAt(hours, date = new Date()) {
  const h = normalizeHours(hours);
  const f = h.volumes.find((v) => inRange(v.start, v.end, date));
  return f ? f.level : h.volume;
}

/** Próxima abertura (texto curto para a tela "Fechado"). */
export function nextOpening(hours, date = new Date()) {
  const h = normalizeHours(hours);
  if (!h.enabled || !h.days.length) return null;
  for (let i = 0; i < 8; i++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
    if (!h.days.includes(d.getDay())) continue;
    const [hh, mm] = h.open.split(':').map(Number);
    d.setHours(hh, mm, 0, 0);
    if (d > date) {
      const label = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'long' });
      return `Abrimos ${label} às ${h.open}`;
    }
  }
  return null;
}

/* ---------------- Alerta urgente ---------------- */

export const ALERT_THEMES = {
  red: { label: 'Urgente (vermelho)', bg: '#B3141B', fg: '#FFFFFF' },
  amber: { label: 'Atenção (amarelo)', bg: '#F2B705', fg: '#1A1200' },
  blue: { label: 'Informativo (azul)', bg: '#0B4FB3', fg: '#FFFFFF' },
};

export const ALERT_PRESETS = [
  { title: 'Atenção', text: 'Por favor, siga as orientações da equipe.', theme: 'amber' },
  { title: 'Evacuação', text: 'Deixe o local pela saída mais próxima, com calma.', theme: 'red' },
  { title: 'Loja fechando', text: 'Encerramos o atendimento em 15 minutos. Obrigado pela visita!', theme: 'blue' },
  { title: 'Sem sistema', text: 'Estamos sem sistema no momento. Pagamentos só em dinheiro ou Pix.', theme: 'amber' },
];

export function normalizeAlert(a) {
  if (!a || !a.active) return null;
  return {
    active: true,
    id: String(a.id || ''),
    title: String(a.title || '').slice(0, 40),
    text: String(a.text || '').slice(0, 220),
    theme: ALERT_THEMES[a.theme] ? a.theme : 'red',
    sound: a.sound !== false,
    until: Number(a.until) || 0, // 0 = até encerrar
    startedAt: Number(a.startedAt) || 0,
    screenIds: Array.isArray(a.screenIds) && a.screenIds.length ? a.screenIds : null,
    by: String(a.by || ''),
  };
}

/** O alerta vale para esta tela agora? */
export function alertFor(alert, screenId, now = Date.now()) {
  const a = normalizeAlert(alert);
  if (!a) return null;
  if (a.until && a.until <= now) return null;
  if (a.screenIds && !a.screenIds.includes(screenId)) return null;
  return a;
}
