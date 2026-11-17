import { useState } from 'react';
import { ALERT_THEMES, ALERT_PRESETS, normalizeAlert, formatDateTime } from '@vertice/shared';
import { AlertScreen } from '@vertice/shared/apps';
import { useSession } from '../session.jsx';
import { useCol, useNow } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import { PageHeader, Button, Card, Input, Select, Toggle, Loading, Segmented, PillGroup, useToast, useConfirm, StatusBadge } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const DURATIONS = [[15, '15 min'], [30, '30 min'], [60, '1 hora'], [120, '2 horas'], [0, 'Até eu encerrar']];

/** O alerta está valendo agora? */
export function activeAlert(company, now = Date.now()) {
  const a = normalizeAlert(company?.alert);
  return a && (!a.until || a.until > now) ? a : null;
}

/** Encerra o alerta em todas as telas. */
export async function endAlert(base, companyId) {
  await api.update(base, { alert: { active: false, endedAt: Date.now() } });
  await rebuildManifests(companyId);
}

/**
 * Alerta urgente: uma mensagem que toma as telas escolhidas na hora, por cima de tudo
 * (inclusive fora do expediente), com sirene e voz. Fica até o prazo ou até alguém encerrar.
 */
export function Alert() {
  const { base, companyId, company, member, user, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const groups = useCol(`${base}/groups`, { orderBy: ['name', 'asc'] });
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const now = useNow();
  const [f, setF] = useState({ title: 'Atenção', text: '', theme: 'red', minutes: 30, sound: true, scope: 'all', groupIds: [], screenIds: [] });
  const [busy, setBusy] = useState(false);
  if (!groups || !screens) return <Loading />;
  const active = activeAlert(company, now);
  const targets = f.scope === 'all' ? null : screens.filter((s) => f.screenIds.includes(s.id) || f.groupIds.some((g) => (s.groupIds || []).includes(g))).map((s) => s.id);

  const send = async () => {
    if (!f.title.trim()) return toast('Escreva o título do alerta.');
    if (targets && !targets.length) return toast('Escolha as telas que recebem o alerta.');
    const n = targets ? targets.length : screens.length;
    if (!(await confirm({ title: `Mostrar o alerta em ${n} ${n === 1 ? 'tela' : 'telas'}?`, message: 'Ele cobre tudo que estiver passando, na hora, até o prazo ou até você encerrar.', confirmLabel: 'Enviar alerta', danger: f.theme === 'red' }))) return;
    setBusy(true);
    try {
      const startedAt = Date.now();
      await api.update(base, {
        alert: {
          active: true, id: `a${startedAt.toString(36)}`, title: f.title.trim().slice(0, 40), text: f.text.trim().slice(0, 220), theme: f.theme,
          sound: f.sound, startedAt, until: f.minutes ? startedAt + f.minutes * 60_000 : 0, screenIds: targets || [], by: member?.name || user?.name || '',
        },
      });
      await rebuildManifests(companyId);
      toast('Alerta enviado. As telas mostram em segundos.');
    } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await endAlert(base, companyId); toast('Alerta encerrado. As telas voltam à programação.'); } finally { setBusy(false); }
  };

  const preview = { ...f, title: f.title || 'Atenção', startedAt: Date.now(), until: f.minutes ? Date.now() + f.minutes * 60_000 : 0 };
  return (
    <div className="vx-page">
      <PageHeader overline="OPERAÇÃO" title="Alerta urgente" subtitle="Uma mensagem que toma as telas na hora: emergência, aviso de fechamento, falta de sistema." />
      {active && (
        <Card className="vx-alert-live" title="Alerta nas telas agora" icon="siren" actions={can('editor') && <Button variant="alert" icon="x" loading={busy} onClick={stop}>Encerrar alerta</Button>}>
          <div className="vx-alert-live-body">
            <StatusBadge status="offline">No ar</StatusBadge>
            <div><b>{active.title}</b>{active.text ? ` · ${active.text}` : ''}</div>
            <span className="vx-faint">Desde {formatDateTime(active.startedAt)}{active.by ? ` · por ${active.by}` : ''} · {active.until ? `termina ${formatDateTime(active.until)}` : 'até encerrar'} · {active.screenIds ? `${active.screenIds.length} telas` : 'todas as telas'}</span>
          </div>
        </Card>
      )}
      <div className="vx-app-editor">
        <Card title="Novo alerta" icon="siren">
          <fieldset className="vx-form" disabled={!can('editor')}>
            <div className="vx-chips">
              {ALERT_PRESETS.map((p) => <button key={p.title} type="button" className="vx-chip-btn" onClick={() => setF({ ...f, ...p })}>{p.title}</button>)}
            </div>
            <Input label="Título" value={f.title} maxLength={40} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <label className="vx-field">
              <span className="vx-label">Mensagem</span>
              <textarea className="vx-input vx-textarea" rows={3} maxLength={220} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Ex.: Deixe o local pela saída mais próxima, com calma." />
            </label>
            <div className="vx-form-row">
              <Select label="Cor" value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} options={Object.entries(ALERT_THEMES).map(([k, t]) => ({ value: k, label: t.label }))} />
              <Select label="Por quanto tempo" value={String(f.minutes)} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} options={DURATIONS.map(([v, l]) => ({ value: String(v), label: l }))} />
            </div>
            <Toggle label="Sirene e mensagem falada" help="A TV toca um aviso curto e lê o alerta em voz alta (se tiver som ligado)." checked={f.sound} onChange={(v) => setF({ ...f, sound: v })} />
            <Segmented label="Em quais telas" value={f.scope} onChange={(scope) => setF({ ...f, scope })} options={[{ value: 'all', label: `Todas (${screens.length})` }, { value: 'some', label: 'Escolher' }]} />
            {f.scope === 'some' && (
              <>
                <PillGroup label="Grupos" value={f.groupIds} onChange={(groupIds) => setF({ ...f, groupIds })} options={groups.map((g) => ({ value: g.id, label: g.name }))} />
                <PillGroup label="Telas" value={f.screenIds} onChange={(screenIds) => setF({ ...f, screenIds })} options={screens.map((s) => ({ value: s.id, label: s.name }))} />
              </>
            )}
            {can('editor') && <div><Button variant="alert" icon="siren" loading={busy} onClick={send}>{active ? 'Trocar o alerta' : 'Enviar alerta'}</Button></div>}
          </fieldset>
        </Card>
        <div className="vx-app-preview">
          <div className="vx-section-head"><span className="vx-label">Como aparece na TV</span></div>
          <div className="vx-tv"><div className="vx-tv-in"><AlertScreen alert={preview} /></div></div>
          <p className="vx-help"><Icon name="alert" /> O alerta aparece mesmo fora do expediente e por cima do video wall. TVs sem internet mostram quando a conexão voltar.</p>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
