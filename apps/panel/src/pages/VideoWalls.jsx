import { useMemo, useState } from 'react';
import { WALL_LIMITS, normalizeWall, wallCrop, screenStatus, totalDuration, expandPlaylist, formatDuration } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useById, useNow } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, Loading, EmptyState, useToast, useConfirm, Modal, Input, Select, Toggle, ScreenStatus,
} from '../ui/kit.jsx';
import { Slider } from './ScreenDisplay.jsx';
import { Icon } from '../ui/Icon.jsx';

/** Primeira imagem da playlist (para a prévia do recorte). */
function firstImage(playlist, mediaById) {
  for (const it of playlist?.items || []) {
    const m = mediaById.get(it.mediaId);
    if (m?.type === 'image' && m.url) return m.url;
    if (m?.type === 'video' && m.thumbUrl) return m.thumbUrl;
  }
  return null;
}

/** Desenho da grade: cada TV com o seu pedaço da imagem e o nome da tela. */
function WallPreview({ wall, screenById, image, now }) {
  const w = normalizeWall(wall);
  const gap = Math.max(4, w.bezel * 2);
  return (
    <div className="vx-wall-grid" style={{ gridTemplateColumns: `repeat(${w.cols}, 1fr)`, gap }}>
      {w.cells.map((sid, i) => {
        const row = Math.floor(i / w.cols);
        const col = i % w.cols;
        const s = sid ? screenById.get(sid) : null;
        const crop = wallCrop({ ...w, row, col });
        return (
          <div key={i} className={`vx-wall-cell ${s ? '' : 'is-empty'}`}>
            {image && s && <img src={image} alt="" style={{ position: 'absolute', ...crop, objectFit: 'cover' }} />}
            <span className="vx-wall-cell-label">
              {s ? <><b>{s.name}</b><ScreenStatus screen={s} now={now} /></> : <span className="vx-faint">Vazio</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Video wall: várias TVs formando uma imagem só. Cada TV do wall mostra o seu pedaço da
 * playlist do wall, e todas trocam juntas pelo relógio do servidor.
 */
export function VideoWalls() {
  const { base, companyId, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const now = useNow();
  const walls = useCol(`${base}/videowalls`, { orderBy: ['name', 'asc'] });
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const playlists = useCol(`${base}/playlists`, { orderBy: ['name', 'asc'] });
  const media = useCol(`${base}/media`);
  const screenById = useById(screens);
  const playlistById = useById(playlists);
  const mediaById = useById(media);
  const [edit, setEdit] = useState(null);

  if (!walls || !screens || !playlists || !media) return <Loading />;

  const save = async (w) => {
    const n = normalizeWall(w);
    const data = { name: n.name.trim() || 'Video wall', rows: n.rows, cols: n.cols, cells: n.cells, bezel: n.bezel, playlistId: n.playlistId || '', active: n.active, updatedAt: api.NOW };
    if (w.id) await api.update(`${base}/videowalls/${w.id}`, data);
    else await api.add(`${base}/videowalls`, { ...data, createdAt: api.NOW });
    const k = await rebuildManifests(companyId);
    setEdit(null);
    toast(`Video wall salvo. ${k} ${k === 1 ? 'tela atualizada' : 'telas atualizadas'}.`);
  };

  const remove = async (w) => {
    const ok = await confirm({ title: `Excluir "${w.name}"?`, danger: true, confirmLabel: 'Excluir', message: 'As telas voltam para a programação delas.' });
    if (!ok) return;
    await api.remove(`${base}/videowalls/${w.id}`);
    await rebuildManifests(companyId);
    toast('Video wall excluído. As telas voltaram para a programação delas.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Video wall" subtitle="Junte várias TVs numa imagem só. Cada TV mostra o seu pedaço, e todas trocam juntas."
        actions={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ name: 'Vitrine', rows: 1, cols: 2, cells: [], bezel: 1, playlistId: playlists[0]?.id || '', active: true })}>Novo video wall</Button>} />

      {walls.length ? (
        <div className="vx-walls">
          {walls.map((w) => {
            const n = normalizeWall(w);
            const pl = playlistById.get(w.playlistId);
            const dur = pl ? totalDuration(expandPlaylist(pl, mediaById)) : 0;
            const filled = n.cells.filter(Boolean);
            const offline = filled.filter((id) => screenStatus(screenById.get(id) || {}, now).key === 'offline').length;
            return (
              <Card key={w.id} title={w.name} icon="wall" className="vx-wall-card"
                actions={can('editor') && (
                  <div className="vx-row-actions">
                    <Button size="sm" icon="edit" onClick={() => setEdit({ ...w })}>Editar</Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(w)} aria-label={`Excluir ${w.name}`} />
                  </div>
                )}>
                <WallPreview wall={w} screenById={screenById} image={firstImage(pl, mediaById)} now={now} />
                <div className="vx-wall-meta">
                  <span><Icon name="wall" /> {n.cols}×{n.rows} · {filled.length} {filled.length === 1 ? 'TV' : 'TVs'}</span>
                  <span><Icon name="playlist" /> {pl ? `${pl.name} · ${formatDuration(dur)}` : 'Sem playlist'}</span>
                  {!n.active && <span className="vx-state vx-state-idle"><i />Desligado</span>}
                  {n.active && offline > 0 && <span className="vx-state vx-state-offline"><i />{offline} offline</span>}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="wall" title="Nenhum video wall ainda" action={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ name: 'Vitrine', rows: 1, cols: 2, cells: [], bezel: 1, playlistId: playlists[0]?.id || '', active: true })}>Montar video wall</Button>}>
          Coloque 2 ou mais TVs lado a lado (ou em grade), pareie todas e monte o wall aqui. A playlist do wall aparece dividida entre elas.
        </EmptyState>
      )}

      {edit && <WallEditor value={edit} onChange={setEdit} walls={walls} screens={screens} screenById={screenById} playlists={playlists} mediaById={mediaById} now={now} onClose={() => setEdit(null)} onSave={save} />}
      {confirmDialog}
    </div>
  );
}

function WallEditor({ value, onChange, walls, screens, screenById, playlists, mediaById, now, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const w = normalizeWall(value);
  const set = (p) => onChange({ ...value, ...p });
  const resize = (rows, cols) => {
    // Mantém cada tela na mesma linha/coluna quando a grade cresce ou diminui.
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(r < w.rows && c < w.cols ? w.cells[r * w.cols + c] : null);
    set({ rows, cols, cells });
  };
  const setCell = (i, sid) => set({ cells: w.cells.map((x, j) => (j === i ? sid || null : x === sid ? null : x)) });
  const busyElsewhere = useMemo(() => {
    const m = new Map();
    for (const o of walls) if (o.id !== value.id && o.active !== false) for (const sid of o.cells || []) if (sid) m.set(sid, o.name);
    return m;
  }, [walls, value.id]);
  const pl = playlists.find((p) => p.id === w.playlistId);
  const items = pl ? expandPlaylist(pl, mediaById) : [];
  const videosNoDuration = items.filter((it) => it.type === 'video' && !it.durationSec).length;
  const filled = w.cells.filter(Boolean).length;
  const err = !w.name?.trim() ? 'Dê um nome.' : filled < 2 ? 'Escolha pelo menos 2 telas.' : !pl ? 'Escolha a playlist do wall.' : null;
  const submit = async () => { setBusy(true); try { await onSave(value); } finally { setBusy(false); } };

  return (
    <Modal open onClose={onClose} width={1000} icon="wall" title={value.id ? `Editar ${value.name}` : 'Novo video wall'}
      subtitle="As telas do wall deixam a programação delas e passam a mostrar só a playlist do wall."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} loading={busy} disabled={!!err} title={err || undefined}>Salvar video wall</Button></>}>
      <div className="vx-app-editor">
        <div className="vx-form">
          <div className="vx-form-row">
            <Input label="Nome" value={value.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
            <Select label="Playlist do wall" value={w.playlistId || ''} onChange={(e) => set({ playlistId: e.target.value })}
              options={[{ value: '', label: 'Escolher…' }, ...playlists.map((p) => ({ value: p.id, label: p.name }))]} />
          </div>
          <div className="vx-form-row">
            <Select label="Colunas (TVs lado a lado)" value={String(w.cols)} onChange={(e) => resize(w.rows, Number(e.target.value))}
              options={Array.from({ length: WALL_LIMITS.cols[1] }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
            <Select label="Linhas (TVs empilhadas)" value={String(w.rows)} onChange={(e) => resize(Number(e.target.value), w.cols)}
              options={Array.from({ length: WALL_LIMITS.rows[1] }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
          </div>
          <div className="vx-field">
            <span className="vx-label">Qual TV fica em cada posição (olhando de frente)</span>
            <div className="vx-wall-cells" style={{ gridTemplateColumns: `repeat(${w.cols}, 1fr)` }}>
              {w.cells.map((sid, i) => (
                <select key={i} className="vx-input vx-select" value={sid || ''} onChange={(e) => setCell(i, e.target.value)} aria-label={`Linha ${Math.floor(i / w.cols) + 1}, coluna ${(i % w.cols) + 1}`}>
                  <option value="">— vazio —</option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id} disabled={busyElsewhere.has(s.id)}>
                      {s.name} ({s.code}){busyElsewhere.has(s.id) ? ` · no wall ${busyElsewhere.get(s.id)}` : ''}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
          <div className="vx-field">
            <Slider label="Moldura entre as TVs" value={w.bezel} min={WALL_LIMITS.bezel[0]} max={WALL_LIMITS.bezel[1]} step={0.5} unit="%" onChange={(v) => set({ bezel: v })} />
            <span className="vx-help">Compensa a borda das TVs: a imagem "passa por trás" da moldura e as linhas retas continuam retas.</span>
          </div>
          <Toggle label="Wall ligado" help="Desligado, as TVs voltam para a programação delas sem perder a montagem." checked={w.active} onChange={(v) => set({ active: v })} />
          {videosNoDuration > 0 && <p className="vx-help vx-help-warn"><Icon name="alert" />{videosNoDuration} vídeo(s) sem duração conhecida contam 30 s. Defina o tempo na playlist para a troca sair certinha.</p>}
          <p className="vx-help">Dica: use mídias feitas para o tamanho do wall inteiro ({w.cols * 1920}×{w.rows * 1080} px para TVs Full HD deitadas). O som sai só da TV do canto de cima à esquerda.</p>
          {err && <p className="vx-help vx-help-warn"><Icon name="alert" />{err}</p>}
        </div>
        <div className="vx-app-preview">
          <div className="vx-section-head"><span className="vx-label">Como fica</span></div>
          <WallPreview wall={value} screenById={screenById} image={firstImage(pl, mediaById)} now={now} />
          <p className="vx-help">{filled} de {w.rows * w.cols} posições com TV · playlist de {formatDuration(totalDuration(items))}</p>
        </div>
      </div>
    </Modal>
  );
}
