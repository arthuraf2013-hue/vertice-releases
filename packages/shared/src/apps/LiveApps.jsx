import { useEffect, useRef, useState } from 'react';
import { qrMatrix, qrPath } from '../qr.js';
import { commentPage } from '../comments.js';
import { normalizeQueueConfig, timerAt, timerElapsed, normalizeTimer, wodLines, pollResults, pollOptions, TIMER_MODES } from '../interact.js';
import { driveImageUrl, streamKind, HLS_CDN } from '../extras.js';
import { timeAgo } from '../format.js';
import { useNow, Waiting } from './DataApps.jsx';

/**
 * Apps ao vivo: chamada de senhas, cronômetro, enquete, foto no telão, TV ao vivo e pasta do Drive.
 * Quadro fixo 1920×1080 (ou 1080×1920 em pé), como os outros apps.
 */

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

const short = (link) => String(link || '').replace(/^https?:\/\//, '').replace(/\?.*$/, '');
const hhmm = (at) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------------- Chamada de senhas ---------------- */

export function QueueView({ c, d, portrait }) {
  const cfg = normalizeQueueConfig(c);
  const cur = d?.current;
  const hist = (d?.history || []).slice(0, portrait ? 5 : 4);
  const label = cur ? cfg.types.find((t) => t.prefix === cur.prefix)?.label : '';
  return (
    <div className={`vxa-queue ${portrait ? 'col' : ''}`}>
      <section className="vxa-queue-now">
        <div className="vxa-over">{cfg.title || 'Senha chamada'}</div>
        {cur ? (
          <div key={cur.n || cur.at} className="vxa-queue-call">
            <div className="vxa-queue-code">{cur.code}</div>
            {cur.counter && <div className="vxa-queue-counter">{cur.counter}</div>}
            {label && <div className="vxa-queue-type">{label}</div>}
          </div>
        ) : (
          <div className="vxa-queue-idle">Aguarde ser chamado</div>
        )}
      </section>
      <aside className="vxa-queue-hist">
        <div className="vxa-queue-hist-title">Últimas chamadas</div>
        {hist.length ? hist.map((h) => (
          <div key={`${h.code}${h.at}`} className="vxa-queue-row">
            <b>{h.code}</b><span>{h.counter}</span><small>{hhmm(h.at)}</small>
          </div>
        )) : <div className="vxa-muted vxa-queue-none">Nenhuma ainda</div>}
      </aside>
    </div>
  );
}

/* ---------------- Cronômetro ---------------- */

export function TimerView({ c, d, now, portrait }) {
  const t = useNow(250, now);
  const cfg = normalizeTimer(c);
  const offset = Number(d?.offset) || 0; // diferença do relógio da TV para o do servidor
  const el = d?.demoElapsed != null ? d.demoElapsed : timerElapsed(cfg, d?.state || {}, t + offset);
  const st = timerAt(cfg, el);
  const wod = wodLines(cfg.wod);
  const paused = d?.state?.status === 'paused';
  return (
    <div className={`vxa-timer is-${st.phase} ${paused ? 'is-paused' : ''} ${portrait || !wod.length ? 'col' : ''}`}>
      <section className="vxa-timer-main">
        <div className="vxa-timer-top">
          <span className="vxa-over">{TIMER_MODES[cfg.mode].label}{cfg.mode === 'amrap' || cfg.mode === 'fortime' || cfg.mode === 'countdown' ? ` · ${cfg.minutes} min` : ''}</span>
          {st.rounds > 0 && st.round > 0 && <span className="vxa-timer-round">Rodada <b>{st.round}</b>/{st.rounds}</span>}
        </div>
        <div className="vxa-timer-label">{paused ? 'Pausado' : st.label}</div>
        <div className="vxa-timer-digits">{st.display}</div>
        <div className="vxa-timer-bar"><i style={{ width: `${Math.round(st.progress * 100)}%` }} /></div>
      </section>
      {wod.length > 0 && (
        <aside className="vxa-timer-wod">
          <div className="vxa-timer-wod-title">{cfg.title || 'WOD'}</div>
          <ul>{wod.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </aside>
      )}
    </div>
  );
}

/* ---------------- Enquete ---------------- */

export function PollView({ c, d, portrait }) {
  const options = pollOptions(c.options);
  const r = pollResults(options, d?.tally);
  return (
    <div className={`vxa-poll ${portrait ? 'col' : ''}`}>
      <section className="vxa-poll-main">
        <div className="vxa-over">Enquete</div>
        <div className="vxa-poll-q">{c.question}</div>
        <div className="vxa-poll-rows">
          {r.rows.map((row, i) => (
            <div key={i} className={`vxa-poll-row ${row.leader ? 'is-leader' : ''}`}>
              <div className="vxa-poll-label"><span>{row.label}</span>{c.showResults !== false && <b>{row.pct}%</b>}</div>
              {c.showResults !== false && <div className="vxa-poll-bar"><i style={{ width: `${row.pct}%` }} /></div>}
            </div>
          ))}
        </div>
        {c.showResults !== false && <div className="vxa-muted vxa-poll-total">{r.total} {r.total === 1 ? 'voto' : 'votos'}</div>}
      </section>
      {c.showQr !== false && c.link && (
        <aside className="vxa-poll-side">
          <Qr text={c.link} size={portrait ? 300 : 360} />
          <span>Vote pelo celular<small>{short(c.link)}</small></span>
        </aside>
      )}
    </div>
  );
}

/* ---------------- Foto no telão ---------------- */

function Photo({ src, alt }) {
  if (String(src).startsWith('demo:')) return <div className="vxa-photo-demo" style={{ background: src.slice(5) }} aria-label={alt} />;
  return <img src={src} alt={alt} />;
}

export function PhotoWallView({ c, comments, now, portrait }) {
  const t = useNow(1000, now);
  const list = (comments || []).filter((m) => m.photo);
  const mosaic = c.layout !== 'single';
  const per = mosaic ? (portrait ? 4 : 6) : 1;
  const page = commentPage(list, per, c.rotateSec || 6, t);
  return (
    <div className={`vxa-photos ${portrait ? 'col' : ''}`}>
      <aside className="vxa-photos-side">
        <div className="vxa-over">{c.title || 'Sua foto no telão'}</div>
        {c.question && <div className="vxa-wall-question">{c.question}</div>}
        {c.showQr !== false && c.link && (
          <div className="vxa-wall-qr">
            <Qr text={c.link} size={portrait ? 260 : 320} />
            <span>Aponte a câmera e mande<small>{short(c.link)}</small></span>
          </div>
        )}
      </aside>
      <div className={`vxa-photos-grid n${page.length || 0} ${mosaic ? '' : 'single'}`}>
        {page.length ? page.map((m) => (
          <figure key={m.id} className="vxa-photo">
            <Photo src={m.photo} alt={m.name ? `Foto de ${m.name}` : 'Foto'} />
            <figcaption><b>{m.name || 'Anônimo'}</b>{m.text ? ` · ${m.text}` : ''}<span> · {timeAgo(m.at, t)}</span></figcaption>
          </figure>
        )) : (
          <div className="vxa-wall-empty">
            <b>Mande a primeira foto</b>
            <span className="vxa-muted">Pelo QR Code. Ela aparece aqui depois de aprovada.</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- TV ao vivo ---------------- */

let hlsPromise = null;
function loadHls() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem navegador'));
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsPromise = hlsPromise || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HLS_CDN;
    s.async = true;
    s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js não carregou')));
    s.onerror = () => { hlsPromise = null; reject(new Error('sem acesso à CDN')); };
    document.head.appendChild(s);
  });
  return hlsPromise;
}

export function StreamView({ c, preview }) {
  const ref = useRef(null);
  const [err, setErr] = useState(null);
  const kind = streamKind(c.url);
  useEffect(() => {
    const v = ref.current;
    if (!v || !kind || preview) return undefined;
    let hls = null;
    let retry = null;
    let alive = true;
    const play = () => {
      v.muted = !!c.muted;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    };
    const start = () => {
      setErr(null);
      if (kind === 'video' || v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = c.url;
        play();
        return;
      }
      loadHls().then((Hls) => {
        if (!alive) return;
        if (!Hls.isSupported()) { setErr('Este aparelho não toca transmissões'); return; }
        hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
        hls.loadSource(c.url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          setErr('Transmissão fora do ar. Tentando de novo…');
          hls.destroy();
          hls = null;
          retry = setTimeout(start, 20_000);
        });
      }, () => { setErr('Sem internet para a transmissão'); retry = setTimeout(start, 30_000); });
    };
    start();
    return () => { alive = false; clearTimeout(retry); hls?.destroy(); v.removeAttribute('src'); v.load?.(); };
  }, [c.url, kind, c.muted, preview]);
  if (!kind) return <div className="vxa-missing">Link de transmissão inválido (use .m3u8 ou .mp4)</div>;
  return (
    <div className="vxa-stream">
      {preview ? <div className="vxa-stream-preview"><span>Transmissão</span><small>{short(c.url)}</small></div> : <video ref={ref} playsInline autoPlay onError={() => setErr('Não foi possível abrir a transmissão')} />}
      <div className="vxa-stream-badge"><i />AO VIVO{c.title ? <span>{c.title}</span> : null}</div>
      {err && <div className="vxa-stream-err">{err}</div>}
    </div>
  );
}

/* ---------------- Pasta do Google Drive ---------------- */

export function DriveView({ c, d, status, now }) {
  const t = useNow(1000, now);
  const files = d?.files || [];
  if (!files.length) return <Waiting title="Pasta do Google Drive" status={status} hint="Pasta sem imagens ou não compartilhada. Confira o link." />;
  const sec = Math.max(3, Number(c.seconds) || 8);
  const i = Math.floor(t / (sec * 1000)) % files.length;
  const f = files[i];
  return (
    <div className={`vxa-drive fit-${c.fit === 'cover' ? 'cover' : 'contain'}`}>
      {f.demo ? <div className="vxa-photo-demo" style={{ background: f.demo }}><span>{f.name}</span></div> : <img key={f.id} src={driveImageUrl(f.id)} alt={f.name} />}
      {/* Pré-carrega a próxima. */}
      {!f.demo && files.length > 1 && <link rel="prefetch" href={driveImageUrl(files[(i + 1) % files.length].id)} />}
    </div>
  );
}
