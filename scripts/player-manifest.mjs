// Monta o player-update.json de uma versão (o arquivo que cada TV lê para se atualizar) e
// cópias com nome fixo para o link "Baixar" do painel (…/releases/latest/download/…).
//   node scripts/player-manifest.mjs <versão> <pasta com os arquivos> <dono/repositório> [notas] [manifesto anterior]
// A pasta pode ter: Vertice-Player-Setup-<v>.exe, Vertice-Player-<v>.apk e vertice-player-web-<v>.zip.
// Publica o que tiver (o instalador do Windows não espera o APK, e vice-versa). Sem APK novo,
// o manifesto continua oferecendo o APK da versão anterior.
//
// Espelhos: cada arquivo pequeno (APK e conteúdo) também vai para o ramo "updates" do repositório,
// servido pelo raw.githubusercontent.com e pelo jsDelivr. O manifesto lista esses endereços em
// "mirrors", e as TVs tentam um depois do outro se o GitHub Releases falhar.
//
// Parte nativa (APK): o script tira uma "impressão digital" de tudo o que vai compilado no APK
// (pasta android/, capacitor.config.json e as versões dos plugins do Capacitor). Se ela não mudou
// desde a versão anterior, as TVs Android recebem só o conteúdo novo, em silêncio. Se mudou, o
// conteúdo novo passa a exigir o APK novo (minNativeCode) e a TV instala o APK primeiro.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { versionCode } from './player-version.mjs';

const [versao, pasta, repo, notas = '', anterior] = process.argv.slice(2);
if (!versao || !pasta || !repo) {
  console.error('Uso: node scripts/player-manifest.mjs <versão> <pasta> <dono/repositório> [notas]');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(new URL('../apps/player/package.json', import.meta.url), 'utf8'));
const base = `https://github.com/${repo}/releases/download/v${versao}`;
/** Onde o ramo "updates" é servido (mesmos arquivos, outros servidores). */
export const mirrorBases = (r) => [
  `https://raw.githubusercontent.com/${r}/updates`,
  `https://cdn.jsdelivr.net/gh/${r}@updates`,
];
const ESPELHO_ATE = 19 * 1024 * 1024; // o jsDelivr não serve arquivos maiores que ~20 MB

function arquivo(nome, algoritmo, formato, { espelho = false } = {}) {
  const p = path.join(pasta, nome);
  const dados = readFileSync(p);
  const size = statSync(p).size;
  const bases = espelho ? mirrorBases(repo).filter((b) => size <= ESPELHO_ATE || b.includes('raw.githubusercontent')) : [];
  return {
    url: `${base}/${nome}`,
    [algoritmo]: createHash(algoritmo).update(dados).digest(formato),
    size,
    ...(bases.length ? { mirrors: bases.map((b) => `${b}/${nome}`) } : {}),
  };
}
const tem = (nome) => existsSync(path.join(pasta, nome));

const RAIZ = new URL('../', import.meta.url);
const IGNORAR_PASTAS = new Set(['build', '.gradle', '.idea', 'public']);
const IGNORAR_ARQUIVOS = /^(local\.properties|.*\.keystore|.*\.jks)$/;

/** Impressão digital da parte nativa do player Android. */
function impressaoNativa() {
  const h = createHash('sha256');
  const android = path.join(RAIZ.pathname, 'apps/player/android');
  const arquivos = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir).sort()) {
      const p = path.join(dir, nome);
      const st = statSync(p);
      if (st.isDirectory()) {
        // assets/public é o conteúdo web: entra pelo .zip, não pelo APK.
        if (!IGNORAR_PASTAS.has(nome)) andar(p);
      } else if (!IGNORAR_ARQUIVOS.test(nome)) arquivos.push(p);
    }
  };
  andar(android);
  for (const p of arquivos) {
    let txt = readFileSync(p);
    // A versão do APK muda a cada lançamento; não conta como mudança nativa.
    if (p.endsWith(path.join('app', 'build.gradle'))) {
      txt = Buffer.from(txt.toString('utf8').replace(/versionCode \d+/, '').replace(/versionName "[^"]*"/, ''));
    }
    h.update(path.relative(android, p).replaceAll('\\', '/'));
    h.update(txt.toString('utf8').replace(/\r\n/g, '\n'));
  }
  h.update(readFileSync(new URL('apps/player/capacitor.config.json', RAIZ), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('package-lock.json', RAIZ), 'utf8'));
  for (const [k, v] of Object.entries(lock.packages || {}).sort()) {
    if (/node_modules\/@capacitor(-community)?\//.test(k)) h.update(`${k}@${v.version}`);
  }
  return h.digest('hex');
}

const nativeHash = impressaoNativa();
const prev = anterior && existsSync(anterior) ? JSON.parse(readFileSync(anterior, 'utf8')) : null;
// Sem versão anterior publicada: vale o piso do package.json (o APK 0.3.0 já tem tudo).
const minNativeCode = prev?.nativeHash === nativeHash && prev?.web?.minNativeCode
  ? Number(prev.web.minNativeCode)
  : prev ? versionCode(versao) : versionCode(pkg.vertice?.minNativeVersion || versao);

const exe = `Vertice-Player-Setup-${versao}.exe`;
const apk = `Vertice-Player-${versao}.apk`;
const web = `vertice-player-web-${versao}.zip`;

if (!tem(exe) && !tem(apk) && !tem(web)) {
  console.error('Nenhum arquivo para publicar.');
  process.exit(1);
}
const manifesto = {
  version: versao,
  nativeHash,
  publishedAt: new Date().toISOString(),
  notes: String(notas).replace(/^release:\s*/i, '').split('\n')[0].slice(0, 300),
  // Sem arquivo novo, fica o da versão anterior (as TVs daquele sistema só não sobem de versão).
  windows: tem(exe) ? { version: versao, ...arquivo(exe, 'sha512', 'base64') } : prev?.windows || null,
  android: tem(apk) ? { version: versao, versionCode: versionCode(versao), ...arquivo(apk, 'sha256', 'hex', { espelho: true }) } : prev?.android || null,
  web: tem(web) ? {
    version: versao,
    ...arquivo(web, 'sha256', 'hex', { espelho: true }),
    // O conteúdo novo só vai por cima de um APK que já tem a parte nativa que ele usa.
    // (Parte nativa mudou e o APK novo não saiu? As TVs Android esperam: não aplicam o conteúdo.)
    minNativeCode,
  } : prev?.web || null,
  mirrors: mirrorBases(repo).map((b) => `${b}/player-update.json`),
};

writeFileSync(path.join(pasta, 'player-update.json'), `${JSON.stringify(manifesto, null, 2)}\n`);
if (tem(apk)) copyFileSync(path.join(pasta, apk), path.join(pasta, 'Vertice-Player.apk'));
if (tem(exe)) copyFileSync(path.join(pasta, exe), path.join(pasta, 'Vertice-Player-Setup.exe'));
for (const [nome, ok] of [['Windows', tem(exe)], ['APK', tem(apk)], ['conteúdo Android', tem(web)]]) {
  if (!ok) console.log(`::warning::Esta versão saiu sem ${nome} novo (ver o job que falhou). As TVs continuam com o anterior.`);
}
console.log(JSON.stringify(manifesto, null, 2));
