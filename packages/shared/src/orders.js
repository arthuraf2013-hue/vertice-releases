import { ORDER_STATUS } from './constants.js';

/** Formata o nome do cliente para a TV, respeitando a privacidade escolhida na tela. */
export function formatCustomerName(name = '', format = 'first-initial') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length || format === 'none') return '';
  const cap = (w) => w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
  const first = cap(parts[0]);
  if (format === 'first') return first;
  if (format === 'full') return parts.map(cap).join(' ');
  // "first-initial": ignora partículas (da, de, dos...) ao escolher a inicial.
  const rest = parts.slice(1).filter((w) => !/^(d[aeo]s?|e)$/i.test(w));
  const last = rest[rest.length - 1];
  return last ? `${first} ${last.charAt(0).toLocaleUpperCase('pt-BR')}.` : first;
}

/** Número do pedido para exibir: 7 → "007"; "A12" fica como está. */
export function formatOrderNumber(n) {
  if (n === null || n === undefined) return '';
  const s = String(n).trim();
  return /^\d+$/.test(s) && s.length < 3 ? s.padStart(3, '0') : s;
}

/**
 * Pedidos visíveis no painel da TV.
 * - Em preparo: os mais antigos primeiro.
 * - Prontos: os mais recentes primeiro, e somem após `readyTtlMin`.
 */
export function boardOrders(orders = [], { now = Date.now(), readyTtlMin = 10, unitId = null } = {}) {
  const ttl = readyTtlMin * 60 * 1000;
  const mine = orders.filter((o) => !unitId || !o.unitId || o.unitId === unitId);
  const preparing = mine
    .filter((o) => o.status === ORDER_STATUS.PREPARING)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const ready = mine
    .filter((o) => o.status === ORDER_STATUS.READY && (!o.readyAt || now - o.readyAt < ttl))
    .sort((a, b) => (b.readyAt || 0) - (a.readyAt || 0));
  return { preparing, ready };
}

/**
 * Quais pedidos ficaram prontos desde a última leitura (para o aviso em tela cheia).
 * @param {Set<string>} seen  ids já anunciados (é atualizado)
 */
export function newlyReady(ready = [], seen) {
  const fresh = ready.filter((o) => !seen.has(o.id));
  fresh.forEach((o) => seen.add(o.id));
  return fresh.reverse(); // anuncia na ordem em que ficaram prontos
}
