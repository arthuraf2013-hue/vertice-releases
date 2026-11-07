import { useEffect, useMemo, useRef, useState } from 'react';
import { ORDER_BOARD_DEFAULTS, screenDisplay, ROTATIONS } from '@vertice/shared';
import { createDevice } from './services/device.js';
import { hasFirebase } from './services/firebase.js';
import { SystemScreen } from './ui/SystemScreen.jsx';
import { Playback } from './ui/Playback.jsx';
import { OrderOverlay, OrderSidebar, OrderBoard, useReadyAnnouncer, chaveDoPronto } from './ui/Orders.jsx';
import { OperatorMenu } from './ui/OperatorMenu.jsx';
import { createUpdater } from './services/updater.js';
import { startRemote } from './services/remote.js';
import { demoState, demoReady } from './demo.js';

export function App() {
  const demo = new URLSearchParams(location.search).get('demo') || (!hasFirebase ? 'pairing' : null);
  return demo ? <Demo kind={demo} /> : <Live />;
}

function Demo({ kind }) {
  const [state, setState] = useState(() => demoState(kind));
  useEffect(() => {
    if (!state.addLater) return;
    const t = setTimeout(() => setState((s) => ({ ...s, orders: [...s.orders, demoReady] })), 1000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Screen state={state} device={null} />;
}

function Live() {
  const [state, setState] = useState(null);
  const deviceRef = useRef(null);
  const [svc, setSvc] = useState({});
  const [signals, setSignals] = useState({ open: 0, identify: 0 });
  useEffect(() => {
    const d = createDevice(setState);
    deviceRef.current = d;
    setState(d.getState());
    d.start();
    // Atualização automática e comandos do painel (Recarregar, Reiniciar, Ver tela, Diagnóstico…).
    const updater = createUpdater();
    updater.start();
    const remote = startRemote({
      device: d,
      updater,
      ui: {
        identify: () => setSignals((x) => ({ ...x, identify: x.identify + 1 })),
        openMenu: () => setSignals((x) => ({ ...x, open: x.open + 1 })),
      },
    });
    setSvc({ updater, remote });
  }, []);
  if (!state) return null;
  return <Screen state={state} device={deviceRef.current} updater={svc.updater} remote={svc.remote} signals={signals} />;
}

function Screen({ state, device, updater, remote, signals }) {
  const { phase, manifest, network } = state;
  const cache = device?.cache || state.cache;
  const [empty, setEmpty] = useState(false);
  const config = useMemo(() => ({ ...ORDER_BOARD_DEFAULTS, ...(manifest?.orderBoard || {}) }), [manifest]);
  const { board, queue, shift, latestId } = useReadyAnnouncer(state.orders || [], config, manifest?.screen?.unitId);
  const display = useMemo(() => screenDisplay(manifest?.screen || {}), [manifest]);
  const geo = useGeometry(display);
  const calibrating = useUntil(manifest?.screen?.calibrateUntil);

  let body;
  if (phase === 'boot') body = <SystemScreen variant="boot" network={network} />;
  else if (phase === 'error' && !manifest) body = <SystemScreen variant="offline" network={network} />;
  else if (phase === 'pairing') body = <SystemScreen variant="pairing" code={state.code} codeExpiresAt={state.codeExpiresAt} network={network} />;
  else if (!manifest) body = <SystemScreen variant={network?.online === false ? 'offline' : 'boot'} network={network} />;
  else if (config.mode === 'full') {
    body = <OrderBoard board={board} config={config} latestId={latestId} companyName={manifest.company?.name} />;
  } else {
    const firstSync = state.sync?.status === 'syncing' && state.sync.done === 0 && network?.online === false;
    const content = (
      <>
        <Playback manifest={manifest} cache={cache} cacheVersion={state.cacheVersion} onNowPlaying={(it) => device?.setNowPlaying(it)} onEmpty={setEmpty} />
        {empty && <SystemScreen variant={firstSync ? 'syncing' : 'empty'} network={network} screenCode={manifest.screen?.code} companyName={manifest.company?.name} />}
      </>
    );
    body = config.mode === 'sidebar' ? (
      <div className="tv tv-split"><div className="tv-split-media">{content}</div><OrderSidebar board={board} config={config} latestId={latestId} /></div>
    ) : (
      <div className="tv">{content}</div>
    );
  }

  return (
    <div className="tv-root" style={geo.root}>
      <div className="tv-stage" style={geo.stage}>
        {body}
        {config.mode === 'overlay' && queue[0] && <OrderOverlay key={chaveDoPronto(queue[0])} order={queue[0]} config={config} onDone={shift} />}
        {calibrating && <Calibration display={display} screen={manifest?.screen} />}
      </div>
      <OperatorMenu state={state} updater={updater} remote={remote} openSignal={signals?.open} identifySignal={signals?.identify} />
    </div>
  );
}

/**
 * Gira e posiciona o conteúdo conforme o painel.
 * A TV Box quase sempre manda sinal horizontal; numa TV pendurada na vertical o player
 * gira o conteúdo 90° ou 270° (depende de que lado ficou o botão da TV).
 */
function useGeometry(display) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return useMemo(() => {
    const { w, h } = size;
    const r = display.rotation;
    const portrait = r === 90 || r === 270;
    const lw = portrait ? h : w;
    const lh = portrait ? w : h;
    const u = portrait ? Math.min(lw / 1080, lh / 1920) : Math.min(lw / 1920, lh / 1080);
    const rot = {
      0: 'none',
      90: 'rotate(90deg) translateY(-100%)',
      180: 'rotate(180deg) translate(-100%, -100%)',
      270: 'rotate(-90deg) translateX(-100%)',
    }[r];
    const z = display.zoom / 100;
    const moved = display.offsetX || display.offsetY || z !== 1;
    return {
      root: { width: lw, height: lh, transform: rot, '--u': `${u}px` },
      stage: moved ? { transform: `translate(${display.offsetX}%, ${display.offsetY}%) scale(${z})` } : undefined,
    };
  }, [size, display]);
}

/** true enquanto Date.now() < until (confere a cada 5 s). */
function useUntil(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until || until < Date.now()) return undefined;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [until]);
  return !!until && until > now;
}

/** Grade para acertar a posição olhando a TV: bordas, área segura, centro e "topo". */
function Calibration({ display, screen }) {
  return (
    <div className="tv-calib" aria-hidden>
      <div className="tv-calib-grid" />
      <div className="tv-calib-safe" />
      <div className="tv-calib-edge" />
      {['tl', 'tr', 'bl', 'br'].map((c) => <i key={c} className={`tv-calib-corner ${c}`} />)}
      <div className="tv-calib-cross" />
      <div className="tv-calib-top"><i />TOPO</div>
      <div className="tv-calib-info">
        <b>Ajuste de posição · {screen?.code || ''}</b>
        <span>{ROTATIONS[display.rotation]} · zoom {display.zoom}% · deslocamento {display.offsetX}% / {display.offsetY}%</span>
        <span>As bordas douradas devem encostar nos cantos da TV.</span>
      </div>
    </div>
  );
}
