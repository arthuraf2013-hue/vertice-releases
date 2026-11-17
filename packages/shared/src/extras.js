/**
 * Conteúdo de fora (pasta do Google Drive, transmissão ao vivo), registro de atividades
 * e catálogo de mídia indoor para anunciantes.
 */

/* ---------------- Google Drive ---------------- */

/** Id da pasta a partir do link de compartilhar (ou o próprio id). */
export function driveFolderId(input = '') {
  const s = String(input).trim();
  const m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(s) ? s : null;
}

const IMG = /\.(jpe?g|png|webp|gif)$/i;

/** Endereço da lista: pela API do Google (com chave) ou pela visualização pública da pasta. */
export function driveListUrl(folderId, apiKey = '') {
  if (!folderId) return null;
  if (apiKey) {
    const q = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime)',
      orderBy: 'name',
      pageSize: '100',
      key: apiKey,
    });
    return `https://www.googleapis.com/drive/v3/files?${q}`;
  }
  return `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * Arquivos de imagem da pasta, em ordem de nome.
 * Aceita a resposta JSON da API e o HTML da visualização pública (entradas "entry-{id}").
 */
export function parseDriveList(text = '') {
  const t = String(text || '');
  let files = [];
  if (t.trim().startsWith('{')) {
    try {
      files = (JSON.parse(t).files || []).filter((f) => /^image\//.test(f.mimeType || '') || IMG.test(f.name || '')).map((f) => ({ id: f.id, name: f.name || '' }));
    } catch { files = []; }
  } else {
    const re = /id="entry-([\w-]{10,})"[\s\S]*?class="flip-entry-title"[^>]*>([^<]*)</g;
    let m;
    while ((m = re.exec(t))) files.push({ id: m[1], name: decode(m[2].trim()) });
    files = files.filter((f) => IMG.test(f.name));
  }
  const seen = new Set();
  return files
    .filter((f) => f.id && !seen.has(f.id) && seen.add(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
    .slice(0, 100);
}

/** Imagem do Drive em tamanho de TV (serve arquivos com "qualquer pessoa com o link"). */
export const driveImageUrl = (id, width = 1920) => `https://lh3.googleusercontent.com/d/${id}=w${width}`;

export const driveSource = {
  ttl: 15 * 60_000,
  urls: (c, { driveKey = '' } = {}) => {
    const id = driveFolderId(c.url);
    return id ? [driveListUrl(id, driveKey)] : [];
  },
  parse([t]) {
    const files = parseDriveList(t);
    if (!files.length) throw new Error('pasta sem imagens ou não compartilhada');
    return { files };
  },
  sample: () => ({ files: [{ id: 'demo1', name: '01 Promoção.jpg', demo: '#1160D6' }, { id: 'demo2', name: '02 Cardápio.jpg', demo: '#E8A93A' }, { id: 'demo3', name: '03 Aviso.jpg', demo: '#0A1A44' }] }),
};

/* ---------------- Transmissão ao vivo ---------------- */

/** 'hls' (.m3u8), 'video' (mp4/webm) ou null. */
export function streamKind(url = '') {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (/\.m3u8$/i.test(u.pathname) || /m3u8/i.test(u.search)) return 'hls';
  if (/\.(mp4|webm)$/i.test(u.pathname)) return 'video';
  return null;
}

/** hls.js carregado da CDN só quando precisa (a transmissão já depende de internet). */
export const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.light.min.js';

/* ---------------- Registro de atividades (auditoria) ---------------- */

export const AUDIT_AREAS = {
  media: 'Mídia', playlists: 'Playlist', schedules: 'Grade', screens: 'Tela', priceLists: 'Tabela de preços',
  advertisers: 'Anunciante', videowalls: 'Video wall', layouts: 'Layout', members: 'Usuário', units: 'Unidade',
  groups: 'Grupo', queues: 'Fila de senhas', timers: 'Cronômetro', polls: 'Enquete', proposals: 'Proposta',
  commentBoards: 'Mural', comments: 'Comentário', integrations: 'Integração', invites: 'Convite',
};

// Campos que mudam sozinhos ou toda hora (não viram registro).
const NOISY = new Set(['__prev', '__merge', 'updatedAt', 'lastSeen', 'nowPlaying', 'syncState', 'appVersion', 'storageUsedBytes', 'screenSeq', 'screenCount', 'screenOp', 'calibrateUntil', 'pin']);
const COMPANY_FIELDS = { alert: 'Alerta urgente', hours: 'Horário de funcionamento', name: 'Dados da empresa', alerts: 'Avisos por e-mail/WhatsApp', catalog: 'Catálogo de mídia indoor', phone: 'Dados da empresa', city: 'Dados da empresa', cnpj: 'Dados da empresa' };

/**
 * O que registrar para uma gravação do painel (ou null se não interessa).
 * @param {'set'|'update'|'delete'|'add'} op
 * @param {string} path caminho do documento
 * @param {object} [data] o que foi gravado
 */
export function auditEntry(op, path, data = {}) {
  const parts = String(path).split('/');
  if (parts[0] === 'invites' && parts.length === 2) {
    return { action: op === 'delete' ? 'delete' : 'create', area: 'Convite', targetId: parts[1], targetName: parts[1], fields: [] };
  }
  if (parts[0] !== 'companies') return null;
  if (parts.length === 2) {
    if (op !== 'update' && op !== 'set') return null;
    const keys = Object.keys(data || {}).filter((k) => !NOISY.has(k));
    const areas = [...new Set(keys.map((k) => COMPANY_FIELDS[k.split('.')[0]]).filter(Boolean))];
    if (!areas.length) return null;
    const action = keys.includes('alert') ? (data.alert?.active ? 'alert-on' : 'alert-off') : 'update';
    return { action, area: areas.join(', '), targetId: parts[1], targetName: action.startsWith('alert') ? (data.alert?.title || '') : '', fields: keys };
  }
  // Documento de subcoleção da empresa (ou de mural: commentBoards/{b}/comments/{c}).
  if (parts.length !== 4 && parts.length !== 6) return null;
  const col = parts[parts.length - 2];
  const area = AUDIT_AREAS[col];
  if (!area) return null;
  const fields = Object.keys(data || {}).filter((k) => !NOISY.has(k));
  if (op === 'update' && !fields.length) return null;
  let action = op === 'delete' ? 'delete' : op === 'update' || (op === 'set' && data?.__merge) ? 'update' : 'create';
  if (col === 'schedules' && fields.includes('status')) action = data.status === 'published' ? 'publish' : 'unpublish';
  if (col === 'comments' && fields.includes('status')) action = data.status === 'approved' ? 'approve' : data.status === 'hidden' ? 'hide' : 'update';
  return {
    action,
    area,
    targetId: parts[parts.length - 1],
    targetName: String(data?.name || data?.title || data?.question || data?.client || '').slice(0, 80),
    fields: fields.slice(0, 12),
  };
}

const VERB = { create: 'criou', update: 'alterou', delete: 'excluiu', publish: 'publicou', unpublish: 'tirou do ar', approve: 'aprovou', hide: 'ocultou', 'alert-on': 'enviou', 'alert-off': 'encerrou' };

const FEM = new Set(['Mídia', 'Playlist', 'Grade', 'Tela', 'Tabela de preços', 'Unidade', 'Fila de senhas', 'Enquete', 'Proposta', 'Integração']);
const article = (area = '') => {
  if (area.startsWith('Dados')) return 'os';
  if (area.startsWith('Avisos')) return 'os';
  return FEM.has(area) || /^(Horário|Alerta|Catálogo)/.test(area) ? (FEM.has(area) ? 'a' : 'o') : 'o';
};

/** "Ana publicou a grade “Manhã”". */
export function describeAudit(e) {
  const who = e.byName || 'Alguém';
  const verb = VERB[e.action] || 'alterou';
  const name = e.targetName ? ` “${e.targetName}”` : '';
  if (e.action?.startsWith('alert')) return `${who} ${verb} o alerta urgente${name}`;
  const area = e.area || '';
  const what = area.includes(',') ? area.toLowerCase() : `${article(area)} ${area.charAt(0).toLowerCase()}${area.slice(1)}`;
  return `${who} ${verb} ${what}${name}`;
}

/* ---------------- Mídia indoor: catálogo e propostas ---------------- */

export const CATALOG_DEFAULTS = {
  enabled: false,
  title: 'Anuncie nas nossas telas',
  intro: 'Seu anúncio nas TVs das nossas lojas, visto por quem já está comprando.',
  whatsapp: '',
  packages: [
    { name: 'Básico', seconds: 15, insertionsPerDay: 60, days: 30, price: 290 },
    { name: 'Destaque', seconds: 15, insertionsPerDay: 120, days: 30, price: 490 },
  ],
};

export function normalizeCatalog(c = {}) {
  const x = { ...CATALOG_DEFAULTS, ...c };
  return {
    enabled: !!x.enabled,
    title: String(x.title || '').slice(0, 80),
    intro: String(x.intro || '').slice(0, 300),
    whatsapp: String(x.whatsapp || '').replace(/\D/g, '').slice(0, 15),
    packages: (x.packages || []).map((p) => ({
      name: String(p.name || '').slice(0, 30),
      seconds: Math.max(5, Math.min(120, Number(p.seconds) || 15)),
      insertionsPerDay: Math.max(1, Math.min(2000, Number(p.insertionsPerDay) || 1)),
      days: Math.max(1, Math.min(366, Number(p.days) || 30)),
      price: Math.max(0, Number(p.price) || 0),
    })).filter((p) => p.name).slice(0, 6),
  };
}

/** Documento público do catálogo (o que a página /midia mostra). Sem nada interno da empresa. */
export function publicCatalog({ company = {}, units = [], screens = [], settings }) {
  const c = normalizeCatalog(settings);
  const byUnit = new Map();
  for (const s of screens) byUnit.set(s.unitId || '', (byUnit.get(s.unitId || '') || 0) + 1);
  const points = units
    .filter((u) => u.catalog?.show !== false && (byUnit.get(u.id) || 0) > 0)
    .map((u) => ({
      id: u.id,
      name: String(u.name || '').slice(0, 60),
      city: String(u.geo?.city || u.city || '').slice(0, 60),
      screens: byUnit.get(u.id) || 0,
      audience: Math.max(0, Number(u.catalog?.audience) || 0),
      description: String(u.catalog?.description || '').slice(0, 200),
      lat: u.geo?.lat ?? null,
      lon: u.geo?.lon ?? null,
    }));
  return {
    companyName: String(company.name || '').slice(0, 80),
    title: c.title,
    intro: c.intro,
    whatsapp: c.whatsapp,
    packages: c.packages,
    points,
    totalScreens: points.reduce((a, p) => a + p.screens, 0),
    totalAudience: points.reduce((a, p) => a + p.audience, 0),
    enabled: c.enabled,
  };
}

export const PROPOSAL_STATUS = {
  draft: { label: 'Rascunho', tone: 'muted' },
  sent: { label: 'Enviada', tone: 'sync' },
  accepted: { label: 'Aceita', tone: 'online' },
  declined: { label: 'Recusada', tone: 'offline' },
};

/** Contas da proposta: inserções, alcance estimado e valor final. */
export function proposalTotals(p = {}, units = [], screens = []) {
  const ids = new Set(p.unitIds || []);
  const scr = screens.filter((s) => ids.has(s.unitId || '')).length;
  const days = p.start && p.end ? Math.max(1, Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000) + 1) : Math.max(1, Number(p.days) || 30);
  const perDay = Math.max(0, Number(p.insertionsPerDay) || 0);
  const insertions = perDay * days * scr;
  const audience = units.filter((u) => ids.has(u.id)).reduce((a, u) => a + (Number(u.catalog?.audience) || 0), 0) * days;
  const gross = Math.max(0, Number(p.price) || 0);
  const discount = Math.min(gross, Math.max(0, Number(p.discount) || 0));
  const total = gross - discount;
  return { screens: scr, days, perDay, insertions, audience, gross, discount, total, perInsertion: insertions ? total / insertions : 0 };
}

export const catalogLink = (base, companyId) => (base && companyId ? `${String(base).replace(/\/$/, '')}/midia?e=${encodeURIComponent(companyId)}` : '');
