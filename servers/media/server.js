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
//   GET    /health                                         verificação rápida
//
// Configuração por variáveis de ambiente (ou arquivo .env ao lado deste):
//   FIREBASE_PROJECT_ID   id do projeto Firebase do Vértice (obrigatório)
//   PUBLIC_URL            endereço público, ex.: https://midias.vettasistemas.com.br
//                         (vazio = IP deste PC na rede local, ex.: http://192.168.0.10:8787)
//   PORT                  porta (padrão 8787)
//   DATA_DIR              pasta das mídias (padrão ./data)
//   MAX_UPLOAD_MB         tamanho máximo por arquivo (padrão 500)
//   ALLOWED_ORIGINS       origens do painel separadas por vírgula (padrão *)
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

function cors(req, res) {
  const origin = req.headers.origin;
  if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, DELETE, OPTIONS');
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
  return { uid, role };
}

async function handleUpload(req, res, cid, name) {
  const dest = filePath(cid, name);
  if (!dest) return send(res, 400, { error: 'Nome de arquivo inválido.' });
  const auth = await authorize(req, cid);
  if (auth.error) return send(res, auth.status, { error: auth.error });

  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BYTES) return send(res, 413, { error: `Arquivo acima de ${MAX_BYTES / 1048576} MB.` });
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
          yield chunk;
        }
      },
      fs.createWriteStream(part),
    );
    if (!received) throw Object.assign(new Error('vazio'), { code: 'EMPTY' });
    await fsp.rename(part, dest);
  } catch (e) {
    await fsp.rm(part, { force: true });
    if (e.code === 'TOO_BIG') return send(res, 413, { error: `Arquivo acima de ${MAX_BYTES / 1048576} MB.` });
    if (e.code === 'EMPTY') return send(res, 400, { error: 'Arquivo vazio.' });
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
server.listen(PORT, () => {
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
