// Guia de configuração da primeira tela: os passos e quando abrir o guia sozinho.

/** Quantas entradas no painel o guia abre sozinho enquanto a configuração não termina. */
export const SETUP_AUTO_VISITS = 3;

/**
 * Passos para deixar uma tela exibindo conteúdo, na ordem em que precisam ser feitos.
 * Cada passo sabe se já foi feito pelo que existe na conta.
 */
export function setupSteps({ screens = [], media = [], playlists = [], schedules = [] } = {}) {
  const paired = screens.length > 0;
  const steps = [
    {
      id: 'player', icon: 'download', title: 'Instale o player na TV',
      text: 'Baixe o Vértice Player na TV box, na smart TV Android ou no computador ligado à tela. Ao abrir, ele mostra um código de 6 caracteres.',
      action: 'Ver downloads', to: '/downloads', done: paired,
    },
    {
      id: 'pair', icon: 'screen', title: 'Pareie a tela',
      text: 'Digite o código que aparece na TV. A tela passa a fazer parte da sua conta e recebe o que você publicar.',
      action: 'Parear tela', to: '/telas?parear=1', done: paired,
    },
    {
      id: 'media', icon: 'upload', title: 'Envie suas mídias',
      text: 'Imagens, vídeos ou PDFs. Também dá para criar uma arte no Estúdio ou usar um aplicativo, como relógio e notícias.',
      action: 'Enviar mídias', to: '/midias', done: media.length > 0,
    },
    {
      id: 'playlist', icon: 'playlist', title: 'Monte uma playlist',
      text: 'Escolha as mídias, a ordem e quanto tempo cada uma fica na tela.',
      action: 'Criar playlist', to: '/playlists', done: playlists.length > 0,
    },
    {
      id: 'publish', icon: 'send', title: 'Publique a programação',
      text: 'Diga qual playlist passa em qual tela e em que horário. Depois de publicar, a TV atualiza sozinha em alguns segundos.',
      action: 'Abrir programação', to: '/programacao', done: schedules.some((s) => s.status === 'published'),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) || null;
  return { steps, done, total: steps.length, complete: !next, next };
}

/** O guia abre sozinho nas primeiras entradas, se a pessoa não pediu para esconder e ainda falta algo. */
export function shouldAutoOpenSetup({ visits = 0, hidden = false } = {}, progress) {
  if (hidden || !progress || progress.complete) return false;
  return visits <= SETUP_AUTO_VISITS;
}
