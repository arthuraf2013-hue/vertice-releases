/**
 * QR Code e Pix, sem internet (a TV gera o código na hora).
 */
import qrcode from 'qrcode-generator';
import { parsePrice } from './apps.js';

/** Texto → matriz do QR Code (true = quadradinho preto). Aceita acentos (UTF-8). */
export function qrMatrix(text, level = 'M') {
  const s = String(text ?? '');
  if (!s) return null;
  const qr = qrcode(0, level);
  // A biblioteca grava 1 byte por caractere: passamos o texto já em UTF-8.
  qr.addData(unescape(encodeURIComponent(s)));
  qr.make();
  const n = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/** Matriz → caminho SVG (um "d" só, leve para desenhar). */
export function qrPath(matrix) {
  if (!matrix) return '';
  let d = '';
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) { x++; continue; }
      let w = 1;
      while (row[x + w]) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}

/* ---------------- Wi-Fi ---------------- */

const wifiEsc = (s = '') => String(s).replace(/([\\;,:"])/g, '\\$1');
export function wifiPayload({ ssid = '', password = '', security = 'WPA', hidden = false } = {}) {
  const t = security === 'nopass' || !password ? 'nopass' : security;
  return `WIFI:T:${t};S:${wifiEsc(ssid)};${t === 'nopass' ? '' : `P:${wifiEsc(password)};`}${hidden ? 'H:true;' : ''};`;
}

/* ---------------- Pix (BR Code estático, padrão do Banco Central) ---------------- */

const plain = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .,\-@/]/g, '').trim();
const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o BR Code. */
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Pix "copia e cola" estático.
 * @param {{ key: string, name: string, city: string, amount?: number|null, txid?: string, message?: string }} p
 */
export function pixPayload({ key, name, city, amount = null, txid = '', message = '' }) {
  const k = String(key || '').trim();
  if (!k) return '';
  const acc = field('00', 'br.gov.bcb.pix') + field('01', k) + (message ? field('02', plain(message).slice(0, 40)) : '');
  const tx = (String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)) || '***';
  let s = field('00', '01')
    + field('26', acc)
    + field('52', '0000')
    + field('53', '986')
    + (Number(amount) > 0 ? field('54', Number(amount).toFixed(2)) : '')
    + field('58', 'BR')
    + field('59', (plain(name).toUpperCase() || 'RECEBEDOR').slice(0, 25))
    + field('60', (plain(city).toUpperCase() || 'BRASIL').slice(0, 15))
    + field('62', field('05', tx));
  s += '6304';
  return s + crc16(s);
}

/** Texto que vai dentro do QR, conforme o modo do aplicativo. */
export function qrContent(c = {}) {
  if (c.mode === 'wifi') return c.ssid ? wifiPayload({ ssid: c.ssid, password: c.password, security: c.security || 'WPA' }) : '';
  if (c.mode === 'pix') return pixPayload({ key: c.pixKey, name: c.pixName, city: c.pixCity, amount: parsePrice(c.pixAmount), message: c.pixMessage });
  if (c.mode === 'text') return String(c.text || '').slice(0, 500);
  return String(c.url || '').trim();
}
