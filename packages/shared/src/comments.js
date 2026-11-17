/**
 * MURAL DE COMENTÁRIOS: o público comenta por um link (ou QR Code) e a TV mostra o que foi aprovado.
 *
 * Onde fica cada coisa no Firestore (regras em firebase/firestore.rules):
 *   companies/{empresa}/commentBoards/{mural}             título, pergunta, aberto (leitura pública)
 *   companies/{empresa}/commentBoards/{mural}/comments/*  { name, text, status, createdAt, uid }
 *   companies/{empresa}/commentSettings/{mural}           aprovação automática e palavras bloqueadas
 *   commentLimits/{uid}                                   limite de envios por aparelho
 * O id do mural é o id da mídia do app "comments" (o mesmo que entra nas playlists).
 */

export const COMMENT_LIMITS = {
  text: 200, // caracteres por comentário
  name: 30,
  perWindow: 3, // envios por aparelho...
  windowMin: 10, // ...a cada 10 minutos
};

export const COMMENT_STATUS = {
  pending: 'Aguardando',
  approved: 'Aprovado',
  hidden: 'Oculto',
};

/** Padrão que nunca casa com nada (RE2, usado nas regras quando não há palavras bloqueadas). */
export const NEVER_MATCH = 'a^';

const norm = (s) => String(s || '').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lista de palavras (uma por linha ou separadas por vírgula), em minúsculas e sem repetir. */
export function blockedWordList(text = '') {
  return [...new Set(String(text).split(/[\n,;]/).map((w) => norm(w).trim()).filter((w) => w.length >= 2))].slice(0, 100);
}

/**
 * Expressão regular gravada em commentSettings.blockPattern. As regras do Firestore conferem o
 * texto em minúsculas com ela: comentário com palavra bloqueada nunca entra aprovado direto.
 */
export function blockPattern(words) {
  const list = Array.isArray(words) ? words : blockedWordList(words);
  if (!list.length) return NEVER_MATCH;
  return `(?s).*(${list.map(escapeRe).join('|')}).*`;
}

/** Mesma conferência do lado de quem envia (para já mandar como "aguardando"). */
export function hasBlockedWord(text, words) {
  const list = Array.isArray(words) ? words : blockedWordList(words);
  const t = norm(text);
  return list.some((w) => t.includes(w));
}

/** Nome e texto como são gravados: sem espaços sobrando, sem quebra de linha, no tamanho máximo. */
export function cleanComment({ name = '', text = '' } = {}) {
  const one = (s, max) => String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return { name: one(name, COMMENT_LIMITS.name), text: one(text, COMMENT_LIMITS.text) };
}

/** Na TV aparece só o primeiro nome (o resto do nome não sai do banco). */
export function firstName(name = '') {
  const n = String(name).trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1, 20) : '';
}

/**
 * Próximo estado do limite de envios. `prev` é o documento commentLimits/{uid} (ou null).
 * @returns {{ allowed: boolean, reset: boolean, waitMin: number }}
 *   reset: começa uma janela nova (count volta a 1); senão, soma 1 na janela atual.
 */
export function nextLimit(prev, now = Date.now()) {
  const windowMs = COMMENT_LIMITS.windowMin * 60_000;
  const start = prev?.windowStart == null ? null : Number(prev.windowStart);
  if (start == null || start + windowMs <= now) return { allowed: true, reset: true, waitMin: 0 };
  if ((Number(prev.count) || 0) < COMMENT_LIMITS.perWindow) return { allowed: true, reset: false, waitMin: 0 };
  return { allowed: false, reset: false, waitMin: Math.max(1, Math.ceil((start + windowMs - now) / 60_000)) };
}

/** Link da página de envio. `base` é o endereço do site (ex.: https://vertice.vettasistemas.com.br/). */
export function commentLink(base, companyId, boardId) {
  const b = String(base || '').replace(/\/?$/, '/');
  return `${b}comentar?e=${encodeURIComponent(companyId)}&m=${encodeURIComponent(boardId)}`;
}

/** Fotos de exemplo (prévia do Foto no telão): quadros coloridos, sem arquivo. */
export function samplePhotos(now = Date.now()) {
  const names = ['Mariana', 'João', 'Carla', 'Pedro', 'Bia', 'Rafa'];
  const colors = ['#1160D6', '#E8A93A', '#2E8B57', '#B3141B', '#6A4CC2', '#0A1A44'];
  return names.map((name, i) => ({ id: `ph${i}`, name, text: i % 2 ? '' : 'Que festa!', photo: `demo:${colors[i]}`, at: now - i * 7 * 60_000 }));
}

/** Link da página de comentar/enviar foto. */
export const photoLink = (base, companyId, boardId) => commentLink(base, companyId, boardId);

/** O que a TV mostra: aprovados, mais novos primeiro, no máximo `max`. */
export function commentsForTv(list = [], max = 20) {
  return list
    .filter((c) => c.status === 'approved' && (c.text || c.photo))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
    .slice(0, max)
    .map((c) => ({ id: c.id, name: firstName(c.name), text: c.text || '', at: Number(c.createdAt) || null, ...(c.photo ? { photo: c.photo } : {}) }));
}

/** Grupo de comentários que aparece agora (rodízio de `perPage` a cada `everySec`). */
export function commentPage(list, perPage, everySec, now = Date.now()) {
  const n = Math.max(1, Number(perPage) || 3);
  if (list.length <= n) return list;
  const pages = Math.ceil(list.length / n);
  const p = Math.floor(now / (Math.max(3, Number(everySec) || 8) * 1000)) % pages;
  return list.slice(p * n, p * n + n);
}

/** Exemplos para a prévia do painel e para a TV de demonstração. */
export function sampleComments(now = Date.now()) {
  return [
    { id: 's1', name: 'Mariana', text: 'Atendimento nota 10! O café da manhã de domingo é o melhor da cidade.', at: now - 4 * 60_000 },
    { id: 's2', name: 'João', text: 'Adorei a promoção do pão de queijo. Voltarei amanhã!', at: now - 35 * 60_000 },
    { id: 's3', name: 'Carla', text: 'Equipe muito simpática, parabéns pelo capricho.', at: now - 3 * 3_600_000 },
  ];
}
