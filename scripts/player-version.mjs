// Versão do Vértice Player em um lugar só: apps/player/package.json, package-lock.json e o APK
// (versionName/versionCode no build.gradle).
//   node scripts/player-version.mjs            mostra a versão atual
//   node scripts/player-version.mjs bump       sobe o último número (0.3.0 → 0.3.1)
//   node scripts/player-version.mjs set 0.4.0  define uma versão
// Imprime "version=X.Y.Z" (formato do $GITHUB_OUTPUT do GitHub Actions).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const raiz = new URL('../', import.meta.url);
const arq = (p) => new URL(p, raiz);
const PKG = arq('apps/player/package.json');
const LOCK = arq('package-lock.json');
const GRADLE = arq('apps/player/android/app/build.gradle');

/** "0.3.1" → 301 (igual ao versionCode do @vertice/shared). */
export const versionCode = (v) => {
  const [a = 0, b = 0, c = 0] = String(v).split('.').map((n) => parseInt(n, 10) || 0);
  return a * 10000 + b * 100 + c;
};

function aplicar(versao) {
  if (!/^\d+\.\d+\.\d+$/.test(versao)) throw new Error(`Versão inválida: ${versao}`);
  const [, , patch] = versao.split('.').map(Number);
  if (patch > 99) throw new Error('O último número passa de 99: suba o do meio (ex.: 0.4.0).');

  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  pkg.version = versao;
  writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);

  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  if (lock.packages?.['apps/player']) lock.packages['apps/player'].version = versao;
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);

  let gradle = readFileSync(GRADLE, 'utf8');
  gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode(versao)}`).replace(/versionName "[^"]*"/, `versionName "${versao}"`);
  writeFileSync(GRADLE, gradle);
}

// Só roda como comando (o player-manifest.mjs importa o versionCode daqui).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, arg] = process.argv.slice(2);
  const atual = JSON.parse(readFileSync(PKG, 'utf8')).version;
  let versao = atual;
  if (cmd === 'bump') {
    const [a, b, c] = atual.split('.').map(Number);
    versao = `${a}.${b}.${c + 1}`;
    aplicar(versao);
  } else if (cmd === 'set') {
    versao = arg;
    aplicar(versao);
  }
  console.log(`version=${versao}`);
}
