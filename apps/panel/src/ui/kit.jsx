import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, createContext, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { screenStatus, STATUS_LABEL, formatTime, timeAgo, APP_KINDS } from '@vertice/shared';
import { Icon } from './Icon.jsx';

/* ---------- Marca ---------- */
import simbolo from '@vertice/shared/brand/vertice-simbolo.svg';
import simboloEscuro from '@vertice/shared/brand/vertice-simbolo-escuro.svg';
import { useSession } from '../session.jsx';
export function Logo({ size = 36, endorse = true, dark }) {
  const theme = useSession()?.theme;
  const isDark = dark ?? theme === 'dark';
  return (
    <span className="vx-logo">
      <img src={isDark ? simboloEscuro : simbolo} width={size} height={size} alt="" />
      <span>
        <Wordmark />
        {endorse && <span className="vx-logo-endorse">POR VETTA SISTEMAS</span>}
      </span>
    </span>
  );
}
/** "Vértice" com o pingo do i em dourado (o vértice). */
export function Wordmark({ className = '' }) {
  return (
    <span className={`vx-wordmark ${className}`} aria-label="Vértice">
      Vért<span className="vx-wordmark-i">ı</span>ce
    </span>
  );
}

/* ---------- Botões ---------- */
export function Button({ variant = 'secondary', size, icon, iconRight, children, className = '', loading, ...rest }) {
  const cls = ['vx-btn', variant !== 'secondary' && `vx-btn-${variant}`, size === 'sm' && 'vx-btn-sm', className]
    .filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="vx-spinner" aria-hidden /> : icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}
export function IconButton({ icon, label, variant = 'secondary', className = '', ...rest }) {
  return (
    <button type="button" className={`vx-btn vx-btn-icon ${variant === 'danger' ? 'vx-btn-danger' : ''} ${variant === 'ghost' ? 'vx-btn-ghost-icon' : ''} ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
export function TextLink({ to, children, icon = 'arrowRight', ...rest }) {
  return (
    <Link className="vx-link" to={to} {...rest}>
      {children}
      {icon && <Icon name={icon} />}
    </Link>
  );
}

/* ---------- Status ---------- */
const STATUS_ICON = { online: 'check', warn: 'alert', offline: 'xCircle', sync: 'sync', idle: 'clock' };
export function StatusBadge({ status, children }) {
  return (
    <span className={`vx-badge vx-badge-${status}`}>
      <Icon name={STATUS_ICON[status]} />
      {children || STATUS_LABEL[status]}
    </span>
  );
}
export function ScreenStatus({ screen, now, withReason }) {
  const st = screenStatus(screen, now);
  return (
    <span className="vx-status-cell">
      <StatusBadge status={st.key} />
      {withReason && <span className="vx-faint">{st.reason}</span>}
    </span>
  );
}
export function ProBadge() {
  return <span className="vx-badge vx-badge-pro">PRO</span>;
}
export function Chip({ children, tone }) {
  return <span className={`vx-chip ${tone ? `vx-chip-${tone}` : ''}`}>{children}</span>;
}

/* ---------- Estrutura ---------- */
export function PageHeader({ overline, title, subtitle, actions }) {
  return (
    <header className="vx-page-head">
      <div>
        {overline && <div className="vx-overline">{overline}</div>}
        <h1 className="vx-page-title">{title}</h1>
        {subtitle && <p className="vx-page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="vx-row">{actions}</div>}
    </header>
  );
}
export function Card({ title, icon, iconTone, actions, children, className = '', pad = true, ...rest }) {
  return (
    <section className={`vx-card ${pad ? '' : 'vx-card-flush'} ${className}`} {...rest}>
      {(title || actions) && (
        <div className="vx-card-head">
          {title && (
            <h2 className="vx-card-title">
              {icon && <span className={`vx-tile ${iconTone === 'neutral' ? 'is-neutral' : ''}`}><Icon name={icon} /></span>}
              {title}
            </h2>
          )}
          {actions && <div className="vx-row vx-card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
export function MetricCard({ icon, label, value, total, bar, dot = 'online', note, link, linkLabel }) {
  return (
    <section className="vx-card vx-metric">
      <div className="vx-metric-head"><span className="vx-tile"><Icon name={icon} /></span>{label}</div>
      <div className="vx-metric-num">
        {value}
        {total !== undefined && <span className="vx-metric-total"> / {total}</span>}
      </div>
      {bar !== undefined && <div className="vx-bar"><i style={{ width: `${Math.min(100, bar)}%`, background: bar > 90 && dot === 'warn' ? 'var(--status-warn)' : undefined }} /></div>}
      {note && <div className="vx-metric-note"><span className={`vx-dot ${dot}`} />{note}</div>}
      {link && <div className="vx-metric-link"><TextLink to={link}>{linkLabel}</TextLink></div>}
    </section>
  );
}

/** Anel de saúde da rede: verde/laranja/vermelho com o vértice dourado no topo. */
export function NetworkHealth({ summary, now }) {
  const C = 2 * Math.PI * 64;
  const total = summary.total || 1;
  const segs = [
    ['var(--status-online)', summary.online + summary.sync],
    ['var(--status-warn)', summary.warn],
    ['var(--status-offline)', summary.offline],
    ['var(--line-strong)', summary.idle],
  ].filter(([, n]) => n > 0);
  const gap = segs.length > 1 ? 3 : 0;
  let off = 0;
  return (
    <Card title="Saúde da rede" icon="pulse" iconTone="neutral" className="vx-health">
      <div className="vx-health-body">
        <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={`${summary.healthyPct}% das telas com conexão saudável`}>
          <circle cx="80" cy="80" r="64" fill="none" stroke="var(--bg-sunken)" strokeWidth="14" />
          {summary.total > 0 && segs.map(([color, n]) => {
            const len = (n / total) * C;
            const el = (
              <circle key={color} cx="80" cy="80" r="64" fill="none" stroke={color} strokeWidth="14"
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 80 80)" />
            );
            off += len;
            return el;
          })}
          <circle cx="80" cy="16" r="4" fill="var(--vetta-gold)" />
          <text x="80" y="84" textAnchor="middle" className="vx-health-pct">{summary.total ? `${summary.healthyPct}%` : '—'}</text>
          <text x="80" y="104" textAnchor="middle" className="vx-health-cap">conexão saudável</text>
        </svg>
        <div className="vx-health-legend">
          {[['online', 'Online', summary.online + summary.sync], ['warn', 'Atenção', summary.warn], ['offline', 'Offline', summary.offline], ...(summary.idle ? [['idle', 'Aguardando', summary.idle]] : [])].map(([k, l, n]) => (
            <div key={k}><span className={`vx-dot ${k}`} />{l}<b className="vx-num">{n}</b></div>
          ))}
        </div>
      </div>
      <div className="vx-card-foot">Atenção após 15 min sem contato; offline após 60 min. Leitura: {formatTime(now)}.</div>
    </Card>
  );
}

/** Miniatura da mídia (imagem, pôster de vídeo ou vazio). */
export function MediaThumb({ media, className = '' }) {
  if (!media) {
    return (
      <div className={`vx-thumb vx-thumb-empty ${className}`}>
        <Icon name="screen" />
      </div>
    );
  }
  if (media.type === 'app') {
    const def = APP_KINDS[media.app?.kind];
    return (
      <div className={`vx-thumb vx-thumb-app ${className}`}>
        <Icon name={def?.icon || 'apps'} />
        <span className="vx-thumb-tag"><Icon name="apps" />{def?.label || 'App'}</span>
      </div>
    );
  }
  const src = media.thumbUrl || (media.type === 'image' ? media.url : null);
  return (
    <div className={`vx-thumb ${className}`}>
      {src ? <img src={src} alt="" loading="lazy" /> : media.type === 'video' ? <video src={media.url} muted preload="metadata" /> : null}
      {media.type === 'video' && <span className="vx-thumb-tag"><Icon name="play" />Vídeo</span>}
    </div>
  );
}

export function DeviceCard({ screen, media, unitName, now, onClick }) {
  const st = screenStatus(screen, now);
  return (
    <button type="button" className="vx-card vx-device" onClick={onClick}>
      {media ? (
        <MediaThumb media={media} />
      ) : (
        <div className="vx-thumb vx-thumb-empty">
          <div>
            <Icon name={screen.orderBoard?.mode === 'full' ? 'receipt' : 'screen'} />
            <b>{screen.orderBoard?.mode === 'full' ? 'Painel de pedidos' : 'Sem mídia no ar'}</b>
          </div>
        </div>
      )}
      <div className="vx-device-body">
        <div className="vx-device-top"><span className="vx-mono">{screen.code}</span><StatusBadge status={st.key} /></div>
        <div className="vx-device-name">{screen.name}</div>
        <div className="vx-device-place">{unitName || 'Sem unidade'}</div>
        <div className="vx-device-meta">
          <Icon name="clock" />
          {st.key === 'offline' || st.key === 'warn' ? `Último contato ${formatTime(screen.lastSeen)}` : st.key === 'idle' ? 'Aguardando a TV' : `Contato ${timeAgo(screen.lastSeen, now)}`}
        </div>
      </div>
    </button>
  );
}

export function EmptyState({ icon = 'layers', title, children, action }) {
  return (
    <div className="vx-empty">
      <span className="vx-tile is-neutral"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Carregando…' }) {
  return <div className="vx-loading"><span className="vx-spinner" />{label}</div>;
}

/* ---------- Abas ---------- */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="vx-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} className={`vx-tab ${value === t.id ? 'is-active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="vx-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Formulários ---------- */
export function Field({ label, help, error, children, className = '' }) {
  const id = useId();
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className={`vx-field ${error ? 'has-error' : ''} ${className}`}>
      {label && <label htmlFor={id} className="vx-label">{label}</label>}
      {child}
      {error ? <div className="vx-field-error"><Icon name="alert" />{error}</div> : help && <div className="vx-help">{help}</div>}
    </div>
  );
}
export function Input({ label, help, error, className, ...rest }) {
  return <Field label={label} help={help} error={error} className={className}>{(id) => <input id={id} className="vx-input" {...rest} />}</Field>;
}
export function Select({ label, help, options, className, ...rest }) {
  return (
    <Field label={label} help={help} className={className}>
      {(id) => (
        <div className="vx-select-wrap">
          <select id={id} className="vx-input vx-select" {...rest}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Icon name="chevronDown" />
        </div>
      )}
    </Field>
  );
}
export function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="vx-toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="vx-toggle-track" aria-hidden><i /></span>
      <span><span className="vx-toggle-label">{label}</span>{help && <span className="vx-help">{help}</span>}</span>
    </label>
  );
}
/** Pílulas de múltipla escolha (grupos, dias da semana). */
export function PillGroup({ options, value = [], onChange, label, help }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Field label={label} help={help}>
      <div className="vx-pills" role="group">
        {options.map((o) => (
          <button key={o.value} type="button" className={`vx-pill ${value.includes(o.value) ? 'is-on' : ''}`} aria-pressed={value.includes(o.value)} onClick={() => toggle(o.value)}>
            {value.includes(o.value) && <Icon name="check" />}
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}
/** Segmentado (escolha única). */
export function Segmented({ options, value, onChange, label }) {
  return (
    <Field label={label}>
      <div className="vx-seg" role="radiogroup">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`vx-seg-item ${value === o.value ? 'is-on' : ''}`} onClick={() => onChange(o.value)}>
            {o.icon && <Icon name={o.icon} />}
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/* ---------- Tabela ---------- */
export function Table({ columns, rows, rowKey = (r) => r.id, onRowClick, empty }) {
  if (!rows?.length) return empty || null;
  return (
    <div className="vx-table-wrap">
      <table className="vx-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'is-clickable' : ''}>
              {columns.map((c) => <td key={c.key} style={{ textAlign: c.align }}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Modal ---------- */
/** Janelas abertas, da mais antiga para a mais nova: Esc fecha só a de cima. */
const modalStack = [];
export function Modal({ open, onClose, title, subtitle, children, footer, width = 560, icon }) {
  const ref = useRef(null);
  // onClose num ref: o efeito roda só ao abrir (senão cada re-render roubaria o foco do campo em edição).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const me = {};
    modalStack.push(me);
    const onKey = (e) => e.key === 'Escape' && modalStack[modalStack.length - 1] === me && closeRef.current?.();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector('input,select,textarea,button:not(.vx-modal-x)')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(me), 1);
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  // Portal no <body>: uma janela aberta de dentro de outra fica por cima, sem herdar o layout dela.
  return createPortal(
    <div className="vx-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="vx-modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }} ref={ref}>
        <div className="vx-modal-head">
          {icon && <span className="vx-tile"><Icon name={icon} /></span>}
          <div>
            <h2 className="vx-card-title">{title}</h2>
            {subtitle && <p className="vx-modal-sub">{subtitle}</p>}
          </div>
          <IconButton icon="x" label="Fechar" variant="ghost" onClick={onClose} className="vx-modal-x" />
        </div>
        <div className="vx-modal-body">{children}</div>
        {footer && <div className="vx-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmação para ações destrutivas. */
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal open={!!state} onClose={() => close(false)} title={state?.title} width={460}
      footer={<><Button onClick={() => close(false)}>Cancelar</Button><Button variant={state?.danger ? 'destructive' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel || 'Confirmar'}</Button></>}>
      <p className="vx-muted" style={{ margin: 0 }}>{state?.message}</p>
    </Modal>
  );
  return [confirm, dialog];
}

/* ---------- Avisos (toasts) ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'online') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="vx-toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`vx-toast vx-toast-${t.tone}`}>
            <Icon name={t.tone === 'offline' ? 'xCircle' : t.tone === 'warn' ? 'alert' : 'check'} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
