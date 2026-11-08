import { DEFAULT_IMAGE_SECONDS, ORDER_BOARD_DEFAULTS, DISPLAY_DEFAULTS, DISPLAY_LIMITS, FIT_MODES, MEDIA_ADJUST_LIMITS } from './constants.js';
import { normalizeApp, appDefaultSeconds, priceListForTv } from './apps.js';

/**
 * O MANIFESTO é o que deixa o player leve: em vez de a TV ouvir telas, grades,
 * playlists e mídias (dezenas de leituras), o painel compila tudo que uma tela
 * precisa num único documento `companies/{cid}/manifests/{screenId}`.
 * A TV ouve só esse documento e baixa só as mídias listadas nele.
 */

/** As grades publicadas que valem para esta tela (direto ou por grupo). */
export function schedulesForScreen(screen, schedules = []) {
  const groups = new Set(screen.groupIds || []);
  return schedules
    .filter((s) => s.status === 'published')
    .filter((s) => (s.screenIds || []).includes(screen.id) || (s.groupIds || []).some((g) => groups.has(g)))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.publishedAt || 0) - (a.publishedAt || 0));
}

const clamp = (n, [a, b], d) => (Number.isFinite(Number(n)) ? Math.min(b, Math.max(a, Number(n))) : d);

/**
 * Posição da tela normalizada. Aceita telas antigas, que só tinham `orientation`.
 * @returns {{rotation:0|90|180|270, zoom:number, offsetX:number, offsetY:number, fit:string}}
 */
export function screenDisplay(screen = {}) {
  const d = screen.display || {};
  const legacy = screen.orientation === 'portrait' ? 90 : 0;
  const rotation = [0, 90, 180, 270].includes(Number(d.rotation)) ? Number(d.rotation) : legacy;
  return {
    rotation,
    zoom: clamp(d.zoom, DISPLAY_LIMITS.zoom, DISPLAY_DEFAULTS.zoom),
    offsetX: clamp(d.offsetX, DISPLAY_LIMITS.offset, 0),
    offsetY: clamp(d.offsetY, DISPLAY_LIMITS.offset, 0),
    fit: FIT_MODES[d.fit] ? d.fit : DISPLAY_DEFAULTS.fit,
  };
}

/**
 * Ajuste de uma mídia numa tela (screen.mediaOverrides[mediaId]), normalizado.
 * Devolve null quando não há nada para mudar.
 */
export function mediaAdjust(o) {
  if (!o) return null;
  const a = {
    fit: FIT_MODES[o.fit] ? o.fit : null,
    zoom: clamp(o.zoom, MEDIA_ADJUST_LIMITS.zoom, 100),
    offsetX: clamp(o.offsetX, MEDIA_ADJUST_LIMITS.offset, 0),
    offsetY: clamp(o.offsetY, MEDIA_ADJUST_LIMITS.offset, 0),
  };
  return a.fit || a.zoom !== 100 || a.offsetX || a.offsetY ? a : null;
}

/** Orientação de quem olha a TV, a partir da rotação. */
export const orientationOf = (rotation) => (rotation === 90 || rotation === 270 ? 'portrait' : 'landscape');

/** A data mais tarde / mais cedo entre duas "YYYY-MM-DD" (null = sem limite). */
const laterDate = (a, b) => (!a ? b || null : !b ? a : a > b ? a : b);
const earlierDate = (a, b) => (!a ? b || null : !b ? a : a < b ? a : b);

/**
 * Expande uma playlist em itens prontos para tocar (com URL e duração).
 * Ajustes da playlist valem mais que os da mídia; os da mídia valem mais que os da tela.
 * Validade: o item só toca dentro das duas janelas (playlist e mídia).
 */
export function expandPlaylist(playlist, mediaById, priceById = null) {
  if (!playlist) return [];
  return (playlist.items || [])
    .map((it, idx) => {
      const m = mediaById.get(it.mediaId);
      if (!m) return null;
      if (m.type === 'app') return expandApp(playlist, it, idx, m, priceById);
      if (!m.url) return null;
      const durationSec =
        m.type === 'video'
          ? Number(it.durationSec) || Math.ceil(m.durationSec || 0) || null
          : Number(it.durationSec) || Number(m.defaultDurationSec) || DEFAULT_IMAGE_SECONDS;
      return {
        key: `${playlist.id}:${idx}`,
        mediaId: m.id,
        name: m.name,
        type: m.type,
        url: m.url,
        ext: m.ext || guessExt(m),
        sizeBytes: m.sizeBytes || 0,
        durationSec,
        // null = usa o preenchimento padrão da tela.
        fit: (FIT_MODES[it.fit] && it.fit) || (FIT_MODES[m.fit] && m.fit) || null,
        muted: !!m.muted,
        validFrom: laterDate(it.validFrom, m.validFrom),
        validTo: earlierDate(it.validTo, m.validTo),
      };
    })
    .filter(Boolean);
}

/** Aplicativo na playlist: não tem arquivo; leva o tipo, a configuração e (Price) a tabela. */
function expandApp(playlist, it, idx, m, priceById) {
  const app = normalizeApp(m.app);
  if (!app) return null;
  if (app.kind === 'price') {
    // Sem o mapa de tabelas (ex.: só calculando a duração), o item vale; no manifesto, só com a tabela.
    if (priceById) {
      const data = priceListForTv(priceById.get(app.config.listId));
      if (!data || !data.items.length) return null;
      app.data = data;
    }
  }
  return {
    key: `${playlist.id}:${idx}`,
    mediaId: m.id,
    name: m.name,
    type: 'app',
    url: null,
    sizeBytes: 0,
    app,
    durationSec: Number(it.durationSec) || Number(m.defaultDurationSec) || appDefaultSeconds(app.kind),
    fit: null,
    muted: true,
    validFrom: laterDate(it.validFrom, m.validFrom),
    validTo: earlierDate(it.validTo, m.validTo),
  };
}

function guessExt(m) {
  const fromName = /\.([a-z0-9]{2,4})$/i.exec(m.name || '');
  if (fromName) return fromName[1].toLowerCase();
  return m.type === 'video' ? 'mp4' : 'jpg';
}

/**
 * Compila o manifesto de uma tela.
 * @param {object} p
 * @param {object} p.screen  tela (com id)
 * @param {object[]} p.schedules  grades da empresa
 * @param {object[]} p.playlists  playlists da empresa
 * @param {object[]} p.media  mídias da empresa
 * @param {object} [p.company]
 */
export function buildManifest({ screen, schedules, playlists, media, company, priceLists }) {
  const mediaById = new Map((media || []).map((m) => [m.id, m]));
  const priceById = new Map((priceLists || []).map((l) => [l.id, l]));
  const playlistById = new Map((playlists || []).map((p) => [p.id, p]));
  const applicable = schedulesForScreen(screen, schedules);

  const slots = [];
  for (const s of applicable) {
    for (const [i, slot] of (s.slots || []).entries()) {
      const items = expandPlaylist(playlistById.get(slot.playlistId), mediaById, priceById);
      if (!items.length) continue;
      slots.push({
        id: `${s.id}:${i}`,
        scheduleId: s.id,
        scheduleName: s.name,
        priority: s.priority || 0,
        days: (slot.days || []).map(Number),
        start: slot.start || '00:00',
        end: slot.end || '24:00',
        items,
      });
    }
  }

  const fallbackSchedule = applicable.find((s) => s.fallbackPlaylistId && playlistById.get(s.fallbackPlaylistId));
  const fallback = fallbackSchedule
    ? expandPlaylist(playlistById.get(fallbackSchedule.fallbackPlaylistId), mediaById, priceById)
    : [];

  // Ajustes desta tela para mídias específicas valem mais que tudo (playlist, mídia e padrão).
  const overrides = screen.mediaOverrides || {};
  const applyOverride = (it) => {
    const a = mediaAdjust(overrides[it.mediaId]);
    if (!a) return it;
    const out = { ...it, fit: a.fit || it.fit };
    if (a.zoom !== 100 || a.offsetX || a.offsetY) out.adjust = { zoom: a.zoom, offsetX: a.offsetX, offsetY: a.offsetY };
    return out;
  };
  for (const sl of slots) sl.items = sl.items.map(applyOverride);
  for (let i = 0; i < fallback.length; i++) fallback[i] = applyOverride(fallback[i]);

  const allItems = [...slots.flatMap((s) => s.items), ...fallback];
  // Só o que tem arquivo para baixar (aplicativos se montam na TV).
  const assets = [...new Map(allItems.filter((it) => it.url).map((it) => [it.mediaId, it])).values()].map((it) => ({
    mediaId: it.mediaId,
    url: it.url,
    ext: it.ext,
    sizeBytes: it.sizeBytes,
  }));

  const display = screenDisplay(screen);
  return {
    screen: {
      id: screen.id,
      code: screen.code,
      name: screen.name,
      unitId: screen.unitId || null,
      orientation: orientationOf(display.rotation),
      display,
      // Grade de ajuste de posição visível na TV até este horário (ms).
      calibrateUntil: Number(screen.calibrateUntil) || 0,
      // Mídia fixada na TV enquanto alguém ajusta pelo painel: { mediaId, until }.
      pin: screen.pin?.mediaId && Number(screen.pin.until) > 0 ? { mediaId: screen.pin.mediaId, until: Number(screen.pin.until) } : null,
    },
    company: { name: company?.name || '' },
    orderBoard: { ...ORDER_BOARD_DEFAULTS, ...(screen.orderBoard || {}) },
    slots,
    fallback,
    assets,
    totalBytes: assets.reduce((a, b) => a + (b.sizeBytes || 0), 0),
  };
}

/** "08:30" → 510 minutos. "24:00" → 1440. */
export function toMinutes(hhmm = '00:00') {
  const [h, m] = String(hhmm).split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/** Data local em "YYYY-MM-DD" (sem o bug de fuso do toISOString). */
export function localISODate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** O horário cai neste slot? Aceita virada de meia-noite (22:00 → 02:00). */
export function slotMatches(slot, date = new Date()) {
  const day = date.getDay();
  const min = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  if (start < end) return slot.days.includes(day) && min >= start && min < end;
  // Atravessa a meia-noite: a parte da noite pertence ao dia de início,
  // a parte da madrugada pertence ao dia seguinte.
  const yesterday = (day + 6) % 7;
  return (slot.days.includes(day) && min >= start) || (slot.days.includes(yesterday) && min < end);
}

export function itemIsValid(item, date = new Date()) {
  const today = localISODate(date);
  if (item.validFrom && today < item.validFrom) return false;
  if (item.validTo && today > item.validTo) return false;
  return true;
}

/**
 * O que a tela deve tocar agora.
 * @returns {{ source: 'slot'|'fallback'|'empty', slotId: string|null, items: object[] }}
 */
export function resolveNow(manifest, date = new Date()) {
  if (!manifest) return { source: 'empty', slotId: null, items: [] };
  const candidates = (manifest.slots || []).filter((s) => slotMatches(s, date));
  for (const slot of candidates.sort((a, b) => b.priority - a.priority)) {
    const items = slot.items.filter((it) => itemIsValid(it, date));
    if (items.length) return { source: 'slot', slotId: slot.id, items };
  }
  const fb = (manifest.fallback || []).filter((it) => itemIsValid(it, date));
  if (fb.length) return { source: 'fallback', slotId: 'fallback', items: fb };
  return { source: 'empty', slotId: null, items: [] };
}

/** Soma da duração de uma playlist já expandida (vídeo sem duração conta 0). */
export function totalDuration(items = []) {
  return items.reduce((a, it) => a + (Number(it.durationSec) || 0), 0);
}

export function formatDuration(sec = 0) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
