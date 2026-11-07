import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../services/platform.js';
import { host, can, shell, SYSTEM_SETTINGS } from '../services/host.js';
import { collectDiagnostics, formatBytes } from '../services/diagnostics.js';
import { updateLabel } from '../services/updater.js';

const BOTAO_VISIVEL_MS = 8000;
const MENU_PARADO_MS = 2 * 60_000;
const TECLAS_NAV = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * Menu do operador. A TV não tem cursor nem barra do sistema: qualquer toque, movimento do
 * mouse ou tecla do controle mostra o botão "Menu" por alguns segundos. Dentro do menu, as setas
 * do controle andam entre os botões, OK escolhe e Voltar fecha.
 *
 * @param {{ state: object, updater?: object, remote?: object, openSignal?: number, identifySignal?: number }} props
 */
export function OperatorMenu({ state, updater, remote, openSignal = 0, identifySignal = 0 }) {
  const [botao, setBotao] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [identificar, setIdentificar] = useState(false);
  const botaoRef = useRef(null);
  const esconder = useRef(null);
  const parado = useRef(null);
  const abertoRef = useRef(false);
  abertoRef.current = aberto;

  const mostrarBotao = useCallback((focar) => {
    setBotao(true);
    document.body.classList.add('vx-cursor');
    clearTimeout(esconder.current);
    esconder.current = setTimeout(() => {
      setBotao(false);
      if (!abertoRef.current) document.body.classList.remove('vx-cursor');
    }, BOTAO_VISIVEL_MS);
    if (focar) setTimeout(() => botaoRef.current?.focus(), 0);
  }, []);

  const abrir = useCallback(() => {
    setAberto(true);
    setBotao(false);
    document.body.classList.add('vx-cursor');
  }, []);
  const fechar = useCallback(() => {
    setAberto(false);
    document.body.classList.remove('vx-cursor');
  }, []);

  // Qualquer sinal de gente mexendo mostra o botão.
  useEffect(() => {
    const atividade = () => {
      if (!abertoRef.current) mostrarBotao(false);
    };
    const tecla = (e) => {
      if (abertoRef.current) {
        if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
          e.preventDefault();
          fechar();
        }
        return;
      }
      if (e.key === 'ContextMenu') {
        e.preventDefault();
        abrir();
        return;
      }
      // Botão escondido: a primeira tecla só mostra o botão (e o OK seguinte abre o menu).
      if (document.activeElement !== botaoRef.current) {
        e.preventDefault();
        mostrarBotao(true);
      } else mostrarBotao(false);
    };
    const voltar = () => (abertoRef.current ? fechar() : mostrarBotao(true));
    window.addEventListener('pointermove', atividade, { passive: true });
    window.addEventListener('pointerdown', atividade, { passive: true });
    window.addEventListener('wheel', atividade, { passive: true });
    window.addEventListener('keydown', tecla);
    window.addEventListener('vxback', voltar);
    window.addEventListener('vxmenu', abrir);
    return () => {
      window.removeEventListener('pointermove', atividade);
      window.removeEventListener('pointerdown', atividade);
      window.removeEventListener('wheel', atividade);
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('vxback', voltar);
      window.removeEventListener('vxmenu', abrir);
    };
  }, [abrir, fechar, mostrarBotao]);

  // Comandos do painel: abrir o menu e identificar a TV.
  useEffect(() => { if (openSignal) abrir(); }, [openSignal, abrir]);
  useEffect(() => {
    if (!identifySignal) return undefined;
    setIdentificar(true);
    const t = setTimeout(() => setIdentificar(false), 15_000);
    return () => clearTimeout(t);
  }, [identifySignal]);

  // Menu esquecido aberto fecha sozinho.
  useEffect(() => {
    if (!aberto) return undefined;
    const reiniciar = () => {
      clearTimeout(parado.current);
      parado.current = setTimeout(fechar, MENU_PARADO_MS);
    };
    reiniciar();
    window.addEventListener('keydown', reiniciar);
    window.addEventListener('pointerdown', reiniciar);
    window.addEventListener('pointermove', reiniciar);
    return () => {
      clearTimeout(parado.current);
      window.removeEventListener('keydown', reiniciar);
      window.removeEventListener('pointerdown', reiniciar);
      window.removeEventListener('pointermove', reiniciar);
    };
  }, [aberto, fechar]);

  return (
    <>
      {botao && !aberto && (
        <button ref={botaoRef} type="button" className="vx-op-fab" onClick={abrir}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          Menu
        </button>
      )}
      {aberto && <MenuPanel state={state} updater={updater} remote={remote} onClose={fechar} />}
      {identificar && <Identify state={state} />}
    </>
  );
}

/** Mostra o código da tela bem grande (comando "Identificar" do painel). */
function Identify({ state }) {
  const s = state.manifest?.screen;
  return (
    <div className="vx-op-identify" role="status">
      <div className="tv-over">ESTA É A TELA</div>
      <b>{s?.code || '—'}</b>
      {s?.name && s.name !== s.code && <span>{s.name}</span>}
    </div>
  );
}

function MenuPanel({ state, updater, remote, onClose }) {
  const ref = useRef(null);
  const [upd, setUpd] = useState(() => updater?.getState() || null);
  const [diag, setDiag] = useState(null);
  const [testando, setTestando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [janela, setJanela] = useState({ fullscreen: true, monitores: 1 });
  const [confirmarSaida, setConfirmarSaida] = useState(false);

  useEffect(() => (updater ? updater.subscribe(setUpd) : undefined), [updater]);
  useEffect(() => {
    host.windowState().then(setJanela).catch(() => {});
    return host.onWindowState(setJanela);
  }, []);

  const testar = useCallback(async () => {
    setTestando(true);
    try {
      setDiag(await collectDiagnostics(state, {}));
    } finally {
      setTestando(false);
    }
  }, [state]);
  useEffect(() => { testar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Foco no primeiro botão e navegação pelas setas do controle.
  useEffect(() => {
    const painel = ref.current;
    painel?.querySelector('button')?.focus();
    const onKey = (e) => {
      if (!TECLAS_NAV.includes(e.key)) return;
      e.preventDefault();
      const alvo = vizinho(painel, document.activeElement, e.key);
      if (alvo) {
        alvo.focus();
        alvo.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const executar = async (fn, msg) => {
    setAviso(msg || '');
    try {
      await fn();
    } catch (e) {
      setAviso(`Não deu certo: ${e?.message || e}`);
    }
  };

  const enviar = async () => {
    if (!remote) return setAviso('Esta tela ainda não está pareada.');
    await executar(() => remote.sendDiagnostics(), 'Enviando ao painel…');
    setAviso('Diagnóstico enviado ao painel.');
  };

  const screen = state.manifest?.screen;
  const online = state.network?.online !== false;
  const ms = (v) => (v === null || v === undefined ? 'sem resposta' : `${v} ms`);
  const st = diag?.storage || {};

  return (
    <div className="vx-op-backdrop">
      <div className="vx-op-panel" ref={ref} role="dialog" aria-label="Menu do operador">
        <header className="vx-op-head">
          <div>
            <div className="tv-over">MENU DO OPERADOR</div>
            <h2>Vértice Player <span>v{APP_VERSION}</span></h2>
            <p>{[screen?.code, screen?.name, state.manifest?.company?.name].filter(Boolean).join(' · ') || 'Tela ainda não pareada'}</p>
          </div>
          <button type="button" className="vx-op-btn vx-op-close" onClick={onClose}>Fechar menu</button>
        </header>

        <div className="vx-op-body">
          <section>
            <h3>Player</h3>
            <div className="vx-op-grid">
              <button type="button" className="vx-op-btn" onClick={() => executar(() => host.reload(), 'Recarregando…')}>Recarregar</button>
              {can.restart && <button type="button" className="vx-op-btn" onClick={() => executar(() => host.restart(), 'Reiniciando…')}>Reiniciar o player</button>}
              {can.window && (janela.fullscreen
                ? <button type="button" className="vx-op-btn" onClick={() => executar(() => host.setFullscreen(false))}>Sair da tela cheia</button>
                : <button type="button" className="vx-op-btn" onClick={() => executar(() => host.setFullscreen(true))}>Voltar à tela cheia</button>)}
              {can.window && janela.monitores > 1 && <button type="button" className="vx-op-btn" onClick={() => executar(() => host.nextMonitor(), 'Trocando de monitor…')}>Trocar de monitor</button>}
              {can.minimize && <button type="button" className="vx-op-btn" onClick={() => executar(() => host.minimize())}>Minimizar</button>}
              {can.otherLauncher && <button type="button" className="vx-op-btn" onClick={() => executar(() => host.otherLauncher())}>Abrir outra tela inicial</button>}
              {can.quit && (
                <button type="button" className={`vx-op-btn vx-op-danger ${confirmarSaida ? 'is-armed' : ''}`}
                  onClick={() => (confirmarSaida ? executar(() => host.quit(), 'Fechando…') : setConfirmarSaida(true))}
                  onBlur={() => setConfirmarSaida(false)}>
                  {confirmarSaida ? 'Confirmar: fechar o player' : 'Fechar o player'}
                </button>
              )}
            </div>
            {can.quit && <p className="vx-op-help">{shell === 'android'
              ? 'Fechado, o player volta sozinho quando a TV religar. Se ele for a tela inicial, aperte Home para abrir de novo.'
              : 'Fechado, o player volta sozinho quando o Windows religar, ou pelo atalho "Vértice Player".'}</p>}
          </section>

          <section>
            <h3>Atualização</h3>
            <div className="vx-op-row">
              <p className="vx-op-status">{updateLabel(upd) || 'Atualização automática ligada'}</p>
              {updater && <button type="button" className="vx-op-btn" onClick={() => executar(() => updater.check({ interactive: true }), 'Procurando atualização…')}>Atualizar agora</button>}
            </div>
            <p className="vx-op-help">O player se atualiza sozinho. {shell === 'android'
              ? 'Melhorias entram sem reinstalar; quando o app inteiro muda, o Android pode pedir para confirmar "Instalar".'
              : shell === 'electron' ? 'A tela fica uns 15 segundos sem conteúdo enquanto instala.' : 'A página recarrega quando sai versão nova.'}</p>
          </section>

          {SYSTEM_SETTINGS.length > 0 && (
            <section>
              <h3>{shell === 'android' ? 'Configurações do Android' : 'Configurações do Windows'}</h3>
              <div className="vx-op-grid">
                {SYSTEM_SETTINGS.map(([k, label]) => (
                  <button key={k} type="button" className="vx-op-btn vx-op-soft" onClick={() => executar(() => host.openSettings(k), `Abrindo ${label.toLowerCase()}…`)}>{label}</button>
                ))}
              </div>
              <p className="vx-op-help">{shell === 'android'
                ? 'Para voltar ao player, aperte Voltar no controle ou abra o Vértice Player.'
                : 'A janela das configurações abre por cima. Depois, use "Voltar à tela cheia".'}</p>
            </section>
          )}

          <section>
            <h3>Diagnóstico</h3>
            <dl className="vx-op-diag">
              <div><dt>Internet</dt><dd className={online ? '' : 'is-bad'}>{online ? ms(diag?.latency?.internet) : 'Sem conexão'}</dd></div>
              <div><dt>Firebase</dt><dd className={diag && diag.latency.firebase === null ? 'is-bad' : ''}>{diag ? ms(diag.latency.firebase) : '…'}</dd></div>
              <div><dt>Servidor de mídias</dt><dd className={diag && diag.latency.mediaServer === null && state.manifest?.assets?.length ? 'is-bad' : ''}>{diag ? (diag.latency.mediaServer === null && !state.manifest?.assets?.length ? 'sem mídias' : ms(diag.latency.mediaServer)) : '…'}</dd></div>
              <div><dt>Espaço livre</dt><dd className={st.freeBytes !== null && st.freeBytes < 500 * 1024 * 1024 ? 'is-bad' : ''}>{diag ? `${formatBytes(st.freeBytes)} de ${formatBytes(st.totalBytes)}` : '…'}</dd></div>
              <div><dt>Mídias baixadas</dt><dd>{state.sync ? `${state.sync.done}/${state.sync.total}` : '—'}{st.mediaBytes ? ` · ${formatBytes(st.mediaBytes)}` : ''}</dd></div>
              <div><dt>Resolução</dt><dd>{diag?.resolution || '—'}</dd></div>
              <div><dt>Aparelho</dt><dd>{diag ? [diag.model, diag.nativeVersion && diag.nativeVersion !== APP_VERSION ? `app ${diag.nativeVersion}` : null].filter(Boolean).join(' · ') || shell : '…'}</dd></div>
              <div><dt>Ligado há</dt><dd>{diag ? tempo(diag.uptimeMin) : '…'}</dd></div>
            </dl>
            {diag?.errors?.length > 0 && (
              <div className="vx-op-errors">
                <b>Últimos avisos</b>
                <ul>{diag.errors.slice(0, 4).map((e, i) => <li key={i}>{new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {e.msg}</li>)}</ul>
              </div>
            )}
            <div className="vx-op-grid">
              <button type="button" className="vx-op-btn vx-op-soft" disabled={testando} onClick={testar}>{testando ? 'Testando…' : 'Testar de novo'}</button>
              <button type="button" className="vx-op-btn vx-op-soft" onClick={enviar}>Enviar ao painel</button>
            </div>
          </section>
        </div>
        <footer className="vx-op-foot">
          <span>{aviso || (shell === 'web' ? 'Esc fecha o menu.' : 'Setas do controle escolhem · OK confirma · Voltar fecha')}</span>
        </footer>
      </div>
    </div>
  );
}

function tempo(min) {
  if (!Number.isFinite(min)) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} dias`;
}

/** Centro do botão em coordenadas do painel (ignora a rotação da TV: as setas seguem o que se vê). */
function centro(el, painel) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  let n = el;
  // A rolagem é a mesma para todos os botões do painel: não entra na conta.
  while (n && n !== painel) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x, y };
}

/** Próximo botão na direção da seta (navegação espacial simples). */
export function vizinho(painel, atual, tecla) {
  if (!painel) return null;
  const botoes = [...painel.querySelectorAll('button:not([disabled])')];
  if (!botoes.includes(atual)) return botoes[0] || null;
  const a = centro(atual, painel);
  let melhor = null;
  let melhorNota = Infinity;
  for (const b of botoes) {
    if (b === atual) continue;
    const c = centro(b, painel);
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const ok = { ArrowRight: dx > 4, ArrowLeft: dx < -4, ArrowDown: dy > 4, ArrowUp: dy < -4 }[tecla];
    if (!ok) continue;
    const principal = tecla === 'ArrowLeft' || tecla === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy);
    const lateral = tecla === 'ArrowLeft' || tecla === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
    const nota = principal + lateral * 3;
    if (nota < melhorNota) {
      melhorNota = nota;
      melhor = b;
    }
  }
  // Sem vizinho na direção: esquerda/direita seguem a ordem da lista (fim de linha pula para a próxima).
  if (!melhor && (tecla === 'ArrowRight' || tecla === 'ArrowLeft')) {
    const i = botoes.indexOf(atual) + (tecla === 'ArrowRight' ? 1 : -1);
    melhor = botoes[i] || null;
  }
  return melhor;
}
