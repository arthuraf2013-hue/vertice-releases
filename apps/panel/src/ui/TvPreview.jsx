import { useEffect, useState } from 'react';
import {
  APP_SOURCES, sampleQueue, sampleTally, samplePhotos, sampleComments, isOpen, alertFor, pollOptions,
} from '@vertice/shared';
import { AppView, LayoutGrid, ClosedScreen, AlertScreen } from '@vertice/shared/apps';

/**
 * A TV desenhada no painel: layout em zonas, barra inferior, expediente e alerta, tocando os
 * itens de verdade (imagens e vídeos pelo link; apps com dados de exemplo).
 * Usada no editor de layouts e no "Ver como na tela".
 *
 * @param {{ manifest: object, items: object[], at?: Date, portrait?: boolean, speed?: number, onItem?: (it) => void }} p
 *   items: o que a área principal toca (já resolvido para o horário); speed: acelera a troca (prévia).
 */
export function TvPreview({ manifest, items, at, portrait, speed = 1, onItem, mainLabel }) {
  const now = at ? at.getTime() : undefined;
  const date = at || new Date();
  const alert = alertFor(manifest?.alert, manifest?.screen?.id, date.getTime());
  const open = isOpen(manifest?.hours, date);
  const main = mainLabel ? <div className="vx-tv-placeholder"><span>{mainLabel}</span></div> : <Cycle items={items} speed={speed} onItem={onItem} now={now} />;
  let body;
  if (!open) body = <ClosedScreen hours={manifest.hours} now={now} />;
  else if (manifest?.layout) {
    body = (
      <LayoutGrid
        layout={manifest.layout}
        logoSrc={manifest.layout.bar?.logo?.url || null}
        now={now}
        main={main}
        zone={(z) => <Cycle items={manifest.layout.zones[z]} speed={speed} now={now} />}
      />
    );
  } else body = main;
  return (
    <div className={`vx-tv ${portrait ? 'is-portrait' : ''}`}>
      <div className="vx-tv-in">
        {body}
        {alert && <AlertScreen alert={alert} now={now} />}
      </div>
    </div>
  );
}

/** Passa pelos itens no tempo de cada um (dividido por `speed`). */
function Cycle({ items, speed, onItem, now }) {
  const [i, setI] = useState(0);
  const list = items || [];
  const it = list.length ? list[i % list.length] : null;
  useEffect(() => { setI(0); }, [list.length]);
  useEffect(() => {
    if (!it) return undefined;
    onItem?.(it);
    if (list.length < 2) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % list.length), Math.max(1500, ((Number(it.durationSec) || 10) * 1000) / speed));
    return () => clearTimeout(t);
  }, [i, it?.key, list.length, speed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!it) return <div className="vx-tv-empty">Nada programado</div>;
  if (it.type === 'app') return <PreviewApp app={it.app} now={now} />;
  if (it.type === 'video') return <video key={it.key} className="vx-tv-media" src={it.url} muted autoPlay loop playsInline />;
  return <img key={it.key} className={`vx-tv-media fit-${it.fit || 'cover'}`} src={it.url} alt="" />;
}

/** App com dados de exemplo (a TV busca os de verdade). */
export function PreviewApp({ app, now }) {
  const c = app.config || {};
  let data = null;
  let comments = null;
  if (APP_SOURCES[app.kind]) data = APP_SOURCES[app.kind].sample(c, Date.now());
  if (app.kind === 'queue') data = sampleQueue();
  if (app.kind === 'timer') data = { demoElapsed: 10 + 4 * 60 + 37 };
  if (app.kind === 'poll') data = { tally: sampleTally(pollOptions(c.options).length || 3) };
  if (app.kind === 'photowall') comments = samplePhotos();
  if (app.kind === 'comments') comments = sampleComments();
  return <AppView app={app} data={data} comments={comments} now={now} preview />;
}
