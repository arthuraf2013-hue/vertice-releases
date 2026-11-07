// Roda o Gradle do projeto Android do player no Windows (gradlew.bat) ou no Linux/macOS (./gradlew).
// Uso: node scripts/gradle.mjs assembleDebug
//
// Precisa do Java e do Android SDK. Sem JAVA_HOME, usa o Java que vem com o Android Studio
// (pasta "jbr"), se ele estiver instalado nos lugares de sempre.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'player', 'android');
const win = process.platform === 'win32';
const env = { ...process.env };

if (!env.JAVA_HOME) {
  const candidatos = win
    ? [
        path.join(env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
        path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Android Studio', 'jbr'),
      ]
    : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/opt/android-studio/jbr', path.join(os.homedir(), 'android-studio', 'jbr')];
  const jbr = candidatos.find((p) => existsSync(path.join(p, 'bin', win ? 'java.exe' : 'java')));
  if (jbr) env.JAVA_HOME = jbr;
}
const temJava = env.JAVA_HOME || spawnSync(win ? 'where' : 'which', ['java'], { shell: win }).status === 0;
const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT
  || (win ? path.join(env.LOCALAPPDATA || '', 'Android', 'Sdk') : path.join(os.homedir(), 'Android', 'Sdk'));
const temSdk = existsSync(path.join(dir, 'local.properties')) || existsSync(sdk);
if (!temJava || !temSdk) {
  console.error(`\nPara gerar o APK neste computador falta ${!temJava && !temSdk ? 'o Java e o Android SDK' : !temJava ? 'o Java' : 'o Android SDK'}.`);
  console.error('Instale o Android Studio (https://developer.android.com/studio), abra-o uma vez para baixar o SDK e rode de novo.');
  console.error('O instalador do Windows (npm run win:player) não depende disso.\n');
  process.exit(1);
}

const r = spawnSync(win ? 'gradlew.bat' : './gradlew', process.argv.slice(2), { cwd: dir, stdio: 'inherit', shell: win, env });
if (r.status === 0 && process.argv.includes('assembleDebug')) {
  console.log(`\nAPK pronto: ${path.join(dir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')}`);
}
process.exit(r.status ?? 1);
