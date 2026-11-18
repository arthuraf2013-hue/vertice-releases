import { useEffect, useRef, useState } from 'react';
import { qrMatrix, qrPath } from '../qr.js';
import {
  LOTTERY_GAMES, prizeText, SIGNS, horoscopeOf, quizOfDay, quizStep, FITNESS_BACKS, fitnessOfDay, parseClasses, classesToday,
  roomStatus, TRIBUTE_TEMPLATES, powerBiUrl, powerBiPages, htmlDocument, audioKind,
} from '../more.js';
import { youtubeEmbedUrl } from '../apps.js';
import { HLS_CDN } from '../extras.js';
import { useNow, Waiting } from './DataApps.jsx';

/**
 * Aplicativos do catálogo ampliado: loterias, horóscopo, quiz, cinema, agro, aniversariante,
 * aulas, fitness, sala de reunião, pesquisa, Power BI, HTML e rádio. Quadro fixo 1920×1080.
 */

const hhmm = (at) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const money = (v, d = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function Qr({ text, size }) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length + 8;
  return (
    <div className="vxa-qr-box" style={{ width: size, height: size }}>
      <svg viewBox={`-4 -4 ${n} ${n}`} width="100%" height="100%" shapeRendering="crispEdges" aria-label="QR Code">
        <rect x="-4" y="-4" width={n} height={n} fill="#fff" />
        <path d={qrPath(m)} fill="#0E1A2B" />
      </svg>
    </div>
  );
}

/** Índice do rodízio: muda a cada `everySec`, igual em todas as telas que estão no mesmo minuto. */
function useRotation(count, everySec, now) {
  const t = useNow(1000, now);
  if (!count) return 0;
  return Math.floor(t / 1000 / Math.max(2, everySec)) % count;
}

/* ---------------- Loterias ---------------- */

export function LotteryView({ c, d, status, now, portrait }) {
  const games = d?.games || [];
  const i = useRotation(games.length, Number(c.everySec) || 8, now);
  if (!games.length) return <Waiting title="Loterias CAIXA" status={status} />;
  const g = games[i];
  const many = g.numbers.length > 10;
  return (
    <div className="vxa-lot" style={{ '--lot': g.color }}>
      <header className="vxa-lot-head">
        <div>
          <div className="vxa-lot-name">{g.label}</div>
          <div className="vxa-lot-meta">Concurso {g.number} · {g.date}</div>
        </div>
        {g.accumulated ? <span className="vxa-lot-acc">Acumulou!</span> : g.winners != null && <span className="vxa-lot-acc is-won">{g.winners === 1 ? '1 ganhador' : `${g.winners} ganhadores`}</span>}
      </header>
      <div className={`vxa-lot-balls ${many ? 'is-many' : ''} ${portrait ? 'col' : ''}`}>
        {g.numbers.map((n) => <span key={n} className="vxa-lot-ball">{n}</span>)}
      </div>
      {g.second && (
        <div className="vxa-lot-second">
          <span>2º sorteio</span>
          {g.second.map((n) => <span key={n} className="vxa-lot-ball is-small">{n}</span>)}
        </div>
      )}
      {g.trevos && <div className="vxa-lot-extra">Trevos: {g.trevos.join(' e ')}</div>}
      {g.extra && <div className="vxa-lot-extra">{g.extra}</div>}
      {g.nextPrize > 0 && (
        <footer className="vxa-lot-next">
          <span>Próximo concurso{g.nextDate ? ` · ${g.nextDate}` : ''}</span>
          <b>{prizeText(g.nextPrize)}</b>
        </footer>
      )}
      {games.length > 1 && <div className="vxa-dots">{games.map((x, k) => <i key={x.key} className={k === i ? 'is-on' : ''} />)}</div>}
      <div className="vxa-lot-src">Fonte: CAIXA · Confira sempre o resultado oficial</div>
    </div>
  );
}

/* ---------------- Horóscopo ---------------- */

export function HoroscopeView({ c, now, portrait }) {
  const t = useNow(1000, now);
  const i = useRotation(SIGNS.length, Number(c.everySec) || 4, now);
  const h = horoscopeOf(SIGNS[i].key, new Date(t));
  return (
    <div className={`vxa-horo ${portrait ? 'col' : ''}`}>
      <div className="vxa-horo-sign">
        <span className="vxa-horo-symbol" aria-hidden>{h.symbol}</span>
        <div className="vxa-horo-name">{h.label}</div>
        <div className="vxa-muted vxa-horo-dates">{h.dates}</div>
      </div>
      <div className="vxa-horo-text">
        <div className="vxa-over">Horóscopo do dia</div>
        <p><b>Amor</b>{h.love}</p>
        <p><b>Trabalho</b>{h.work}</p>
        <p><b>Dica</b>{h.tip}</p>
        <div className="vxa-horo-luck">Cor: <b>{h.color}</b> · Número da sorte: <b>{h.number}</b></div>
      </div>
      <div className="vxa-dots">{SIGNS.map((s, k) => <i key={s.key} className={k === i ? 'is-on' : ''} />)}</div>
    </div>
  );
}

/* ---------------- Quiz ---------------- */

/** O quiz começa do zero quando entra na tela (cada exibição mostra a sequência do começo). */
function useElapsed(fixed) {
  const [start] = useState(() => Date.now());
  const t = useNow(250, fixed ? start + fixed * 1000 : undefined);
  return (t - start) / 1000;
}

export function QuizView({ c, now, portrait, demoElapsed }) {
  const day = useNow(60_000, now);
  const list = quizOfDay(c, new Date(day));
  const elapsed = useElapsed(demoElapsed);
  if (!list.length) return <Waiting title={c.title || 'Quiz do dia'} hint="Escreva perguntas ou ligue o banco de perguntas." status="error" />;
  const step = quizStep(elapsed, { thinkSec: Number(c.thinkSec) || 10, revealSec: Number(c.revealSec) || 5, count: list.length });
  const q = list[step.index];
  const letters = 'ABCDE';
  return (
    <div className={`vxa-quiz ${portrait ? 'col' : ''}`}>
      <header className="vxa-quiz-head">
        <span className="vxa-over">{c.title || 'Quiz do dia'}</span>
        <span className="vxa-quiz-count">{step.index + 1} de {list.length}</span>
      </header>
      <div className="vxa-quiz-q">{q.q}</div>
      <div className="vxa-quiz-opts">
        {q.options.map((o, k) => (
          <div key={o} className={`vxa-quiz-opt ${step.phase === 'reveal' ? (k === q.answer ? 'is-right' : 'is-off') : ''}`}>
            <b>{letters[k]}</b><span>{o}</span>
          </div>
        ))}
      </div>
      <footer className="vxa-quiz-foot">
        {step.phase === 'think' ? (
          <>
            <div className="vxa-quiz-bar"><div style={{ width: `${(1 - step.progress) * 100}%` }} /></div>
            <span className="vxa-quiz-left">{step.left}</span>
          </>
        ) : (
          <span className="vxa-quiz-answer">Resposta: {letters[q.answer]}) {q.options[q.answer]}</span>
        )}
      </footer>
    </div>
  );
}

/* ---------------- Cinema ---------------- */

export function CinemaView({ c, now, preview }) {
  const movies = (c.movies || []).filter((m) => m.title && youtubeEmbedUrl(m.url));
  const i = useRotation(movies.length, Number(c.secPerMovie) || 60, now);
  if (!movies.length) return <div className="vxa-missing">Coloque pelo menos um filme com o link do trailer no YouTube.</div>;
  const m = movies[i];
  const src = youtubeEmbedUrl(m.url, { muted: c.muted !== false });
  return (
    <div className="vxa-cine">
      {preview ? <div className="vxa-cine-poster" /> : <iframe key={m.url} className="vxa-frame" src={src} title={m.title} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />}
      <div className="vxa-cine-info">
        <span className="vxa-over">{c.title || 'Em cartaz'}</span>
        <div className="vxa-cine-title">{m.title}</div>
        <div className="vxa-cine-meta">
          {m.rating && <span className={`vxa-cine-rating r-${String(m.rating).toLowerCase()}`}>{m.rating}</span>}
          {m.genre && <span>{m.genre}</span>}
          {m.info && <span>{m.info}</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Agro ---------------- */

export function AgroView({ c, d, status, portrait }) {
  if (!d) return <Waiting title={c.title || 'Cotações do agro'} status={status} />;
  const rows = d.rows.slice(0, portrait ? 8 : 8);
  const date = rows[0]?.date;
  return (
    <div className="vxa-dx">
      <header className="vxa-dx-head">
        <div><div className="vxa-over">{date ? `Indicadores de ${date}` : 'Indicadores'}</div><div className="vxa-dx-title">{c.title || 'Cotações do agro'}</div></div>
      </header>
      <div className={`vxa-agro ${portrait ? 'col' : ''}`}>
        {rows.map((r) => (
          <div key={r.label} className="vxa-agro-card">
            <span className="vxa-agro-name">{r.label}</span>
            <b className="vxa-agro-price">{r.cents ? `${money(r.price)} ¢` : <><small>R$</small>{money(r.price)}</>}</b>
            <span className="vxa-muted">por {r.unit}{r.date !== date ? ` · ${r.date}` : ''}</span>
          </div>
        ))}
      </div>
      <div className="vxa-dx-foot vxa-muted">Fonte: {d.source}</div>
    </div>
  );
}

/* ---------------- Aniversariante do dia ---------------- */

export function TributeView({ c, image, portrait }) {
  const t = TRIBUTE_TEMPLATES[c.template] || TRIBUTE_TEMPLATES.confete;
  return (
    <div className={`vxa-trib vxa-trib-${c.template || 'confete'} ${portrait ? 'col' : ''}`} style={{ background: t.bg, color: t.fg, '--vxa-accent': t.accent }}>
      <Decor kind={c.template} color={t.accent} />
      <div className="vxa-trib-photo">
        {image ? <img src={image} alt="" /> : <span className="vxa-trib-initial">{String(c.name || '?').trim().charAt(0).toUpperCase()}</span>}
      </div>
      <div className="vxa-trib-text">
        <div className="vxa-over">Parabéns!</div>
        <div className="vxa-trib-name">{c.name || 'Nome do aniversariante'}</div>
        {c.role && <div className="vxa-trib-role">{c.role}</div>}
        <div className="vxa-trib-msg">{c.message}</div>
      </div>
    </div>
  );
}

/** Enfeites desenhados (sem imagem de banco): confete, balões, velas. */
function Decor({ kind, color }) {
  const dots = Array.from({ length: 36 }, (_, i) => ({ x: (i * 53) % 100, y: (i * 37) % 100, r: 6 + ((i * 7) % 10), o: 0.25 + ((i * 13) % 40) / 100 }));
  if (kind === 'baloes') {
    return (
      <svg className="vxa-trib-decor" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {[[120, 230, '#E53935'], [290, 150, color], [1760, 860, '#43A047'], [1640, 940, '#FDD835'], [1850, 760, color]].map(([x, y, f], i) => (
          <g key={i}><ellipse cx={x} cy={y} rx="70" ry="88" fill={f} opacity=".85" /><path d={`M${x} ${y + 88} q 20 120 -10 260`} stroke={f} strokeWidth="4" fill="none" opacity=".6" /></g>
        ))}
      </svg>
    );
  }
  return (
    <svg className="vxa-trib-decor" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r / 20} fill={i % 3 ? color : '#E53935'} opacity={p.o} />)}
    </svg>
  );
}

/* ---------------- Agenda de aulas ---------------- */

export function ClassesView({ c, now, portrait }) {
  const t = useNow(30_000, now);
  const today = classesToday(parseClasses(c.list), new Date(t));
  const shown = today.filter((x) => x.status !== 'done');
  const list = (shown.length ? shown : today).slice(0, portrait ? 8 : 6);
  const label = { now: 'Agora', next: 'A seguir', later: '', done: 'Encerrada' };
  return (
    <div className="vxa-dx">
      <header className="vxa-dx-head">
        <div><div className="vxa-over">{new Date(t).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div><div className="vxa-dx-title">{c.title || 'Aulas de hoje'}</div></div>
      </header>
      {list.length ? (
        <div className="vxa-classes">
          {list.map((x) => (
            <div key={`${x.start}${x.title}`} className={`vxa-class is-${x.status}`}>
              <span className="vxa-class-time">{x.start}<small>{x.end}</small></span>
              <div className="vxa-class-body">
                <b>{x.title}</b>
                <span className="vxa-muted">{[x.who, x.where].filter(Boolean).join(' · ')}</span>
              </div>
              {label[x.status] && <span className="vxa-dx-pill">{label[x.status]}</span>}
            </div>
          ))}
        </div>
      ) : <div className="vxa-center vxa-muted vxa-dx-wait">Sem aulas programadas para hoje.</div>}
    </div>
  );
}

/* ---------------- Fitness ---------------- */

export function FitnessView({ c, now, image }) {
  const t = useNow(1000, now);
  const list = fitnessOfDay(c, new Date(t));
  const i = useRotation(list.length, Number(c.everySec) || 8, now);
  const b = FITNESS_BACKS[c.back] || FITNESS_BACKS.iron;
  return (
    <div className={`vxa-fit vxa-fit-${c.back || 'iron'}`} style={{ background: b.bg, color: b.fg, '--vxa-accent': b.accent }}>
      {image ? <img className="vxa-fit-img" src={image} alt="" /> : <FitBack kind={c.back} color={b.accent} />}
      <div className="vxa-fit-shade" />
      <div key={i} className="vxa-fit-phrase">{list[i]}</div>
    </div>
  );
}

function FitBack({ kind, color }) {
  if (kind === 'track') {
    return (
      <svg className="vxa-fit-art" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((k) => <path key={k} d={`M-200 ${1100 - k * 70} Q 960 ${300 - k * 40} 2120 ${1100 - k * 70}`} stroke="#fff" strokeOpacity=".22" strokeWidth="10" fill="none" />)}
      </svg>
    );
  }
  if (kind === 'neon' || kind === 'sunrise') {
    return (
      <svg className="vxa-fit-art" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs><radialGradient id="fg" cx="50%" cy={kind === 'sunrise' ? '100%' : '30%'} r="70%"><stop offset="0" stopColor={color} stopOpacity=".55" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient></defs>
        <rect width="1920" height="1080" fill="url(#fg)" />
        {kind === 'neon' && [0, 1, 2].map((k) => <rect key={k} x={260 + k * 520} y="140" width="360" height="800" rx="180" fill="none" stroke={color} strokeOpacity=".35" strokeWidth="6" />)}
      </svg>
    );
  }
  // ferro e aço: anilhas e barra
  return (
    <svg className="vxa-fit-art" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="512" width="1920" height="56" fill="#fff" opacity=".07" />
      {[[120, 540, 330], [1800, 540, 330], [330, 540, 250], [1590, 540, 250]].map(([x, y, r], k) => (
        <g key={k} opacity=".12"><circle cx={x} cy={y} r={r} fill="none" stroke="#fff" strokeWidth="60" /><circle cx={x} cy={y} r="40" fill="#fff" /></g>
      ))}
      <rect x="0" y="0" width="1920" height="1080" fill={color} opacity=".06" />
    </svg>
  );
}

/* ---------------- Sala de reunião ---------------- */

export function RoomView({ c, d, status, now, portrait }) {
  const t = useNow(30_000, now);
  if (!d) return <Waiting title={c.name || 'Sala de reunião'} status={status} />;
  const r = roomStatus(d.events || [], t);
  return (
    <div className={`vxa-room ${r.busy ? 'is-busy' : 'is-free'} ${portrait ? 'col' : ''}`}>
      <section className="vxa-room-now">
        <div className="vxa-room-name">{c.name || 'Sala de reunião'}</div>
        <div className="vxa-room-state">{r.busy ? 'Ocupada' : 'Livre'}</div>
        {r.busy ? (
          <div className="vxa-room-cur"><b>{r.current.title || 'Reunião'}</b><span>até {hhmm(r.current.end || r.current.start + 3_600_000)}</span></div>
        ) : (
          <div className="vxa-room-cur"><span>{r.freeUntil ? `Livre até ${hhmm(r.freeUntil)}` : 'Livre pelo resto do dia'}</span></div>
        )}
      </section>
      <aside className="vxa-room-next">
        <div className="vxa-over">Próximas</div>
        {r.next.length ? r.next.map((e) => (
          <div key={`${e.start}${e.title}`} className="vxa-room-row"><b>{hhmm(e.start)}</b><span>{e.title || 'Reunião'}</span></div>
        )) : <div className="vxa-muted">Nada mais hoje.</div>}
      </aside>
    </div>
  );
}

/* ---------------- Pesquisa de satisfação ---------------- */

export function SurveyView({ c, portrait, now }) {
  const qs = (c.questions || []).filter((q) => q.text);
  const i = useRotation(qs.length, 6, now);
  return (
    <div className={`vxa-survey ${portrait ? 'col' : ''}`}>
      <div className="vxa-survey-text">
        <div className="vxa-over">{c.subtitle || 'Pesquisa rápida'}</div>
        <div className="vxa-survey-title">{c.title || 'Sua opinião importa'}</div>
        {qs.length > 0 && <div key={i} className="vxa-survey-q">“{qs[i].text}”</div>}
        <div className="vxa-survey-hint">Aponte a câmera do celular para o código e responda. É anônimo.</div>
      </div>
      {c.link && <Qr text={c.link} size={portrait ? 520 : 560} />}
    </div>
  );
}

/* ---------------- Power BI ---------------- */

export function PowerBiView({ c, now, preview }) {
  const pages = powerBiPages(c.pages);
  const i = useRotation(pages.length || 1, Number(c.everySec) || 30, now);
  const [n, setN] = useState(0);
  useEffect(() => {
    const min = Number(c.reloadMin) || 0;
    if (!min) return undefined;
    const id = setInterval(() => setN((x) => x + 1), min * 60_000);
    return () => clearInterval(id);
  }, [c.reloadMin]);
  const src = powerBiUrl(c.url, pages[i] || '');
  if (!src) return <div className="vxa-missing">Cole o link de "Publicar na Web" do Power BI (app.powerbi.com/view?r=…).</div>;
  if (preview) return <div className="vxa-missing">Relatório do Power BI{pages.length ? ` · ${pages.length} páginas em rodízio` : ''}. Ele abre na TV.</div>;
  return <iframe key={`${src}${n}`} className="vxa-frame" src={src} title="Power BI" allowFullScreen />;
}

/* ---------------- Código HTML ---------------- */

export function HtmlView({ c }) {
  const box = { left: `${Number(c.x) || 0}%`, top: `${Number(c.y) || 0}%`, width: `${Number(c.w) || 100}%`, height: `${Number(c.h) || 100}%` };
  return (
    <div className="vxa-html" style={{ background: c.bg || '#000' }}>
      <iframe className="vxa-html-frame" style={box} title="Código HTML" srcDoc={htmlDocument(c.code, c.bg)} sandbox="allow-scripts allow-popups" referrerPolicy="no-referrer" />
    </div>
  );
}

/* ---------------- Rádio ---------------- */

/** Toca um link de áudio (direto ou HLS). Usado pelo app e pelo som ambiente da tela. */
export function useAudio(url, { muted = false, volume = 1, enabled = true } = {}) {
  const [state, setState] = useState('idle');
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled || !url || typeof Audio === 'undefined') return undefined;
    const kind = audioKind(url);
    if (!kind) { setState('error'); return undefined; }
    const el = new Audio();
    ref.current = el;
    el.volume = Math.max(0, Math.min(1, volume));
    el.muted = !!muted;
    el.preload = 'none';
    el.crossOrigin = 'anonymous';
    let hls = null;
    let alive = true;
    const play = () => el.play().then(() => alive && setState('playing')).catch(() => alive && setState('blocked'));
    el.addEventListener('error', () => alive && setState('error'));
    el.addEventListener('waiting', () => alive && setState('loading'));
    el.addEventListener('playing', () => alive && setState('playing'));
    setState('loading');
    if (kind === 'hls' && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import(/* @vite-ignore */ HLS_CDN).then((m) => {
        if (!alive) return;
        const Hls = m.default || m;
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(el);
        play();
      }).catch(() => alive && setState('error'));
    } else {
      el.src = url;
      play();
    }
    return () => { alive = false; ref.current = null; el.pause(); el.removeAttribute('src'); el.load(); hls?.destroy?.(); };
  }, [url, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // Volume e mudo mudam sem recriar o áudio (som ambiente baixa quando entra um vídeo com som).
  useEffect(() => {
    if (!ref.current) return;
    ref.current.volume = Math.max(0, Math.min(1, volume));
    ref.current.muted = !!muted;
  }, [muted, volume]);
  return state;
}

export function RadioView({ c, image, preview }) {
  const state = useAudio(c.url, { enabled: !preview });
  return (
    <div className="vxa-radio">
      <div className="vxa-radio-logo">{image ? <img src={image} alt="" /> : <RadioIcon />}</div>
      <div className="vxa-radio-text">
        <span className="vxa-dx-pill is-live">AO VIVO</span>
        <div className="vxa-radio-name">{c.name || 'Rádio'}</div>
        {c.slogan && <div className="vxa-radio-slogan">{c.slogan}</div>}
        <div className={`vxa-eq ${state === 'playing' || preview ? 'is-on' : ''}`} aria-hidden>{Array.from({ length: 9 }, (_, k) => <i key={k} style={{ animationDelay: `${(k * 137) % 700}ms` }} />)}</div>
        {!preview && state === 'error' && <div className="vxa-muted vxa-radio-msg">Não conseguimos tocar a rádio agora. Tentamos de novo na próxima vez.</div>}
        {!preview && state === 'blocked' && <div className="vxa-muted vxa-radio-msg">O aparelho bloqueou o som automático. Toque na tela uma vez para liberar.</div>}
      </div>
    </div>
  );
}

function RadioIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8l10-5" /><circle cx="15.5" cy="14" r="3" /><path d="M6 12h4M6 15h4" />
    </svg>
  );
}
