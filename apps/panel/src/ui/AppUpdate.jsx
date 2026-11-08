import pkg from '../../package.json';
import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

const desktop = typeof window !== 'undefined' ? window.vxDesktop : null;
/** Atualizador do painel instalado no Windows (no navegador não existe: o site já é a versão nova). */
const updater = desktop?.update || null;

function texto(s, conferiuAgora) {
  switch (s?.status) {
    case 'checking': return 'Procurando versão nova…';
    case 'downloading': return `Baixando a versão ${s.available}${s.progress ? ` · ${s.progress}%` : '…'}`;
    case 'ready': return `Versão ${s.available} pronta para instalar`;
    case 'installing': return 'Instalando… o painel abre de novo sozinho';
    case 'error': return 'Não consegui atualizar agora';
    case 'dev': return 'Rodando do código-fonte (sem atualização)';
    case 'uptodate': return conferiuAgora ? 'Você já está na versão mais nova' : 'Atualizado';
    default: return 'Atualização automática ligada';
  }
}

/**
 * Rodapé do menu: versão e o botão de atualização manual do painel no Windows.
 * O painel já confere sozinho ao abrir e a cada hora e baixa em segundo plano; o botão confere na
 * hora e, com a versão baixada, reinicia e instala. Fechando o painel, ela entra em silêncio.
 */
export function AppUpdate() {
  const [s, setS] = useState(null);
  const [manual, setManual] = useState(false);
  const versao = desktop?.version || pkg.version;

  useEffect(() => {
    if (!updater) return undefined;
    updater.state().then((st) => st && setS(st)).catch(() => {});
    return updater.onState(setS);
  }, []);

  if (!updater) return <div className="vx-nav-foot"><span className="vx-mono">v{versao}</span></div>;

  const procurar = async () => {
    setManual(true);
    try { setS(await updater.check()); } catch (e) { setS({ status: 'error', error: e.message }); }
  };
  const status = s?.status;
  const ocupado = status === 'checking' || status === 'downloading' || status === 'installing';

  return (
    <div className={`vx-nav-foot vx-appupd ${status === 'ready' ? 'is-ready' : ''}`}>
      <div className="vx-appupd-line">
        <span className="vx-mono">v{versao}</span>
        <span className={`vx-appupd-state ${status === 'error' ? 'is-bad' : status === 'uptodate' ? 'is-ok' : ''}`} title={status === 'error' ? s.error : undefined}>
          {status === 'uptodate' && <Icon name="check" />}
          {texto(s, manual)}
        </span>
      </div>
      {status === 'downloading' && <div className="vx-bar vx-appupd-bar"><i style={{ width: `${s.progress || 4}%` }} /></div>}
      {status === 'ready' ? (
        <>
          <button type="button" className="vx-btn vx-btn-sm vx-btn-primary" onClick={() => updater.install()}>
            <Icon name="sync" />Reiniciar e atualizar
          </button>
          <span className="vx-appupd-help">Ou feche o painel: a versão nova entra sozinha.</span>
        </>
      ) : (
        <button type="button" className="vx-btn vx-btn-sm" disabled={ocupado || status === 'dev'} onClick={procurar}>
          {ocupado ? <span className="vx-spinner" aria-hidden /> : <Icon name="download" />}
          {status === 'error' ? 'Tentar de novo' : 'Procurar atualização'}
        </button>
      )}
    </div>
  );
}
