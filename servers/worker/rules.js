// Regras do serviço de alertas, sem Firebase nem rede (testadas em rules.test.js).

const DAY = 86400000;

/** Hora e minuto no fuso da loja, como "HH:MM". */
export function clockIn(tz, now = Date.now()) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now)).replace(/^24/, '00');
}

/** Dentro do horário de silêncio? Aceita faixa que vira a noite (22:00 → 06:00). */
export function inQuiet(start, end, tz, now = Date.now()) {
  if (!start || !end || start === end) return false;
  const t = clockIn(tz, now);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/**
 * Compara a situação de cada tela com o que já foi avisado.
 * screens: [{ id, name, lastSeen(ms) }]; state: { [id]: 'offline' | 'online' }.
 * Devolve quem caiu, quem voltou e o estado novo. Tela que nunca deu sinal é ignorada.
 */
export function screenTransitions(screens, state, { offlineMinutes = 15, now = Date.now() } = {}) {
  const limit = offlineMinutes * 60000;
  const down = [];
  const up = [];
  const next = {};
  for (const s of screens) {
    if (!s.lastSeen) continue;
    const off = now - s.lastSeen > limit;
    const was = state[s.id] || 'online';
    next[s.id] = off ? 'offline' : 'online';
    if (off && was !== 'offline') down.push(s);
    if (!off && was === 'offline') up.push(s);
  }
  return { down, up, next };
}

const fmtDay = (ms, tz) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: tz });
const ago = (ms, now) => {
  const min = Math.round((now - ms) / 60000);
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
};

export function offlineMessage(company, down, up, now = Date.now()) {
  const lines = [];
  if (down.length) {
    lines.push(down.length === 1 ? `A tela "${down[0].name}" está sem responder há ${ago(down[0].lastSeen, now)}.` : `${down.length} telas estão sem responder:`);
    if (down.length > 1) for (const s of down) lines.push(`• ${s.name} (há ${ago(s.lastSeen, now)})`);
    lines.push('Confira se a TV está ligada e com internet. O player toca o que já baixou mesmo sem internet, mas não recebe mudanças.');
  }
  if (up.length) lines.push(up.length === 1 ? `A tela "${up[0].name}" voltou a responder.` : `Voltaram a responder: ${up.map((s) => s.name).join(', ')}.`);
  const subject = down.length
    ? `Vértice: ${down.length === 1 ? `a tela ${down[0].name} parou` : `${down.length} telas pararam`} (${company.name})`
    : `Vértice: ${up.length === 1 ? `a tela ${up[0].name} voltou` : 'telas voltaram'} (${company.name})`;
  return { subject, text: lines.join('\n') };
}

/**
 * Avisos de cobrança que valem para hoje. Cada aviso tem uma chave: o serviço guarda as já enviadas
 * na empresa (notices) e não repete. A chave inclui a data de vencimento, então um novo ciclo avisa de novo.
 */
export function billingNotices(c, { now = Date.now(), tz = 'America/Recife', graceDefault = 5 } = {}) {
  const out = [];
  const status = c.status || 'active';
  const grace = Number.isFinite(c.graceDays) ? c.graceDays : graceDefault;
  const days = (to) => Math.ceil((to - now) / DAY);
  if (status === 'trial' && c.trialEndsAt) {
    const left = days(c.trialEndsAt);
    const tag = fmtDay(c.trialEndsAt, tz);
    if (left <= 0) out.push({ key: `trial-end:${tag}`, subject: `Seu teste grátis do Vértice terminou`, text: `O teste grátis de ${c.name} terminou em ${tag} e as telas foram pausadas. Nada foi apagado: contrate um plano para continuar de onde parou.` });
    else if (left <= 3) out.push({ key: `trial-3:${tag}`, subject: `Faltam ${left} ${left === 1 ? 'dia' : 'dias'} do seu teste grátis do Vértice`, text: `O teste grátis de ${c.name} termina em ${tag}. Para as telas não pararem, contrate um plano com a Vetta Sistemas.` });
  }
  if (status === 'active' && c.paidUntil) {
    const tag = fmtDay(c.paidUntil, tz);
    const left = days(c.paidUntil);
    const blockAt = c.paidUntil + grace * DAY;
    if (now >= blockAt) out.push({ key: `blocked:${tag}`, subject: `Vértice: telas pausadas por falta de pagamento`, text: `A mensalidade de ${c.name}, vencida em ${tag}, não foi confirmada e as telas foram pausadas. Assim que o pagamento for confirmado, elas voltam sozinhas.` });
    else if (now >= c.paidUntil) out.push({ key: `overdue:${tag}`, subject: `Vértice: mensalidade vencida`, text: `A mensalidade de ${c.name} venceu em ${tag}. As telas param em ${fmtDay(blockAt, tz)} se o pagamento não for confirmado. Se já pagou, desconsidere.` });
    else if (left <= 5) out.push({ key: `due-5:${tag}`, subject: `Vértice: mensalidade vence em ${left} ${left === 1 ? 'dia' : 'dias'}`, text: `A mensalidade de ${c.name} vence em ${tag}${c.monthlyPrice ? `, no valor de R$ ${Number(c.monthlyPrice).toFixed(2).replace('.', ',')}` : ''}. Se já pagou, desconsidere.` });
  }
  return out;
}
