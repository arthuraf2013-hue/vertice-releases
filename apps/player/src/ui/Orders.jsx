import { useEffect, useRef, useState } from 'react';
import { boardOrders, formatCustomerName, formatOrderNumber } from '@vertice/shared';
import { chime } from '../services/chime.js';
import { Clock, useTick } from './SystemScreen.jsx';

/** Um "pronto" é identificado pelo pedido e pelo horário em que ficou pronto: chamar de novo gera novo aviso. */
export const chaveDoPronto = (o) => `${o.id}@${o.readyAt ?? ''}`;

/** O aviso que foi interrompido por uma chamada nova volta depois, se ficou menos que isto na tela. */
const AVISO_MINIMO_MS = 3000;

/**
 * Detecta pedidos que acabaram de ficar prontos (ou foram chamados de novo) e toca o aviso.
 * Chamada nova aparece NA HORA: passa na frente da fila do aviso em tela cheia, em vez de esperar
 * o aviso anterior terminar. Chamar de novo um pedido que ainda estava na fila não repete o aviso duas vezes.
 */
export function useReadyAnnouncer(orders, config, unitId) {
  const now = useTick(15_000);
  const seen = useRef(null);
  const shownAt = useRef(0);
  const [queue, setQueue] = useState([]);
  const board = boardOrders(orders, { now, readyTtlMin: config.readyTtlMin, unitId });
  const overlay = config.mode === 'overlay';

  useEffect(() => {
    // Na primeira leitura, só memoriza: não anuncia pedidos que já estavam prontos.
    if (!seen.current) {
      seen.current = new Set(board.ready.map(chaveDoPronto));
      return;
    }
    const fresh = board.ready.filter((o) => !seen.current.has(chaveDoPronto(o)));
    fresh.forEach((o) => seen.current.add(chaveDoPronto(o)));
    if (!fresh.length) return;
    if (config.chime) chime();
    if (!overlay) return; // nos outros modos o destaque fica na própria lista
    const ids = new Set(fresh.map((o) => o.id));
    const novos = [...fresh].reverse(); // na ordem em que foram chamados
    setQueue((q) => {
      const [atual, ...resto] = q;
      const volta = atual && !ids.has(atual.id) && Date.now() - shownAt.current < AVISO_MINIMO_MS ? [atual] : [];
      return [...novos, ...volta, ...resto.filter((o) => !ids.has(o.id))];
    });
  }, [board.ready.map(chaveDoPronto).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Marca quando cada aviso entrou na tela; trocar de modo limpa a fila.
  const atual = queue[0] ? chaveDoPronto(queue[0]) : '';
  useEffect(() => { shownAt.current = Date.now(); }, [atual]);
  useEffect(() => { if (!overlay) setQueue([]); }, [overlay]);

  const shift = () => setQueue((q) => q.slice(1));
  return { board, queue, shift, latestId: board.ready[0]?.id };
}

/** Modo "Aviso em tela cheia": interrompe a mídia por alguns segundos. */
export function OrderOverlay({ order, config, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, (config.overlaySec || 12) * 1000);
    return () => clearTimeout(t);
  }, [order.id, order.readyAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = formatCustomerName(order.customerName, config.nameFormat);
  return (
    <div className="tv-overlay" key={chaveDoPronto(order)}>
      <div className="tv-overlay-card">
        <div className="tv-over">PEDIDO PRONTO</div>
        <div className="tv-overlay-num">{formatOrderNumber(order.number)}</div>
        {name && <div className="tv-overlay-name">{name}</div>}
        <div className="tv-overlay-help">Retire no balcão</div>
      </div>
    </div>
  );
}

/** Modo "Coluna lateral": mídia à esquerda, prontos e em preparo à direita. */
export function OrderSidebar({ board, config, latestId }) {
  return (
    <aside className="tv-side">
      <div className="tv-side-head"><span className="tv-over">PRONTOS</span><span className="tv-side-clock"><Clock /></span></div>
      <ul className="tv-side-ready">
        {/* A chave muda a cada chamada: chamar de novo remonta o item e repete a animação do destaque. */}
        {board.ready.slice(0, 5).map((o) => (
          <li key={chaveDoPronto(o)} className={o.id === latestId ? 'is-new' : ''}>
            <b>{formatOrderNumber(o.number)}</b>
            <span>{formatCustomerName(o.customerName, config.nameFormat)}</span>
          </li>
        ))}
        {!board.ready.length && <li className="tv-side-none">Nenhum pedido pronto agora</li>}
      </ul>
      {config.showPreparing && (
        <>
          <div className="tv-side-head tv-side-head-sub"><span className="tv-over tv-over-muted">EM PREPARO</span></div>
          <div className="tv-side-prep">
            {board.preparing.slice(0, 12).map((o) => <span key={o.id}>{formatOrderNumber(o.number)}</span>)}
          </div>
        </>
      )}
    </aside>
  );
}

/** Modo "Painel dedicado": a TV inteira é o painel de retirada. */
export function OrderBoard({ board, config, latestId, companyName }) {
  const hero = board.ready[0];
  return (
    <div className="tv tv-board">
      <header className="tv-board-head">
        <span className="tv-board-company">{companyName || 'Pedidos'}</span>
        <span className="tv-board-clock"><Clock /></span>
      </header>
      <div className={`tv-board-cols ${config.showPreparing ? '' : 'only-ready'}`}>
        {config.showPreparing && (
          <section className="tv-board-col">
            <h2 className="tv-board-title tv-over-muted">EM PREPARO</h2>
            <ul className="tv-board-prep">
              {board.preparing.slice(0, 14).map((o) => (
                <li key={o.id}><b>{formatOrderNumber(o.number)}</b><span>{formatCustomerName(o.customerName, config.nameFormat)}</span></li>
              ))}
              {!board.preparing.length && <li className="tv-board-none">Nenhum pedido em preparo</li>}
            </ul>
          </section>
        )}
        <section className="tv-board-col is-ready">
          <h2 className="tv-board-title">PRONTO · RETIRE NO BALCÃO</h2>
          {hero && (
            <div className={`tv-board-hero ${hero.id === latestId ? 'is-new' : ''}`} key={chaveDoPronto(hero)}>
              <b>{formatOrderNumber(hero.number)}</b>
              <span>{formatCustomerName(hero.customerName, config.nameFormat)}</span>
            </div>
          )}
          <ul className="tv-board-ready">
            {board.ready.slice(1, 9).map((o) => (
              <li key={o.id}><b>{formatOrderNumber(o.number)}</b><span>{formatCustomerName(o.customerName, config.nameFormat)}</span></li>
            ))}
          </ul>
          {!hero && <p className="tv-board-none">Os pedidos prontos aparecem aqui.</p>}
        </section>
      </div>
      <div className="tv-board-foot"><span className="tv-board-dot" />Atualizado em tempo real · Vértice</div>
    </div>
  );
}
