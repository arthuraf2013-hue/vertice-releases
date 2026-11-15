// Tempo de GIF animado: o painel lê a duração da animação ao enviar a mídia (campo `animSec`)
// e o GIF passa a ficar na tela por voltas inteiras, em vez dos segundos padrão de imagem.

/** Menor tempo de um GIF na tela: animações curtas repetem até passar disso. */
export const GIF_MIN_SECONDS = 5;

/**
 * Duração de uma volta do GIF, em segundos, lendo os atrasos de cada quadro.
 * Devolve null para GIF de um quadro só (parado) ou arquivo que não é GIF.
 * @param {Uint8Array} b bytes do arquivo
 */
export function gifAnimationSeconds(b) {
  if (!b || b.length < 14) return null;
  const sig = String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  let p = 13;
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1)); // tabela de cores global
  const pulaSubBlocos = () => {
    while (p < b.length) {
      const n = b[p++];
      if (!n) return;
      p += n;
    }
  };
  let quadros = 0;
  let centesimos = 0;
  let atraso = 0;
  while (p < b.length) {
    const tipo = b[p++];
    if (tipo === 0x3b) break; // fim do arquivo
    if (tipo === 0x21) {
      const rotulo = b[p++];
      if (rotulo === 0xf9 && b[p] === 4) atraso = b[p + 2] | (b[p + 3] << 8); // controle gráfico do próximo quadro
      pulaSubBlocos();
    } else if (tipo === 0x2c) {
      const flags = b[p + 8];
      p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1)); // tabela de cores local
      p += 1; // tamanho mínimo do código LZW
      pulaSubBlocos();
      quadros += 1;
      centesimos += atraso < 2 ? 10 : atraso; // os navegadores tocam atrasos de 0 e 1 como 100 ms
      atraso = 0;
    } else {
      return null; // arquivo corrompido
    }
  }
  if (quadros < 2 || p > b.length + 1) return null;
  return Math.round(centesimos) / 100;
}

/**
 * Tempo automático de um GIF na tela: voltas inteiras da animação, no mínimo GIF_MIN_SECONDS.
 * Devolve null quando a mídia não tem animação conhecida.
 */
export function gifAutoSeconds(animSec, min = GIF_MIN_SECONDS) {
  const s = Number(animSec);
  if (!Number.isFinite(s) || s <= 0) return null;
  const voltas = Math.max(1, Math.ceil((min - 1e-9) / s));
  return Math.min(600, Math.round(voltas * s * 10) / 10);
}
