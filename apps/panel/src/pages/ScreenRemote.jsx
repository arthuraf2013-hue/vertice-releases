import { useState } from 'react';
import { compareVersions, timeAgo } from '@vertice/shared';
import { useDoc } from '../data/hooks.js';
import { api } from '../data/api.js';
import { Button, useToast, useConfirm } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

/** Players a partir desta versão recebem comandos e mandam diagnóstico. */
export const REMOTE_MIN_VERSION = '0.3.0';
const SEM_RESPOSTA_MS = 2 * 60_000;

const COMANDOS = {
  identify: 'Identificar',
  menu: 'Abrir o menu na TV',
  reload: 'Recarregar',
  restart: 'Reiniciar o player',
  update: 'Atualizar agora',
  screenshot: 'Ver a tela agora',
  diagnostics: 'Atualizar diagnóstico',
};

const bytes = (b) => {
  if (!Number.isFinite(b) || b === null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 && i ? 1 : 0 })} ${u[i]}`;
};
const ms = (v) => (v === null || v === undefined ? 'sem resposta' : `${v} ms`);
const hora = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Controle remoto da TV: comandos (recarregar, reiniciar, atualizar, foto da tela) e o
 * diagnóstico que a TV manda (versão, internet, espaço, erros).
 */
export function ScreenRemote({ base, screen, now, readOnly }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(null);
  const live = `${base}/screens/${screen.id}/live`;
  const diag = useDoc(`${live}/diagnostics`);
  const shot = useDoc(`${live}/screenshot`);
  const cmd = useDoc(`${live}/command`);
  const antigo = screen.appVersion && compareVersions(screen.appVersion, REMOTE_MIN_VERSION) < 0;

  const send = async (type) => {
    if (type === 'restart') {
      const ok = await confirm({
        title: `Reiniciar o player de ${screen.name}?`, confirmLabel: 'Reiniciar',
        message: 'A TV fica alguns segundos sem conteúdo e volta sozinha.',
      });
      if (!ok) return;
    }
    setBusy(type);
    try {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await api.set(`${live}/command`, { id, type, at: api.NOW });
      toast(`"${COMANDOS[type]}" enviado. A TV responde em segundos.`);
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setBusy(null);
    }
  };

  const ack = diag?.ack;
  const pendente = cmd?.id && cmd.id !== ack?.id;
  const semResposta = pendente && cmd.at && now - cmd.at > SEM_RESPOSTA_MS;
  const st = diag?.storage || {};
  const lat = diag?.latency || {};

  return (
    <div className="vx-subsection">
      {confirmDialog}
      <h3 className="vx-subtitle"><Icon name="pulse" />Controle remoto</h3>
      <p className="vx-help">Mande comandos para a TV sem ir até a loja. O operador também tem o mesmo menu na própria TV (botão "Menu", que aparece ao tocar na tela ou apertar uma tecla do controle).</p>
      {antigo && (
        <div className="vx-alert vx-alert-warn" role="status">
          <Icon name="alert" />
          <span>Esta TV está com o app v{screen.appVersion}. Comandos e diagnóstico precisam do Vértice Player {REMOTE_MIN_VERSION} ou mais novo. Instale a versão nova uma vez: depois ela se atualiza sozinha.</span>
        </div>
      )}
      <div className="vx-remote-actions">
        {['identify', 'screenshot', 'reload', 'restart', 'update', 'menu', 'diagnostics'].map((t) => (
          <Button key={t} size="sm" disabled={readOnly} loading={busy === t}
            icon={{ identify: 'eye', screenshot: 'camera', reload: 'sync', restart: 'play', update: 'download', menu: 'apps', diagnostics: 'pulse' }[t]}
            onClick={() => send(t)}>{COMANDOS[t]}</Button>
        ))}
      </div>
      {cmd?.id && (
        <p className={`vx-remote-ack ${semResposta || (ack?.id === cmd.id && ack.ok === false) ? 'is-bad' : ''}`}>
          {pendente
            ? (semResposta
              ? `"${COMANDOS[cmd.type] || cmd.type}" sem resposta. Confira se a TV está ligada e com internet.`
              : `"${COMANDOS[cmd.type] || cmd.type}" enviado ${timeAgo(cmd.at, now)}. Aguardando a TV…`)
            : `${COMANDOS[ack.type] || ack.type}: ${ack.ok ? (ack.message || 'feito') : `não deu certo — ${ack.message || 'erro'}`} (${hora(ack.doneAt)})`}
        </p>
      )}

      <div className="vx-remote-grid">
        <div className="vx-remote-shot">
          {shot?.image
            ? (
              <>
                <img src={shot.image} alt={`Tela de ${screen.name}`} />
                <span>Foto das {hora(shot.at)} · vídeos podem aparecer pretos na foto</span>
              </>
            )
            : <div className="vx-remote-empty"><Icon name="camera" /><span>Use "Ver a tela agora" para ver o que a TV está mostrando.</span></div>}
        </div>
        <div className="vx-remote-diag">
          {diag ? (
            <>
              <dl>
                <div><dt>Versão</dt><dd className="vx-mono">v{diag.appVersion}{diag.nativeVersion && diag.nativeVersion !== diag.appVersion ? ` · app ${diag.nativeVersion}` : ''}</dd></div>
                <div><dt>Atualização</dt><dd>{diag.update?.label || '—'}</dd></div>
                <div><dt>Internet</dt><dd className={diag.online === false ? 'is-bad' : ''}>{diag.online === false ? 'sem conexão' : ms(lat.internet)}</dd></div>
                <div><dt>Firebase</dt><dd className={lat.firebase === null ? 'is-bad' : ''}>{ms(lat.firebase)}</dd></div>
                <div><dt>Espaço livre</dt><dd className={st.freeBytes !== null && st.freeBytes < 500 * 1024 * 1024 ? 'is-bad' : ''}>{bytes(st.freeBytes)} de {bytes(st.totalBytes)}</dd></div>
                <div><dt>Mídias</dt><dd>{diag.sync ? `${diag.sync.done}/${diag.sync.total}` : '—'}{st.mediaBytes ? ` · ${bytes(st.mediaBytes)}` : ''}</dd></div>
                <div><dt>Aparelho</dt><dd>{[diag.model, diag.platform].filter(Boolean).join(' · ') || '—'}</dd></div>
                <div><dt>Ligado há</dt><dd>{Number.isFinite(diag.uptimeMin) ? (diag.uptimeMin < 60 ? `${diag.uptimeMin} min` : `${Math.floor(diag.uptimeMin / 60)} h`) : '—'}</dd></div>
              </dl>
              {diag.errors?.length > 0 && (
                <details className="vx-remote-errors">
                  <summary>{diag.errors.length} aviso(s) recente(s) na TV</summary>
                  <ul>{diag.errors.slice(0, 6).map((e, i) => <li key={i}><span className="vx-mono">{hora(e.at)}</span> {e.msg}</li>)}</ul>
                </details>
              )}
              <span className="vx-help">Diagnóstico das {hora(diag.at)}. A TV manda um novo a cada 30 minutos.</span>
            </>
          ) : <div className="vx-remote-empty"><Icon name="pulse" /><span>{antigo ? 'Disponível depois de atualizar o player.' : 'A TV ainda não mandou diagnóstico. Use "Atualizar diagnóstico".'}</span></div>}
        </div>
      </div>
    </div>
  );
}
