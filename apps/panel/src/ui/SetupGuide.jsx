import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { setupSteps, shouldAutoOpenSetup, pickHint, onStepPage } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { Button, Card, IconButton } from './kit.jsx';
import { Icon } from './Icon.jsx';

/*
 * Guia da primeira tela. Fica no layout do painel, então acompanha a pessoa por todas as páginas:
 * uma caixa no canto diz o passo atual e o que fazer na página aberta, um contorno dourado mostra
 * onde clicar (também dentro das janelas, como a do código de pareamento), e o guia avança sozinho
 * quando o passo fica pronto, porque lê as telas, mídias, playlists e grades em tempo real.
 */

const keyOf = (cid) => `vx-guia:${cid}`;
const readState = (cid) => { try { return JSON.parse(localStorage.getItem(keyOf(cid))) || {}; } catch { return {}; } };
const writeState = (cid, s) => { try { localStorage.setItem(keyOf(cid), JSON.stringify(s)); } catch { /* sem storage */ } };
const onceThisSession = (key) => {
  try { if (sessionStorage.getItem(key) === '1') return false; sessionStorage.setItem(key, '1'); } catch { /* sem storage */ }
  return true;
};
const visible = (el) => !!el && el.getClientRects().length > 0;
/** Link do menu para a página do passo: o do menu lateral ou o da barra de baixo (o menu lateral do celular fica fora da tela). */
const navTarget = (path) => [`.vx-nav a[href="#${path}"]`, `.vx-dock a[href="#${path}"]`].find((sel) => {
  const el = document.querySelector(sel);
  if (!visible(el)) return false;
  const r = el.getBoundingClientRect();
  // Na horizontal basta: um item mais abaixo no menu é rolado até aparecer.
  return r.right > 0 && r.left < window.innerWidth;
}) || null;

const GuideCtx = createContext(null);
export const useGuide = () => useContext(GuideCtx);

export function SetupGuideProvider({ children }) {
  const { base, companyId, company, can } = useSession();
  const enabled = !!company && !!companyId && can('admin');
  const screens = useCol(enabled ? `${base}/screens` : null);
  const media = useCol(enabled ? `${base}/media` : null);
  const playlists = useCol(enabled ? `${base}/playlists` : null);
  const schedules = useCol(enabled ? `${base}/schedules` : null);
  const [state, setState] = useState({});

  // Cada sessão do navegador conta como uma entrada no painel.
  useEffect(() => {
    if (!companyId) return;
    const s = readState(companyId);
    const next = onceThisSession(`vx-guia-sessao:${companyId}`) ? { ...s, visits: (s.visits || 0) + 1 } : s;
    writeState(companyId, next);
    setState(next);
  }, [companyId]);

  const update = useCallback((patch) => {
    setState((s) => {
      const next = { ...s, ...patch };
      writeState(companyId, next);
      return next;
    });
  }, [companyId]);

  const loaded = enabled && screens && media && playlists && schedules;
  const progress = useMemo(
    () => (loaded ? setupSteps({ screens, media, playlists, schedules, playerConfirmed: !!state.playerConfirmed }) : null),
    [loaded, screens, media, playlists, schedules, state.playerConfirmed],
  );

  // Nas primeiras entradas, o guia começa sozinho (uma vez por entrada).
  const autoChecked = useRef(false);
  useEffect(() => {
    if (autoChecked.current || !progress || !state.visits) return;
    autoChecked.current = true;
    if (shouldAutoOpenSetup(state, progress) && onceThisSession(`vx-guia-aberto:${companyId}`)) update({ active: true, min: false });
  }, [progress, state, companyId, update]);

  const value = useMemo(() => ({
    enabled, progress, state,
    start: () => update({ active: true, min: false, hidden: false }),
    stop: () => update({ active: false }),
    hide: () => update({ active: false, hidden: true }),
    minimize: (min) => update({ min }),
    confirmPlayer: () => update({ playerConfirmed: true }),
  }), [enabled, progress, state, update]);

  return (
    <GuideCtx.Provider value={value}>
      {children}
      {enabled && state.active && progress && <GuideDock />}
    </GuideCtx.Provider>
  );
}

/** Acha a dica do passo pelo que está na página agora e acompanha as mudanças (janelas abrindo, botões habilitando). */
function useLiveHint(step, onPage) {
  const [hint, setHint] = useState(null);
  useEffect(() => {
    if (!step) { setHint(null); return undefined; }
    let raf = 0;
    const scan = () => {
      raf = 0;
      const has = (sel) => visible(document.querySelector(sel));
      // Fora da página do passo: aponta o item do menu, se estiver à vista.
      const nav = onPage ? null : navTarget(step.path);
      const h = onPage ? pickHint(step, has) : nav ? { target: nav, nav: true } : null;
      setHint((prev) => (prev?.target === h?.target ? prev : h));
    };
    scan();
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'data-guide', 'class', 'hidden', 'style'] });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [step, onPage]);
  return hint;
}

/** Posição do alvo na tela, atualizada ao rolar, redimensionar ou a página mudar. */
function useTargetRect(selector) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!selector) { setRect(null); return undefined; }
    let raf = 0;
    let last = '';
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector(selector);
      if (visible(el)) {
        const r = el.getBoundingClientRect();
        if (!scrolled) {
          scrolled = true;
          if (r.top < 70 || r.bottom > window.innerHeight - 20) {
            const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
          }
        }
        const k = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (k !== last) { last = k; setRect({ left: r.left, top: r.top, width: r.width, height: r.height }); }
      } else if (last) { last = ''; setRect(null); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  return rect;
}

function Spotlight({ rect }) {
  if (!rect) return null;
  const pad = 6;
  return createPortal(
    <div className="vx-guide-ring" aria-hidden="true"
      style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />,
    document.body,
  );
}

function GuideDock() {
  const { progress, state, stop, minimize, confirmPlayer } = useGuide();
  const loc = useLocation();
  const nav = useNavigate();
  const step = progress.next;
  const onPage = onStepPage(step, loc.pathname);
  const hint = useLiveHint(step, onPage);
  const rect = useTargetRect(state.min ? null : hint?.target);
  const [all, setAll] = useState(false);

  // Comemora o passo que acabou de ficar pronto.
  const [cheer, setCheer] = useState(null);
  const doneIds = useRef(null);
  useEffect(() => {
    const ids = progress.steps.filter((s) => s.done).map((s) => s.id);
    const before = doneIds.current;
    doneIds.current = ids;
    if (!before) return undefined;
    const fresh = progress.steps.find((s) => s.done && !before.includes(s.id));
    if (fresh) setCheer(fresh);
    return undefined;
  }, [progress]);
  useEffect(() => {
    if (!cheer) return undefined;
    const t = setTimeout(() => setCheer(null), 7000);
    return () => clearTimeout(t);
  }, [cheer]);

  // A caixa nunca cobre onde a pessoa precisa clicar. Com uma janela aberta, ela vai para a margem ao
  // lado da janela (mais estreita, se preciso); senão, fica do lado oposto ao alvo.
  const box = useRef(null);
  const [place, setPlace] = useState({ side: 'right', edge: 'bottom', width: null });
  useLayoutEffect(() => {
    if (!rect) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = box.current?.offsetHeight || 260;
    if (vw <= 720) {
      setPlace({ side: 'full', edge: rect.top + rect.height > vh - h - 100 ? 'top' : 'bottom', width: null });
      return;
    }
    const el = hint?.target && document.querySelector(hint.target);
    const modal = el?.closest('.vx-modal')?.getBoundingClientRect();
    if (modal) {
      const right = vw - modal.right - 32;
      const left = modal.left - 32;
      const room = Math.max(right, left);
      if (room >= 260) {
        setPlace({ side: right >= left ? 'right' : 'left', edge: 'bottom', width: Math.min(360, room) });
        return;
      }
    }
    // Do lado oposto ao alvo; sobe para o alto só se, embaixo, ainda encostaria nele.
    const side = rect.left + rect.width / 2 > vw / 2 ? 'left' : 'right';
    const w = Math.min(360, vw - 32);
    const x0 = side === 'right' ? vw - 24 - w : 24;
    const below = { left: x0, right: x0 + w, top: vh - 24 - h, bottom: vh - 24 };
    const hits = rect.left < below.right && rect.left + rect.width > below.left && rect.top < below.bottom && rect.top + rect.height > below.top;
    setPlace({ side, edge: hits ? 'top' : 'bottom', width: null });
  }, [rect, hint]);

  const stepNo = step ? progress.steps.indexOf(step) + 1 : progress.total;
  const pct = Math.round((progress.done / progress.total) * 100);
  const cls = `vx-guide is-${place.side} at-${place.edge}`;

  if (state.min) {
    return createPortal(
      <button type="button" className={`vx-guide-pill ${cls}`} onClick={() => minimize(false)}>
        <Icon name="tv" />
        <span>Guia · {progress.done}/{progress.total}</span>
        {step && <b>{step.title}</b>}
        <Icon name="arrowUp" />
      </button>,
      document.body,
    );
  }

  let body;
  if (progress.complete) {
    body = (
      <>
        <div className="vx-guide-done"><Icon name="check" /></div>
        <h3 className="vx-guide-title">Sua tela está no ar</h3>
        <p className="vx-guide-text">A TV já recebe a programação. Para mudar o que passa, edite a playlist ou a grade: as telas se atualizam sozinhas.</p>
        <div className="vx-guide-actions">
          <Button variant="primary" icon="screen" onClick={() => { stop(); nav('/telas'); }}>Ver minhas telas</Button>
          <Button onClick={stop}>Fechar o guia</Button>
        </div>
      </>
    );
  } else {
    const text = onPage
      ? (hint?.text || step.text)
      : hint?.nav ? `Abra ${step.page} no menu (destacado) ou use o botão abaixo.` : `Este passo é feito na página ${step.page}.`;
    body = (
      <>
        {cheer && <p className="vx-guide-cheer" role="status"><Icon name="check" />{cheer.title}: feito.</p>}
        {!cheer && progress.done === 0 && !onPage && <p className="vx-guide-intro">Cinco passos, cerca de 10 minutos. Eu mostro onde clicar em cada tela.</p>}
        <h3 className="vx-guide-title">{step.title}</h3>
        <p className="vx-guide-text" aria-live="polite">{text}</p>
        {onPage && hint && <p className="vx-guide-where"><Icon name="arrowRight" />Siga o contorno dourado.</p>}
        <div className="vx-guide-actions">
          {!onPage && <Button variant="primary" icon={step.icon} onClick={() => nav(step.path)}>Ir para {step.page}</Button>}
          {onPage && step.confirm && (
            <Button variant="primary" icon="check" onClick={() => { confirmPlayer(); nav('/telas?parear=1'); }}>{step.confirm}</Button>
          )}
        </div>
      </>
    );
  }

  return createPortal(
    <section ref={box} className={cls} style={place.width ? { width: place.width } : undefined} aria-label="Guia da primeira tela">
      <header className="vx-guide-head">
        <span className="vx-guide-step">{progress.complete ? 'Configuração concluída' : `Passo ${stepNo} de ${progress.total}`}</span>
        <IconButton icon="chevronDown" label="Recolher o guia" variant="ghost" onClick={() => minimize(true)} />
        <IconButton icon="x" label="Fechar o guia" variant="ghost" onClick={stop} />
      </header>
      <div className="vx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><i style={{ width: `${pct}%` }} /></div>
      <div className="vx-guide-body">{body}</div>
      {!progress.complete && (
        <div className="vx-guide-foot">
          <button type="button" className="vx-guide-all" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Esconder os passos' : 'Ver todos os passos'}<Icon name={all ? 'chevronDown' : 'chevronRight'} />
          </button>
          {all && (
            <ol className="vx-guide-list">
              {progress.steps.map((s) => (
                <li key={s.id} className={s.done ? 'is-done' : s === step ? 'is-now' : ''}>
                  <span aria-hidden="true">{s.done ? <Icon name="check" /> : null}</span>
                  {s.title}{s.done && <span className="vx-sr"> (feito)</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <Spotlight rect={rect} />
    </section>,
    document.body,
  );
}

/** Cartão no início enquanto a configuração não termina. */
export function SetupCard() {
  const guide = useGuide();
  if (!guide?.enabled || !guide.progress || guide.progress.complete || guide.state.hidden) return null;
  const { progress, state, start, hide } = guide;
  const running = state.active;
  return (
    <Card className="vx-setup-card">
      <div className="vx-setup-card-row">
        <span className="vx-tile"><Icon name="tv" /></span>
        <div className="vx-setup-card-text">
          <h2 className="vx-card-title">Configure sua primeira tela</h2>
          <p className="vx-faint">
            {progress.done} de {progress.total} passos feitos. {running ? 'O guia está aberto no canto da tela.' : 'O guia acompanha você pelo painel e mostra onde clicar.'}
          </p>
          <div className="vx-bar"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
        </div>
        <div className="vx-setup-card-actions">
          <Button variant="primary" icon="play" onClick={start}>{running ? 'Mostrar o guia' : progress.done ? 'Continuar o guia' : 'Começar o guia'}</Button>
          <Button variant="ghost" size="sm" onClick={hide}>Não mostrar de novo</Button>
        </div>
      </div>
    </Card>
  );
}

/** Botão para reabrir o guia depois de escondido ou concluído. */
export function SetupGuideButton() {
  const guide = useGuide();
  if (!guide?.enabled || !guide.progress) return null;
  if (!guide.state.hidden && !guide.progress.complete) return null;
  return <Button variant="ghost" icon="question" onClick={guide.start}>Guia da primeira tela</Button>;
}
