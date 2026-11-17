import { useMemo, useState } from 'react';
import {
  buildManifest, resolveNow, slotMatches, isOpen, volumeAt, alertFor, localISODate, formatDuration, totalDuration, LAYOUT_TEMPLATES, orientationOf, screenDisplay,
} from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { Modal, Select, Input, Toggle, Loading, Segmented, Chip, StatusBadge } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { TvPreview } from '../ui/TvPreview.jsx';

const pad = (n) => String(n).padStart(2, '0');
const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * "Ver como na tela": monta o manifesto da tela como o painel publicaria e mostra o que ela
 * exibe num dia e hora (layout, barra, expediente, alerta), sem mexer em nada.
 * Com "Incluir rascunhos", as grades ainda não publicadas entram na conta.
 */
export function ScreenSim({ screenId, onClose }) {
  const { base, company, units } = useSession();
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const schedules = useCol(`${base}/schedules`);
  const playlists = useCol(`${base}/playlists`);
  const media = useCol(`${base}/media`);
  const priceLists = useCol(`${base}/priceLists`);
  const walls = useCol(`${base}/videowalls`);
  const layouts = useCol(`${base}/layouts`);
  const d0 = new Date();
  const [sid, setSid] = useState(screenId || '');
  const [day, setDay] = useState(localISODate(d0));
  const [time, setTime] = useState(`${pad(d0.getHours())}:${pad(d0.getMinutes())}`);
  const [drafts, setDrafts] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(null);

  const ready = screens && schedules && playlists && media && priceLists && walls && layouts;
  const screen = ready ? screens.find((s) => s.id === (sid || screens[0]?.id)) : null;
  const at = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  }, [day, time]);
  const manifest = useMemo(() => {
    if (!screen) return null;
    const sched = schedules.map((s) => (drafts && s.status !== 'published' ? { ...s, status: 'published' } : s));
    return buildManifest({ screen, schedules: sched, playlists, media, company, priceLists, walls, layouts, units });
  }, [screen, schedules, playlists, media, company, priceLists, walls, layouts, units, drafts]);
  if (!ready) return <Modal open onClose={onClose} title="Ver como na tela" width={1100}><Loading /></Modal>;
  if (!screen) return <Modal open onClose={onClose} title="Ver como na tela" width={600}><p>Pareie uma tela primeiro.</p></Modal>;

  const r = resolveNow(manifest, at);
  const slot = manifest.slots.find((s) => s.id === r.slotId);
  const open = isOpen(manifest.hours, at);
  const alert = alertFor(manifest.alert, screen.id, at.getTime());
  const vol = manifest.hours ? volumeAt(manifest.hours, at) : 100;
  const daySlots = manifest.slots.filter((s) => s.days.includes(at.getDay()) || slotMatches(s, at));
  const portrait = orientationOf(screenDisplay(screen).rotation) === 'portrait';

  return (
    <Modal open onClose={onClose} width={1180} icon="eye" title="Ver como na tela" subtitle="O que a tela mostra no dia e hora escolhidos, com layout, barra, expediente e alerta. Nada é publicado.">
      <div className="vx-sim">
        <div className="vx-sim-controls">
          <Select label="Tela" value={screen.id} onChange={(e) => setSid(e.target.value)} options={screens.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))} />
          <div className="vx-form-row">
            <Input label="Dia" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            <Input label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <Toggle label="Incluir rascunhos" help="Veja a grade antes de publicar." checked={drafts} onChange={setDrafts} />
          <Segmented label="Velocidade da prévia" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={[{ value: '1', label: 'Real' }, { value: '4', label: '4×' }, { value: '10', label: '10×' }]} />
          <div className="vx-sim-facts">
            <div><Icon name="calendar" /><span>{WEEK[at.getDay()]}, {pad(at.getHours())}:{pad(at.getMinutes())}</span></div>
            <div><Icon name="playlist" /><span>{r.source === 'slot' ? <>Grade <b>{slot?.scheduleName}</b> ({slot?.start}–{slot?.end})</> : r.source === 'fallback' ? 'Playlist padrão (fora das faixas)' : 'Nada programado'}</span></div>
            <div><Icon name="layout" /><span>{manifest.wall ? 'Video wall (tela inteira)' : manifest.layout ? `${manifest.layout.name || 'Layout'} · ${LAYOUT_TEMPLATES[manifest.layout.template]?.label}${manifest.layout.bar ? ' + barra' : ''}` : 'Tela inteira, sem layout'}</span></div>
            <div><Icon name="door" /><span>{open ? 'Dentro do expediente' : 'Fora do expediente: a tela escurece'}</span></div>
            <div><Icon name="volume" /><span>Volume {vol}%</span></div>
            {alert && <div className="is-warn"><Icon name="siren" /><span>Alerta urgente por cima: <b>{alert.title}</b></span></div>}
          </div>
        </div>
        <div className="vx-sim-stage">
          <TvPreview manifest={manifest} items={r.items} at={undefined} portrait={portrait} speed={speed} onItem={setPlaying} key={`${screen.id}:${r.slotId}:${drafts}`} />
          <div className="vx-sim-items">
            <div className="vx-section-head"><span className="vx-label">Sequência neste horário</span><Chip>{r.items.length} itens · {formatDuration(totalDuration(r.items))}</Chip></div>
            <ol>
              {r.items.map((it) => (
                <li key={it.key} className={playing?.key === it.key ? 'is-on' : ''}>
                  <Icon name={it.type === 'video' ? 'video' : it.type === 'app' ? 'apps' : 'image'} />
                  <span>{it.name}</span>
                  <small className="vx-num">{it.durationSec ? formatDuration(it.durationSec) : 'vídeo inteiro'}</small>
                </li>
              ))}
              {!r.items.length && <li className="vx-faint">Nada toca. A tela mostra "Sem programação".</li>}
            </ol>
            {daySlots.length > 0 && (
              <>
                <div className="vx-section-head"><span className="vx-label">Faixas de {WEEK[at.getDay()]}</span></div>
                <div className="vx-sim-slots">
                  {daySlots.map((s) => (
                    <button key={s.id} type="button" className={s.id === r.slotId ? 'is-on' : ''} onClick={() => setTime(s.start)}>
                      <b>{s.start}–{s.end}</b><span>{s.scheduleName}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!open && <StatusBadge status="warn">Fechado neste horário</StatusBadge>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
