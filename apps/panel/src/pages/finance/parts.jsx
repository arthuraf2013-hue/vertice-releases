import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PAYMENT_METHODS, methodKey } from '@vertice/shared';
import { Icon } from '../../ui/Icon.jsx';
import { formatDoc } from './useFinance.js';

/** Indicador: ícone, nome, número e uma linha de contexto. */
export function Kpi({ icon, label, value, note, chip, tone }) {
  return (
    <div className="vx-kpi">
      <div className="vx-kpi-head"><span className={`vx-kpi-icon ${tone ? `is-${tone}` : ''}`}><Icon name={icon} /></span>{label}</div>
      <div className={`vx-kpi-value ${tone === 'bad' ? 'is-bad' : ''}`}>{value}</div>
      {chip}
      {note && <div className="vx-kpi-note">{note}</div>}
    </div>
  );
}

/** Variação em relação a outro período, com seta (nunca só a cor). */
export function Delta({ value, label }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={`vx-delta ${up ? 'is-up' : 'is-down'}`}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} />{up ? '+' : '−'}{Math.abs(Math.round(value * 100))}% {label}
    </span>
  );
}

/** Faixa de resumo no topo de cada aba. */
export function Summary({ items }) {
  return (
    <div className="vx-fin-summary" style={{ '--cols': items.length }}>
      {items.map((it) => (
        <div key={it.label} className="vx-fin-summary-item">
          <span>{it.label}</span>
          <b className={it.bad ? 'is-bad' : ''}>{it.value}</b>
          {it.note && <small>{it.note}</small>}
        </div>
      ))}
    </div>
  );
}

/** Filtros em pílula com a contagem de cada um. */
export function Pills({ options, value, onChange, label }) {
  return (
    <div className="vx-fin-pills" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`vx-fin-pill ${value === o.value ? 'is-on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}<b>{o.count}</b>
        </button>
      ))}
    </div>
  );
}

/** Busca e filtros numa linha. */
export function Filters({ children }) {
  return <div className="vx-fin-filters">{children}</div>;
}
export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="vx-fin-search">
      <Icon name="search" />
      <input className="vx-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}
export function SelectBox({ value, onChange, options, label }) {
  return (
    <select className="vx-input vx-fin-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Cliente: nome e CPF/CNPJ (ou cidade). */
export function ClientCell({ c, name, sub }) {
  return (
    <span className="vx-client-name">
      <b>{name || c?.name}</b>
      <small>{sub ?? (c ? (formatDoc(c.doc) || c.city || c.ownerEmail || '') : '')}</small>
    </span>
  );
}

/** Meio de pagamento com a cor da série e o nome escrito. */
export function MethodTag({ method }) {
  const m = PAYMENT_METHODS.find((x) => x.key === methodKey(method)) || PAYMENT_METHODS[3];
  return <span className="vx-method"><i style={{ background: m.color }} aria-hidden="true" />{m.label}</span>;
}

/** Duas linhas numa célula. */
export function Two({ top, sub, strong }) {
  return <span className="vx-two">{strong ? <b>{top}</b> : <span>{top}</span>}{sub && <small>{sub}</small>}</span>;
}

/** Menu de ações da linha (fica por cima da tabela; fecha com Esc, clique fora ou rolagem). */
export function RowMenu({ items, label = 'Ações' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const menu = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current?.offsetHeight || 200;
    const top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
    setPos({ top, left: Math.max(8, r.right - 240) });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const scroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', scroll, true);
    menu.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', scroll, true); };
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <>
      <button ref={btn} type="button" className="vx-row-menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <Icon name="more" />
      </button>
      {open && createPortal(
        <div ref={menu} className="vx-row-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          {shown.map((it) => (it.href ? (
            <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noreferrer" className={it.danger ? 'is-danger' : ''} onClick={() => setOpen(false)}>
              <Icon name={it.icon} />{it.label}
            </a>
          ) : (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? 'is-danger' : ''} disabled={it.disabled} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}>
              <Icon name={it.icon} />{it.label}
            </button>
          )))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Seção com título. */
export function Section({ title, children, action }) {
  return (
    <section className="vx-fin-section">
      <header><h2>{title}</h2>{action}</header>
      {children}
    </section>
  );
}
