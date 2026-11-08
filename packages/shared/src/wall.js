/**
 * VIDEO WALL: várias TVs formando uma imagem só.
 *
 * - `videowalls/{id}`: { name, rows, cols, cells: [screenId|null] (linha por linha), playlistId, bezel, active }.
 * - O painel põe no manifesto de cada TV do wall: `wall: { id, rows, cols, row, col, bezel }` e a playlist do wall.
 * - Sincronia sem servidor de vídeo: todas as TVs calculam o que tocar pelo mesmo relógio
 *   (hora do servidor). Posição = agora mod duração total da playlist; vídeo começa já no segundo certo.
 */

export const WALL_LIMITS = { rows: [1, 4], cols: [1, 4], bezel: [0, 8] }; // moldura em % da tela
export const WALL_DEFAULT_SECONDS = 10;
export const WALL_VIDEO_FALLBACK_SECONDS = 30;

const clampInt = (v, [a, b]) => Math.min(b, Math.max(a, Math.round(Number(v) || a)));

/** Wall com valores válidos (tamanho da grade, células, moldura). */
export function normalizeWall(w = {}) {
  const rows = clampInt(w.rows, WALL_LIMITS.rows);
  const cols = clampInt(w.cols, WALL_LIMITS.cols);
  const cells = Array.from({ length: rows * cols }, (_, i) => (w.cells?.[i] ? String(w.cells[i]) : null));
  const bezel = Math.min(WALL_LIMITS.bezel[1], Math.max(0, Number(w.bezel) || 0));
  return { ...w, rows, cols, cells, bezel, active: w.active !== false };
}

/** Onde a tela fica no wall, ou null. */
export function wallCell(wall, screenId) {
  const w = normalizeWall(wall);
  const i = w.cells.indexOf(screenId);
  return i < 0 ? null : { row: Math.floor(i / w.cols), col: i % w.cols };
}

/**
 * Recorte da imagem para uma TV: o conteúdo é desenhado do tamanho do wall inteiro
 * (contando as molduras entre as TVs) e deslocado para mostrar só o pedaço desta TV.
 * @returns {{ width: string, height: string, left: string, top: string }} em %
 */
export function wallCrop({ rows, cols, row, col, bezel = 0 }) {
  const b = (Number(bezel) || 0) / 100;
  const W = cols + (cols - 1) * b;
  const H = rows + (rows - 1) * b;
  const pct = (n) => `${Math.round(n * 1e6) / 1e4}%`;
  return { width: pct(W), height: pct(H), left: pct(-col * (1 + b)), top: pct(-row * (1 + b)) };
}

const itemSeconds = (it) => Number(it.durationSec) || (it.type === 'video' ? WALL_VIDEO_FALLBACK_SECONDS : WALL_DEFAULT_SECONDS);

/**
 * O que o wall mostra agora, igual em todas as TVs.
 * @param {object[]} items  itens da playlist do wall (com durationSec)
 * @param {number} nowMs    hora do servidor em ms
 * @returns {{ index:number, item:object, offset:number, remaining:number, cycle:number, round:number }|null}
 *   offset/remaining em segundos; round = quantas voltas a playlist já deu (para trocar a chave do item).
 */
export function wallPosition(items, nowMs) {
  if (!items?.length) return null;
  const durs = items.map(itemSeconds);
  const cycle = durs.reduce((a, b) => a + b, 0);
  const t = nowMs / 1000;
  const round = Math.floor(t / cycle);
  let pos = t - round * cycle;
  for (let i = 0; i < items.length; i++) {
    if (pos < durs[i]) return { index: i, item: items[i], offset: pos, remaining: durs[i] - pos, cycle, round };
    pos -= durs[i];
  }
  return { index: 0, item: items[0], offset: 0, remaining: durs[0], cycle, round: round + 1 };
}

/** Wall ativo que contém a tela (se a tela estiver em mais de um, vale o primeiro por nome). */
export function wallForScreen(walls = [], screenId) {
  return [...walls]
    .filter((w) => w && w.active !== false && (w.cells || []).includes(screenId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))[0] || null;
}
