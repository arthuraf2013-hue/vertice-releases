import { NEWS_PUBLISHERS, publisherFeeds } from './feeds.js';

/* ---------------- Atalhos do catálogo ---------------- */

/**
 * Cartões prontos no catálogo de Aplicativos: abrem um tipo já configurado (portal de notícias,
 * campeonato, playlist do YouTube). "action" abre uma tela própria (importar lista IPTV).
 */
export const APP_PRESETS = [
  ...['g1', 'uol', 'ge', 'agenciabrasil', 'canaltech', 'vatican', 'cnn', 'folha'].map((k) => {
    const p = NEWS_PUBLISHERS[k];
    const editorias = Object.keys(p.feeds);
    return {
      id: `news-${k}`, kind: 'headlines', label: p.label, icon: 'news', group: 'Notícias', brand: p.color,
      desc: `Manchetes do ${p.label}${editorias.length > 1 ? ` em ${editorias.length} editorias: ${editorias.slice(0, 4).join(', ')}${editorias.length > 4 ? '…' : ''}` : ''}.`,
      name: p.label, config: { feeds: publisherFeeds(k), publisher: k },
    };
  }),
  { id: 'brasileirao', kind: 'standings', label: 'Brasileirão', icon: 'trophy', group: 'Esportes', desc: 'Classificação da Série A com pontos e saldo; o seu time em destaque.', name: 'Brasileirão', config: { leagueId: 4351 } },
  { id: 'estaduais', kind: 'standings', label: 'Campeonatos estaduais', icon: 'trophy', group: 'Esportes', desc: 'A tabela do seu estadual: Pernambucano, Paulista, Carioca, Mineiro e mais 18.', name: 'Estadual', config: { leagueId: 5768, rows: 10 } },
  { id: 'jogos-dia', kind: 'matches', label: 'Jogos e resultados', icon: 'ball', group: 'Esportes', desc: 'Últimos placares e próximos jogos, com horário, do campeonato ou do seu time.', name: 'Jogos', config: { leagueId: 4351 } },
  { id: 'yt-playlist', kind: 'youtube', label: 'Playlist do YouTube', icon: 'playlist', group: 'Web', desc: 'Os vídeos de uma playlist do YouTube em sequência, sem baixar nada.', name: 'Playlist do YouTube', config: { source: 'playlist' } },
  { id: 'yt-live', kind: 'youtube', label: 'Canal ao vivo', icon: 'broadcast', group: 'Web', desc: 'A transmissão ao vivo do seu canal do YouTube (culto, evento, aula) entra sozinha.', name: 'Ao vivo no YouTube', config: { source: 'live' } },
  { id: 'iptv', action: 'iptv', label: 'Canais IPTV', icon: 'tv', group: 'Web', desc: 'Importe a lista M3U do seu fornecedor: cada canal vira um item para playlists, grupos e zonas.' },
];
