// Monta o player-update.json de uma versão (o arquivo que cada TV lê para se atualizar) e
// cópias com nome fixo para o link "Baixar" do painel (…/releases/latest/download/…).
//   node scripts/player-manifest.mjs <versão> <pasta com os arquivos> <dono/repositório> [notas] [manifesto anterior]
// A pasta precisa ter: Vertice-Player-Setup-<v>.exe, Vertice-Player-<v>.apk e vertice-player-web-<v>.zip.
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

function arquivo(nome, algoritmo, formato) {
  const p = path.join(pasta, nome);
  const dados = readFileSync(p);
  return {
    url: `${base}/${nome}`,
    [algoritmo]: createHash(algoritmo).update(dados).digest(formato),
    size: statSync(p).size,
  };
}

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

const manifesto = {
  version: versao,
  nativeHash,
  publishedAt: new Date().toISOString(),
  notes: String(notas).replace(/^release:\s*/i, '').split('\n')[0].slice(0, 300),
  windows: { version: versao, ...arquivo(exe, 'sha512', 'base64') },
  android: { version: versao, versionCode: versionCode(versao), ...arquivo(apk, 'sha256', 'hex') },
  web: {
    version: versao,
    ...arquivo(web, 'sha256', 'hex'),
    // O conteúdo novo só vai por cima de um APK que já tem a parte nativa que ele usa.
    minNativeCode,
  },
};

writeFileSync(path.join(pasta, 'player-update.json'), `${JSON.stringify(manifesto, null, 2)}\n`);
copyFileSync(path.join(pasta, apk), path.join(pasta, 'Vertice-Player.apk'));
copyFileSync(path.join(pasta, exe), path.join(pasta, 'Vertice-Player-Setup.exe'));
console.log(JSON.stringify(manifesto, null, 2));
