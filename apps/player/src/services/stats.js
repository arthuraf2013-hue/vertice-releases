// Exibições por mídia para o painel (Relatórios).
// A TV soma no aparelho (vale offline) e manda os totais do dia a cada 5 minutos para
// companies/{id}/playStats/{tela}_{dia}. Mandar o total (e não "+1") deixa o envio repetível.
import { localISODate } from '@vertice/shared';
import { local } from './platform.js';

const FLUSH_MS = 5 * 60_000;
const MIN_SECONDS = 1;

export function createStats(device) {
  let day = localISODate();
  let items = local.get(`stats:${day}`, {});
  let dirty = false;
  const pending = new Set(local.get('stats:pending', [])); // dias antigos ainda não enviados

  function save() {
    local.set(`stats:${day}`, items);
  }

  function roll() {
    const d = localISODate();
    if (d === day) return;
    if (dirty) pending.add(day);
    local.set('stats:pending', [...pending]);
    day = d;
    items = local.get(`stats:${day}`, {});
    dirty = false;
  }

  /** Uma exibição terminou: soma uma vez e o tempo que ficou na tela. */
  function record(item, seconds) {
    if (!item?.mediaId || !(seconds >= MIN_SECONDS)) return;
    roll();
    const r = items[item.mediaId] || { plays: 0, seconds: 0, name: '' };
    r.plays += 1;
    r.seconds = Math.round((r.seconds + Math.min(seconds, 3600)) * 10) / 10;
    r.name = String(item.name || '').slice(0, 80);
    if (item.advertiserId) r.adv = String(item.advertiserId).slice(0, 40); // relatório do anunciante
    items[item.mediaId] = r;
    dirty = true;
    save();
  }

  async function flush() {
    roll();
    for (const d of [...pending]) {
      try {
        await device.writeStats(d, local.get(`stats:${d}`, {}));
        pending.delete(d);
        local.set(`stats:${d}`, null);
      } catch { /* tenta no próximo ciclo */ }
    }
    local.set('stats:pending', [...pending]);
    if (!dirty) return;
    dirty = false;
    try {
      await device.writeStats(day, { ...items });
    } catch {
      dirty = true;
    }
  }

  const t = setInterval(flush, FLUSH_MS);
  return { record, flush, stop: () => clearInterval(t) };
}
