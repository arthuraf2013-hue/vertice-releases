import { describe, it, expect } from 'vitest';
import { gifAnimationSeconds, gifAutoSeconds, expandPlaylist, mediaSeconds } from './index.js';

/** Monta um GIF mínimo com os atrasos dados (centésimos de segundo). */
function gif(delays, { globalTable = true, localTable = false } = {}) {
  const b = [...'GIF89a'].map((c) => c.charCodeAt(0));
  b.push(1, 0, 1, 0, globalTable ? 0x80 : 0, 0, 0);
  if (globalTable) b.push(0, 0, 0, 255, 255, 255);
  b.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0); // repetir
  for (const d of delays) {
    b.push(0x21, 0xf9, 4, 0, d & 255, d >> 8, 0, 0);
    b.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, localTable ? 0x80 : 0);
    if (localTable) b.push(0, 0, 0, 255, 255, 255);
    b.push(2, 2, 0x4c, 0x01, 0);
  }
  b.push(0x3b);
  return new Uint8Array(b);
}

describe('gifAnimationSeconds', () => {
  it('soma os atrasos dos quadros', () => {
    expect(gifAnimationSeconds(gif([50, 50, 100]))).toBe(2);
    expect(gifAnimationSeconds(gif([300, 20], { localTable: true, globalTable: false }))).toBe(3.2);
  });
  it('atraso 0 ou 1 conta 100 ms, como nos navegadores', () => {
    expect(gifAnimationSeconds(gif([0, 1, 0, 10]))).toBe(0.4);
  });
  it('GIF parado, arquivo de outro tipo ou truncado: null', () => {
    expect(gifAnimationSeconds(gif([50]))).toBeNull();
    expect(gifAnimationSeconds(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toBeNull();
    expect(gifAnimationSeconds(gif([50, 50]).slice(0, 40))).toBeNull();
    expect(gifAnimationSeconds(null)).toBeNull();
  });
});

describe('tempo automático', () => {
  it('GIF fica por voltas inteiras, no mínimo 5 s', () => {
    expect(gifAutoSeconds(2)).toBe(6);
    expect(gifAutoSeconds(0.4)).toBe(5.2);
    expect(gifAutoSeconds(5)).toBe(5);
    expect(gifAutoSeconds(12.34)).toBe(12.3);
    expect(gifAutoSeconds(0)).toBeNull();
    expect(gifAutoSeconds(undefined)).toBeNull();
  });
  it('playlist: tempo do item > tempo ajustado na mídia > GIF > padrão', () => {
    const g = { id: 'g', type: 'image', url: 'u', ext: 'gif', animSec: 2 };
    const media = new Map([
      ['g', g],
      ['g2', { ...g, id: 'g2', defaultDurationSec: 20 }],
      ['i', { id: 'i', type: 'image', url: 'u', ext: 'png' }],
      ['v', { id: 'v', type: 'video', url: 'u', ext: 'mp4', durationSec: 12.4 }],
    ]);
    const items = expandPlaylist({ id: 'p', items: [{ mediaId: 'g' }, { mediaId: 'g', durationSec: 9 }, { mediaId: 'g2' }, { mediaId: 'i' }, { mediaId: 'v' }] }, media);
    expect(items.map((x) => x.durationSec)).toEqual([6, 9, 20, 10, 13]);
    expect(mediaSeconds(media.get('v'))).toBe(13);
    expect(mediaSeconds({ type: 'app', app: { kind: 'clock' } })).toBeGreaterThan(0);
  });
});
