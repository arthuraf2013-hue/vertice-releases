import { describe, it, expect } from 'vitest';
import { versionCode, planUpdate } from './index.js';

const manifest = {
  version: '0.3.2',
  windows: { url: 'https://x/Setup-0.3.2.exe', sha512: 'abc' },
  android: { versionCode: 301, url: 'https://x/p-0.3.1.apk', sha256: 'f' },
  web: { version: '0.3.2', url: 'https://x/web-0.3.2.zip', sha256: 'e', minNativeCode: 300 },
};

describe('atualização automática do player', () => {
  it('versionCode cresce com a versão', () => {
    expect(versionCode('0.2.1')).toBe(201);
    expect(versionCode('0.3.0')).toBe(300);
    expect(versionCode('1.0.0')).toBeGreaterThan(versionCode('0.99.99'));
  });

  it('Windows: instala quando há versão maior', () => {
    expect(planUpdate(manifest, { shell: 'electron', version: '0.3.1' }).windows.url).toContain('0.3.2');
    expect(planUpdate(manifest, { shell: 'electron', version: '0.3.2' })).toEqual({});
  });

  it('Android: conteúdo novo vai em silêncio, sem reinstalar o APK', () => {
    const p = planUpdate(manifest, { shell: 'android', version: '0.3.0', nativeVersion: '0.3.0' });
    expect(p.web.version).toBe('0.3.2');
    expect(p.apk).toBeUndefined();
  });

  it('Android: APK só quando a parte nativa mudou (conteúdo exige APK mais novo)', () => {
    const nativoMudou = { ...manifest, android: { versionCode: 302, url: 'https://x/p.apk' }, web: { ...manifest.web, minNativeCode: 302 } };
    const p = planUpdate(nativoMudou, { shell: 'android', version: '0.3.1', nativeVersion: '0.3.0' });
    expect(p.apk.versionCode).toBe(302);
    expect(p.web).toBeUndefined();
    // APK antigo (0.2.x, sem atualização automática) nunca recebe o conteúdo novo por cima.
    expect(planUpdate(manifest, { shell: 'android', version: '0.2.1', nativeVersion: '0.2.1' }).web).toBeUndefined();
  });

  it('Android: não repete conteúdo que já falhou ao abrir', () => {
    expect(planUpdate(manifest, { shell: 'android', version: '0.3.1', nativeVersion: '0.3.1', badWeb: ['0.3.2'] }).web).toBeUndefined();
  });

  it('player web recarrega quando sai versão nova', () => {
    expect(planUpdate(manifest, { shell: 'web', version: '0.3.1' })).toEqual({ reload: true });
    expect(planUpdate({}, { shell: 'web', version: '0.3.1' })).toEqual({});
  });
});
