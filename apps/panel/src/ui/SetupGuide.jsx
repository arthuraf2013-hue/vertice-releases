import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shouldAutoOpenSetup } from '@vertice/shared';
import { Modal, Button, Card } from './kit.jsx';
import { Icon } from './Icon.jsx';

const keyOf = (cid) => `vx-guia:${cid}`;

function readState(cid) {
  try { return JSON.parse(localStorage.getItem(keyOf(cid))) || {}; } catch { return {}; }
}
function writeState(cid, state) {
  try { localStorage.setItem(keyOf(cid), JSON.stringify(state)); } catch { /* sem storage */ }
}

/**
 * Estado do guia por empresa neste navegador: quantas entradas já houve e se a pessoa pediu para esconder.
 * Cada sessão do navegador conta como uma entrada. O guia abre sozinho nas primeiras entradas.
 */
export function useSetupGuide(companyId, progress, enabled) {
  const [state, setState] = useState(() => readState(companyId));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const sessionKey = `vx-guia-sessao:${companyId}`;
    let counted = false;
    try { counted = sessionStorage.getItem(sessionKey) === '1'; sessionStorage.setItem(sessionKey, '1'); } catch { /* sem storage */ }
    const s = readState(companyId);
    const next = counted ? s : { ...s, visits: (s.visits || 0) + 1 };
    if (!counted) writeState(companyId, next);
    setState(next);
  }, [companyId]);

  // Abre uma vez por entrada, quando os dados chegam e ainda falta configurar.
  const [autoDone, setAutoDone] = useState(false);
  useEffect(() => {
    if (autoDone || !enabled || !progress || !state.visits) return;
    setAutoDone(true);
    const sessionKey = `vx-guia-aberto:${companyId}`;
    let shown = false;
    try { shown = sessionStorage.getItem(sessionKey) === '1'; } catch { /* sem storage */ }
    if (!shown && shouldAutoOpenSetup(state, progress)) {
      setOpen(true);
      try { sessionStorage.setItem(sessionKey, '1'); } catch { /* sem storage */ }
    }
  }, [autoDone, enabled, progress, state, companyId]);

  const hide = () => {
    const next = { ...state, hidden: true };
    writeState(companyId, next);
    setState(next);
    setOpen(false);
  };
  const show = () => {
    const next = { ...state, hidden: false };
    writeState(companyId, next);
    setState(next);
    setOpen(true);
  };
  return { open, setOpen, hidden: !!state.hidden, hide, show };
}

function StepList({ progress, onGo }) {
  return (
    <ol className="vx-setup-steps">
      {progress.steps.map((s, i) => {
        const isNext = progress.next?.id === s.id;
        return (
          <li key={s.id} className={s.done ? 'is-done' : isNext ? 'is-next' : ''}>
            <span className="vx-setup-mark" aria-hidden="true">{s.done ? <Icon name="check" /> : i + 1}</span>
            <div className="vx-setup-body">
              <b>{s.title}{s.done && <span className="vx-sr"> (feito)</span>}</b>
              {!s.done && <p>{s.text}</p>}
              {!s.done && (
                <Button size="sm" variant={isNext ? 'primary' : 'ghost'} icon={s.icon} onClick={() => onGo(s.to)}>{s.action}</Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Janela com o passo a passo para colocar a primeira tela no ar. */
export function SetupGuide({ open, onClose, onHide, progress }) {
  const nav = useNavigate();
  if (!progress) return null;
  const go = (to) => { onClose(); nav(to); };
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <Modal open={open} onClose={onClose} icon="tv" width={600}
      title={progress.complete ? 'Sua tela está no ar' : 'Configure sua primeira tela'}
      subtitle={progress.complete ? 'Tudo pronto. Você pode reabrir este guia pelo início a qualquer momento.' : 'Cinco passos, cerca de 10 minutos. Você pode parar e continuar depois.'}
      footer={<>
        {!progress.complete && <Button variant="ghost" onClick={onHide} className="vx-mr-auto">Não mostrar de novo</Button>}
        <Button onClick={onClose}>{progress.complete ? 'Fechar' : 'Fazer depois'}</Button>
      </>}>
      <div className="vx-setup-progress">
        <span><b className="vx-num">{progress.done}</b> de {progress.total} passos</span>
        <div className="vx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><i style={{ width: `${pct}%` }} /></div>
      </div>
      <StepList progress={progress} onGo={go} />
    </Modal>
  );
}

/** Cartão no início enquanto a configuração não termina. */
export function SetupCard({ progress, onOpen, onHide }) {
  const nav = useNavigate();
  if (!progress || progress.complete) return null;
  const next = progress.next;
  return (
    <Card className="vx-setup-card">
      <div className="vx-setup-card-row">
        <span className="vx-tile"><Icon name="tv" /></span>
        <div className="vx-setup-card-text">
          <h2 className="vx-card-title">Configure sua primeira tela</h2>
          <p className="vx-faint">{progress.done} de {progress.total} passos feitos. Próximo: {next.title.toLowerCase()}.</p>
          <div className="vx-bar"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
        </div>
        <div className="vx-setup-card-actions">
          <Button variant="primary" icon={next.icon} onClick={() => nav(next.to)}>{next.action}</Button>
          <Button onClick={onOpen}>Ver todos os passos</Button>
          <Button variant="ghost" size="sm" onClick={onHide}>Esconder</Button>
        </div>
      </div>
    </Card>
  );
}
