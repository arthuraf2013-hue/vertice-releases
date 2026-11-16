/**
 * Endereço do site público (termos, privacidade e a página de comentários do mural).
 * No Hosting o painel fica em /app/ e o site na raiz; no Windows e no desenvolvimento, o domínio.
 */
export function siteBase() {
  if (typeof location !== 'undefined' && /^https?:/.test(location.protocol) && location.pathname.startsWith('/app')) return `${location.origin}/`;
  return (import.meta.env.VITE_SITE_URL || 'https://vertice.vettasistemas.com.br/').replace(/\/?$/, '/');
}
