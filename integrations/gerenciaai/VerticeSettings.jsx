/**
 * Tela de configuração "Vértice" para o GerenciaAI (Configurações › Vértice).
 * Ajuste os estilos para os componentes do GerenciaAI; a lógica fica toda aqui.
 *
 * Uso:
 *   import { vertice } from './verticeClient';   // instância única (veja README)
 *   <VerticeSettings vx={vertice} />
 */
import { useEffect, useState } from 'react';

export function VerticeSettings({ vx }) {
  const [s, setS] = useState(vx.getState());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testSent, setTestSent] = useState(false);
  useEffect(() => vx.onState(setS), [vx]);

  const test = () => {
    setErr('');
    try {
      vx.sendTestOrder();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 60_000);
    } catch (e) {
      setErr(e.message);
    }
  };

  const generate = async () => {
    setBusy(true);
    setErr('');
    try {
      await vx.startPairing();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={box}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Vértice · Painel de pedidos na TV</h2>
      <p style={muted}>Mostra o número do pedido e o nome do cliente nas TVs da loja quando o pedido fica pronto.</p>

      {s.status === 'paired' && (
        <>
          <p style={{ ...badge, background: '#e2f3ec', color: '#11724f' }}>● Conectado{s.companyName ? ` a ${s.companyName}` : ''}</p>
          <p style={muted}>Caixa: <b>{s.terminal}</b>{s.lastSentAt ? ` · último pedido enviado às ${new Date(s.lastSentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          {s.pending > 0 && <p style={{ ...badge, background: '#fff4e5', color: '#8a4b00' }}>{s.pending} {s.pending === 1 ? 'pedido aguardando' : 'pedidos aguardando'} internet. Saem sozinhos quando a conexão voltar.</p>}
          {s.lastError && <p style={{ ...badge, background: '#fbe7e5', color: '#9b1c1c' }}>{s.lastError}</p>}
          <p style={muted}>Para escolher em quais TVs os pedidos aparecem, use o painel Vértice: Telas › configurar tela › Painel de pedidos.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...btn, ...primary }} onClick={test} disabled={testSent}>{testSent ? 'Teste enviado: confira a TV' : 'Enviar pedido de teste'}</button>
            <button type="button" style={btn} onClick={() => vx.unpair()}>Desconectar este caixa</button>
          </div>
        </>
      )}

      {s.status === 'pairing' && (
        <>
          <p style={muted}>No painel Vértice, abra <b>Empresa › Integrações › Conectar caixa</b> e digite:</p>
          <div style={code}>{s.code.slice(0, 3)}<span style={{ color: '#d9a84e', margin: '0 .2em' }}>·</span>{s.code.slice(3)}</div>
          <p style={muted}>O código vale por 30 minutos. Esta tela muda sozinha quando conectar.</p>
          <button type="button" style={btn} onClick={() => vx.cancelPairing()}>Cancelar</button>
        </>
      )}

      {(s.status === 'unpaired' || s.status === 'error') && (
        <>
          {s.error && <p style={{ ...badge, background: '#fbe7e5', color: '#9b1c1c' }}>{s.error}</p>}
          <button type="button" style={{ ...btn, ...primary }} onClick={generate} disabled={busy}>{busy ? 'Gerando…' : 'Gerar código de conexão'}</button>
        </>
      )}

      {s.status === 'starting' && <p style={muted}>Conectando ao Vértice…</p>}
      {err && <p style={{ ...badge, background: '#fbe7e5', color: '#9b1c1c' }}>{err}</p>}
    </section>
  );
}

const box = { border: '1px solid #e3e8ee', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 };
const muted = { margin: 0, color: '#4b5a70', fontSize: 14, lineHeight: '22px' };
const badge = { margin: 0, alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700 };
const code = { fontFamily: 'Sora, system-ui, sans-serif', fontSize: 56, fontWeight: 700, letterSpacing: '.06em', color: '#141b26' };
const btn = { alignSelf: 'flex-start', height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid #8795a8', background: '#fff', fontWeight: 600, cursor: 'pointer' };
const primary = { background: '#293548', borderColor: '#293548', color: '#fff' };
