// Vértice: troca o endereço do servidor de mídias gravado no Firestore.
//
// O painel grava o link completo de cada mídia (ex.: http://192.168.0.10:8787/m/empresa/arquivo.mp4)
// e os manifestos das TVs copiam esse link. Ao mudar o servidor de lugar (PC → VPS), os links
// antigos param de funcionar. Este script percorre as empresas e troca só o começo do link,
// mantendo /m/{empresa}/{arquivo}. Links de outros lugares (Firebase Storage, planilhas) ficam.
//
//   node migrar-midias.mjs https://midias.vettasistemas.com.br            só mostra o que mudaria
//   node migrar-midias.mjs https://midias.vettasistemas.com.br --aplicar  grava
//
// Usa a mesma configuração do serviço de alertas (.env ao lado, ou variáveis de ambiente):
// GOOGLE_APPLICATION_CREDENTIALS e FIREBASE_PROJECT_ID. Na VPS:
//   sudo bash -c 'set -a; . /etc/vertice/alertas.env; cd /opt/vertice/alertas; node migrar-midias.mjs https://... --aplicar'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(HERE, '.env'));

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const novo = args.find((a) => !a.startsWith('--'));
let NOVO;
try {
  const u = new URL(novo);
  if (!/^https?:$/.test(u.protocol) || (u.pathname !== '/' && u.pathname !== '')) throw new Error();
  NOVO = u.origin;
} catch {
  console.error('Uso: node migrar-midias.mjs https://midias.seudominio.com.br [--aplicar]');
  process.exit(1);
}

/** Link do servidor de mídias em outro endereço → mesmo caminho no endereço novo. */
const LINK = /^https?:\/\/[^/?#]+(\/m\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_.-]{1,90})$/;
function trocar(valor, novo) {
  if (typeof valor === 'string') {
    const m = LINK.exec(valor);
    return m && !valor.startsWith(`${novo}/`) ? novo + m[1] : valor;
  }
  if (Array.isArray(valor)) return valor.map((v) => trocar(v, novo));
  // Só objetos simples; Timestamp, referências etc. ficam como estão.
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(valor)) o[k] = trocar(valor[k], novo);
    return o;
  }
  return valor;
}

const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS && path.resolve(HERE, process.env.GOOGLE_APPLICATION_CREDENTIALS);
initializeApp(credFile && fs.existsSync(credFile)
  ? { credential: cert(JSON.parse(fs.readFileSync(credFile, 'utf8'))) }
  : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore();

const antigos = new Map();
const porColecao = new Map();
let docs = 0;
let lote = db.batch();
let noLote = 0;

async function visitar(ref, data) {
  const mudou = {};
  for (const k of Object.keys(data)) {
    const t = trocar(data[k], NOVO);
    if (JSON.stringify(t) !== JSON.stringify(data[k])) mudou[k] = t;
  }
  if (Object.keys(mudou).length) {
    docs++;
    const col = ref.parent.id;
    porColecao.set(col, (porColecao.get(col) || 0) + 1);
    JSON.stringify(data, (_, v) => {
      const m = typeof v === 'string' && LINK.exec(v);
      if (m && !v.startsWith(`${NOVO}/`)) antigos.set(new URL(v).origin, (antigos.get(new URL(v).origin) || 0) + 1);
      return v;
    });
    if (APLICAR) {
      lote.update(ref, mudou);
      if (++noLote >= 400) {
        await lote.commit();
        lote = db.batch();
        noLote = 0;
      }
    }
  }
  for (const sub of await ref.listCollections()) {
    for (const d of (await sub.get()).docs) await visitar(d.ref, d.data());
  }
}

for (const c of (await db.collection('companies').get()).docs) await visitar(c.ref, c.data());
if (APLICAR && noLote) await lote.commit();

if (!docs) {
  console.log(`Nada a trocar: todos os links de mídia já usam ${NOVO}.`);
} else {
  console.log(`${docs} documento(s) com links antigos:`);
  for (const [col, n] of porColecao) console.log(`  ${col}: ${n}`);
  console.log('Endereços antigos encontrados:');
  for (const [o, n] of antigos) console.log(`  ${o} (${n} link(s))`);
  console.log(APLICAR ? `Trocados para ${NOVO}.` : `Nada foi gravado. Para trocar por ${NOVO}, rode de novo com --aplicar.`);
}
process.exit(0);

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
