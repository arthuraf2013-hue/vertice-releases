import { useEffect, useState } from 'react';
import { splitPairingCode } from '@vertice/shared';
import simbolo from '@vertice/shared/brand/vertice-simbolo-escuro.svg';
import { APP_VERSION } from '../services/platform.js';

/** Telas de sistema do player (PlayerScreen do design system): sempre escuras. */
export function SystemScreen({ variant, code, codeExpiresAt, network, screenCode, companyName }) {
  const content = {
    boot: { over: 'INICIANDO', title: 'Preparando a tela', help: 'Só um instante.' },
    pairing: { over: 'PAREAMENTO', title: 'Conecte esta tela', help: <>No painel Vértice, abra <b>Telas › Parear tela</b> e digite o código:</> },
    empty: { over: companyName ? companyName.toUpperCase() : 'SEM PROGRAMAÇÃO', title: 'Nada programado para agora', help: <>Publique uma grade para esta tela em <b>Programação</b>, no painel.</> },
    offline: { over: 'SEM INTERNET', title: 'Aguardando conexão', help: 'Confira o cabo ou o Wi-Fi da TV. Tentamos de novo sozinhos.' },
    syncing: { over: 'BAIXANDO CONTEÚDO', title: 'Preparando as mídias', help: 'A primeira vez leva alguns minutos. Depois a tela toca mesmo sem internet.' },
  }[variant];
  const [a, b] = splitPairingCode(code || '');

  return (
    <div className="tv tv-system">
      <div className="tv-top"><img src={simbolo} alt="" /><span className="tv-brand">Vért<span className="tv-i">ı</span>ce</span></div>
      <div className="tv-main">
        <div className="tv-over">{content.over}</div>
        <h1 className="tv-title">{content.title}</h1>
        <p className="tv-help">{content.help}</p>
        {variant === 'pairing' && code && (
          <>
            <div className="tv-code" aria-label={`Código ${code.split('').join(' ')}`}>{a}<span>·</span>{b}</div>
            <ExpiresIn at={codeExpiresAt} />
          </>
        )}
        {variant === 'boot' && <div className="tv-loader"><i /></div>}
      </div>
      <BottomBar network={network} screenCode={screenCode} />
    </div>
  );
}

function ExpiresIn({ at }) {
  const now = useTick(15_000);
  if (!at) return null;
  const min = Math.max(1, Math.ceil((at - now) / 60000));
  return <p className="tv-expire">Este código troca sozinho em {min} min.</p>;
}

export function useTick(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Clock() {
  const now = useTick(10_000);
  return <>{new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>;
}

function BottomBar({ network, screenCode }) {
  const online = network?.online !== false;
  return (
    <div className="tv-bar">
      <span><svg className="tv-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><Clock /></span>
      <span className="tv-sep" />
      <span className={online ? '' : 'tv-bar-off'}>
        <svg className="tv-ico" viewBox="0 0 24 24">{online ? <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.1" /> : <path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5.5 12.5a9.5 9.5 0 0 1 4-2.3M2.5 9a14 14 0 0 1 5-3M14 9.5a9.5 9.5 0 0 1 4.5 3M12 19.5v.1" />}</svg>
        {online ? `Conectado${network?.type && network.type !== 'unknown' ? ` · ${network.type === 'wifi' ? 'Wi-Fi' : network.type === 'ethernet' ? 'Cabo' : network.type}` : ''}` : 'Sem internet'}
      </span>
      <span className="tv-ver">v{APP_VERSION}{screenCode ? ` · ${screenCode}` : ''}</span>
    </div>
  );
}
