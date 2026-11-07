// Configuração em tempo de execução dos apps Windows (painel e player).
// Permite apontar o instalador para o projeto Firebase e o servidor de mídias sem gerar outro .exe.
// Procura vertice.config.json ao lado do .exe e depois na pasta de dados do app (%APPDATA%\<app>).
// Se não existir, cria um modelo na pasta de dados para a pessoa preencher.
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = {
  _leia: 'Preencha com o app Web do Firebase (Configurações do projeto > Seus apps) e o endereço do servidor de mídias. Salve e reabra o programa. Vazio = modo demonstração.',
  firebase: { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' },
  mediaServerUrl: '',
};

function loadDesktopConfig(app) {
  const candidates = [
    path.join(path.dirname(process.execPath), 'vertice.config.json'),
    path.join(app.getPath('userData'), 'vertice.config.json'),
  ];
  for (const file of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...cfg, _file: file };
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[vx] vertice.config.json inválido:', file, e.message);
    }
  }
  const file = candidates[1];
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(TEMPLATE, null, 2));
  } catch { /* sem permissão: segue em demonstração */ }
  return { _file: file };
}

/** Argumento para o preload (process.argv é o único canal num preload com sandbox). */
function configArg(cfg) {
  return `--vx-config=${Buffer.from(JSON.stringify(cfg)).toString('base64')}`;
}

module.exports = { loadDesktopConfig, configArg };
