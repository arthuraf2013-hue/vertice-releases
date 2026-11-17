/**
 * Apps que conversam com gente: chamada de senhas, cronômetro de academia e enquete.
 * O estado ao vivo fica num documento do Firestore que a TV escuta; aqui ficam as contas,
 * iguais no painel, no celular, na página pública e na TV.
 */

/* ---------------- Chamada de senhas ---------------- */

export const QUEUE_LIMITS = { types: 4, counters: 12, history: 6, maxNumber: 999 };

export const QUEUE_DEFAULTS = {
  title: 'Acompanhe sua senha',
  types: [{ prefix: 'A', label: 'Normal' }, { prefix: 'P', label: 'Preferencial' }],
  counters: ['Guichê 1', 'Guichê 2'],
  digits: 3,
  voice: true,
  sound: true,
  theme: 'brand',
};

export function normalizeQueueConfig(c = {}) {
  const x = { ...QUEUE_DEFAULTS, ...c };
  const types = (x.types || [])
    .map((t) => ({ prefix: String(t.prefix || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2), label: String(t.label || '').slice(0, 24) }))
    .filter((t) => t.prefix)
    .slice(0, QUEUE_LIMITS.types);
  const counters = (Array.isArray(x.counters) ? x.counters : String(x.counters || '').split('\n'))
    .map((s) => String(s).trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, QUEUE_LIMITS.counters);
  return {
    ...x,
    types: types.length ? types : [{ prefix: 'A', label: 'Normal' }],
    counters: counters.length ? counters : ['Guichê 1'],
    digits: [2, 3].includes(Number(x.digits)) ? Number(x.digits) : 3,
  };
}

/** "A" + 13 → "A013". */
export function formatTicket(prefix, n, digits = 3) {
  return `${prefix}${String(Math.max(0, Number(n) || 0)).padStart(digits, '0')}`;
}

function pushHistory(q, entry) {
  const prev = q.current ? [q.current] : [];
  return [...prev, ...(q.history || [])].filter((h) => h && h.code !== entry.code).slice(0, QUEUE_LIMITS.history);
}

/** Próxima senha de um tipo, num guichê. Devolve o que gravar no documento da fila. */
export function callNext(q = {}, { prefix, counter, digits = 3, at = Date.now() }) {
  const n = ((q.seq?.[prefix] || 0) % QUEUE_LIMITS.maxNumber) + 1;
  const current = { code: formatTicket(prefix, n, digits), prefix, number: n, counter: counter || '', at, n: (q.current?.n || 0) + 1 };
  return { seq: { ...(q.seq || {}), [prefix]: n }, current, history: pushHistory(q, current) };
}

/** Chama um número escolhido (pessoa que não ouviu, senha pulada). Não muda a sequência. */
export function callNumber(q = {}, { prefix, number, counter, digits = 3, at = Date.now() }) {
  const n = Math.min(QUEUE_LIMITS.maxNumber, Math.max(1, Math.round(Number(number)) || 1));
  const current = { code: formatTicket(prefix, n, digits), prefix, number: n, counter: counter || '', at, n: (q.current?.n || 0) + 1 };
  return { current, history: pushHistory(q, current) };
}

/** Chama de novo a senha atual (a TV toca o aviso outra vez). */
export function callAgain(q = {}, { counter, at = Date.now() } = {}) {
  if (!q.current) return null;
  return { current: { ...q.current, counter: counter || q.current.counter, at, n: (q.current.n || 0) + 1 } };
}

/** Frase falada pela TV: "Senha A 13, Guichê 2". */
export function spokenTicket(cur) {
  if (!cur) return '';
  const where = cur.counter ? `, ${cur.counter}` : '';
  return `Senha ${cur.prefix.split('').join(' ')} ${cur.number}${where}`;
}

export function sampleQueue(now = Date.now()) {
  return {
    current: { code: 'A024', prefix: 'A', number: 24, counter: 'Guichê 2', at: now - 4000, n: 9 },
    history: [
      { code: 'P007', prefix: 'P', number: 7, counter: 'Guichê 1', at: now - 90_000 },
      { code: 'A023', prefix: 'A', number: 23, counter: 'Guichê 3', at: now - 160_000 },
      { code: 'A022', prefix: 'A', number: 22, counter: 'Guichê 2', at: now - 250_000 },
      { code: 'P006', prefix: 'P', number: 6, counter: 'Guichê 1', at: now - 400_000 },
    ],
    seq: { A: 24, P: 7 },
  };
}

/* ---------------- Cronômetro de academia ---------------- */

export const TIMER_MODES = {
  fortime: { label: 'For time', desc: 'Conta para cima até terminar ou bater o limite.' },
  amrap: { label: 'AMRAP', desc: 'O máximo de rodadas no tempo: contagem regressiva.' },
  emom: { label: 'EMOM', desc: 'Uma tarefa a cada minuto, por N rodadas.' },
  tabata: { label: 'Tabata', desc: '20 s de esforço e 10 s de descanso, 8 rodadas.' },
  interval: { label: 'Intervalado', desc: 'Esforço e descanso com tempos e rodadas à sua escolha.' },
  countdown: { label: 'Contagem regressiva', desc: 'Um tempo só, do jeito mais simples.' },
};

export const TIMER_DEFAULTS = {
  mode: 'amrap', minutes: 12, work: 40, rest: 20, rounds: 8, prep: 10,
  title: 'WOD do dia', wod: '', starts: '', theme: 'night',
};

export function normalizeTimer(c = {}) {
  const x = { ...TIMER_DEFAULTS, ...c };
  const mode = TIMER_MODES[x.mode] ? x.mode : 'amrap';
  const int = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Math.round(Number(v)))) : d);
  const out = {
    ...x,
    mode,
    minutes: int(x.minutes, 1, 120, 12),
    work: int(x.work, 5, 600, 40),
    rest: int(x.rest, 0, 600, 20),
    rounds: int(x.rounds, 1, 99, 8),
    prep: int(x.prep, 0, 30, 10),
  };
  if (mode === 'tabata') Object.assign(out, { work: 20, rest: 10, rounds: 8 });
  if (mode === 'emom') Object.assign(out, { work: 60, rest: 0 });
  return out;
}

/** Duração total sem a preparação (segundos). For time: o limite (minutos). */
export function timerTotal(cfg) {
  const c = normalizeTimer(cfg);
  if (c.mode === 'emom' || c.mode === 'tabata' || c.mode === 'interval') return c.rounds * (c.work + c.rest) - (c.mode === 'emom' ? 0 : c.rest);
  return c.minutes * 60;
}

const mmss = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Situação do cronômetro depois de `elapsed` segundos desde o "Iniciar" (inclui a preparação).
 * @returns {{ phase: 'idle'|'prep'|'work'|'rest'|'done', display: string, round: number, rounds: number, progress: number, label: string }}
 */
export function timerAt(cfg, elapsed) {
  const c = normalizeTimer(cfg);
  if (elapsed == null || elapsed < 0) return { phase: 'idle', display: c.mode === 'fortime' ? '00:00' : mmss(c.mode === 'amrap' || c.mode === 'countdown' ? c.minutes * 60 : c.work), round: 0, rounds: c.rounds, progress: 0, label: 'Pronto' };
  if (elapsed < c.prep) return { phase: 'prep', display: String(Math.ceil(c.prep - elapsed)), round: 0, rounds: c.rounds, progress: 0, label: 'Prepare-se' };
  const t = elapsed - c.prep;
  const total = timerTotal(c);
  if (t >= total) return { phase: 'done', display: c.mode === 'fortime' ? mmss(total) : '00:00', round: c.rounds, rounds: c.rounds, progress: 1, label: c.mode === 'fortime' ? 'Tempo esgotado' : 'Fim!' };
  if (c.mode === 'fortime') return { phase: 'work', display: mmss(Math.floor(t)), round: 0, rounds: 0, progress: t / total, label: `Limite ${c.minutes} min` };
  if (c.mode === 'amrap' || c.mode === 'countdown') return { phase: 'work', display: mmss(total - t), round: 0, rounds: 0, progress: t / total, label: 'Tempo restante' };
  const cycle = c.work + c.rest;
  const round = Math.floor(t / cycle) + 1;
  const inCycle = t - (round - 1) * cycle;
  const working = inCycle < c.work;
  return {
    phase: working ? 'work' : 'rest',
    display: mmss(working ? c.work - inCycle : cycle - inCycle),
    round,
    rounds: c.rounds,
    progress: t / total,
    label: working ? (c.mode === 'emom' ? `Minuto ${round}` : 'Esforço') : 'Descanso',
  };
}

/** Horários de aula ("06:00, 07:00, 18:30") → minutos do dia. */
export function parseStarts(text = '') {
  return [...new Set(String(text).split(/[\s,;]+/).map((s) => /^([01]?\d|2[0-3])[:h]([0-5]\d)$/.exec(s.trim())).filter(Boolean)
    .map((m) => Number(m[1]) * 60 + Number(m[2])))].sort((a, b) => a - b);
}

/**
 * Segundos decorridos agora, pelo estado gravado (iniciar/pausar no painel) ou, parado,
 * pelo horário de aula mais recente que ainda está correndo. null = parado.
 * @param {{status?:string, startedAt?:number, pausedAt?:number, pausedMs?:number}} state
 */
export function timerElapsed(cfg, state = {}, now = Date.now()) {
  if (state.status === 'running' && state.startedAt) return (now - state.startedAt - (state.pausedMs || 0)) / 1000;
  if (state.status === 'paused' && state.startedAt) return ((state.pausedAt || now) - state.startedAt - (state.pausedMs || 0)) / 1000;
  const c = normalizeTimer(cfg);
  const starts = parseStarts(c.starts);
  if (!starts.length || state.status === 'stopped') return null;
  const d = new Date(now);
  const min = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const last = starts.filter((s) => s <= min).pop();
  if (last == null) return null;
  const el = (min - last) * 60;
  return el <= c.prep + timerTotal(c) + 30 ? el : null;
}

/** Comandos do painel → novo estado. */
export function timerCommand(state = {}, cmd, now = Date.now()) {
  if (cmd === 'start') return { status: 'running', startedAt: now, pausedMs: 0, pausedAt: null };
  if (cmd === 'pause' && state.status === 'running') return { ...state, status: 'paused', pausedAt: now };
  if (cmd === 'resume' && state.status === 'paused') return { ...state, status: 'running', pausedMs: (state.pausedMs || 0) + (now - (state.pausedAt || now)), pausedAt: null };
  if (cmd === 'reset') return { status: 'stopped', startedAt: null, pausedAt: null, pausedMs: 0 };
  return state;
}

export function wodLines(text = '') {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10);
}

/* ---------------- Enquete ---------------- */

export const POLL_LIMITS = { question: 120, option: 40, minOptions: 2, maxOptions: 6 };

export const POLL_DEFAULTS = {
  question: 'Qual sabor você quer na semana que vem?', options: ['Chocolate', 'Morango', 'Doce de leite'],
  showQr: true, showResults: true, link: '', pollId: '', theme: 'brand',
};

export function pollOptions(list = []) {
  return (Array.isArray(list) ? list : String(list).split('\n'))
    .map((s) => String(s).trim().slice(0, POLL_LIMITS.option))
    .filter(Boolean)
    .slice(0, POLL_LIMITS.maxOptions);
}

/** Totais por opção, com porcentagem (a soma dá 100). */
export function pollResults(options = [], tally = {}) {
  const counts = options.map((_, i) => Math.max(0, Number(tally?.counts?.[`o${i}`]) || 0));
  const total = counts.reduce((a, b) => a + b, 0);
  let pcts = counts.map((n) => (total ? (n * 100) / total : 0));
  // Arredonda mantendo a soma em 100 (maiores restos ganham o ponto).
  if (total) {
    const floor = pcts.map(Math.floor);
    let rest = 100 - floor.reduce((a, b) => a + b, 0);
    const order = pcts.map((p, i) => [p - Math.floor(p), i]).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) { if (rest <= 0) break; floor[i] += 1; rest -= 1; }
    pcts = floor;
  }
  const max = Math.max(0, ...counts);
  return { total, rows: options.map((label, i) => ({ label, votes: counts[i], pct: pcts[i], leader: total > 0 && counts[i] === max })) };
}

export function voteLink(base, companyId, pollId) {
  if (!base || !companyId || !pollId) return '';
  return `${String(base).replace(/\/$/, '')}/votar?e=${encodeURIComponent(companyId)}&m=${encodeURIComponent(pollId)}`;
}

/** Id do voto: uma pessoa (aparelho) vota uma vez por rodada. */
export const voteId = (round, uid) => `${Number(round) || 0}_${uid}`;

export function sampleTally(n = 3) {
  const base = [42, 27, 18, 9, 5, 3];
  return { round: 0, counts: Object.fromEntries(base.slice(0, n).map((v, i) => [`o${i}`, v])), total: base.slice(0, n).reduce((a, b) => a + b, 0) };
}
