// Video wall: esta TV mostra só o seu pedaço da imagem.
// O que tocar sai do relógio (hora do servidor), igual em todas as TVs do wall:
// não precisa de uma TV "mestre" nem de rede entre elas.
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveNow, wallPosition, wallCrop } from '@vertice/shared';
import { AppItem } from './Playback.jsx';

export function WallPlayback({ manifest, cache, cacheVersion, clockOffset = 0, onNowPlaying, onPlayed, onEmpty }) {
  const wall = manifest.wall;
  const [, setTick] = useState(0);
  const offsetRef = useRef(clockOffset);
  offsetRef.current = clockOffset;
  const now = () => Date.now() + (offsetRef.current || 0);

  // Itens válidos agora (validade de/até continua valendo no wall).
  const items = resolveNow(manifest, new Date(now()))?.items || [];
  const pos = wallPosition(items, now());
  const key = pos ? `${pos.round}:${pos.index}:${pos.item.key}` : 'none';

  useEffect(() => { onEmpty?.(!pos); }, [!pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Acorda na troca do próximo item (e de 30 em 30 s, caso a playlist/validade mude).
  useEffect(() => {
    const ms = pos ? Math.max(50, Math.min(30_000, pos.remaining * 1000)) : 30_000;
    const t = setTimeout(() => setTick((x) => x + 1), ms);
    return () => clearTimeout(t);
  }, [key, cacheVersion, manifest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Avisa o painel o que está passando e conta a exibição (Relatórios) quando ela termina.
  useEffect(() => {
    if (!pos) return undefined;
    onNowPlaying?.(pos.item);
    const started = Date.now();
    const item = pos.item;
    return () => onPlayed?.(item, (Date.now() - started) / 1000);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const crop = useMemo(() => wallCrop(wall), [wall.rows, wall.cols, wall.row, wall.col, wall.bezel]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pos) return null;
  const it = pos.item;
  // Som só na TV do canto de cima à esquerda (senão o mesmo áudio sai de todas, com eco).
  const leader = wall.row === 0 && wall.col === 0;
  return (
    <div className="tv-play tv-wall">
      <div className="tv-wall-canvas" style={crop}>
        {it.type === 'app' ? (
          <AppItem key={key} item={it} cache={cache} />
        ) : it.type === 'video' ? (
          <WallVideo key={key} src={cache.src(it)} startAt={pos.offset} muted={!leader || it.muted !== false} fit={it.fit || 'cover'} />
        ) : (
          <img key={key} className={`tv-media fit-${it.fit || 'cover'}`} src={cache.src(it)} alt="" />
        )}
      </div>
    </div>
  );
}

/** Vídeo que começa no segundo em que o wall está (entrou atrasado? pula para o ponto certo). */
function WallVideo({ src, startAt, muted, fit }) {
  const ref = useRef(null);
  const t0 = useRef(Date.now());
  return (
    <video
      ref={ref}
      className={`tv-media fit-${fit}`}
      src={src}
      autoPlay
      muted={muted}
      playsInline
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        const at = startAt + (Date.now() - t0.current) / 1000;
        if (at > 0.3 && at < (v.duration || Infinity)) v.currentTime = at;
      }}
    />
  );
}
