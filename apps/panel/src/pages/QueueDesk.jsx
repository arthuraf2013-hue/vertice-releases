import { useEffect, useState } from 'react';
import { normalizeQueueConfig, callNext, callAgain, callNumber, callName, timeAgo } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useDoc, useNow } from '../data/hooks.js';
import { api } from '../data/api.js';
import { PageHeader, Button, Card, Loading, EmptyState, Select, useToast, Input, useConfirm } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const recall = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

/**
 * Chamar senha: tela do atendente (computador ou celular). Escolhe o guichê uma vez e
 * chama a próxima com um toque; a TV mostra, toca o aviso e fala a senha.
 */
export function QueueDesk() {
  const { base, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const apps = useCol(`${base}/media`, { where: [['app.kind', '==', 'queue']] });
  const [qid, setQid] = useState(() => recall('vx-queue'));
  const [counter, setCounter] = useState(() => recall('vx-counter'));
  const [num, setNum] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const app = apps?.find((a) => a.id === qid) || apps?.[0];
  const q = useDoc(app ? `${base}/queues/${app.id}` : null);
  useEffect(() => { if (app) remember('vx-queue', app.id); }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!apps) return <Loading />;
  if (!apps.length) {
    return (
      <div className="vx-page">
        <PageHeader overline="OPERAÇÃO" title="Chamar senha" />
        <Card><EmptyState icon="bell" title="Nenhuma fila de senhas" action={can('editor') && <Button variant="primary" icon="plus" onClick={() => { location.hash = '#/aplicativos'; }}>Criar em Aplicativos</Button>}>
          Crie o app "Chamada de senhas" em Aplicativos e coloque numa playlist da TV da recepção.
        </EmptyState></Card>
      </div>
    );
  }
  if (q === undefined) return <Loading />;
  const cfg = normalizeQueueConfig({ ...app.app.config, ...(q || {}) });
  const desk = cfg.counters.includes(counter) ? counter : cfg.counters[0];
  const path = `${base}/queues/${app.id}`;
  const run = async (fn, msg) => {
    setBusy(true);
    try {
      const patch = await api.transact(path, (cur) => fn(cur));
      if (patch?.current) toast(msg(patch.current));
    } catch (e) {
      toast(`Não deu para chamar: ${e.message || e}`);
    } finally { setBusy(false); }
  };
  const next = (prefix) => run((cur) => ({ ...callNext(cur, { prefix, counter: desk, digits: cfg.digits }), updatedAt: Date.now() }), (c) => `Chamando ${c.code} no ${c.counter}.`);
  const again = () => run((cur) => (cur.current ? { ...callAgain(cur, { counter: desk }), updatedAt: Date.now() } : null), (c) => `Chamando ${c.code} de novo.`);
  const pick = (prefix) => {
    if (!Number(num)) return toast('Digite o número da senha.');
    run((cur) => ({ ...callNumber(cur, { prefix, number: num, counter: desk, digits: cfg.digits }), updatedAt: Date.now() }), (c) => `Chamando ${c.code}.`);
    setNum('');
  };
  const byName = (e) => {
    e.preventDefault();
    if (!who.trim()) return toast('Digite o nome.');
    run((cur) => { const p = callName(cur, { name: who, counter: desk }); return p ? { ...p, updatedAt: Date.now() } : null; }, (c) => `Chamando ${c.code}.`);
    setWho('');
  };
  const reset = async () => {
    if (!(await confirm({ title: 'Zerar as senhas?', message: 'A próxima chamada de cada tipo volta para o número 1. Use no começo do dia.', confirmLabel: 'Zerar', danger: true }))) return;
    await api.set(path, { seq: {}, current: null, history: [], updatedAt: Date.now() }, true);
    toast('Senhas zeradas.');
  };
  const cur = q?.current;
  return (
    <div className="vx-page vx-desk">
      <PageHeader overline="OPERAÇÃO" title="Chamar senha" subtitle="Escolha o seu guichê e toque para chamar. A TV mostra, toca o aviso e fala a senha."
        actions={can('editor') && <Button icon="sync" onClick={reset}>Zerar senhas</Button>} />
      <div className="vx-desk-top">
        {apps.length > 1 && <Select label="Fila" value={app.id} onChange={(e) => setQid(e.target.value)} options={apps.map((a) => ({ value: a.id, label: a.name }))} />}
        <div className="vx-field">
          <span className="vx-label">Meu guichê</span>
          <div className="vx-chips">
            {cfg.counters.map((c) => (
              <button key={c} type="button" className={`vx-chip-btn ${c === desk ? 'is-on' : ''}`} aria-pressed={c === desk} onClick={() => { setCounter(c); remember('vx-counter', c); }}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="vx-desk-grid">
        <Card className="vx-desk-now" title="Na TV agora" icon="screen">
          {cur ? (
            <div className="vx-desk-call">
              <b className="vx-desk-code">{cur.code}</b>
              <span>{cur.counter} · {timeAgo(cur.at, now)}</span>
              <Button icon="bell" loading={busy} onClick={again}>Chamar de novo</Button>
            </div>
          ) : <p className="vx-faint">Nenhuma senha chamada ainda.</p>}
        </Card>
        <div className="vx-desk-actions">
          {cfg.types.map((t) => (
            <button key={t.prefix} type="button" className="vx-desk-big" disabled={busy} onClick={() => next(t.prefix)}>
              <span>Chamar próxima</span>
              <b>{t.label || t.prefix}</b>
              <small>Próxima: {t.prefix}{String(((q?.seq?.[t.prefix] || 0) % 999) + 1).padStart(cfg.digits, '0')}</small>
            </button>
          ))}
        </div>
        <Card title="Chamar pelo nome" icon="user">
          <form className="vx-inline-search" onSubmit={byName}>
            <input className="vx-input" value={who} maxLength={40} onChange={(e) => setWho(e.target.value)} placeholder="Ex.: Maria Souza" aria-label="Nome para chamar" />
            <Button type="submit" icon="bell" loading={busy}>Chamar</Button>
          </form>
          <p className="vx-help">A TV mostra e fala o nome com o seu guichê ou sala. Bom para consultórios, salões e restaurantes.</p>
        </Card>
        <Card title="Chamar um número" icon="search">
          <div className="vx-desk-pick">
            <Input label="Número" type="number" inputMode="numeric" min={1} max={999} value={num} onChange={(e) => setNum(e.target.value)} />
            <div className="vx-row-actions">{cfg.types.map((t) => <Button key={t.prefix} size="sm" onClick={() => pick(t.prefix)}>{t.prefix}{num ? String(num).padStart(cfg.digits, '0') : '…'}</Button>)}</div>
          </div>
          {(q?.history || []).length > 0 && (
            <ol className="vx-desk-hist">
              {q.history.map((h) => <li key={`${h.code}${h.at}`}><b>{h.code}</b><span>{h.counter}</span><small>{timeAgo(h.at, now)}</small></li>)}
            </ol>
          )}
        </Card>
      </div>
      {confirmDialog}
    </div>
  );
}
