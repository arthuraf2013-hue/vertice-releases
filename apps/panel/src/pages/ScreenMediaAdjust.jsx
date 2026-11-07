import { useEffect, useMemo, useRef, useState } from 'react';
import { FIT_MODES, MEDIA_ADJUST_LIMITS, PIN_MS, mediaAdjust } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useDoc } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import { Modal, Button, Select, MediaThumb, useToast } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const FIT_LABEL = { cover: 'Preencher (corta as bordas)', contain: 'Mostrar inteira (com faixas)', blur: 'Inteira com fundo desfocado', fill: 'Esticar' };
const NEUTRAL = { fit: '', zoom: 100, offsetX: 0, offsetY: 0 };

/**
 * "Ajustes por mídia nesta tela": lista as mídias da programação desta tela e permite
 * mudar preenchimento, tamanho e posição de cada uma só aqui.
 */
export function ScreenMediaList({ screen, mediaById, display, readOnly }) {
  const { base } = useSession();
  const manifest = useDoc(`${base}/manifests/${screen.id}`);
  const [overrides, setOverrides] = useState(() => screen.mediaOverrides || {});
  const [editing, setEditing] = useState(null);

  const items = useMemo(() => {
    if (!manifest) return [];
    const all = [...(manifest.slots || []).flatMap((s) => s.items || []), ...(manifest.fallback || [])];
    return [...new Map(all.map((it) => [it.mediaId, it])).values()];
  }, [manifest]);

  if (manifest === undefined) return null;
  return (
    <>
      {items.length ? (
        <div className="vx-madj-grid">
          {items.map((it) => {
            const m = mediaById.get(it.mediaId) || { id: it.mediaId, name: it.name, type: it.type, url: it.url };
            const on = !!mediaAdjust(overrides[it.mediaId]);
            return (
              <button key={it.mediaId} type="button" className={`vx-madj-item ${on ? 'is-on' : ''}`} onClick={() => setEditing(m)} disabled={readOnly}>
                <MediaThumb media={m} />
                <span className="vx-madj-name" title={m.name}>{m.name}</span>
                <span className={`vx-madj-tag ${on ? 'is-on' : ''}`}>{on ? 'Ajustada nesta tela' : 'Padrão'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="vx-help">Esta tela ainda não tem mídias na programação. Publique uma grade para ela em Programação.</p>
      )}
      {editing && (
        <MediaAdjustModal screen={screen} media={editing} display={display} overrides={overrides}
          onSaved={setOverrides} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function MediaAdjustModal({ screen, media, display, overrides, onSaved, onClose }) {
  const { base, companyId } = useSession();
  const toast = useToast();
  const [a, setA] = useState(() => ({ ...NEUTRAL, ...(overrides[media.id] || {}), fit: overrides[media.id]?.fit || '' }));
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = useRef(null);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

  const nextOverrides = (adj) => {
    const n = { ...overrides };
    const clean = mediaAdjust(adj);
    if (clean) n[media.id] = { fit: clean.fit, zoom: clean.zoom, offsetX: clean.offsetX, offsetY: clean.offsetY };
    else delete n[media.id];
    return n;
  };
  const write = async (adj, extra = {}) => {
    const mediaOverrides = nextOverrides(adj);
    await api.update(`${base}/screens/${screen.id}`, { mediaOverrides, ...extra });
    await rebuildManifests(companyId, [screen.id]);
    return mediaOverrides;
  };

  const change = (patch) => {
    const adj = { ...a, ...patch };
    setA(adj);
    if (!pinnedRef.current) return;
    clearTimeout(live.current);
    live.current = setTimeout(() => write(adj).catch((e) => toast(e.message, 'offline')), 600);
  };

  const togglePin = async () => {
    setBusy(true);
    try {
      const on = !pinned;
      await write(a, { pin: on ? { mediaId: media.id, until: Date.now() + PIN_MS } : null });
      setPinned(on);
      if (on) toast('A TV vai ficar nesta mídia enquanto você ajusta.');
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    clearTimeout(live.current);
    try {
      const n = await write(a, { pin: null });
      onSaved(n);
      toast(mediaAdjust(a) ? 'Ajuste salvo para esta tela.' : 'Esta mídia voltou ao padrão nesta tela.');
      onClose();
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setBusy(false);
    }
  };
  // Fechou sem salvar: solta a TV e desfaz o que foi mandado ao vivo.
  const cancel = async () => {
    clearTimeout(live.current);
    if (pinned) await write(overrides[media.id] || NEUTRAL, { pin: null }).catch(() => {});
    onClose();
  };
  useEffect(() => () => clearTimeout(live.current), []);

  const portrait = display.rotation === 90 || display.rotation === 270;
  const fit = a.fit || media.fit || display.fit || 'cover';
  const src = media.type === 'video' ? media.thumbUrl || media.url : media.url;
  const isNeutral = !mediaAdjust(a);

  return (
    <Modal open onClose={cancel} width={900} icon="image" title={`Ajustar nesta tela · ${media.name}`}
      subtitle={`${screen.name} (${screen.code}). O ajuste vale só para esta TV.`}
      footer={(
        <>
          <Button variant="ghost" onClick={() => change(NEUTRAL)} disabled={isNeutral} className="vx-mr-auto">Voltar ao padrão</Button>
          <Button onClick={cancel}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy}>Salvar ajuste</Button>
        </>
      )}>
      <div className="vx-madj">
        <div className="vx-madj-stage">
          <div className={`vx-madj-tv ${portrait ? 'is-portrait' : ''}`}>
            {fit === 'blur' && media.type === 'image' && <img className="vx-madj-bg" src={src} alt="" />}
            {src && media.type === 'video' && !media.thumbUrl
              ? <video className="vx-madj-media" src={src} muted style={mediaStyle(fit, a)} />
              : <img className="vx-madj-media" src={src} alt="" style={mediaStyle(fit, a)} />}
          </div>
          <span className="vx-help vx-center">Prévia na {portrait ? 'TV vertical' : 'TV horizontal'} desta tela</span>
        </div>
        <div className="vx-form">
          <Select label="Preenchimento nesta tela" value={a.fit} onChange={(e) => change({ fit: e.target.value })}
            options={[{ value: '', label: `Padrão (${FIT_LABEL[media.fit || display.fit || 'cover'].split(' (')[0].toLowerCase()})` }, ...Object.keys(FIT_MODES).map((k) => ({ value: k, label: FIT_LABEL[k] }))]} />
          <AdjustSlider label="Tamanho" value={a.zoom} min={MEDIA_ADJUST_LIMITS.zoom[0]} max={MEDIA_ADJUST_LIMITS.zoom[1]} step={1} onChange={(zoom) => change({ zoom })} />
          <AdjustSlider label="Horizontal" value={a.offsetX} min={MEDIA_ADJUST_LIMITS.offset[0]} max={MEDIA_ADJUST_LIMITS.offset[1]} step={0.5} signed onChange={(offsetX) => change({ offsetX })} />
          <AdjustSlider label="Vertical" value={a.offsetY} min={MEDIA_ADJUST_LIMITS.offset[0]} max={MEDIA_ADJUST_LIMITS.offset[1]} step={0.5} signed onChange={(offsetY) => change({ offsetY })} />
          <div className={`vx-calib-box ${pinned ? 'is-on' : ''}`}>
            <b><Icon name="screen" />Ver na TV enquanto ajusta</b>
            <span className="vx-help">
              {pinned
                ? 'A TV está parada nesta mídia e mostra cada mudança em poucos segundos. Ao salvar ou cancelar, ela volta para a programação.'
                : 'Fixa esta mídia na TV por até 5 minutos para você acertar olhando a tela.'}
            </span>
            <Button size="sm" variant={pinned ? 'secondary' : 'primary'} loading={busy} onClick={togglePin}>{pinned ? 'Soltar a TV' : 'Fixar na TV'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function mediaStyle(fit, a) {
  return {
    objectFit: fit === 'blur' ? 'contain' : fit,
    transform: `translate(${a.offsetX}%, ${a.offsetY}%) scale(${a.zoom / 100})`,
  };
}

function AdjustSlider({ label, value, min, max, step, onChange, signed }) {
  const fmt = (v) => `${signed && v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`;
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="vx-slider">
      <span className="vx-slider-label">{label}</span>
      <button type="button" className="vx-slider-step" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <button type="button" className="vx-slider-step" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
      <span className="vx-slider-value vx-num">{fmt(value)}</span>
    </div>
  );
}
