import { useEffect, useState } from 'react';
import { compareVersions, screenStatus, formatDateTime } from '@vertice/shared';
import { downloads, api } from '../data/api.js';
import { useSession } from '../session.jsx';
import { useCol, useNow } from '../data/hooks.js';
import { PageHeader, Card, useToast, Button, ScreenStatus } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

// Manifesto publicado pelo GitHub Actions. O ramo "updates" é servido com CORS liberado
// (o painel consegue ler); o GitHub Releases fica por último (costuma bloquear o navegador).
const REPO = 'arthuraf2013-hue/vertice-releases';
const MANIFESTOS = [
  `https://raw.githubusercontent.com/${REPO}/updates/player-update.json`,
  `https://cdn.jsdelivr.net/gh/${REPO}@updates/player-update.json`,
  `https://github.com/${REPO}/releases/latest/download/player-update.json`,
];
const PLATAFORMA = { android: 'Android', 'android-tv': 'Android', windows: 'Windows', electron: 'Windows', web: 'Navegador' };
// Antes desta versão o player não tinha atualização automática: precisa reinstalar uma vez.
const AUTO_DESDE = '0.3.0';
const cmdId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function usePublished() {
  const [s, setS] = useState({ loading: true, manifest: null });
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const u of MANIFESTOS) {
        try {
          const r = await fetch(`${u}?t=${Date.now()}`, { cache: 'no-store' });
          if (r.ok) {
            const m = await r.json();
            if (m?.version) { if (vivo) setS({ loading: false, manifest: m, from: u }); return; }
          }
        } catch { /* tenta o próximo */ }
      }
      if (vivo) setS({ loading: false, manifest: null });
    })();
    return () => { vivo = false; };
  }, []);
  return s;
}

/** Quadro "Atualização das telas": versão publicada × versão de cada TV. */
function PlayerUpdates() {
  const { base, can, user } = useSession();
  const toast = useToast();
  const now = useNow();
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const { loading, manifest } = usePublished();
  const [busy, setBusy] = useState(false);
  const v = manifest?.version;
  const rows = (screens || []).map((s) => {
    const off = screenStatus(s, now).key === 'offline';
    const ok = v && s.appVersion && compareVersions(s.appVersion, v) >= 0;
    const manual = s.appVersion && compareVersions(s.appVersion, AUTO_DESDE) < 0;
    return { s, off, ok, manual, old: v && s.appVersion && !ok && !manual };
  });
  const behind = rows.filter((r) => r.old && !r.off);
  const manuais = rows.filter((r) => r.manual).length;
  const pedir = async () => {
    setBusy(true);
    try {
      await api.batch(behind.map(({ s }) => ({ op: 'set', path: `${base}/screens/${s.id}/live/command`, data: { id: cmdId(), type: 'update', at: api.NOW, by: user?.uid || '' } })));
      toast(`Pedido enviado para ${behind.length} ${behind.length === 1 ? 'tela' : 'telas'}. Cada uma baixa e aplica sozinha.`);
    } catch (e) {
      toast(e.message, 'offline');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Atualização das telas" icon="download"
      actions={can('admin') && behind.length > 0 && <Button size="sm" variant="primary" icon="download" loading={busy} onClick={pedir}>Atualizar agora ({behind.length})</Button>}>
      {loading ? <p className="vx-muted">Conferindo a versão publicada…</p> : manifest ? (
        <div className="vx-upd-head">
          <div><span className="vx-label">Versão publicada</span><b className="vx-upd-ver">{v}</b></div>
          <div className="vx-faint">
            {manifest.publishedAt && <>Publicada {formatDateTime(Date.parse(manifest.publishedAt))}. </>}
            {[manifest.windows?.version === v && 'Windows', manifest.android?.version === v && 'APK', manifest.web?.version === v && 'conteúdo Android'].filter(Boolean).join(', ') || '—'}
            {manifest.notes && <> · {manifest.notes}</>}
          </div>
        </div>
      ) : (
        <p className="vx-help vx-help-warn"><Icon name="alert" />Ainda não há versão publicada para as TVs (ou o GitHub não respondeu). Sem versão publicada, as telas não têm de onde se atualizar.</p>
      )}
      {!!rows.length && (
        <table className="vx-table vx-upd-table">
          <thead><tr><th>Tela</th><th>Sistema</th><th>Versão na tela</th><th>Situação</th></tr></thead>
          <tbody>
            {rows.map(({ s, off, ok, old, manual }) => (
              <tr key={s.id}>
                <td><b>{s.name}</b> <span className="vx-faint">{s.code}</span></td>
                <td>{PLATAFORMA[s.platform] || s.platform || '—'}</td>
                <td className="vx-num">{s.appVersion || '—'}</td>
                <td>
                  {ok ? <span className="vx-state vx-state-online"><i />Atualizada</span>
                    : manual ? <span className="vx-state vx-state-offline"><i />Reinstale uma vez (player sem atualização automática)</span>
                      : old ? <span className={`vx-state ${off ? 'vx-state-idle' : 'vx-state-warn'}`}><i />{off ? 'Desatualizada · offline, atualiza quando voltar' : 'Desatualizada · a TV baixa sozinha'}</span>
                        : <ScreenStatus screen={s} now={now} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {manuais > 0 && <p className="vx-help vx-help-warn"><Icon name="alert" />{manuais} {manuais === 1 ? 'tela tem' : 'telas têm'} player anterior à {AUTO_DESDE}: instale o player desta página nela uma vez. Daí em diante ela se atualiza sozinha.</p>}
      <p className="vx-help">As TVs conferem a cada hora (e logo depois de ligar). Se o GitHub falhar, buscam nos espelhos; se der erro, tentam de novo em 5, 10, 20 minutos. O conteúdo novo entra sozinho; no Android, só o APK novo (raro) pode pedir "Instalar".</p>
    </Card>
  );
}

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
      <PlayerUpdates />
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
