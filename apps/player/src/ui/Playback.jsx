import { useEffect, useRef, useState } from 'react';
import { resolveNow, timerAt, timerElapsed } from '@vertice/shared';
import { beep } from '../services/speak.js';
import { clockOffset } from '../services/clock.js';
import { AppView } from '@vertice/shared/apps';
import { useAppData } from '../services/appData.js';

// Imagem e aplicativo ficam o tempo da playlist; vídeo vai até o fim.
const timed = (it) => it.type === 'image' || it.type === 'app';

/**
 * Toca a programação: resolve o que vale agora, passa item por item e,
 * a cada troca, confere de novo o horário (troca de faixa sem cortar a mídia no meio).
 */
export function Playback({ manifest, cache, cacheVersion, onNowPlaying, onEmpty, onPlayed, volume = 1 }) {
  const defaultFit = manifest?.screen?.display?.fit || 'cover';
  const [cur, setCur] = useState(() => pick(manifest, null));
  const timer = useRef(null);
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;

  // Manifesto novo: se o item atual saiu da programação, troca na hora.
  // Se continua, pega a versão nova do item (ajustes de posição aparecem sem cortar a mídia).
  useEffect(() => {
    setCur((c) => {
      const pinned = pinnedItem(manifest);
      if (pinned) return c && c.pinned && c.item.mediaId === pinned.mediaId ? { ...c, item: pinned } : { item: pinned, slotId: 'pin', n: ++counter, pinned: true };
      if (c?.pinned) return pick(manifest, null);
      const r = resolveNow(manifest);
      const fresh = c && r.items.find((it) => it.key === c.item.key);
      if (fresh) return { ...c, item: fresh };
      if (!c || !r.items.some((it) => it.mediaId === c.item.mediaId)) return pick(manifest, null);
      return c;
    });
  }, [manifest]);

  // Fim da mídia fixada pelo painel: volta para a programação.
  useEffect(() => {
    const t = setInterval(() => {
      setCur((c) => (c?.pinned && !pinnedItem(manifestRef.current) ? pick(manifestRef.current, null) : c));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // A cada 30 s, se a faixa de horário mudou e o item atual é de outra faixa, avança.
  useEffect(() => {
    const t = setInterval(() => {
      setCur((c) => {
        const r = resolveNow(manifestRef.current);
        if (c?.pinned) return c;
        if (c && r.slotId !== c.slotId && timed(c.item)) return pick(manifestRef.current, null);
        if (!c && r.items.length) return pick(manifestRef.current, null);
        return c;
      });
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const next = () => setCur((c) => (c?.pinned ? { ...c, n: ++counter } : pick(manifestRef.current, c)));

  useEffect(() => {
    clearTimeout(timer.current);
    if (!cur) {
      onEmpty?.(true);
      onNowPlaying?.(null);
      return;
    }
    onEmpty?.(false);
    onNowPlaying?.(cur.item);
    if (cur.pinned) {
      // Fixada: fica parada (imagem) ou repete (vídeo) até o painel soltar.
    } else if (timed(cur.item)) {
      timer.current = setTimeout(next, (cur.item.durationSec || 10) * 1000);
    } else {
      // Rede de segurança: se o vídeo travar, segue em frente.
      const max = ((cur.item.durationSec || 600) + 10) * 1000;
      timer.current = setTimeout(next, max);
    }
    // Pré-carrega a próxima imagem.
    const n = peek(manifestRef.current, cur);
    if (n?.type === 'image') {
      const img = new Image();
      img.src = cache.src(n);
    }
    // Relatórios: conta a exibição quando ela termina (mídia fixada para ajuste não conta).
    const started = Date.now();
    const shown = cur;
    return () => {
      clearTimeout(timer.current);
      if (!shown.pinned) onPlayed?.(shown.item, (Date.now() - started) / 1000);
    };
  }, [cur?.n, cur?.pinned]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) return null;
  if (cur.item.type === 'app') {
    return <div className="tv-play"><AppItem key={cur.n} item={cur.item} cache={cache} /></div>;
  }
  const src = cache.src(cur.item);
  const fit = cur.item.fit || defaultFit;
  const a = cur.item.adjust;
  // Ajuste desta mídia nesta tela (tamanho e posição), feito no painel.
  const adj = a ? { transform: `translate(${a.offsetX}%, ${a.offsetY}%) scale(${a.zoom / 100})` } : undefined;
  return (
    <div className="tv-play" data-cache={cacheVersion}>
      {cur.item.type === 'image' ? (
        <div key={cur.n} className="tv-media-wrap">
          {/* Fundo desfocado: a própria imagem ampliada atrás, para não sobrar faixa preta. */}
          {fit === 'blur' && <img className="tv-media tv-media-bg" src={src} alt="" aria-hidden />}
          <img className={`tv-media fit-${fit}`} style={adj} src={src} alt="" onError={next} />
        </div>
      ) : (
        // Vídeo com fundo desfocado tocaria dois vídeos ao mesmo tempo (pesado na TV box): mostra inteiro.
        <Video key={cur.n} src={src} fit={fit === 'blur' ? 'contain' : fit} style={adj} loop={!!cur.pinned} muted={cur.item.muted || volume <= 0} volume={volume} onEnded={next} />
      )}
    </div>
  );
}

/** Aplicativo na tela (relógio, clima, notícias, preços…). */
export function AppItem({ item, cache }) {
  const data = useAppData(item.app);
  useTimerBeeps(item.app, data.data);
  // Foto da peça do Estúdio: a cópia baixada no aparelho, se já tiver.
  const imageSrc = item.app.image ? cache.src(item.app.image) : null;
  return (
    <div className="tv-media-wrap tv-app">
      <AppView app={item.app} weather={data.weather} feed={data.feed} table={data.table} data={data.data} comments={data.comments} imageSrc={imageSrc} status={data.status} />
    </div>
  );
}

function Video({ src, fit, muted, style, loop, onEnded, volume = 1 }) {
  const ref = useRef(null);
  // Volume por horário (Empresa › Horário de funcionamento).
  useEffect(() => { if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume)); }, [volume]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !!muted;
    v.play().catch(() => {
      // Navegador sem permissão de áudio automático: toca mudo.
      v.muted = true;
      v.play().catch(onEnded);
    });
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  return <video ref={ref} className={`tv-media fit-${fit || 'cover'}`} style={style} loop={loop} src={src} playsInline preload="auto" onEnded={onEnded} onError={onEnded} />;
}

let counter = 0;
/** Item fixado pelo painel (ajuste ao vivo), se ainda valer. */
function pinnedItem(manifest) {
  const pin = manifest?.screen?.pin;
  if (!pin || pin.until < Date.now()) return null;
  const all = [...(manifest.slots || []).flatMap((s) => s.items), ...(manifest.fallback || [])];
  return all.find((it) => it.mediaId === pin.mediaId) || null;
}
/** Próximo item: continua a sequência se a faixa é a mesma; recomeça se mudou. */
function pick(manifest, cur) {
  const r = resolveNow(manifest, new Date());
  if (!r.items.length) return null;
  let i = 0;
  if (cur && cur.slotId === r.slotId) {
    const at = r.items.findIndex((it) => it.key === cur.item.key);
    i = at >= 0 ? (at + 1) % r.items.length : 0;
  }
  return { item: r.items[i], slotId: r.slotId, n: ++counter };
}
function peek(manifest, cur) {
  const r = resolveNow(manifest, new Date());
  if (!r.items.length) return null;
  const at = r.items.findIndex((it) => it.key === cur.item.key);
  return r.items[(at + 1) % r.items.length];
}

/** Cronômetro: bipe curto nos 3 últimos segundos de cada fase e bipe longo na troca. */
function useTimerBeeps(app, data) {
  const last = useRef({ phase: null, sec: null });
  useEffect(() => {
    if (app?.kind !== 'timer' || app.config?.beeps === false) return undefined;
    const t = setInterval(() => {
      const el = data?.demoElapsed != null ? null : timerElapsed(app.config, data?.state || {}, Date.now() + clockOffset());
      const st = timerAt(app.config, el);
      const prev = last.current;
      if (prev.phase && st.phase !== prev.phase && st.phase !== 'idle') beep(true);
      else if ((st.phase === 'work' || st.phase === 'rest' || st.phase === 'prep') && /^00:0[1-3]$|^[1-3]$/.test(st.display) && st.display !== prev.sec) beep(false);
      last.current = { phase: st.phase, sec: st.display };
    }, 250);
    return () => clearInterval(t);
  }, [app, data]);
}
