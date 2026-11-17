import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BAR_THEMES, ALERT_THEMES, nextOpening } from '../signage.js';
import { TICKER_SPEEDS } from '../apps.js';

/**
 * Peças de tela que ficam por cima ou em volta da programação: zonas, barra inferior,
 * tela de "fechado" e alerta urgente. Usadas no player e no "Ver como na tela" do painel.
 * Medidas desenhadas em 1920 px de largura (1080 em pé) e escaladas por --s.
 */

function useBox() {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 1920, h: 1080 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth || 1920, h: el.clientHeight || 1080 });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

function useTick(ms, fixed) {
  const [t, setT] = useState(() => fixed || Date.now());
  useEffect(() => {
    if (fixed) return undefined;
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, fixed]);
  return fixed || t;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Divide a tela conforme o layout. `main` é a programação; `zone(nome)` desenha cada zona.
 * Em pé, as zonas ficam empilhadas embaixo da principal.
 */
export function LayoutGrid({ layout, main, zone, logoSrc, now }) {
  const [ref, box] = useBox();
  const portrait = box.h > box.w;
  const s = box.w / (portrait ? 1080 : 1920);
  const t = layout?.template || 'full';
  const side = `${layout?.sideWidth || 30}%`;
  let style;
  if (portrait) {
    const rows = { full: ['main'], side: ['main', 'side'], split: ['main', 'second'], lshape: ['main', 'foot', 'side'] }[t] || ['main'];
    const sizes = rows.map((r) => (r === 'main' ? '1fr' : r === 'foot' ? '14%' : r === 'second' ? '1fr' : '28%'));
    style = { gridTemplateColumns: '1fr', gridTemplateRows: sizes.join(' '), gridTemplateAreas: rows.map((r) => `"${r}"`).join(' ') };
  } else if (t === 'side') style = { gridTemplateColumns: `1fr ${side}`, gridTemplateRows: '1fr', gridTemplateAreas: '"main side"' };
  else if (t === 'split') style = { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr', gridTemplateAreas: '"main second"' };
  else if (t === 'lshape') style = { gridTemplateColumns: `1fr ${side}`, gridTemplateRows: '1fr 18%', gridTemplateAreas: '"main side" "foot side"' };
  else style = { gridTemplateColumns: '1fr', gridTemplateRows: '1fr', gridTemplateAreas: '"main"' };
  const bar = layout?.bar;
  return (
    <div ref={ref} className={`vxs-frame ${portrait ? 'is-portrait' : ''}`} style={{ '--s': `${s}px` }}>
      <div className="vxs-grid" style={style}>
        <div className="vxs-zone" style={{ gridArea: 'main' }}>{main}</div>
        {Object.keys(layout?.zones || {}).map((z) => (
          <div key={z} className={`vxs-zone vxs-zone-${z}`} style={{ gridArea: z }}>{zone(z)}</div>
        ))}
      </div>
      {bar && <BottomBar bar={bar} logoSrc={logoSrc} now={now} />}
    </div>
  );
}

/** Barra fixa embaixo: logo, avisos correndo e relógio. */
export function BottomBar({ bar, logoSrc, now }) {
  const t = useTick(1000, now);
  const th = BAR_THEMES[bar.theme] || BAR_THEMES.brand;
  const text = (bar.lines || []).join('     •     ');
  const speed = TICKER_SPEEDS[bar.speed] || TICKER_SPEEDS.normal;
  const dur = Math.max(10, (text.length * 26 + 1500) / speed);
  const d = new Date(t);
  return (
    <div className="vxs-bar" style={{ '--bar-bg': th.bg, '--bar-fg': th.fg, '--bar-accent': th.accent }}>
      {(logoSrc || bar.title) && (
        <div className="vxs-bar-brand">
          {logoSrc && <img src={logoSrc} alt="" />}
          {bar.title && <span>{bar.title}</span>}
        </div>
      )}
      <div className="vxs-bar-ticker">
        {text && (
          <div className="vxs-bar-track" style={{ animationDuration: `${dur}s` }}>
            <span>{text}</span><span aria-hidden>{text}</span>
          </div>
        )}
      </div>
      {bar.clock && (
        <div className="vxs-bar-clock">
          <b>{pad(d.getHours())}:{pad(d.getMinutes())}</b>
          {bar.date && <span>{d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')}</span>}
        </div>
      )}
    </div>
  );
}

/** Fora do expediente: tela preta, relógio discreto ou aviso de fechado. */
export function ClosedScreen({ hours, now }) {
  const t = useTick(15_000, now);
  const [ref, box] = useBox();
  const s = box.w / (box.h > box.w ? 1080 : 1920);
  if (!hours || hours.closedMode === 'black') return <div ref={ref} className="vxs-closed is-black" />;
  const d = new Date(t);
  const next = nextOpening(hours, d);
  return (
    <div ref={ref} className="vxs-closed" style={{ '--s': `${s}px` }}>
      {hours.closedMode === 'clock' ? (
        <div className="vxs-closed-clock">{pad(d.getHours())}:{pad(d.getMinutes())}</div>
      ) : (
        <>
          <div className="vxs-closed-title">{hours.closedText || 'Estamos fechados'}</div>
          {next && <div className="vxs-closed-next">{next}</div>}
        </>
      )}
    </div>
  );
}

/** Alerta urgente: ocupa a tela inteira, por cima de tudo. */
export function AlertScreen({ alert, now }) {
  const [ref, box] = useBox();
  const s = box.w / (box.h > box.w ? 1080 : 1920);
  const th = ALERT_THEMES[alert.theme] || ALERT_THEMES.red;
  const t = useTick(1000, now);
  const since = alert.startedAt ? new Date(alert.startedAt) : null;
  const left = alert.until ? Math.max(0, Math.round((alert.until - t) / 60000)) : null;
  return (
    <div ref={ref} className={`vxs-alert vxs-alert-${alert.theme}`} role="alert" style={{ '--s': `${s}px`, '--al-bg': th.bg, '--al-fg': th.fg }}>
      <div className="vxs-alert-in">
        <svg className="vxs-alert-ico" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3 2 20h20L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className="vxs-alert-title">{alert.title || 'Atenção'}</div>
        {alert.text && <div className="vxs-alert-text">{alert.text}</div>}
        <div className="vxs-alert-meta">
          {since && <>Aviso das {pad(since.getHours())}:{pad(since.getMinutes())}</>}
          {left != null && left > 0 && <> · termina em {left} min</>}
        </div>
      </div>
    </div>
  );
}
