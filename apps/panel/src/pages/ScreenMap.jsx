import { useEffect, useMemo, useRef, useState } from 'react';
import { screenStatus, STATUS_LABEL } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useNow } from '../data/hooks.js';
import { api } from '../data/api.js';
import { PageHeader, Button, Card, Loading, EmptyState, useToast } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { searchAddress } from './CompanyExtra.jsx';

// Leaflet e o mapa do OpenStreetMap vêm da internet só quando a página abre.
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const COLOR = { online: '#11724f', warn: '#b4470c', offline: '#9b1c1c', sync: '#2d64a8', idle: '#5f6e84' };
const RANK = { offline: 4, warn: 3, sync: 2, idle: 1, online: 0 };

let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletP = leafletP || new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.onload = () => resolve(window.L);
    s.onerror = () => { leafletP = null; reject(new Error('Sem internet para carregar o mapa.')); };
    document.head.appendChild(s);
  });
  return leafletP;
}

/** Situação da unidade: a pior entre as telas dela. */
function unitState(screens, now) {
  const st = screens.map((s) => screenStatus(s, now).key);
  const worst = st.sort((a, b) => RANK[b] - RANK[a])[0] || 'idle';
  const count = (k) => st.filter((x) => x === k).length;
  return { worst, online: count('online'), warn: count('warn') + count('sync'), offline: count('offline'), total: st.length };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Mapa de telas: cada unidade é um ponto com a cor da pior situação das telas dela.
 * Unidade sem local: escolha e clique no mapa (ou busque o endereço) para marcar.
 */
export function ScreenMap() {
  const { base, units, can } = useSession();
  const toast = useToast();
  const now = useNow();
  const screens = useCol(`${base}/screens`);
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [err, setErr] = useState('');
  const [placing, setPlacing] = useState(null);
  const [ready, setReady] = useState(false);
  const placingRef = useRef(null);
  placingRef.current = placing;

  const byUnit = useMemo(() => {
    const m = new Map();
    for (const s of screens || []) m.set(s.unitId || '', [...(m.get(s.unitId || '') || []), s]);
    return m;
  }, [screens]);
  const placed = units.filter((u) => u.geo?.lat != null);
  const missing = units.filter((u) => u.geo?.lat == null);

  // Cria o mapa uma vez.
  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !box.current || map.current) return;
      map.current = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([-8.05, -34.9], 12);
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      map.current.on('click', async (e) => {
        const u = placingRef.current;
        if (!u) return;
        await api.update(`${base}/units/${u.id}`, { geo: { ...(u.geo || {}), lat: e.latlng.lat, lon: e.latlng.lng } });
        setPlacing(null);
        toast(`${u.name} marcada no mapa.`);
      });
      setErr('');
      setReady(true);
    }, (e) => alive && setErr(e.message));
    return () => { alive = false; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pontos (atualiza com a situação das telas).
  useEffect(() => {
    const L = window.L;
    if (!L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts = [];
    for (const u of placed) {
      const list = byUnit.get(u.id) || [];
      const st = unitState(list, now);
      const icon = L.divIcon({
        className: 'vx-map-pin',
        html: `<span style="--c:${COLOR[st.worst]}"><b>${st.total}</b></span>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const mk = L.marker([u.geo.lat, u.geo.lon], { icon, draggable: can('admin'), title: u.name, keyboard: true }).addTo(layer.current);
      mk.bindPopup(`<div class="vx-map-pop"><b>${esc(u.name)}</b><span>${esc(u.address || '')}</span><ul>${list.map((s) => {
        const k = screenStatus(s, now).key;
        return `<li><i style="background:${COLOR[k]}"></i>${esc(s.name)} <small>${STATUS_LABEL[k]}</small></li>`;
      }).join('') || '<li>Sem telas</li>'}</ul><a href="#/telas">Ver telas</a></div>`);
      mk.on('dragend', async () => {
        const p = mk.getLatLng();
        await api.update(`${base}/units/${u.id}`, { geo: { ...(u.geo || {}), lat: p.lat, lon: p.lng } });
        toast(`Local de ${u.name} ajustado.`);
      });
      pts.push([u.geo.lat, u.geo.lon]);
    }
    if (pts.length && !map.current._vxFitted) {
      map.current.fitBounds(pts, { padding: [60, 60], maxZoom: 15 });
      map.current._vxFitted = true;
    }
  }, [placed, byUnit, now, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { box.current?.classList.toggle('is-placing', !!placing); }, [placing]);

  const findAndPlace = async (u) => {
    try {
      const r = await searchAddress([u.address, u.city].filter(Boolean).join(', ') || u.name);
      if (!r.length) return toast('Endereço não encontrado. Clique no mapa para marcar.');
      await api.update(`${base}/units/${u.id}`, { geo: { lat: r[0].lat, lon: r[0].lon, city: r[0].city } });
      map.current?.setView([r[0].lat, r[0].lon], 16);
      toast(`${u.name} marcada pelo endereço. Arraste o ponto para ajustar.`);
    } catch (e) { toast(e.message); }
  };

  if (!screens) return <Loading />;
  const noUnit = byUnit.get('') || [];
  return (
    <div className="vx-page">
      <PageHeader overline="OPERAÇÃO" title="Mapa de telas" subtitle="Cada ponto é uma unidade, com a cor da pior situação entre as telas dela." />
      <div className="vx-map-layout">
        <Card pad={false} className="vx-map-card">
          {err ? <EmptyState icon="map" title="Mapa indisponível">{err}</EmptyState> : <div ref={box} className="vx-map" role="application" aria-label="Mapa das unidades" />}
          {placing && <div className="vx-map-hint"><Icon name="pin" />Clique no mapa onde fica <b>{placing.name}</b>. <button type="button" onClick={() => setPlacing(null)}>Cancelar</button></div>}
        </Card>
        <div className="vx-map-side">
          <Card title="Legenda" icon="pulse" iconTone="neutral">
            <ul className="vx-map-legend">
              {['online', 'warn', 'offline', 'idle'].map((k) => <li key={k}><i style={{ background: COLOR[k] }} />{STATUS_LABEL[k]}</li>)}
            </ul>
            <p className="vx-help">O número no ponto é a quantidade de telas da unidade.</p>
          </Card>
          {units.length === 0 ? (
            <Card><EmptyState icon="pin" title="Nenhuma unidade">Cadastre as lojas em Telas › Unidades para vê-las no mapa.</EmptyState></Card>
          ) : missing.length > 0 && (
            <Card title="Sem local no mapa" icon="pin">
              <ul className="vx-map-missing">
                {missing.map((u) => (
                  <li key={u.id}>
                    <div><b>{u.name}</b><span className="vx-faint">{(byUnit.get(u.id) || []).length} telas</span></div>
                    {can('admin') && <div className="vx-row-actions">
                      {(u.address || u.city) && <Button size="sm" icon="search" onClick={() => findAndPlace(u)}>Pelo endereço</Button>}
                      <Button size="sm" icon="pin" onClick={() => setPlacing(u)}>Clicar no mapa</Button>
                    </div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {noUnit.length > 0 && <p className="vx-help"><Icon name="alert" />{noUnit.length} {noUnit.length === 1 ? 'tela está' : 'telas estão'} sem unidade e não aparecem no mapa.</p>}
          <p className="vx-help">Mapa © colaboradores do OpenStreetMap.</p>
        </div>
      </div>
    </div>
  );
}

