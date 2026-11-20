// Guia de configuração da primeira tela: os passos, as dicas de cada página e quando o guia começa sozinho.

/** Quantas entradas no painel o guia começa sozinho enquanto a configuração não termina. */
export const SETUP_AUTO_VISITS = 3;

const g = (name, extra = '') => `[data-guide="${name}"]${extra}`;

/**
 * Passos para deixar uma tela exibindo conteúdo, na ordem em que precisam ser feitos.
 * Cada passo sabe se já foi feito pelo que existe na conta.
 * `hints` vem em ordem de prioridade: o guia mostra a primeira cujo alvo está visível na página,
 * então a dica acompanha o que a pessoa já fez (abriu a janela, digitou o código, escolheu as mídias…).
 */
export function setupSteps({ screens = [], media = [], playlists = [], schedules = [], playerConfirmed = false } = {}) {
  const paired = screens.length > 0;
  const steps = [
    {
      id: 'player', icon: 'download', title: 'Instale o player na TV', done: paired || playerConfirmed,
      path: '/downloads', page: 'Downloads',
      text: 'Instale o Vértice Player no aparelho ligado à TV. Ao abrir, ele mostra um código de 6 caracteres.',
      hints: [
        { target: g('player-options'), text: 'Escolha o aparelho da TV: APK para TV box e smart TV Android, instalador para Windows ou o player web. Siga os passos do cartão. Quando o código aparecer na TV, clique em "Já instalei".' },
      ],
      confirm: 'Já instalei, o código está na TV',
    },
    {
      id: 'pair', icon: 'screen', title: 'Pareie a tela', done: paired,
      path: '/telas', page: 'Telas',
      text: 'Digite o código que aparece na TV para ligar a tela à sua conta.',
      hints: [
        { target: g('pair-submit', ':not(:disabled)'), text: 'Código completo. Clique em Conectar tela.' },
        { target: g('pair-code'), text: 'Digite aqui o código de 6 caracteres que aparece na TV. Não precisa do traço.' },
        { target: g('pair-open'), text: 'Clique em Parear tela.' },
      ],
    },
    {
      id: 'media', icon: 'upload', title: 'Envie suas mídias', done: media.length > 0,
      path: '/midias', page: 'Mídias',
      text: 'Imagens, vídeos ou PDFs que vão passar na TV.',
      hints: [
        { target: g('media-upload'), text: 'Clique em Enviar mídias e escolha imagens, vídeos ou PDFs do computador. Também dá para arrastar os arquivos para esta página.' },
      ],
    },
    {
      id: 'playlist', icon: 'playlist', title: 'Monte uma playlist', done: playlists.length > 0,
      path: '/playlists', page: 'Playlists',
      text: 'A sequência de mídias que a TV vai repetir.',
      hints: [
        { target: g('playlist-save', ':not(:disabled)'), text: 'Confira a ordem e o tempo de cada mídia e clique em Salvar playlist.' },
        { target: g('playlist-pick'), text: 'Toque nas mídias para colocá-las na sequência.' },
        { target: g('playlist-add'), text: 'Dê um nome à playlist e clique em Adicionar mídias.' },
        { target: g('playlist-new'), text: 'Clique em Nova playlist.' },
      ],
    },
    {
      id: 'publish', icon: 'send', title: 'Publique a programação', done: schedules.some((s) => s.status === 'published'),
      path: '/programacao', page: 'Programação',
      text: 'Diga qual playlist passa na tela e em que horário.',
      hints: [
        { target: g('schedule-name', ':placeholder-shown'), text: 'Dê um nome para a grade, como "Grade da semana".' },
        { target: g('schedule-publish'), when: g('schedule-targets', ' [aria-pressed="true"]'), text: 'Confira os dias, o horário e a playlist da faixa e clique em Publicar. A TV atualiza em alguns segundos.' },
        { target: g('schedule-targets'), text: 'Escolha onde a grade vai passar: marque a sua tela em Telas avulsas ou um grupo de telas.' },
        { target: g('schedule-row-publish'), text: 'Sua grade está em rascunho. Clique em Publicar para ela ir para a TV.' },
        { target: g('schedule-new'), text: 'Clique em Nova grade.' },
      ],
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) || null;
  return { steps, done, total: steps.length, complete: !next, next };
}

/** O guia começa sozinho nas primeiras entradas, se a pessoa não pediu para esconder e ainda falta algo. */
export function shouldAutoOpenSetup({ visits = 0, hidden = false } = {}, progress) {
  if (hidden || !progress || progress.complete) return false;
  return visits <= SETUP_AUTO_VISITS;
}

/**
 * A dica a mostrar: a primeira cujo alvo existe (e cuja condição `when`, se houver, também).
 * `has(selector)` diz se o elemento está na página.
 */
export function pickHint(step, has) {
  if (!step) return null;
  return step.hints.find((h) => has(h.target) && (!h.when || has(h.when))) || null;
}

/** A pessoa está na página do passo? (ignora a busca da URL, como "?parear=1"). */
export function onStepPage(step, pathname = '') {
  return !!step && (pathname.replace(/\/+$/, '') || '/') === step.path;
}
