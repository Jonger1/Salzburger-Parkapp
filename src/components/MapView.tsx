import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../AppContext';
import { ALTSTADT_ACCESS_AREA, DATA_DATE, PEDESTRIAN_LINES, RESIDENT_ZONES, ZONES, type ZoneKind } from '../data/zones';
import { DISABLED_SPOTS, fetchOccupancy, MACHINES, PLACES, priceOf, type Occupancy, type Place } from '../data/places';
import { evaluate } from '../lib/evaluate';
import type { LatLng } from '../lib/geo';
import { formatDate } from '../lib/i18n';
import { useSession } from '../lib/store';
import { StatusCard } from './NowView';
import { Icon } from './ui';

export const ZONE_STYLE: Record<ZoneKind | 'altstadt_access' | 'resident', { color: string; fill: number; dash?: string }> = {
  kpz_paid: { color: '#1d4ed8', fill: 0.3 },
  kpz_free: { color: '#38bdf8', fill: 0.25 },
  pedestrian: { color: '#8e4ec6', fill: 0 },
  altstadt_access: { color: '#f5a524', fill: 0.04, dash: '6 6' },
  resident: { color: '#16a34a', fill: 0, dash: '2 6' },
};

const PLACE_COLOR: Record<Place['kind'], string> = { garage: '#1f2937', lot: '#475569', pr: '#16a34a' };
const SALZBURG: LatLng = [47.8028, 13.0448];
const OFFICIAL_MAP = `https://maps.stadt-salzburg.at/cmsmap.html?spec=${encodeURIComponent('{"mode":"layer","baselayer":0,"layers":[{"id":541,"subs":[]}]}')}`;
/** Automaten und Behindertenparkplätze erst ab dieser Zoomstufe zeigen */
const DETAIL_ZOOM = 16;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function MapView() {
  const { t, lang, fix, settings, updateSettings, profile, setPicked, goTo, startParking } = useApp();
  const [session] = useSession();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const placesLayer = useRef<L.LayerGroup | null>(null);
  const detailLayer = useRef<L.LayerGroup | null>(null);
  const residentLayer = useRef<L.LayerGroup | null>(null);
  const tapMarker = useRef<L.CircleMarker | null>(null);
  const [tapped, setTapped] = useState<LatLng | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [zoom, setZoom] = useState(14);
  const [occupancy, setOccupancy] = useState<Map<number, Occupancy> | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(fix?.point ?? SALZBURG, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Zonen: <a href="https://data.stadt-salzburg.at/">Stadt Salzburg</a>',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);

    L.polygon(ALTSTADT_ACCESS_AREA, {
      color: ZONE_STYLE.altstadt_access.color, weight: 2, fillOpacity: ZONE_STYLE.altstadt_access.fill,
      dashArray: ZONE_STYLE.altstadt_access.dash, interactive: false,
    }).addTo(m);
    // zuerst die gebührenfreien, darüber die gebührenpflichtigen Zonen
    for (const z of [...ZONES].reverse()) {
      const s = ZONE_STYLE[z.kind];
      L.polygon(z.polygons, { color: s.color, weight: 1, fillColor: s.color, fillOpacity: s.fill, interactive: false }).addTo(m);
    }
    L.polyline(PEDESTRIAN_LINES.map((l) => l.line), { color: ZONE_STYLE.pedestrian.color, weight: 5, opacity: 0.75, interactive: false }).addTo(m);

    residentLayer.current = L.layerGroup().addTo(m);
    placesLayer.current = L.layerGroup().addTo(m);
    detailLayer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => setTapped([e.latlng.lat, e.latlng.lng]));
    m.on('zoomend', () => setZoom(m.getZoom()));
    // Der Hinweis verschwindet, sobald die Karte benutzt wird
    m.on('click dragstart popupopen', () => setHint(false));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 50);
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-Belegung der Garagen
  useEffect(() => {
    if (!settings.showPlaces) return;
    let alive = true;
    const load = () => fetchOccupancy().then((d) => alive && setOccupancy(d)).catch(() => undefined);
    void load();
    const id = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [settings.showPlaces]);

  // Bewohnerparkzonen (Umrisse)
  useEffect(() => {
    const layer = residentLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!settings.showResidentZones) return;
    const s = ZONE_STYLE.resident;
    for (const r of RESIDENT_ZONES) {
      const mine = settings.residentPermit && r.name === settings.residentZone;
      L.polygon(r.polygons, { color: s.color, weight: mine ? 4 : 2, dashArray: mine ? undefined : s.dash, fill: false, interactive: false })
        .bindTooltip(r.name, { permanent: true, direction: 'center', className: 'zone-label' })
        .addTo(layer);
    }
  }, [settings.showResidentZones, settings.residentPermit, settings.residentZone]);

  // Garagen, Parkplätze, P+R
  useEffect(() => {
    const layer = placesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!settings.showPlaces) return;
    for (const p of PLACES) {
      const occ = occupancy?.get(p.id);
      const label = p.kind === 'pr' ? 'P+R' : 'P';
      const icon = L.divIcon({
        className: 'place-icon',
        html: `<span style="background:${PLACE_COLOR[p.kind]}">${label}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const price = priceOf(p);
      const lines = [
        `<strong>${esc(p.name)}</strong>`,
        p.address ? esc(p.address) : '',
        occ ? `<b>${esc(t('map.freeSpaces', { n: occ.free }))}</b>${occ.updated ? ` <small>(${esc(occ.updated)})</small>` : ''}` : '',
        price ? esc(price[lang]) : '',
        `<a href="https://www.google.com/maps/dir/?api=1&destination=${p.pos[0]},${p.pos[1]}" target="_blank" rel="noreferrer">${esc(t('map.route'))}</a>` +
          (p.url && /^https?:\/\//.test(p.url) ? ` · <a href="${esc(p.url)}" target="_blank" rel="noreferrer">${esc(t('map.website'))}</a>` : ''),
      ].filter(Boolean);
      L.marker(p.pos, { icon }).bindPopup(lines.join('<br>')).addTo(layer);
    }
  }, [settings.showPlaces, lang, occupancy, t]);

  // Parkscheinautomaten und barrierefreie Parkplätze (nur nah herangezoomt)
  useEffect(() => {
    const layer = detailLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (zoom < DETAIL_ZOOM) return;
    if (settings.showMachines) {
      for (const mch of MACHINES) {
        L.circleMarker(mch.pos, { radius: 6, color: '#fff', weight: 2, fillColor: '#1d4ed8', fillOpacity: 1 })
          .bindPopup(`<strong>${esc(t('legend.machine'))}</strong><br>${esc(mch.name)}`)
          .addTo(layer);
      }
    }
    if (settings.disabilityPermit) {
      for (const pos of DISABLED_SPOTS) {
        L.circleMarker(pos, { radius: 6, color: '#fff', weight: 2, fillColor: '#0ea5e9', fillOpacity: 1 })
          .bindPopup(esc(t('legend.disabled')))
          .addTo(layer);
      }
    }
  }, [zoom >= DETAIL_ZOOM, settings.showMachines, settings.disabilityPermit, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // eigener Standort + Auto
  useEffect(() => {
    const layer = meLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (fix) {
      L.circle(fix.point, { radius: fix.accuracy, color: '#3e8ef7', weight: 0, fillOpacity: 0.12, interactive: false }).addTo(layer);
      L.circleMarker(fix.point, { radius: 7, color: '#fff', weight: 3, fillColor: '#3e8ef7', fillOpacity: 1, interactive: false }).addTo(layer);
    }
    if (session) {
      const icon = L.divIcon({ className: 'place-icon car', html: '<span>🚗</span>', iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([session.lat, session.lng], { icon, interactive: false }).addTo(layer);
    }
  }, [fix, session]);

  // Tipp-Markierung
  useEffect(() => {
    tapMarker.current?.remove();
    tapMarker.current = null;
    if (tapped && map.current) {
      tapMarker.current = L.circleMarker(tapped, { radius: 8, color: '#111', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map.current);
    }
  }, [tapped]);

  const ev = tapped ? evaluate(tapped, new Date(), profile) : null;
  const legendZones: (ZoneKind | 'altstadt_access' | 'resident')[] = ['kpz_paid', 'kpz_free', 'pedestrian', 'resident', 'altstadt_access'];

  return (
    <div className="map-view">
      <div ref={el} className={`map ${zoom < 15 ? 'zoomed-out' : ''}`} />
      <div className="map-tools">
        <button className="fab" aria-label={t('map.locate')} disabled={!fix} onClick={() => fix && map.current?.setView(fix.point, 17)}>
          <Icon name="locate" />
        </button>
        <button className="fab" aria-label={t('map.legend')} aria-expanded={legendOpen} onClick={() => setLegendOpen((o) => !o)}>
          <Icon name="info" />
        </button>
      </div>
      {legendOpen && (
        <div className="legend">
          <strong>{t('map.legend')}</strong>
          {legendZones.map((k) => (
            <div key={k} className="legend-row">
              <span className={`swatch ${k === 'pedestrian' || k === 'resident' || k === 'altstadt_access' ? 'line' : ''}`} style={{ background: ZONE_STYLE[k].color }} />
              {t(`legend.${k}`)}
            </div>
          ))}
          {(['garage', 'pr'] as const).map((k) => (
            <div key={k} className="legend-row">
              <span className="swatch round" style={{ background: PLACE_COLOR[k] }} />
              {t(`legend.${k}`)}
            </div>
          ))}
          <div className="legend-row">
            <span className="swatch round" style={{ background: '#1d4ed8' }} />
            {t('legend.machine')} <small className="muted">({t('map.zoomIn')})</small>
          </div>
          <label className="legend-row check">
            <input type="checkbox" checked={settings.showPlaces} onChange={(e) => updateSettings({ showPlaces: e.target.checked })} />
            {t('map.layerGarages')}
          </label>
          <label className="legend-row check">
            <input type="checkbox" checked={settings.showMachines} onChange={(e) => updateSettings({ showMachines: e.target.checked })} />
            {t('legend.machine')}
          </label>
          <label className="legend-row check">
            <input type="checkbox" checked={settings.showResidentZones} onChange={(e) => updateSettings({ showResidentZones: e.target.checked })} />
            {t('legend.resident')}
          </label>
          <small className="muted">{t('now.dataDate', { date: formatDate(lang, DATA_DATE) })}</small>
          <a href={OFFICIAL_MAP} target="_blank" rel="noreferrer">{t('map.officialMap')} <Icon name="external" size={14} /></a>
        </div>
      )}
      {hint && !ev && !legendOpen && <div className="map-hint">{t('map.tapHint')}</div>}
      {ev && tapped && (
        <div className="sheet">
          <button className="sheet-close" aria-label={t('common.close')} onClick={() => setTapped(null)}>×</button>
          <StatusCard ev={ev} point={tapped} compact />
          <div className="btn-grid">
            <button className="btn" onClick={() => { setPicked(tapped); goTo('now'); }}>{t('map.showHere')}</button>
            {!session && ev.status !== 'outside' && ev.status !== 'no_parking' && (
              <button className="btn primary" onClick={() => { startParking(tapped); goTo('now'); }}>{t('now.parkHere')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
