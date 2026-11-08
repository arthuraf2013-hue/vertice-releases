// Comandos do painel e diagnóstico enviado ao painel (screens/{id}/live/*).
import { collectDiagnostics } from './diagnostics.js';
import { host } from './host.js';
import { updateLabel } from './updater.js';

const PRIMEIRO_ENVIO_MS = 60_000;
const INTERVALO_MS = 30 * 60_000;

/**
 * @param {{ device: object, updater: object, ui: { identify: () => void, openMenu: () => void } }} deps
 * @returns {{ sendDiagnostics: (ack?: object) => Promise<object>, stop: () => void }}
 */
export function startRemote({ device, updater, ui }) {
  async function sendDiagnostics(ack) {
    const diag = await collectDiagnostics(device.getState(), { update: resumoUpdate(updater.getState()) });
    await device.writeLive('diagnostics', ack ? { ...diag, ack } : diag);
    return diag;
  }

  const off = device.onCommand(async (cmd) => {
    const ack = { id: cmd.id, type: cmd.type, ok: true, message: null, doneAt: Date.now() };
    const responder = (patch) => sendDiagnostics({ ...ack, ...patch, doneAt: Date.now() }).catch((e) => console.warn('[vx] resposta ao painel', e.code || e));
    try {
      switch (cmd.type) {
        case 'identify':
          ui.identify();
          await responder({ message: 'Código mostrado na TV por 15 segundos.' });
          break;
        case 'menu':
          ui.openMenu();
          await responder({ message: 'Menu aberto na TV.' });
          break;
        case 'reload':
          await withTimeout(responder({ message: 'Recarregando.' }), 4000);
          await host.reload();
          break;
        case 'restart':
          await withTimeout(responder({ message: 'Reiniciando o player.' }), 4000);
          await host.restart();
          break;
        case 'update': {
          await updater.check({ interactive: true });
          await responder({ message: updateLabel(updater.getState()) });
          break;
        }
        case 'screenshot': {
          const image = await host.screenshot();
          if (!image) throw new Error('Este aparelho não tira foto da tela (player no navegador).');
          await device.writeLive('screenshot', { image });
          // Histórico em Capturas (não atrapalha a resposta se falhar).
          await device.addCapture?.(image).catch((e) => console.warn('[vx] histórico de capturas', e.code || e));
          await responder({ message: 'Foto da tela enviada.' });
          break;
        }
        case 'diagnostics':
          await responder({ message: 'Diagnóstico atualizado.' });
          break;
        default:
          await responder({ ok: false, message: 'Comando desconhecido. Atualize o player.' });
      }
    } catch (e) {
      await responder({ ok: false, message: String(e?.message || e).slice(0, 200) });
    }
  });

  const t1 = setTimeout(() => sendDiagnostics().catch(() => {}), PRIMEIRO_ENVIO_MS);
  const t2 = setInterval(() => sendDiagnostics().catch(() => {}), INTERVALO_MS);
  return {
    sendDiagnostics,
    stop() {
      off();
      clearTimeout(t1);
      clearInterval(t2);
    },
  };
}

function resumoUpdate(s) {
  if (!s) return null;
  return {
    status: s.status || null,
    available: s.available || null,
    lastCheck: s.lastCheck || null,
    error: s.error ? String(s.error).slice(0, 160) : null,
    apk: s.apk?.status || null,
    label: updateLabel(s),
  };
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}
