import { useMemo, useState } from 'react';
import { DEFAULT_IMAGE_SECONDS, FIT_MODES, formatBytes, formatDateTime, formatDuration } from '@vertice/shared';
import { Modal, Button, Input, Select, Toggle, Field } from '../ui/kit.jsx';

const KEEP = '__keep';
const FIT_LABEL = { '': 'Padrão de cada tela', cover: 'Preencher (corta as bordas)', contain: 'Mostrar inteira (com faixas)', blur: 'Inteira com fundo desfocado', fill: 'Esticar' };

/** Valor comum a todas as mídias, ou KEEP quando há valores diferentes. */
function common(list, get) {
  const vals = [...new Set(list.map(get))];
  return vals.length === 1 ? vals[0] : KEEP;
}

/**
 * Ajustes de uma mídia ou de várias de uma vez.
 * Em lote, cada campo começa em "manter como está" e só o que você mudar é gravado.
 */
export function MediaSettings({ items, onClose, onSave, readOnly }) {
  const single = items.length === 1 ? items[0] : null;
  const images = items.filter((m) => m.type === 'image');
  const videos = items.filter((m) => m.type === 'video');
  const initial = useMemo(() => ({
    name: single?.name || '',
    duration: images.length ? common(images, (m) => String(m.defaultDurationSec || '')) : KEEP,
    fit: common(items, (m) => m.fit || ''),
    muted: videos.length ? common(videos, (m) => (m.muted ? 'mute' : 'sound')) : KEEP,
    validFrom: common(items, (m) => m.validFrom || ''),
    validTo: common(items, (m) => m.validTo || ''),
  }), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(initial);
  const [applyToPlaylists, setApplyToPlaylists] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const changed = (k) => f[k] !== initial[k] && f[k] !== KEEP;
  const dirty = ['name', 'duration', 'fit', 'muted', 'validFrom', 'validTo'].some(changed);

  const save = async () => {
    setErr('');
    if (f.validFrom && f.validTo && f.validFrom !== KEEP && f.validTo !== KEEP && f.validFrom > f.validTo) {
      setErr('A data final vem antes da inicial.');
      return;
    }
    const dur = f.duration === '' ? null : Number(f.duration);
    if (changed('duration') && dur !== null && (!Number.isFinite(dur) || dur < 2 || dur > 600)) {
      setErr('A duração vai de 2 a 600 segundos.');
      return;
    }
    const patchFor = (m) => {
      const p = {};
      if (single && changed('name') && f.name.trim()) p.name = f.name.trim();
      if (changed('duration') && m.type === 'image') p.defaultDurationSec = dur;
      if (changed('fit')) p.fit = f.fit || null;
      if (changed('muted') && m.type === 'video') p.muted = f.muted === 'mute';
      if (changed('validFrom')) p.validFrom = f.validFrom || null;
      if (changed('validTo')) p.validTo = f.validTo || null;
      return p;
    };
    setBusy(true);
    try {
      await onSave(items.map((m) => ({ id: m.id, patch: patchFor(m) })).filter((x) => Object.keys(x.patch).length), {
        clearPlaylistDurations: changed('duration') && applyToPlaylists ? images.map((m) => m.id) : [],
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = single ? single.name : `Ajustar ${items.length} mídias`;
  const subtitle = single
    ? `${single.type === 'video' ? `Vídeo · ${formatDuration(single.durationSec)}` : 'Imagem'} · ${single.width}×${single.height} · ${formatBytes(single.sizeBytes)} · enviada ${formatDateTime(single.createdAt)}`
    : `${images.length} ${images.length === 1 ? 'imagem' : 'imagens'} · ${videos.length} ${videos.length === 1 ? 'vídeo' : 'vídeos'}. Só o que você mudar é aplicado.`;
  const keepOpt = { value: KEEP, label: '— Manter como está (valores diferentes) —' };
  const fitPreview = f.fit === KEEP ? null : f.fit;

  return (
    <Modal open onClose={onClose} width={single ? 920 : 620} icon="image" title={title} subtitle={subtitle}
      footer={readOnly ? <Button onClick={onClose}>Fechar</Button> : (
        <><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>{single ? 'Salvar ajustes' : `Aplicar em ${items.length} mídias`}</Button></>
      )}>
      <div className={single ? 'vx-mset vx-mset-single' : 'vx-mset'}>
        {single && (
          <div className="vx-mset-preview">
            {single.type === 'video'
              ? <video className="vx-preview-media" src={single.url} poster={single.thumbUrl || undefined} controls muted />
              : <img className="vx-preview-media" src={single.url} alt={single.name} />}
            <span className="vx-overline">COMO FICA NA TV</span>
            <div className="vx-fitprev-row">
              <FitPreview media={single} fit={fitPreview} portrait={false} />
              <FitPreview media={single} fit={fitPreview} portrait />
            </div>
            <span className="vx-help">{fitPreview === '' ? 'Usando o padrão de cada tela (na prévia: preencher).' : 'Prévia com o preenchimento escolhido.'}</span>
          </div>
        )}
        <fieldset className="vx-form" disabled={readOnly}>
          {single && <Input label="Nome" value={f.name} onChange={(e) => set({ name: e.target.value })} />}
          {images.length > 0 && (
            <Field label={`Tempo na tela${single ? '' : ` (${images.length} ${images.length === 1 ? 'imagem' : 'imagens'})`}`}
              help={`Em segundos. Vazio = ${DEFAULT_IMAGE_SECONDS} s. Uma playlist pode definir um tempo próprio para o item.`}>
              <input className="vx-input" type="number" min={2} max={600} placeholder={f.duration === KEEP ? 'Valores diferentes' : String(DEFAULT_IMAGE_SECONDS)}
                value={f.duration === KEEP ? '' : f.duration} onChange={(e) => set({ duration: e.target.value })} />
            </Field>
          )}
          {images.length > 0 && changed('duration') && (
            <Toggle label="Usar este tempo também nas playlists" checked={applyToPlaylists} onChange={setApplyToPlaylists}
              help="Tira o tempo que cada playlist definiu para estas imagens." />
          )}
          <Select label="Preenchimento" value={f.fit} onChange={(e) => set({ fit: e.target.value })}
            help="Como a mídia ocupa a tela quando a proporção é diferente (ex.: imagem vertical em TV horizontal)."
            options={[...(f.fit === KEEP ? [keepOpt] : []), ...Object.keys({ '': 1, ...FIT_MODES }).map((k) => ({ value: k, label: FIT_LABEL[k] }))]} />
          {videos.length > 0 && (
            <Select label={`Som${single ? '' : ` (${videos.length} ${videos.length === 1 ? 'vídeo' : 'vídeos'})`}`} value={f.muted} onChange={(e) => set({ muted: e.target.value })}
              options={[...(f.muted === KEEP ? [keepOpt] : []), { value: 'sound', label: 'Com som' }, { value: 'mute', label: 'Sem som' }]} />
          )}
          <div className="vx-form-row">
            <DateField label="Exibir a partir de" value={f.validFrom} onChange={(validFrom) => set({ validFrom })} />
            <DateField label="Exibir até" value={f.validTo} onChange={(validTo) => set({ validTo })} />
          </div>
          <p className="vx-help">Fora dessas datas a mídia sai das TVs sozinha, em todas as playlists. Vazio = sem limite.</p>
          {err && <div className="vx-alert vx-alert-offline">{err}</div>}
        </fieldset>
      </div>
    </Modal>
  );
}

function DateField({ label, value, onChange }) {
  const mixed = value === KEEP;
  return (
    <Field label={label} help={mixed ? 'Valores diferentes: escolha uma data para todas.' : undefined}>
      <div className="vx-row vx-row-tight">
        <input className="vx-input" type="date" value={mixed ? '' : value} onChange={(e) => onChange(e.target.value)} />
        {!mixed && value && <button type="button" className="vx-link-btn" onClick={() => onChange('')}>Limpar</button>}
      </div>
    </Field>
  );
}

/** Mini TV (horizontal ou vertical) mostrando a mídia com o preenchimento escolhido. */
function FitPreview({ media, fit, portrait }) {
  const src = media.type === 'video' ? media.thumbUrl : media.url;
  const mode = fit || 'cover';
  const objectFit = mode === 'blur' ? 'contain' : mode;
  return (
    <div className={`vx-fitprev ${portrait ? 'is-portrait' : ''}`} title={portrait ? 'TV vertical' : 'TV horizontal'}>
      {src && mode === 'blur' && media.type === 'image' && <img className="vx-fitprev-bg" src={src} alt="" />}
      {src ? <img className="vx-fitprev-img" src={src} alt="" style={{ objectFit: media.type === 'video' && mode === 'blur' ? 'contain' : objectFit }} /> : null}
    </div>
  );
}
