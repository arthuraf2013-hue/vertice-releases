import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session.jsx';
import { api } from '../data/api.js';
import { PageHeader, Card, Button } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

/** Guias curtos do dia a dia, do primeiro acesso à venda de anúncios. */
const GUIDES = [
  { id: 'primeira-tela', icon: 'screen', title: 'Ligar a primeira TV', level: 'Começo', steps: [
    'Instale o Vértice Player na TV box (Downloads) ou abra o player no navegador da TV.',
    'A TV mostra um código de 6 letras. No painel, vá em Telas › Adicionar tela e digite o código.',
    'Dê um nome à tela (ex.: Balcão) e escolha a unidade. Pronto: ela já recebe a programação.',
  ], link: ['/telas', 'Abrir Telas'] },
  { id: 'primeira-playlist', icon: 'playlist', title: 'Montar a primeira playlist', level: 'Começo', steps: [
    'Envie imagens e vídeos em Mídias (arraste os arquivos para a página).',
    'Em Playlists, crie uma playlist e adicione as mídias na ordem que quiser.',
    'Em Programação, escolha a playlist, os dias e os horários, e para quais telas ela vai.',
  ], link: ['/playlists', 'Abrir Playlists'] },
  { id: 'apps', icon: 'apps', title: 'Usar aplicativos que se atualizam sozinhos', level: 'Começo', steps: [
    'Em Aplicativos, escolha um (clima, notícias, loterias, relógio…) e configure.',
    'A prévia mostra como fica na TV, deitada ou em pé.',
    'Salve e coloque o aplicativo numa playlist, como se fosse uma imagem.',
  ], link: ['/aplicativos', 'Abrir Aplicativos'] },
  { id: 'campanhas', icon: 'library', title: 'Campanhas do mês prontas', level: 'Começo', steps: [
    'Em Biblioteca, escolha o mês e toque em Usar na campanha (Outubro Rosa, Black Friday…).',
    'A peça vai para o Estúdio com as cores da campanha; ajuste o texto se quiser.',
    'Ou crie um kit inteiro (comunicação interna, varejo, academia) com a playlist pronta.',
  ], link: ['/biblioteca', 'Abrir Biblioteca'] },
  { id: 'zonas', icon: 'layout', title: 'Dividir a tela em zonas e pôr a barra inferior', level: 'Intermediário', steps: [
    'Em Layouts, escolha um modelo (lateral, dividida, em L).',
    'Em cada zona, escolha o que passa: a programação, um aplicativo ou uma imagem fixa.',
    'Ligue a barra inferior com hora, clima, avisos e o seu logo, e aplique às telas.',
  ], link: ['/layouts', 'Abrir Layouts'] },
  { id: 'senhas', icon: 'bell', title: 'Chamar senha ou nome na TV', level: 'Intermediário', steps: [
    'Crie o aplicativo Chamada de senhas com os tipos (Normal, Preferencial) e os guichês.',
    'Coloque numa playlist da TV da recepção.',
    'Em Operação › Chamar senha, pelo celular ou computador, toque para chamar. Dá para chamar pelo nome também.',
  ], link: ['/senhas', 'Abrir Chamar senha'] },
  { id: 'pesquisa', icon: 'clipboard', title: 'Pesquisa de satisfação com QR Code', level: 'Intermediário', steps: [
    'Crie o aplicativo Pesquisa de satisfação com as perguntas (nota de 0 a 10, estrelas, opções, texto).',
    'A TV mostra o QR Code; o cliente responde no celular, sem cadastro.',
    'Acompanhe a nota NPS e as sugestões em Interação › Pesquisas e baixe a planilha.',
  ], link: ['/comentarios', 'Abrir Interação'] },
  { id: 'alerta', icon: 'siren', title: 'Mandar um alerta urgente para todas as telas', level: 'Intermediário', steps: [
    'Em Alerta urgente, escolha um modelo (evacuação, aviso geral) ou escreva o seu.',
    'Escolha as telas e por quanto tempo. O alerta passa na frente de tudo, com som.',
    'Encerre pela barra vermelha que aparece no topo do painel.',
  ], link: ['/alerta', 'Abrir Alerta'] },
  { id: 'anunciantes', icon: 'megaphone', title: 'Vender anúncio nas suas telas', level: 'Comercial', steps: [
    'Use a Calculadora para mostrar quantas vezes o anúncio vai aparecer.',
    'Acompanhe a negociação no CRM e monte a proposta em Mídia indoor.',
    'Cadastre o anunciante, ligue as mídias a ele e mande o relatório de exibições do mês.',
  ], link: ['/crm', 'Abrir CRM'] },
  { id: 'offline', icon: 'wifi', title: 'O que acontece quando a internet cai', level: 'Suporte', steps: [
    'A TV guarda as mídias e continua tocando a programação sem internet.',
    'Aplicativos de dados (clima, notícias) mostram a última informação que conseguiram ler.',
    'Quando a internet volta, a TV baixa o que mudou sozinha. Veja tudo em Monitoramento.',
  ], link: ['/monitoramento', 'Abrir Monitoramento'] },
];

const LEVELS = ['Todos', 'Começo', 'Intermediário', 'Comercial', 'Suporte'];

/**
 * Academia: guias do Vértice e um assistente que responde dúvidas de uso (IA no servidor de mídias).
 */
export function Academy() {
  const { companyId } = useSession();
  const [level, setLevel] = useState('Todos');
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = GUIDES.filter((g) => level === 'Todos' || g.level === level);

  const ask = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError(''); setAnswer(null);
    try {
      const r = await api.aiText(companyId, { mode: 'help', question: q.trim(), context: PANEL_MAP });
      setAnswer(r.answer || '');
    } catch (err) {
      setError(err.message || 'O assistente não respondeu agora.');
    } finally { setBusy(false); }
  };

  return (
    <div className="vx-page">
      <PageHeader overline="AJUDA" title="Academia" subtitle="Guias rápidos do dia a dia e um assistente para tirar dúvidas sobre o Vértice." />

      <Card title="Pergunte ao assistente" icon="sparkles">
        <form className="vx-inline-search" onSubmit={ask}>
          <input className="vx-input" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Como faço a TV desligar às 22h?" aria-label="Sua dúvida" />
          <Button type="submit" variant="primary" icon="send" loading={busy}>Perguntar</Button>
        </form>
        {error && <p className="vx-help vx-help-warn"><Icon name="alert" />{error}</p>}
        {answer && <div className="vx-academy-answer">{answer.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>}
        <p className="vx-help">O assistente conhece as telas do painel. Para problemas de conta ou pagamento, fale com a Vetta Sistemas.</p>
      </Card>

      <div className="vx-chips vx-academy-levels">
        {LEVELS.map((l) => <button key={l} type="button" className={`vx-chip-btn ${level === l ? 'is-on' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)}>{l}</button>)}
      </div>
      <div className="vx-academy-grid">
        {list.map((g) => (
          <Card key={g.id} className="vx-academy-card">
            <button type="button" className="vx-academy-head" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
              <span className="vx-tile vx-tile-accent"><Icon name={g.icon} /></span>
              <span><b>{g.title}</b><small className="vx-faint">{g.level} · {g.steps.length} passos</small></span>
              <Icon name={open === g.id ? 'chevronDown' : 'chevronRight'} />
            </button>
            {open === g.id && (
              <>
                <ol className="vx-academy-steps">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <Link className="vx-link" to={g.link[0]}>{g.link[1]}<Icon name="arrowRight" /></Link>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Resumo das telas do painel para o assistente (vai junto da pergunta). */
export const PANEL_MAP = GUIDES.map((g) => `${g.title}: ${g.steps.join(' ')}`).join('\n');
