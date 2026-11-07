import { PAIRING_ALPHABET, PAIRING_LENGTH } from './constants.js';

/** Gera um código de pareamento aleatório (ex.: "4F7K2Q"). */
export function generatePairingCode(random = defaultRandom) {
  let out = '';
  for (let i = 0; i < PAIRING_LENGTH; i++) {
    out += PAIRING_ALPHABET[Math.floor(random() * PAIRING_ALPHABET.length)];
  }
  return out;
}

function defaultRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }
  return Math.random();
}

/** "4f7-k2q", "4F7 K2Q" → "4F7K2Q". O alfabeto não tem 0/O/1/I/L, então não há troca ambígua. */
export function normalizePairingCode(input = '') {
  return String(input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, PAIRING_LENGTH);
}

export function isValidPairingCode(code = '') {
  if (code.length !== PAIRING_LENGTH) return false;
  return [...code].every((c) => PAIRING_ALPHABET.includes(c));
}

/** Para exibir: "4F7K2Q" → ["4F7", "K2Q"]. */
export function splitPairingCode(code = '') {
  return [code.slice(0, 3), code.slice(3, 6)];
}

/** Código humano da tela: 1 → "VTX-0001". */
export function screenCode(seq) {
  return `VTX-${String(seq).padStart(4, '0')}`;
}
