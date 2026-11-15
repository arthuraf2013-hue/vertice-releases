// Vigia do player: mantém a TV de pé por semanas sem ninguém mexer.
//  - Recarga diária de madrugada (entre 4h00 e 4h19, sorteado por aparelho): limpa memória acumulada
//    sem interromper o horário da loja.
//  - Memória: se o navegador informa o uso e ele passa de 85% do limite, recarrega antes de travar.
//  - Erro de JavaScript sem tratamento repetido várias vezes em pouco tempo: recarrega.
// Travamento completo da página é tratado fora daqui: no Windows pelo Electron (main.cjs) e no
// Android pela MainActivity (WebView que caiu recria a tela; falha do app reabre o player).
import { local } from './platform.js';

const MIN = 60_000;
const MIN_UPTIME = 60 * MIN;

export function startWatchdog({ reload, isBusy = () => false, now = () => Date.now() }) {
  const bootAt = now();
  let minute = local.get('watchdog:minute');
  if (!Number.isInteger(minute)) {
    minute = Math.floor(Math.random() * 20);
    local.set('watchdog:minute', minute);
  }
  let errors = [];
  const restart = (motivo) => {
    console.warn('[vx] vigia: recarregando —', motivo);
    local.set('watchdog:last', { at: now(), motivo });
    reload();
  };
  const onError = () => {
    const t = now();
    errors = errors.filter((x) => t - x < 5 * MIN).concat(t);
    if (errors.length >= 20 && t - bootAt > 5 * MIN) restart('muitos erros seguidos');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);

  const timer = setInterval(() => {
    const d = new Date(now());
    const up = now() - bootAt;
    if (up > MIN_UPTIME && d.getHours() === 4 && d.getMinutes() === minute && !isBusy()) restart('recarga diária');
    const mem = performance?.memory;
    if (mem?.jsHeapSizeLimit && mem.usedJSHeapSize / mem.jsHeapSizeLimit > 0.85 && up > 10 * MIN && !isBusy()) restart('memória alta');
  }, MIN);

  return {
    stop() {
      clearInterval(timer);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    },
    last: () => local.get('watchdog:last'),
  };
}
