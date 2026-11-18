// Vértice — servidor de mídias.
//
// Guarda os arquivos que o painel envia e entrega para as TVs.
// Não precisa de chave de serviço do Firebase: quem envia manda o próprio token de login
// (ID token do Firebase Auth). O servidor confere a assinatura do token com as chaves públicas
// do Google e pergunta ao Firestore, com o mesmo token, qual é o papel da pessoa na empresa.
//
//   PUT    /v1/files/companies/{empresa}/media/{arquivo}   envia (editor, admin ou proprietário)
//   DELETE /v1/files/companies/{empresa}/media/{arquivo}   apaga
//   GET    /m/{empresa}/{arquivo}                          baixa (TVs e painel; aceita Range)
//   PUT    /v1/public/{empresa}/{mural}/{arquivo}           foto do público (Foto no telão; login anônimo)
//   POST   /v1/ai/{empresa}/texto                           textos de oferta com IA (editor; precisa de ANTHROPIC_API_KEY)
//   GET    /health                                         verificação rápida
//
// Configuração por variáveis de ambiente (ou arquivo .env ao lado deste):
//   FIREBASE_PROJECT_ID   id do projeto Firebase do Vértice (obrigatório)
//   PUBLIC_URL            endereço público, ex.: https://midias.vettasistemas.com.br
//                         (vazio = IP deste PC na rede local, ex.: http://192.168.0.10:8787)
//   PORT                  porta (padrão 8787)
//   HOST                  interface (padrão todas; na VPS 127.0.0.1, atrás do Caddy com HTTPS)
//   DATA_DIR              pasta das mídias (padrão ./data)
//   MAX_UPLOAD_MB         tamanho máximo por arquivo (padrão 500)
//   ALLOWED_ORIGINS       origens do painel separadas por vírgula (padrão *)
//   PUBLIC_MAX_MB         tamanho máximo da foto do público (padrão 6)
//   ANTHROPIC_API_KEY     chave da API da Anthropic (textos com IA no Estúdio; vazio = desligado)
//   AI_MODEL              modelo (padrão claude-haiku-5-5)
//   AI_DAILY_LIMIT        pedidos de IA por empresa por dia (padrão 60)
//   FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST  só para testes locais
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(HERE, '.env'));

const PROJECT = process.env.FIREBASE_PROJECT_ID;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || undefined;
const DATA_DIR = path.resolve(HERE, process.env.DATA_DIR || 'data');
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
const AUTH_EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FS_EMU = process.env.FIRESTORE_EMULATOR_HOST;

if (!PROJECT) {
  console.error('[midias] Defina FIREBASE_PROJECT_ID (no .env ou no ambiente).');
  process.exit(1);
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE = /^[A-Za-z0-9_-]{1,80}\.(jpe?g|png|webp|gif|mp4|webm)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };
const WRITERS = new Set(['editor', 'admin', 'owner']);
const PUBLIC_MAX = Number(process.env.PUBLIC_MAX_MB || 6) * 1024 * 1024;
const PUBLIC_FILE = /^[A-Za-z0-9_-]{1,80}\.jpg$/;
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-5-5';
const AI_DAILY = Number(process.env.AI_DAILY_LIMIT || 60);

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Confere o token de login e devolve o uid. */
async function verifyToken(token) {
  if (AUTH_EMU) {
    // O emulador do Auth emite tokens sem assinatura; só aceitamos isso com o emulador ligado.
    const p = decodeJwt(token);
    if (p.aud !== PROJECT) throw new Error('token de outro projeto');
    return p.user_id || p.sub;
  }
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT}`,
    audience: PROJECT,
    algorithms: ['RS256'],
  });
  if (!payload.sub) throw new Error('token sem usuário');
  return payload.sub;
}

/** Papel da pessoa na empresa, lido do Firestore com o próprio token (as regras decidem). */
const roleCache = new Map();
async function roleOf(token, uid, cid) {
  const key = `${uid}:${cid}`;
  const hit = roleCache.get(key);
  if (hit && hit.until > Date.now()) return hit.role;
  const base = FS_EMU ? `http://${FS_EMU}` : 'https://firestore.googleapis.com';
  const url = `${base}/v1/projects/${PROJECT}/databases/(default)/documents/companies/${cid}/members/${uid}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  let role = null;
  if (res.ok) role = (await res.json())?.fields?.role?.stringValue || null;
  else if (res.status !== 403 && res.status !== 404) throw new Error(`Firestore respondeu ${res.status}`);
  roleCache.set(key, { role, until: Date.now() + 60_000 });
  return role;
}

/** Campo do Firestore REST → valor JS (só os tipos que a empresa usa). */
function fsValue(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  return undefined;
}

/** Plano da empresa (cota e licença), lido com o token de quem envia. Cache de 1 minuto. */
const companyCache = new Map();
async function companyOf(token, cid) {
  const hit = companyCache.get(cid);
  if (hit && hit.until > Date.now()) return hit.data;
  const base = FS_EMU ? `http://${FS_EMU}` : 'https://firestore.googleapis.com';
  const res = await fetch(`${base}/v1/projects/${PROJECT}/databases/(default)/documents/companies/${cid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const f = (await res.json())?.fields || {};
  const data = Object.fromEntries(['status', 'trialEndsAt', 'paidUntil', 'graceDays', 'storageQuotaMB'].map((k) => [k, fsValue(f[k])]));
  companyCache.set(cid, { data, until: Date.now() + 60_000 });
  return data;
}

/** Mesma conta de packages/shared/src/license.js (o servidor é instalado sozinho, sem o pacote). */
function licenseBlocked(c, now = Date.now()) {
  const status = c.status || 'active';
  if (status === 'suspended' || status === 'canceled') return true;
  if (status === 'trial') return !c.trialEndsAt || c.trialEndsAt <= now;
  if (!c.paidUntil) return false;
  const grace = Number.isFinite(c.graceDays) ? c.graceDays : 5;
  return now >= c.paidUntil + grace * 86400000;
}

/** Espaço usado de verdade pela empresa (soma dos arquivos na pasta dela), com cache. */
const usageCache = new Map();
async function usageOf(cid) {
  if (usageCache.has(cid)) return usageCache.get(cid);
  let total = 0;
  try {
    for (const f of await fsp.readdir(path.join(DATA_DIR, cid), { withFileTypes: true })) {
      if (f.isFile() && !f.name.endsWith('.part')) total += (await fsp.stat(path.join(DATA_DIR, cid, f.name))).size;
    }
  } catch { /* pasta ainda não existe */ }
  usageCache.set(cid, total);
  return total;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' });
  res.end(data);
}

function filePath(cid, name) {
  if (!ID.test(cid) || !FILE.test(name)) return null;
  return path.join(DATA_DIR, cid, name);
}

async function authorize(req, cid) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return { status: 401, error: 'Faça login no painel.' };
  let uid;
  try {
    uid = await verifyToken(m[1]);
  } catch {
    return { status: 401, error: 'Sessão inválida ou expirada.' };
  }
  const role = await roleOf(m[1], uid, cid);
  if (!WRITERS.has(role)) return { status: 403, error: 'Sem permissão para mídias desta empresa.' };
  return { uid, role, token: m[1] };
}

async function handleUpload(req, res, cid, name) {
  const dest = filePath(cid, name);
  if (!dest) return send(res, 400, { error: 'Nome de arquivo inválido.' });
  const auth = await authorize(req, cid);
  if (auth.error) return send(res, auth.status, { error: auth.error });

  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BYTES) return send(res, 413, { error: `Arquivo acima de ${MAX_BYTES / 1048576} MB.` });
  // Plano: licença em dia e espaço disponível, conferidos aqui (o painel também avisa antes).
  const company = await companyOf(auth.token, cid);
  if (company && licenseBlocked(company)) return send(res, 402, { error: 'A assinatura desta empresa está bloqueada. Regularize com a Vetta Sistemas para enviar mídias.' });
  const quota = (company?.storageQuotaMB || 0) * 1048576;
  const room = quota ? quota - (await usageOf(cid)) : Infinity;
  if (declared && declared > room) return send(res, 413, { error: 'Sem espaço no plano. Exclua mídias antigas ou amplie o plano.' });
  const ext = name.split('.').pop().toLowerCase();
  const type = (req.headers['content-type'] || '').split(';')[0];
  if (type && type !== MIME[ext] && !(ext === 'jpg' && type === 'image/jpeg')) {
    return send(res, 415, { error: 'Tipo de arquivo não confere com a extensão.' });
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const part = `${dest}.${crypto.randomBytes(4).toString('hex')}.part`;
  let received = 0;
  try {
    await pipeline(
      req,
      async function* limit(src) {
        for await (const chunk of src) {
          received += chunk.length;
          if (received > MAX_BYTES) throw Object.assign(new Error('grande demais'), { code: 'TOO_BIG' });
          if (received > room) throw Object.assign(new Error('sem espaço'), { code: 'NO_ROOM' });
          yield chunk;
        }
      },
      fs.createWriteStream(part),
    );
    if (!received) throw Object.assign(new Error('vazio'), { code: 'EMPTY' });
    await fsp.rename(part, dest);
    usageCache.delete(cid);
  } catch (e) {
    await fsp.rm(part, { force: true });
    if (e.code === 'TOO_BIG') return send(res, 413, { error: `Arquivo acima de ${MAX_BYTES / 1048576} MB.` });
    if (e.code === 'EMPTY') return send(res, 400, { error: 'Arquivo vazio.' });
    if (e.code === 'NO_ROOM') return send(res, 413, { error: 'Sem espaço no plano. Exclua mídias antigas ou amplie o plano.' });
    throw e;
  }
  log('upload', cid, name, received, auth.uid);
  send(res, 201, { url: `${PUBLIC_URL}/m/${cid}/${name}`, sizeBytes: received });
}

async function handleDelete(req, res, cid, name) {
  const dest = filePath(cid, name);
  if (!dest) return send(res, 400, { error: 'Nome de arquivo inválido.' });
  const auth = await authorize(req, cid);
  if (auth.error) return send(res, auth.status, { error: auth.error });
  await fsp.rm(dest, { force: true });
  usageCache.delete(cid);
  log('delete', cid, name, 0, auth.uid);
  res.writeHead(204);
  res.end();
}

async function handleGet(req, res, cid, name) {
  const file = filePath(cid, name);
  if (!file) return send(res, 404, 'Não encontrado');
  let st;
  try {
    st = await fsp.stat(file);
  } catch {
    return send(res, 404, 'Não encontrado');
  }
  const type = MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream';
  // O id do arquivo nunca é reaproveitado: pode guardar em cache para sempre.
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Last-Modified': st.mtime.toUTCString(),
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  if (range) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), st.size - 1);
    } else if (range[2]) {
      start = Math.max(0, st.size - Number(range[2]));
    }
    if (start >= st.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  await pipeline(fs.createReadStream(file, { start, end }), res).catch(() => {});
}

/** Mural público (leitura pública nas regras do Firestore), lido com o token de quem envia. */
async function boardOf(token, cid, bid) {
  const base = FS_EMU ? `http://${FS_EMU}` : 'https://firestore.googleapis.com';
  const res = await fetch(`${base}/v1/projects/${PROJECT}/databases/(default)/documents/companies/${cid}/commentBoards/${bid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const f = (await res.json())?.fields || {};
  return { open: fsValue(f.open), kind: fsValue(f.kind) };
}

/** Limite simples por aparelho (memória): 3 fotos a cada 10 minutos, como os comentários. */
const publicHits = new Map();
function publicAllowed(uid, now = Date.now()) {
  const list = (publicHits.get(uid) || []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 3) return false;
  list.push(now);
  publicHits.set(uid, list);
  return true;
}

/**
 * Foto do público (Foto no telão). Quem envia é um usuário anônimo do Firebase; o mural precisa
 * existir, ser de fotos e estar aberto. O nome do arquivo começa com "p-{mural}-" (as regras do
 * Firestore só aceitam fotos desse mural) e a foto conta no espaço da empresa.
 */
async function handlePublicUpload(req, res, cid, bid, name) {
  if (!ID.test(cid) || !ID.test(bid) || !PUBLIC_FILE.test(name)) return send(res, 400, { error: 'Envio inválido.' });
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return send(res, 401, { error: 'Abra a página do mural de novo.' });
  let uid;
  try { uid = await verifyToken(m[1]); } catch { return send(res, 401, { error: 'Abra a página do mural de novo.' }); }
  if ((req.headers['content-type'] || '').split(';')[0] !== 'image/jpeg') return send(res, 415, { error: 'Envie uma foto.' });
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > PUBLIC_MAX) return send(res, 413, { error: 'Foto grande demais.' });
  const board = await boardOf(m[1], cid, bid);
  if (!board || board.kind !== 'photos') return send(res, 404, { error: 'Mural não encontrado.' });
  if (board.open !== true) return send(res, 403, { error: 'O mural está fechado.' });
  if (!publicAllowed(uid)) return send(res, 429, { error: 'Você já mandou 3 fotos. Espere alguns minutos.' });
  const file = `p-${bid}-${name.replace(/\.jpg$/, '').slice(-40)}.jpg`;
  const dest = filePath(cid, file);
  if (!dest) return send(res, 400, { error: 'Envio inválido.' });
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const part = `${dest}.${crypto.randomBytes(4).toString('hex')}.part`;
  let received = 0;
  let head = null;
  try {
    await pipeline(req, async function* limit(src) {
      for await (const chunk of src) {
        received += chunk.length;
        if (!head) head = chunk.subarray(0, 3);
        if (received > PUBLIC_MAX) throw Object.assign(new Error('grande'), { code: 'TOO_BIG' });
        yield chunk;
      }
    }, fs.createWriteStream(part));
    // Confere que é mesmo um JPEG (FF D8 FF), não só o cabeçalho dizendo que é.
    if (!head || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) throw Object.assign(new Error('tipo'), { code: 'NOT_JPEG' });
    await fsp.rename(part, dest);
    usageCache.delete(cid);
  } catch (e) {
    await fsp.rm(part, { force: true });
    if (e.code === 'TOO_BIG') return send(res, 413, { error: 'Foto grande demais.' });
    if (e.code === 'NOT_JPEG') return send(res, 415, { error: 'Envie uma foto.' });
    throw e;
  }
  log('foto-publico', cid, bid, received, uid);
  send(res, 201, { url: `${PUBLIC_URL}/m/${cid}/${file}` });
}

/** Lê o corpo JSON (pequeno). */
async function readJson(req, max = 8192) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > max) throw Object.assign(new Error('grande'), { code: 'TOO_BIG' });
  }
  return JSON.parse(body || '{}');
}

const aiUse = new Map();
/**
 * Sugestões de texto para peças do Estúdio (oferta, aviso). A chave da IA fica só aqui no servidor;
 * cada empresa tem um limite por dia. Devolve 3 opções curtas em JSON.
 */
async function handleAi(req, res, cid) {
  if (!AI_KEY) return send(res, 503, { error: 'A IA não está ligada neste servidor. Peça para a Vetta configurar.' });
  if (!ID.test(cid)) return send(res, 400, { error: 'Empresa inválida.' });
  const auth = await authorize(req, cid);
  if (auth.error) return send(res, auth.status, { error: auth.error });
  const company = await companyOf(auth.token, cid);
  if (company && licenseBlocked(company)) return send(res, 402, { error: 'A assinatura desta empresa está bloqueada.' });
  const day = new Date().toISOString().slice(0, 10);
  const key = `${cid}:${day}`;
  const used = aiUse.get(key) || 0;
  if (used >= AI_DAILY) return send(res, 429, { error: `Limite de ${AI_DAILY} sugestões por dia atingido. Amanhã libera de novo.` });
  let input;
  try { input = await readJson(req); } catch { return send(res, 400, { error: 'Pedido inválido.' }); }
  const clip = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
  // Três usos: textos de peça (padrão), perguntas de quiz e o assistente de ajuda da Academia.
  const mode = ['quiz', 'help'].includes(input.mode) ? input.mode : 'text';
  let prompt;
  let maxTokens = 600;
  if (mode === 'quiz') {
    const count = Math.max(3, Math.min(15, Number(input.count) || 10));
    maxTokens = 1500;
    prompt = [
      'Você cria perguntas de quiz para TVs de empresas no Brasil (lidas de longe, em poucos segundos).',
      `Crie ${count} perguntas de múltipla escolha em português do Brasil sobre: ${JSON.stringify(clip(input.topic, 80) || 'conhecimentos gerais')}.`,
      'Só fatos certos e estáveis, que não mudam com o tempo; nada de política, religião, tragédias ou temas sensíveis.',
      'Cada pergunta com 1 resposta certa e 3 erradas plausíveis. Pergunta até 110 letras; respostas até 40.',
      'Responda só com JSON: {"questions":[["pergunta","certa","errada","errada","errada"]]}.',
    ].join('\n');
  } else if (mode === 'help') {
    maxTokens = 700;
    prompt = [
      'Você é o assistente de ajuda do Vértice, um sistema de digital signage (TVs com propaganda e avisos) da Vetta Sistemas.',
      'Responda em português do Brasil, em até 6 frases curtas, dizendo em que menu do painel clicar.',
      'Use só o que está no mapa do painel abaixo e o bom senso; se não souber, diga que não sabe e sugira falar com a Vetta Sistemas.',
      'Não trate de pagamentos, senhas ou dados de outras empresas. Texto simples, sem markdown.',
      `Mapa do painel:\n${clip(input.context, 6000)}`,
      `Pergunta: ${JSON.stringify(clip(input.question, 300))}`,
    ].join('\n');
  } else {
    const kind = ['offer', 'notice', 'event', 'welcome', 'menu'].includes(input.kind) ? input.kind : 'offer';
    const brief = {
      tipo: kind, produto: clip(input.product, 80), preco: clip(input.price, 20), loja: clip(input.store, 60),
      segmento: clip(input.segment, 40), tom: clip(input.tone, 30), detalhes: clip(input.details, 240),
    };
    prompt = [
      'Você escreve textos curtos para TVs de lojas pequenas no Brasil (digital signage), lidos de longe em poucos segundos.',
      'Escreva 3 opções diferentes em português do Brasil, sem emojis, sem exagero e sem prometer o que o pedido não diz.',
      'Não invente preço, desconto, prazo ou condição: use só o que estiver no pedido.',
      'Responda só com JSON: {"options":[{"badge":"","title":"","detail":"","footnote":""}]}.',
      'Limites: badge até 16 letras (ex.: SÓ HOJE), title até 32, detail até 70, footnote até 60 (pode ficar vazio).',
      `Pedido: ${JSON.stringify(brief)}`,
    ].join('\n');
  }
  aiUse.set(key, used + 1);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  }).catch(() => null);
  if (!r || !r.ok) {
    log('ia-erro', cid, r?.status || 'rede');
    return send(res, 502, { error: 'A IA não respondeu agora. Tente de novo em instantes.' });
  }
  const text = ((await r.json())?.content || []).map((c) => c.text || '').join('');
  if (mode === 'help') {
    const answer = text.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 1500);
    if (!answer) return send(res, 502, { error: 'O assistente não respondeu agora. Tente de novo.' });
    log('ia-ajuda', cid, auth.uid, used + 1);
    return send(res, 200, { answer, left: AI_DAILY - used - 1 });
  }
  if (mode === 'quiz') {
    let qs = [];
    try { qs = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).questions || []; } catch { qs = []; }
    qs = qs.filter((q) => Array.isArray(q) && q.length >= 3).slice(0, 15).map((q) => q.slice(0, 5).map((x, i) => clip(x, i ? 40 : 110).replace(/\|/g, '/')));
    if (!qs.length) return send(res, 502, { error: 'A IA respondeu fora do formato. Tente de novo.' });
    log('ia-quiz', cid, auth.uid, used + 1);
    return send(res, 200, { questions: qs, left: AI_DAILY - used - 1 });
  }
  let options = [];
  try { options = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).options || []; } catch { options = []; }
  options = options.slice(0, 3).map((o) => ({ badge: clip(o.badge, 16), title: clip(o.title, 32), detail: clip(o.detail, 70), footnote: clip(o.footnote, 60) })).filter((o) => o.title);
  if (!options.length) return send(res, 502, { error: 'A IA respondeu fora do formato. Tente de novo.' });
  log('ia', cid, auth.uid, used + 1);
  send(res, 200, { options, left: AI_DAILY - used - 1 });
}

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/health') return send(res, 200, { ok: true, project: PROJECT });

    let m = /^\/m\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (m && (req.method === 'GET' || req.method === 'HEAD')) return await handleGet(req, res, m[1], m[2]);

    m = /^\/v1\/public\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'PUT') return await handlePublicUpload(req, res, m[1], m[2], m[3]);

    m = /^\/v1\/ai\/([^/]+)\/texto$/.exec(pathname);
    if (m && req.method === 'POST') return await handleAi(req, res, m[1]);

    m = /^\/v1\/files\/companies\/([^/]+)\/media\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'PUT') return await handleUpload(req, res, m[1], m[2]);
    if (m && req.method === 'DELETE') return await handleDelete(req, res, m[1], m[2]);

    send(res, 404, 'Não encontrado');
  } catch (e) {
    console.error('[midias]', e);
    if (!res.headersSent) send(res, 500, { error: 'Erro no servidor de mídias.' });
    else res.destroy();
  }
});
// Uploads grandes em conexão lenta: sem limite de tempo por requisição.
server.requestTimeout = 0;
server.listen(PORT, HOST, () => {
  log(`[midias] ouvindo na porta ${PORT} · projeto ${PROJECT} · pasta ${DATA_DIR}`);
  log(`[midias] endereço público: ${PUBLIC_URL}${AUTH_EMU ? ' · usando emuladores' : ''}`);
});

/** Primeiro IPv4 privado deste PC (para as TVs da mesma rede baixarem as mídias). */
function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
  const priv = all.find((i) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address));
  return (priv || all[0])?.address || 'localhost';
}

function loadDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
