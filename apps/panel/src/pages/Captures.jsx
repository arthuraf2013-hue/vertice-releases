import { useEffect, useMemo, useState } from 'react';
import { screenStatus, compareVersions, timeAgo, formatDateTime } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useNow, useById } from '../data/hooks.js';
import { api } from '../data/api.js';
import {
  PageHeader, Button, MetricCard, Loading, EmptyState, useToast, Modal, Segmented, ScreenStatus,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { REMOTE_MIN_VERSION } from './ScreenRemote.jsx';

const RECENTE_MS = 60 * 60_000;
const cmdId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Última foto de cada tela (screens/{id}/live/screenshot), em tempo real. */
function useShots(base, screens) {
  const [shots, setShots] = useState({});
  const ids = (screens || []).map((s) => s.id).join(',');
  useEffect(() => {
    if (!ids) return undefined;
    const offs = ids.split(',').map((id) => api.watchDoc(`${base}/screens/${id}/live/screenshot`, (d) => setShots((x) => ({ ...x, [id]: d || null })), () => {}));
    return () => offs.forEach((f) => f?.());
  }, [base, ids]);
  return shots;
}

/** Capturas: a última imagem de cada tela e o histórico, para conferir o que está passando. */
export function Captures() {
  const { base, can, units, user } = useSession();
  const toast = useToast();
  const now = useNow();
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const shots = useShots(base, screens);
  const unitById = useById(units);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const capable = (s) => !['offline', 'idle'].includes(screenStatus(s, now).key) && !(s.appVersion && compareVersions(s.appVersion, REMOTE_MIN_VERSION) < 0) && s.platform !== 'web';
  const list = useMemo(() => (screens || []).filter((s) => {
    const txt = `${s.name} ${s.code} ${unitById.get(s.unitId)?.name || ''}`.toLowerCase();
    const has = !!shots[s.id]?.image;
    return txt.includes(q.toLowerCase()) && (f === 'all' || (f === 'com' ? has : !has));
  }), [screens, shots, q, f, unitById]);

  if (!screens) return <Loading />;
  const withShot = screens.filter((s) => shots[s.id]?.image);
  const recent = withShot.filter((s) => now - (shots[s.id].at || 0) < RECENTE_MS);

  const request = async (targets) => {
    setBusy(true);
    try {
      await api.batch(targets.map((s) => ({ op: 'set', path: `${base}/screens/${s.id}/live/command`, data: { id: cmdId(), type: 'screenshot', at: api.NOW, by: user?.uid || '' } })));
      toast(targets.length === 1 ? 'Foto pedida. Chega em alguns segundos.' : `Foto pedida para ${targets.length} telas. Chegam em alguns segundos.`);
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setBusy(false);
    }
  };
  const ready = screens.filter(capable);

  return (
    <div className="vx-page">
      <PageHeader overline="ACOMPANHAMENTO VISUAL" title="Capturas" subtitle="Confira a última imagem recebida de cada tela e o histórico das fotos."
        actions={can('admin') && <Button variant="primary" icon="camera" loading={busy} disabled={!ready.length} onClick={() => request(ready)}>Capturar todas ({ready.length})</Button>} />

      <div className="vx-grid-4">
        <MetricCard icon="screen" label="Telas" value={screens.length} note="Todas as unidades" />
        <MetricCard icon="camera" label="Com foto" value={withShot.length} total={screens.length} dot="online" note="Pelo menos uma foto recebida" />
        <MetricCard icon="clock" label="Foto da última hora" value={recent.length} total={screens.length} dot="sync" note="Imagem recente" />
        <MetricCard icon="image" label="Sem foto" value={screens.length - withShot.length} dot="offline" note="Offline, player antigo ou nunca pedida" />
      </div>

      <div className="vx-toolbar">
        <div className="vx-search"><Icon name="search" /><input className="vx-input" placeholder="Nome, código ou unidade" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar tela" /></div>
        <Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'Todas' }, { value: 'com', label: 'Com foto' }, { value: 'sem', label: 'Sem foto' }]} />
      </div>

      {list.length ? (
        <div className="vx-grid-3">
          {list.map((s) => {
            const shot = shots[s.id];
            const old = shot?.at && now - shot.at > RECENTE_MS;
            return (
              <button key={s.id} type="button" className="vx-card vx-capture" onClick={() => setOpen(s)}>
                <div className={`vx-capture-img ${s.orientation === 'portrait' || [90, 270].includes(s.display?.rotation) ? 'is-portrait' : ''}`}>
                  {shot?.image ? <img src={shot.image} alt={`Tela de ${s.name}`} loading="lazy" /> : <span className="vx-capture-none"><Icon name="camera" />Sem foto ainda</span>}
                  {shot?.at && <span className={`vx-capture-time ${old ? 'is-old' : ''}`}>{timeAgo(shot.at, now)}</span>}
                </div>
                <div className="vx-capture-info">
                  <b>{s.name}</b>
                  <span className="vx-faint">{s.code} · {unitById.get(s.unitId)?.name || 'Sem unidade'}</span>
                  <ScreenStatus screen={s} now={now} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="search" title="Nada encontrado">Tente outro termo ou limpe os filtros.</EmptyState>
      )}

      {open && <CaptureHistory base={base} screen={open} shot={shots[open.id]} canRequest={can('admin') && capable(open)} onRequest={() => request([open])} busy={busy} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CaptureHistory({ base, screen, shot, canRequest, onRequest, busy, onClose }) {
  const history = useCol(`${base}/screens/${screen.id}/captures`, { orderBy: ['at', 'desc'], limit: 12 });
  const [view, setView] = useState(null);
  const items = useMemo(() => {
    const h = history || [];
    // A foto atual pode ter vindo de um player que ainda não guarda histórico.
    if (shot?.image && !h.some((x) => x.image === shot.image)) return [{ id: 'live', ...shot }, ...h];
    return h;
  }, [history, shot]);
  const big = view || items[0];
  return (
    <Modal open onClose={onClose} width={1000} icon="camera" title={`Capturas · ${screen.name}`} subtitle={`${screen.code} · vídeos podem aparecer pretos na foto`}
      footer={<><Button onClick={onClose}>Fechar</Button>{canRequest && <Button variant="primary" icon="camera" loading={busy} onClick={onRequest}>Capturar agora</Button>}</>}>
      {history === undefined ? <Loading /> : items.length ? (
        <div className="vx-capture-history">
          <figure className="vx-capture-big">
            <img src={big.image} alt={`Tela de ${screen.name}`} />
            <figcaption className="vx-faint">{big.at ? formatDateTime(big.at) : ''}</figcaption>
          </figure>
          <div className="vx-capture-strip">
            {items.map((c) => (
              <button key={c.id} type="button" className={`vx-capture-thumb ${big === c || big.id === c.id ? 'is-on' : ''}`} onClick={() => setView(c)}>
                <img src={c.image} alt="" loading="lazy" />
                <span>{c.at ? new Date(c.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon="camera" title="Nenhuma foto desta tela">
          {canRequest ? 'Clique em "Capturar agora". A TV manda a imagem em alguns segundos.' : 'A tela precisa estar online, com o player 0.3 ou mais novo (APK ou Windows).'}
        </EmptyState>
      )}
    </Modal>
  );
}
