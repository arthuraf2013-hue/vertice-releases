import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { host, can } from '../services/host.js';

const VISIVEL_MS = 6000;
// Mouse perto do topo: a barra fica mais tempo (a pessoa está indo pegar nela).
const PERTO_DO_TOPO_PX = 120;

/**
 * Barra do topo do player no Windows (no lugar da moldura do Windows, que não existe).
 * Aparece quando o mouse mexe e some sozinha. Arrastando por ela, o player vai para outro
 * monitor; ao soltar, ele preenche o monitor onde o mouse estava e passa a abrir sempre lá.
 * Em janela comum ela fica sempre visível (é por ela que se move a janela).
 */
export function WindowBar() {
  const [janela, setJanela] = useState({ fullscreen: true, monitores: 1 });
  const [mexeu, setMexeu] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    host.windowState().then(setJanela).catch(() => {});
    return host.onWindowState(setJanela);
  }, []);

  useEffect(() => {
    const mostrar = (e) => {
      setMexeu(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMexeu(false), e.clientY < PERTO_DO_TOPO_PX ? VISIVEL_MS * 2 : VISIVEL_MS);
    };
    window.addEventListener('pointermove', mostrar, { passive: true });
    window.addEventListener('pointerdown', mostrar, { passive: true });
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('pointermove', mostrar);
      window.removeEventListener('pointerdown', mostrar);
    };
  }, []);

  const visivel = mexeu || !janela.fullscreen;
  useEffect(() => {
    document.body.classList.toggle('vx-winbar-on', visivel);
    return () => document.body.classList.remove('vx-winbar-on');
  }, [visivel]);

  const dica = janela.fullscreen
    ? janela.monitores > 1
      ? 'Arraste esta barra até outro monitor: o player preenche a tela onde você soltar'
      : 'Arraste esta barra para mover o player'
    : 'Arraste para mover · puxe as bordas para mudar o tamanho';

  return createPortal(
    <div className={`vx-winbar ${visivel ? 'is-on' : ''}`} role="toolbar" aria-label="Janela do player" aria-hidden={!visivel}>
      <div className="vx-winbar-grip">
        <svg viewBox="0 0 16 16" aria-hidden>
          {[3, 8, 13].flatMap((x) => [5, 11].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
        </svg>
        <b>Vértice Player</b>
        <span>{dica}</span>
      </div>
      <div className="vx-winbar-actions">
        <button type="button" tabIndex={visivel ? 0 : -1} onClick={() => host.setFullscreen(!janela.fullscreen)}>
          {janela.fullscreen ? 'Janela' : 'Tela cheia'}
        </button>
        {can.minimize && <button type="button" tabIndex={visivel ? 0 : -1} onClick={() => host.minimize()}>Minimizar</button>}
      </div>
    </div>,
    document.body,
  );
}
