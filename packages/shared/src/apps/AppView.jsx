import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  appTheme, weatherLabel, formatMoney, youtubeEmbedUrl, safeHttpUrl, TICKER_SPEEDS, APP_KINDS,
} from '../apps.js';

/**
 * Desenho de um aplicativo na TV. O mesmo componente roda no player e na prévia do painel.
 * Tudo é desenhado num quadro fixo (1920×1080 ou 1080×1920, conforme a tela) e escalado
 * para caber: fica igual numa TV 4K, numa TV box HD e na miniatura do painel.
 *
 * @param {{ app: {kind:string, config:object, data?:object}, weather?: object|null, feed?: {source:string, items:object[]}|null,
 *           now?: number, status?: 'loading'|'error'|null }} props
 */
export function AppView({ app, weather = null, feed = null, now, status = null }) {
  if (!app || !APP_KINDS[app.kind]) return <div className="vxa vxa-empty" />;
  const c = app.config || {};
  if (app.kind === 'youtube') {
    const src = youtubeEmbedUrl(c.url, { muted: c.muted !== false });
    return src
      ? <iframe className="vxa-frame" src={src} title="YouTube" allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
      : <Missing text="Link do YouTube inválido" />;
  }
  if (app.kind === 'web') {
    const src = safeHttpUrl(c.url);
    return src ? <WebFrame src={src} reloadMin={Number(c.reloadMin) || 0} /> : <Missing text="Endereço do site inválido" />;
  }
  const themeKey = app.kind === 'price' ? app.data?.theme : c.theme;
  const t = appTheme(themeKey);
  return (
    <Stage bg={t.bg}>
      {({ portrait }) => (
        <div className={`vxa vxa-k-${app.kind} ${portrait ? 'is-portrait' : ''}`} style={{ '--vxa-bg': t.bg, '--vxa-fg': t.fg, '--vxa-accent': t.accent }}>
          {app.kind === 'clock' && <Clock c={c} now={now} />}
          {app.kind === 'ticker' && <Ticker c={c} />}
          {app.kind === 'weather' && <Weather c={c} w={weather} status={status} portrait={portrait} />}
          {app.kind === 'rss' && <News c={c} feed={feed} status={status} />}
          {app.kind === 'price' && <Price data={app.data} portrait={portrait} />}
        </div>
      )}
    </Stage>
  );
}

/** Quadro fixo escalado para caber no espaço disponível. */
function Stage({ bg, children }) {
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
  const portrait = box.h > box.w;
  const W = portrait ? 1080 : 1920;
  const H = portrait ? 1920 : 1080;
  const s = Math.min(box.w / W, box.h / H);
  return (
    <div ref={ref} className="vxa-stage" style={{ background: bg }}>
      <div className="vxa-canvas" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${s})` }}>
        {children({ portrait })}
      </div>
    </div>
  );
}

function Missing({ text }) {
  return <div className="vxa-missing">{text}</div>;
}

function WebFrame({ src, reloadMin }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!reloadMin) return undefined;
    const t = setInterval(() => setN((x) => x + 1), reloadMin * 60_000);
    return () => clearInterval(t);
  }, [reloadMin]);
  return <iframe key={n} className="vxa-frame" src={src} title="Site" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />;
}

/* ---------------- Relógio ---------------- */

function useClock(now) {
  const [t, setT] = useState(() => now || Date.now());
  useEffect(() => {
    if (now) return undefined;
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, [now]);
  return new Date(now || t);
}

function Clock({ c, now }) {
  const d = useClock(now);
  const p = (n) => String(n).padStart(2, '0');
  const raw = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const date = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <div className="vxa-center">
      <div className="vxa-clock-time">
        {p(d.getHours())}<span className="vxa-blink">:</span>{p(d.getMinutes())}
        {c.showSeconds && <small>{p(d.getSeconds())}</small>}
      </div>
      {c.showDate !== false && <div className="vxa-clock-date">{date}</div>}
      {c.message && <div className="vxa-clock-msg">{c.message}</div>}
    </div>
  );
}

/* ---------------- Avisos ---------------- */

function Ticker({ c }) {
  const lines = (Array.isArray(c.lines) ? c.lines : String(c.lines || '').split('\n')).map((l) => String(l).trim()).filter(Boolean);
  const text = lines.join('     •     ') || ' ';
  const speed = TICKER_SPEEDS[c.speed] || TICKER_SPEEDS.normal;
  // Duração pelo tamanho do texto: a faixa anda sempre na mesma velocidade.
  const dur = Math.max(8, (text.length * 28 + 1920) / speed);
  return (
    <>
      <div className="vxa-center vxa-ticker-body">
        <div className="vxa-over">AVISOS</div>
        <div className="vxa-ticker-title">{c.title || 'Avisos'}</div>
        {lines[0] && <div className="vxa-ticker-first">{lines[0]}</div>}
      </div>
      <div className="vxa-marquee">
        <div className="vxa-marquee-track" style={{ animationDuration: `${dur}s` }}>
          <span>{text}</span><span aria-hidden>{text}</span>
        </div>
      </div>
    </>
  );
}

/* ---------------- Clima ---------------- */

const WEEKDAY = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
};

function Weather({ c, w, status, portrait }) {
  if (!w) {
    return (
      <div className="vxa-center">
        <WeatherIcon name="cloudSun" size={220} />
        <div className="vxa-weather-city">{c.city || 'Escolha a cidade'}</div>
        <div className="vxa-muted">{status === 'error' ? 'Sem previsão agora. Tentando de novo…' : 'Carregando a previsão…'}</div>
      </div>
    );
  }
  const now = weatherLabel(w.code);
  return (
    <div className={`vxa-weather ${portrait ? 'col' : ''}`}>
      <div className="vxa-weather-now">
        <div className="vxa-over">{c.city}</div>
        <div className="vxa-weather-main">
          <WeatherIcon name={now.icon} size={portrait ? 260 : 300} />
          <div className="vxa-weather-temp">{w.temp}°</div>
        </div>
        <div className="vxa-weather-desc">{now.text}</div>
        <div className="vxa-muted vxa-weather-range">
          Máx. {w.max}° · Mín. {w.min}°{w.humidity != null ? ` · Umidade ${w.humidity}%` : ''}
        </div>
      </div>
      {!!w.days?.length && (
        <div className="vxa-weather-days">
          {w.days.map((d) => (
            <div key={d.date} className="vxa-weather-day">
              <b>{WEEKDAY(d.date)}</b>
              <WeatherIcon name={weatherLabel(d.code).icon} size={110} />
              <span><strong>{d.max}°</strong> {d.min}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeatherIcon({ name, size = 120 }) {
  const sun = <><circle cx="32" cy="32" r="12" fill="var(--vxa-accent)" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="30.5" y="6" width="3" height="9" rx="1.5" fill="var(--vxa-accent)" transform={`rotate(${a} 32 32)`} />)}</>;
  const cloud = (x = 0, y = 0, op = 1) => <path transform={`translate(${x} ${y})`} opacity={op} fill="var(--vxa-fg)" d="M20 50h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0 1 23z" />;
  const drops = [22, 32, 42].map((x) => <rect key={x} x={x} y="52" width="3" height="9" rx="1.5" fill="#6CB6FF" transform={`rotate(15 ${x} 56)`} />);
  const shapes = {
    sun,
    cloudSun: <><g transform="translate(-8 -8) scale(.8)">{sun}</g>{cloud(4, 4)}</>,
    cloud: <>{cloud(-8, -10, 0.5)}{cloud(2, 0)}</>,
    rain: <>{cloud(0, -6)}{drops}</>,
    storm: <>{cloud(0, -6)}<path d="M33 46l-6 10h6l-3 8 9-12h-6l3-6z" fill="var(--vxa-accent)" /></>,
  };
  return <svg className="vxa-wicon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>{shapes[name] || shapes.cloud}</svg>;
}

/* ---------------- Notícias ---------------- */

function News({ c, feed, status }) {
  const items = (feed?.items || []).slice(0, Math.max(1, Math.min(8, Number(c.count) || 5)));
  const source = c.source || feed?.source || 'Notícias';
  return (
    <div className="vxa-news">
      <div className="vxa-over">{source}</div>
      {items.length ? (
        <>
          <div className="vxa-news-lead">{items[0].title}</div>
          <ul className="vxa-news-list">
            {items.slice(1).map((it, i) => <li key={i}>{it.title}</li>)}
          </ul>
        </>
      ) : (
        <div className="vxa-muted vxa-news-lead">{status === 'error' ? 'Não consegui ler as notícias agora.' : 'Carregando as manchetes…'}</div>
      )}
    </div>
  );
}

/* ---------------- Tabela de preços ---------------- */

function Price({ data, portrait }) {
  if (!data) return <div className="vxa-center vxa-muted">Tabela de preços vazia</div>;
  const items = data.items || [];
  const n = items.length || 1;
  const cards = data.layout === 'cards';
  const cols = cards
    ? (portrait ? (n <= 4 ? 1 : n <= 12 ? 2 : 3) : (n <= 3 ? n : n <= 8 ? 4 : n <= 15 ? 5 : 6))
    : portrait ? 1 : n > 7 ? 2 : 1;
  // Fonte encolhe quando há muitos itens por coluna, para tudo caber sem rolar.
  const perCol = Math.ceil(items.length / cols) || 1;
  // Espaço que sobra para as linhas (altura do quadro menos título, margens e rodapé).
  const avail = (portrait ? 1920 : 1080) - 330 - (data.subtitle ? 52 : 0) - (data.footer ? 80 : 0);
  const row = Math.max(48, Math.min(118, Math.floor(avail / perCol)));
  // Cartões: a letra acompanha o menor lado do cartão (altura ou largura útil).
  const cardH = (avail + 40 - 24 * (perCol - 1)) / perCol;
  const cardW = ((portrait ? 1080 : 1920) - 180 - 24 * (cols - 1)) / cols;
  const cardSize = Math.floor(Math.min(330, cardH, (cardW - 64) * 0.95));
  return (
    <div className="vxa-price">
      <header className="vxa-price-head">
        <div>
          <div className="vxa-price-title">{data.title}</div>
          {data.subtitle && <div className="vxa-muted vxa-price-sub">{data.subtitle}</div>}
        </div>
      </header>
      {cards ? (
        <div className="vxa-price-cards" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${perCol}, minmax(0, 1fr))`, '--card': `${cardSize}px` }}>
          {items.map((it, i) => (
            <div key={i} className={`vxa-price-card ${it.highlight ? 'is-hl' : ''}`}>
              <b>{it.name}{it.unit && <em> {it.unit}</em>}</b>
              {it.oldPrice != null && <span className="vxa-price-was"><span className="vxa-price-tag">OFERTA</span><s>{data.currency} {formatMoney(it.oldPrice)}</s></span>}
              <span className="vxa-price-val"><small>{data.currency}</small>{formatMoney(it.price)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="vxa-price-list" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${perCol}, minmax(0, ${row}px))`, gridAutoFlow: 'column', '--row': `${row}px` }}>
          {items.map((it, i) => (
            <div key={i} className={`vxa-price-row ${it.highlight ? 'is-hl' : ''}`}>
              <span className="vxa-price-name">{it.name}{it.unit && <em> {it.unit}</em>}</span>
              <span className="vxa-price-dots" />
              {it.oldPrice != null && <s>{formatMoney(it.oldPrice)}</s>}
              <span className="vxa-price-val"><small>{data.currency}</small>{formatMoney(it.price)}</span>
            </div>
          ))}
        </div>
      )}
      {data.footer && <footer className="vxa-price-foot vxa-muted">{data.footer}</footer>}
    </div>
  );
}
