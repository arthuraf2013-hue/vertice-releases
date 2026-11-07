import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  networkSummary, screenStatus, ORIENTATIONS, ORDER_BOARD_MODES, ORDER_NAME_FORMATS, ORDER_BOARD_DEFAULTS,
  normalizePairingCode, isValidPairingCode, PAIRING_KIND, formatDateTime, timeAgo,
  screenDisplay, orientationOf, CALIBRATION_MS,
} from '@vertice/shared';
import { useSession, useUnitFilter } from '../session.jsx';
import { useCol, useNow, useById } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Tabs, MetricCard, DeviceCard, Table, Modal, Input, Select, PillGroup, Segmented,
  Toggle, ScreenStatus, EmptyState, Card, Loading, useToast, useConfirm, IconButton, Chip,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { ScreenDisplay } from './ScreenDisplay.jsx';
import { ScreenMediaList } from './ScreenMediaAdjust.jsx';
import { ScreenRemote } from './ScreenRemote.jsx';

export function Screens() {
  const { base, can, units } = useSession();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('overview');
  const all = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const screens = useUnitFilter(all);
  const groups = useCol(`${base}/groups`, { orderBy: ['name', 'asc'] });
  const media = useCol(`${base}/media`);
  const mediaById = useById(media);
  const unitById = useById(units);
  const groupById = useById(groups);
  const summary = useMemo(() => networkSummary(screens || [], now), [screens, now]);

  const pairOpen = params.get('parear') === '1';
  const editingId = params.get('tela');
  const editing = all?.find((s) => s.id === editingId);
  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  if (!all || !groups) return <Loading />;

  return (
    <div className="vx-page">
      <PageHeader overline="OPERAÇÃO" title="Telas" subtitle="Cadastre, organize por grupo e unidade, e configure o que cada TV mostra."
        actions={can('admin') && <Button variant="primary" icon="plus" onClick={() => setParam('parear', '1')}>Parear tela</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Visão geral' },
        { id: 'list', label: 'Lista', count: screens.length },
        { id: 'groups', label: 'Grupos', count: groups.length },
        { id: 'units', label: 'Unidades', count: units.length },
      ]} />

      {tab === 'overview' && (
        <>
          <div className="vx-grid-4">
            <MetricCard icon="screen" label="Telas cadastradas" value={summary.total} note={`${all.length} na empresa toda`} dot="sync" />
            <MetricCard icon="check" label="Online" value={summary.healthy} bar={summary.healthyPct} note={`${summary.healthyPct}% da seleção`} />
            <MetricCard icon="alert" label="Atenção" value={summary.warn} dot="warn" note="Sem contato há mais de 15 min ou app antigo" />
            <MetricCard icon="xCircle" label="Offline" value={summary.offline} dot="offline" note="Sem contato há mais de 60 min" />
          </div>
          {screens.length ? (
            <div className="vx-grid-devices">
              {screens.map((s) => (
                <DeviceCard key={s.id} screen={s} now={now} media={mediaById.get(s.nowPlaying?.mediaId)} unitName={unitById.get(s.unitId)?.name} onClick={() => setParam('tela', s.id)} />
              ))}
            </div>
          ) : (
            <Card><EmptyState icon="screen" title="Nenhuma tela nesta seleção" action={can('admin') && <Button variant="primary" icon="plus" onClick={() => setParam('parear', '1')}>Parear tela</Button>}>
              Instale o player Vértice na TV Box ou Smart TV. Ele mostra um código de 6 caracteres: é só digitar aqui.
            </EmptyState></Card>
          )}
        </>
      )}

      {tab === 'list' && (
        <Card pad={false}>
          <Table rows={screens} onRowClick={(s) => setParam('tela', s.id)}
            empty={<EmptyState icon="screen" title="Nenhuma tela nesta seleção" />}
            columns={[
              { key: 'code', label: 'Código', width: 110, render: (s) => <span className="vx-mono">{s.code}</span> },
              { key: 'name', label: 'Tela', render: (s) => <b>{s.name}</b> },
              { key: 'unit', label: 'Unidade', render: (s) => unitById.get(s.unitId)?.name || <span className="vx-faint">—</span> },
              { key: 'groups', label: 'Grupos', render: (s) => <div className="vx-row vx-row-tight">{(s.groupIds || []).map((g) => groupById.get(g) && <Chip key={g}>{groupById.get(g).name}</Chip>)}</div> },
              { key: 'orders', label: 'Pedidos', render: (s) => s.orderBoard?.mode && s.orderBoard.mode !== 'off' ? ORDER_BOARD_MODES[s.orderBoard.mode] : <span className="vx-faint">—</span> },
              { key: 'status', label: 'Situação', render: (s) => <ScreenStatus screen={s} now={now} /> },
            ]} />
        </Card>
      )}

      {tab === 'groups' && <SimpleCrud kind="groups" title="Grupos de telas" items={groups} screens={all} field="groupIds"
        help="Grupos juntam telas que mostram o mesmo conteúdo (ex.: Caixas, Vitrines). As grades de programação são publicadas para grupos." />}
      {tab === 'units' && <SimpleCrud kind="units" title="Unidades" items={units} screens={all} field="unitId"
        help="Unidades são as lojas ou endereços. Elas filtram o painel no seletor do topo e separam os pedidos de cada loja." withAddress />}

      <PairModal open={pairOpen} onClose={() => setParam('parear', null)} onPaired={(id) => setParams({ tela: id }, { replace: true })} />
      {editing && <ScreenEditor key={editing.id} screen={editing} groups={groups} now={now} mediaById={mediaById} onClose={() => setParam('tela', null)} />}
    </div>
  );
}

/* ---------- Parear tela ---------- */
function PairModal({ open, onClose, onPaired }) {
  const { companyId, units, unitId } = useSession();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setCode(''); setName(''); setError('');
      setUnit(unitId !== 'all' ? unitId : units[0]?.id || '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = normalizePairingCode(code);
  const submit = async (e) => {
    e?.preventDefault();
    if (!isValidPairingCode(norm)) return setError('O código tem 6 caracteres, como aparece na TV.');
    setBusy(true);
    setError('');
    try {
      const { id } = await api.claimPairing({ companyId, code: norm, kind: PAIRING_KIND.SCREEN, name: name.trim(), unitId: unit || null });
      await rebuildManifests(companyId, [id]);
      toast('Tela conectada. Ela já começa a baixar o conteúdo.');
      onPaired(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Parear tela" icon="screen" width={600}
      subtitle="Abra o player Vértice na TV. Ele mostra um código de 6 caracteres."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} loading={busy} disabled={norm.length < 6}>Conectar tela</Button></>}>
      <form onSubmit={submit} className="vx-form">
        <div className="vx-pair-code">
          <label className="vx-label" htmlFor="pair-code">Código da TV</label>
          <input id="pair-code" className="vx-input vx-input-code" value={norm.length > 3 ? `${norm.slice(0, 3)}-${norm.slice(3)}` : norm}
            onChange={(e) => setCode(e.target.value)} placeholder="4F7-K2Q" autoComplete="off" spellCheck={false} inputMode="text" maxLength={7} />
          <div className="vx-help">Não diferencia maiúsculas. O código vale por 30 minutos e a TV gera outro sozinha.</div>
        </div>
        <div className="vx-form-row">
          <Input label="Nome da tela" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Caixa 1, Vitrine" />
          <Select label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value)}
            options={[{ value: '', label: 'Sem unidade' }, ...units.map((u) => ({ value: u.id, label: u.name }))]} />
        </div>
        {error && <div className="vx-alert vx-alert-offline"><Icon name="alert" />{error}</div>}
      </form>
    </Modal>
  );
}

/* ---------- Configurar tela ---------- */
function ScreenEditor({ screen, groups, now, mediaById, onClose }) {
  const { base, companyId, units, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [f, setF] = useState(() => ({
    name: screen.name || '', unitId: screen.unitId || '', groupIds: screen.groupIds || [],
    display: screenDisplay(screen), orderBoard: { ...ORDER_BOARD_DEFAULTS, ...(screen.orderBoard || {}) },
  }));
  const [calibUntil, setCalibUntil] = useState(() => Number(screen.calibrateUntil) || 0);
  const [calibBusy, setCalibBusy] = useState(false);
  const calibrating = calibUntil > now;
  const liveTimer = useRef(null);
  const [busy, setBusy] = useState(false);
  const ob = f.orderBoard;
  const setOb = (patch) => setF({ ...f, orderBoard: { ...ob, ...patch } });
  const readOnly = !can('admin');
  const st = screenStatus(screen, now);

  const save = async () => {
    setBusy(true);
    try {
      await api.update(`${base}/screens/${screen.id}`, {
        name: f.name.trim() || screen.code, unitId: f.unitId || null, groupIds: f.groupIds,
        display: f.display, orientation: orientationOf(f.display.rotation), calibrateUntil: 0,
        orderBoard: { ...ob, overlaySec: Number(ob.overlaySec), readyTtlMin: Number(ob.readyTtlMin) },
      });
      await rebuildManifests(companyId, [screen.id]);
      toast('Tela atualizada. A TV recebe a mudança em segundos.');
      onClose();
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setBusy(false);
    }
  };
  /** Grade de ajuste: liga/desliga na TV. Enquanto ligada, mudanças de posição vão ao vivo. */
  const calibrate = async (on) => {
    setCalibBusy(true);
    try {
      const until = on ? Date.now() + CALIBRATION_MS : 0;
      await api.update(`${base}/screens/${screen.id}`, { calibrateUntil: until, display: f.display, orientation: orientationOf(f.display.rotation) });
      await rebuildManifests(companyId, [screen.id]);
      setCalibUntil(until);
      if (on) toast('Grade enviada. Ela aparece na TV em alguns segundos.');
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setCalibBusy(false);
    }
  };
  const changeDisplay = (display) => {
    setF((x) => ({ ...x, display }));
    if (!calibrating) return;
    clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(async () => {
      try {
        await api.update(`${base}/screens/${screen.id}`, { display, orientation: orientationOf(display.rotation) });
        await rebuildManifests(companyId, [screen.id]);
      } catch (e) {
        toast(e.message, 'offline');
      }
    }, 600);
  };
  useEffect(() => () => clearTimeout(liveTimer.current), []);
  // Fechar sem salvar com a grade ligada: tira a grade da TV.
  const close = () => {
    if (calibrating) calibrate(false);
    onClose();
  };

  const unpair = async () => {
    const ok = await confirm({
      title: `Desconectar ${screen.name}?`, danger: true, confirmLabel: 'Desconectar',
      message: 'A TV para de exibir o conteúdo e volta para a tela de pareamento. O código VTX não é reaproveitado.',
    });
    if (!ok) return;
    await api.batch([
      { op: 'delete', path: `${base}/screens/${screen.id}` },
      { op: 'delete', path: `${base}/manifests/${screen.id}` },
      ...(screen.deviceUid ? [{ op: 'delete', path: `devices/${screen.deviceUid}` }] : []),
    ]);
    toast('Tela desconectada.');
    onClose();
  };

  return (
    <Modal open onClose={close} width={880} icon="screen" title={screen.name}
      subtitle={<span className="vx-row vx-row-tight"><span className="vx-mono">{screen.code}</span><ScreenStatus screen={screen} now={now} /></span>}
      footer={readOnly ? <Button onClick={close}>Fechar</Button> : (
        <>
          <Button variant="destructive" icon="trash" onClick={unpair} className="vx-mr-auto">Desconectar tela</Button>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy}>Salvar</Button>
        </>
      )}>
      <fieldset disabled={readOnly} className="vx-form">
        <div className="vx-info-strip">
          <div><span className="vx-overline">SITUAÇÃO</span><b>{st.reason}</b></div>
          <div><span className="vx-overline">ÚLTIMO CONTATO</span><b>{screen.lastSeen ? timeAgo(screen.lastSeen, now) : 'nunca'}</b></div>
          <div><span className="vx-overline">APP</span><b className="vx-mono">{screen.appVersion ? `v${screen.appVersion}` : '—'}</b></div>
          <div><span className="vx-overline">NO AR</span><b>{screen.nowPlaying?.name || '—'}</b></div>
        </div>

        <ScreenRemote base={base} screen={screen} now={now} readOnly={readOnly} />

        <div className="vx-form-row">
          <Input label="Nome da tela" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Unidade" value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })}
            options={[{ value: '', label: 'Sem unidade' }, ...units.map((u) => ({ value: u.id, label: u.name }))]} />
        </div>
        <PillGroup label="Grupos" value={f.groupIds} onChange={(groupIds) => setF({ ...f, groupIds })}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          help={groups.length ? 'A tela recebe as grades publicadas para estes grupos.' : 'Crie grupos na aba Grupos.'} />

        <div className="vx-subsection">
          <h3 className="vx-subtitle"><Icon name="monitor" />Posição na TV</h3>
          <p className="vx-help">Gire o conteúdo conforme a TV foi instalada e acerte as bordas se a TV cortar a imagem.</p>
          <ScreenDisplay value={f.display} onChange={changeDisplay} disabled={readOnly} appVersion={screen.appVersion}
            calibrating={calibrating} calibBusy={calibBusy} onCalibrate={calibrate} />
        </div>

        <div className="vx-subsection">
          <h3 className="vx-subtitle"><Icon name="image" />Ajustes por mídia nesta tela</h3>
          <p className="vx-help">Mude o preenchimento, o tamanho e a posição de uma mídia só nesta TV. As outras telas continuam com o ajuste da mídia.</p>
          <ScreenMediaList screen={screen} mediaById={mediaById} display={f.display} readOnly={readOnly} />
        </div>

        <div className="vx-subsection">
          <h3 className="vx-subtitle"><Icon name="receipt" />Painel de pedidos (GerenciaAI)</h3>
          <p className="vx-help">Quando o GerenciaAI marca um pedido como pronto, a TV mostra o número e o nome do cliente.</p>
          <div className="vx-board-modes">
            {Object.entries(ORDER_BOARD_MODES).map(([value, label]) => (
              <button key={value} type="button" className={`vx-board-mode ${ob.mode === value ? 'is-on' : ''}`} onClick={() => setOb({ mode: value })} aria-pressed={ob.mode === value}>
                <BoardModeArt mode={value} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {ob.mode !== 'off' && (
            <>
              <div className="vx-form-row">
                <Select label="Como mostrar o cliente" value={ob.nameFormat} onChange={(e) => setOb({ nameFormat: e.target.value })}
                  options={Object.entries(ORDER_NAME_FORMATS).map(([value, label]) => ({ value, label }))} help="Nome e inicial protege a privacidade do cliente (LGPD)." />
                {ob.mode === 'overlay'
                  ? <Input label="Duração do aviso (segundos)" type="number" min={5} max={60} value={ob.overlaySec} onChange={(e) => setOb({ overlaySec: e.target.value })} />
                  : <Input label="Pedido pronto some após (min)" type="number" min={1} max={60} value={ob.readyTtlMin} onChange={(e) => setOb({ readyTtlMin: e.target.value })} />}
              </div>
              <div className="vx-form-row">
                <Toggle label="Tocar aviso sonoro" checked={ob.chime} onChange={(chime) => setOb({ chime })} help="Um toque curto quando um pedido fica pronto." />
                {ob.mode !== 'overlay' && <Toggle label="Mostrar pedidos em preparo" checked={ob.showPreparing} onChange={(showPreparing) => setOb({ showPreparing })} />}
              </div>
            </>
          )}
        </div>

        <div className="vx-meta-line">
          Pareada {formatDateTime(screen.pairedAt)} · {screen.platform || 'plataforma desconhecida'}{screen.resolution ? ` · ${screen.resolution}` : ''}
        </div>
      </fieldset>
      {confirmDialog}
    </Modal>
  );
}

/** Desenho pequeno de cada modo do painel de pedidos. */
function BoardModeArt({ mode }) {
  return (
    <svg viewBox="0 0 96 54" className="vx-board-art" aria-hidden>
      <rect width="96" height="54" rx="6" fill="var(--vetta-night)" />
      {mode === 'off' && <rect x="6" y="6" width="84" height="42" rx="3" fill="var(--vetta-navy)" />}
      {mode === 'overlay' && (<><rect x="6" y="6" width="84" height="42" rx="3" fill="var(--vetta-navy)" opacity=".35" /><rect x="22" y="14" width="52" height="26" rx="3" fill="#0b1017" stroke="var(--vetta-gold)" /><rect x="34" y="20" width="28" height="8" rx="2" fill="#eef2f7" /><rect x="38" y="31" width="20" height="3" rx="1.5" fill="var(--vetta-gold)" /></>)}
      {mode === 'sidebar' && (<><rect x="6" y="6" width="58" height="42" rx="3" fill="var(--vetta-navy)" /><rect x="68" y="6" width="22" height="42" rx="3" fill="#0b1017" /><rect x="71" y="10" width="16" height="6" rx="1.5" fill="#eef2f7" /><rect x="71" y="19" width="16" height="4" rx="1.5" fill="#5a6a82" /><rect x="71" y="26" width="16" height="4" rx="1.5" fill="#5a6a82" /></>)}
      {mode === 'full' && (<><rect x="6" y="6" width="40" height="42" rx="3" fill="#0b1017" /><rect x="50" y="6" width="40" height="42" rx="3" fill="#0b1017" stroke="var(--vetta-gold)" /><rect x="10" y="12" width="20" height="4" rx="1.5" fill="#5a6a82" /><rect x="10" y="20" width="20" height="4" rx="1.5" fill="#5a6a82" /><rect x="54" y="12" width="28" height="8" rx="2" fill="#eef2f7" /><rect x="54" y="24" width="28" height="8" rx="2" fill="#eef2f7" opacity=".7" /></>)}
    </svg>
  );
}

/* ---------- Grupos e Unidades ---------- */
function SimpleCrud({ kind, title, items, screens, field, help, withAddress }) {
  const { base, companyId, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [edit, setEdit] = useState(null); // {id?, name, address}
  const countFor = (id) => screens.filter((s) => (field === 'groupIds' ? (s.groupIds || []).includes(id) : s.unitId === id)).length;
  const label = kind === 'groups' ? 'grupo' : 'unidade';

  const save = async () => {
    const data = { name: edit.name.trim(), ...(withAddress ? { address: (edit.address || '').trim() } : {}) };
    if (!data.name) return;
    if (edit.id) await api.update(`${base}/${kind}/${edit.id}`, data);
    else await api.add(`${base}/${kind}`, { ...data, createdAt: api.NOW });
    setEdit(null);
    toast(kind === 'groups' ? 'Grupo salvo.' : 'Unidade salva.');
  };
  const remove = async (item) => {
    const n = countFor(item.id);
    const ok = await confirm({
      title: `Excluir ${label} "${item.name}"?`, danger: true, confirmLabel: 'Excluir',
      message: n ? `${n} ${n > 1 ? 'telas saem' : 'tela sai'} deste ${label}. As telas continuam pareadas.` : 'Nenhuma tela usa este cadastro.',
    });
    if (!ok) return;
    const ops = [{ op: 'delete', path: `${base}/${kind}/${item.id}` }];
    for (const s of screens) {
      if (field === 'groupIds' && (s.groupIds || []).includes(item.id)) ops.push({ op: 'update', path: `${base}/screens/${s.id}`, data: { groupIds: s.groupIds.filter((g) => g !== item.id) } });
      if (field === 'unitId' && s.unitId === item.id) ops.push({ op: 'update', path: `${base}/screens/${s.id}`, data: { unitId: null } });
    }
    await api.batch(ops);
    if (field === 'groupIds' && ops.length > 1) await rebuildManifests(companyId);
    toast('Excluído.');
  };

  return (
    <Card pad={false} title={title} actions={can('admin') && <Button size="sm" icon="plus" onClick={() => setEdit({ name: '', address: '' })}>{kind === 'groups' ? 'Novo grupo' : 'Nova unidade'}</Button>}>
      <p className="vx-help vx-card-help">{help}</p>
      <Table rows={items} empty={<EmptyState icon={kind === 'groups' ? 'layers' : 'pin'} title={kind === 'groups' ? 'Nenhum grupo' : 'Nenhuma unidade'} />}
        columns={[
          { key: 'name', label: 'Nome', render: (i) => <b>{i.name}</b> },
          ...(withAddress ? [{ key: 'address', label: 'Endereço', render: (i) => i.address || <span className="vx-faint">—</span> }] : []),
          { key: 'n', label: 'Telas', width: 90, render: (i) => <span className="vx-num">{countFor(i.id)}</span> },
          { key: 'a', label: '', width: 100, align: 'right', render: (i) => can('admin') && (
            <div className="vx-row vx-row-tight vx-row-end">
              <IconButton icon="edit" label="Editar" variant="ghost" onClick={() => setEdit(i)} />
              <IconButton icon="trash" label="Excluir" variant="danger" onClick={() => remove(i)} />
            </div>
          ) },
        ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Editar ${label}` : kind === 'groups' ? 'Novo grupo' : 'Nova unidade'} width={480}
        footer={<><Button onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={save} disabled={!edit?.name?.trim()}>Salvar</Button></>}>
        <form className="vx-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input label="Nome" value={edit?.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          {withAddress && <Input label="Endereço" value={edit?.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />}
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}
