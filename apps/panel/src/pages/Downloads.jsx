import { downloads } from '../data/api.js';
import { PageHeader, Card, useToast } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

export function Downloads() {
  const toast = useToast();
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copiado.'));
  const kiosk = `chromium --kiosk --autoplay-policy=no-user-gesture-required ${downloads.web}`;
  return (
    <div className="vx-page">
      <PageHeader overline="GESTÃO" title="Downloads" subtitle="Instale o player nas TVs. Depois é só digitar o código da tela em Telas › Parear tela." />
      <div className="vx-grid-3">
        <Card title="TV Box e Smart TV Android" icon="android">
          <ol className="vx-steps">
            <li>Na TV Box, abra o navegador e baixe o APK (ou copie para um pendrive).</li>
            <li>Permita "fontes desconhecidas" e instale o <b>Vértice Player</b>.</li>
            <li>Abra o app: ele mostra o código de pareamento. O player inicia sozinho quando a TV liga.</li>
          </ol>
          <a className="vx-btn vx-btn-primary" href={downloads.android}><Icon name="download" />Baixar APK</a>
          <p className="vx-help">Android 7 ou mais novo. Funciona como launcher em TV Box (tela inicial). Depois de instalado, o player se atualiza sozinho.</p>
        </Card>
        <Card title="Player para Windows" icon="monitor">
          <ol className="vx-steps">
            <li>No computador ligado à TV, baixe e abra o instalador.</li>
            <li>O player abre em tela cheia e mostra o código de pareamento.</li>
            <li>Ele abre sozinho quando o Windows liga e se atualiza sozinho.</li>
          </ol>
          <a className="vx-btn vx-btn-primary" href={downloads.playerWindows}><Icon name="download" />Baixar player para Windows</a>
          <p className="vx-help">Sem mouse na TV? Toque em qualquer tecla para o botão "Menu" aparecer.</p>
        </Card>
        <Card title="Windows, Linux e Raspberry" icon="globe">
          <ol className="vx-steps">
            <li>Use o Chrome ou Chromium em tela cheia (modo quiosque).</li>
            <li>Abra o endereço do player web abaixo.</li>
            <li>Coloque o comando na inicialização do sistema.</li>
          </ol>
          <div className="vx-code-box">
            <code>{kiosk}</code>
            <button type="button" className="vx-btn vx-btn-icon vx-btn-ghost-icon" onClick={() => copy(kiosk)} aria-label="Copiar"><Icon name="copy" /></button>
          </div>
          <a className="vx-btn" href={downloads.web} target="_blank" rel="noreferrer"><Icon name="link" />Abrir player web</a>
        </Card>
        <Card title="Painel no computador" icon="monitor">
          <p className="vx-muted">O mesmo painel, instalado no Windows: abre direto, fica na barra de tarefas e é ideal para a Sala de controle no monitor do escritório.</p>
          <a className="vx-btn" href={downloads.windows}><Icon name="download" />Baixar para Windows</a>
          <p className="vx-help">O painel web continua funcionando em qualquer navegador.</p>
        </Card>
      </div>
      <Card title="Dicas para a TV não parar" icon="alert" iconTone="neutral">
        <ul className="vx-tips">
          <li><b>Internet:</b> o player baixa as mídias e toca mesmo sem internet. Ele só precisa da rede para receber mudanças.</li>
          <li><b>Energia:</b> configure a TV para ligar sozinha quando a energia volta (menu da TV › Energia).</li>
          <li><b>Vídeos:</b> prefira MP4 H.264 em 1080p. 4K e H.265 travam em TV Box mais simples.</li>
          <li><b>Pedidos:</b> a tela do painel de pedidos precisa de internet para receber o pedido pronto na hora.</li>
        </ul>
      </Card>
    </div>
  );
}
