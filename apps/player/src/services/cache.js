// Cache offline das mídias.
// - No APK: baixa cada arquivo para o armazenamento interno do app (FileTransfer),
//   grava como .part e só renomeia quando termina (arquivo pela metade nunca toca).
// - No player Windows (Electron): baixa para o disco pelo processo principal (vxmedia://).
// - No navegador (Linux/Raspberry em quiosque): usa a Cache Storage API.
// Mídias que saíram do manifesto são apagadas para não lotar a TV Box.
import { Capacitor } from '@capacitor/core';
import { isNative, desktop } from './platform.js';

const DIR = 'vx-media';
const WEB_CACHE = 'vx-media-v1';

export class MediaCache {
  constructor() {
    /** mediaId → src local tocável */
    this.ready = new Map();
    this.objectUrls = new Map();
    this.running = null;
  }

  /** src para tocar: local se já baixou, senão a URL remota (toca enquanto baixa). */
  src(item) {
    return this.ready.get(item.mediaId) || item.url;
  }
  isReady(mediaId) {
    return this.ready.has(mediaId);
  }

  /**
   * Garante todos os arquivos do manifesto. Chamadas novas esperam a anterior terminar.
   * @param {{mediaId,url,ext,sizeBytes}[]} assets
   * @param {(p:{done:number,total:number,status:'syncing'|'synced'|'error'})=>void} onProgress
   */
  sync(assets, onProgress) {
    const run = async () => {
      const total = assets.length;
      let done = 0;
      const missing = [];
      for (const a of assets) {
        if (await this.#has(a)) {
          done++;
        } else missing.push(a);
      }
      onProgress?.({ done, total, status: missing.length ? 'syncing' : 'synced' });
      let failed = 0;
      for (const a of missing) {
        try {
          await this.#download(a);
          done++;
        } catch (e) {
          failed++;
          console.warn('[vx] falha ao baixar', a.mediaId, e);
        }
        onProgress?.({ done, total, status: done + failed < total ? 'syncing' : failed ? 'error' : 'synced' });
      }
      await this.#prune(new Set(assets.map((a) => a.mediaId)));
      return { done, total, failed };
    };
    this.running = (this.running || Promise.resolve()).then(run, run);
    return this.running;
  }

  #name(a) {
    return `${a.mediaId}.${String(a.ext || 'bin').replace(/[^A-Za-z0-9]/g, '') || 'bin'}`;
  }

  #path(a) {
    return `${DIR}/${a.mediaId}.${a.ext || 'bin'}`;
  }

  async #has(a) {
    if (this.ready.has(a.mediaId)) return true;
    if (desktop) {
      const src = await desktop.media.has(this.#name(a), a.sizeBytes || 0);
      if (src) this.ready.set(a.mediaId, src);
      return !!src;
    }
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      try {
        const st = await Filesystem.stat({ path: this.#path(a), directory: Directory.Data });
        if (a.sizeBytes && Math.abs(Number(st.size) - a.sizeBytes) > 1024) return false;
        this.ready.set(a.mediaId, Capacitor.convertFileSrc(st.uri));
        return true;
      } catch {
        return false;
      }
    }
    if (!('caches' in window)) return false;
    const c = await caches.open(WEB_CACHE);
    const hit = await c.match(a.url);
    if (!hit) return false;
    this.#setObjectUrl(a.mediaId, await hit.blob());
    return true;
  }

  async #download(a) {
    if (desktop) {
      this.ready.set(a.mediaId, await desktop.media.download(this.#name(a), a.url));
      return;
    }
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { FileTransfer } = await import('@capacitor/file-transfer');
      await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {});
      const part = `${this.#path(a)}.part`;
      const { uri } = await Filesystem.getUri({ path: part, directory: Directory.Data });
      await FileTransfer.downloadFile({ url: a.url, path: uri });
      await Filesystem.rename({ from: part, to: this.#path(a), directory: Directory.Data, toDirectory: Directory.Data });
      const final = await Filesystem.getUri({ path: this.#path(a), directory: Directory.Data });
      this.ready.set(a.mediaId, Capacitor.convertFileSrc(final.uri));
      return;
    }
    if (!('caches' in window)) throw new Error('Cache Storage indisponível');
    const res = await fetch(a.url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const c = await caches.open(WEB_CACHE);
    await c.put(a.url, res.clone());
    this.#setObjectUrl(a.mediaId, await res.blob());
  }

  #setObjectUrl(id, blob) {
    const prev = this.objectUrls.get(id);
    if (prev) URL.revokeObjectURL(prev);
    const u = URL.createObjectURL(blob);
    this.objectUrls.set(id, u);
    this.ready.set(id, u);
  }

  async #prune(keep) {
    for (const id of [...this.ready.keys()]) {
      if (!keep.has(id)) {
        this.ready.delete(id);
        const u = this.objectUrls.get(id);
        if (u) URL.revokeObjectURL(u);
        this.objectUrls.delete(id);
      }
    }
    try {
      if (desktop) {
        await desktop.media.prune([...keep]);
      } else if (isNative) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
        for (const f of files) {
          const id = f.name.split('.')[0];
          if (!keep.has(id) || f.name.endsWith('.part')) {
            await Filesystem.deleteFile({ path: `${DIR}/${f.name}`, directory: Directory.Data }).catch(() => {});
          }
        }
      } else if ('caches' in window) {
        // Na web, as chaves são URLs do Storage (".../media%2F{id}.ext?..."): extrai o id.
        const c = await caches.open(WEB_CACHE);
        for (const req of await c.keys()) {
          const id = /media%2F([^.%?]+)/.exec(req.url)?.[1];
          if (id && !keep.has(id)) await c.delete(req);
        }
      }
    } catch { /* pasta ainda não existe */ }
  }
}
