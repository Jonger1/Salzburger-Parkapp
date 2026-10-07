import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../AppContext';
import { ZONES, type ZoneKind } from '../data/zones';
import { PLACES, type Place } from '../data/places';
import { evaluate } from '../lib/evaluate';
import type { LatLng } from '../lib/geo';
import { useSession } from '../lib/store';
import { StatusCard } from './NowView';
import { Icon } from './ui';

export const ZONE_STYLE: Record<ZoneKind, { color: string; fill: number; dash?: string }> = {
  kpz_paid: { color: '#e5484d', fill: 0.22 },
  kpz_free: { color: '#3e8ef7', fill: 0.18 },
  pedestrian: { color: '#8e4ec6', fill: 0.35 },
  altstadt_access: { color: '#f5a524', fill: 0.05, dash: '6 6' },
  municipal: { color: '#8b8d98', fill: 0.2 },
};

const PLACE_COLOR: Record<Place['kind'], string> = { garage: '#1f2937', pr: '#16a34a', mall: '#0ea5e9' };
const SALZBURG: LatLng = [47.8028, 13.0448];
const OFFICIAL_MAP = 'https://www.stadt-salzburg.at/kurzparkzone';

export function MapView() {
  const { t, lang, fix, settings, updateSettings, setPicked, goTo, startParking } = useApp();
  const [session] = useSession();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const placesLayer = useRef<L.LayerGroup | null>(null);
  const tapMarker = useRef<L.CircleMarker | null>(null);
  const [tapped, setTapped] = useState<LatLng | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(fix?.point ?? SALZBURG, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);

    for (const z of [...ZONES].sort((a, b) => a.priority - b.priority)) {
      const s = ZONE_STYLE[z.kind];
      L.polygon(z.polygon, {
        color: s.color,
        weight: z.kind === 'altstadt_access' ? 2 : 1.5,
        fillColor: s.color,
        fillOpacity: s.fill,
        dashArray: s.dash,
        interactive: false,
      }).addTo(m);
    }
    meLayer.current = L.layerGroup().addTo(m);
    placesLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => setTapped([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 50);
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Garagen & P+R
  useEffect(() => {
    const layer = placesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!settings.showPlaces) return;
    for (const p of PLACES) {
      const label = p.kind === 'pr' ? 'P+R' : 'P';
      const icon = L.divIcon({
        className: 'place-icon',
        html: `<span style="background:${PLACE_COLOR[p.kind]}">${label}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const price = p.price ? `<br>${p.price[lang]}` : '';
      const spaces = p.spaces ? `<br>${p.spaces} ${lang === 'de' ? 'Stellplätze' : 'spaces'}` : '';
      const nav = `<br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noreferrer">${lang === 'de' ? 'Route' : 'Directions'}</a>`;
      L.marker([p.lat, p.lng], { icon }).bindPopup(`<strong>${p.name}</strong>${price}${spaces}${nav}`).addTo(layer);
    }
  }, [settings.showPlaces, lang]);

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
      L.marker([session.lat, session.lng], { icon }).addTo(layer);
    }
  }, [fix, session]);

  // Tipp-Markierung
  useEffect(() => {
    tapMarker.current?.remove();
    tapMarker.current = null;
    if (tapped && map.current) {
      tapMarker.current = L.circleMarker(tapped, { radius: 8, color: '#111', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map.current);
    }
  }, [tapped]);

  const ev = tapped
    ? evaluate(tapped, new Date(), { disabilityPermit: settings.disabilityPermit, residentPermit: settings.residentPermit, residentZone: settings.residentZone })
    : null;

  return (
    <div className="map-view">
      <div ref={el} className="map" />
      <div className="map-tools">
        <button className="fab" aria-label={t('map.locate')} onClick={() => fix && map.current?.setView(fix.point, 16)}>
          <Icon name="locate" />
        </button>
        <button className="fab" aria-label={t('map.legend')} onClick={() => setLegendOpen((o) => !o)}>
          <Icon name="info" />
        </button>
      </div>
      {legendOpen && (
        <div className="legend">
          <strong>{t('map.legend')}</strong>
          {(Object.keys(ZONE_STYLE) as ZoneKind[]).map((k) => (
            <div key={k} className="legend-row">
              <span className="swatch" style={{ background: ZONE_STYLE[k].color, opacity: k === 'altstadt_access' ? 0.6 : 0.8 }} />
              {t(`legend.${k}`)}
            </div>
          ))}
          {(['garage', 'pr', 'mall'] as const).map((k) => (
            <div key={k} className="legend-row">
              <span className="swatch round" style={{ background: PLACE_COLOR[k] }} />
              {t(`legend.${k}`)}
            </div>
          ))}
          <label className="legend-row check">
            <input type="checkbox" checked={settings.showPlaces} onChange={(e) => updateSettings({ showPlaces: e.target.checked })} />
            {t('map.layerGarages')}
          </label>
          <a href={OFFICIAL_MAP} target="_blank" rel="noreferrer">{t('map.officialMap')} <Icon name="external" size={14} /></a>
        </div>
      )}
      {!ev && <div className="map-hint">{t('map.tapHint')}</div>}
      {ev && tapped && (
        <div className="sheet">
          <button className="sheet-close" aria-label={t('common.close')} onClick={() => setTapped(null)}>×</button>
          <StatusCard ev={ev} compact />
          <div className="btn-grid">
            <button className="btn" onClick={() => { setPicked(tapped); goTo('now'); }}>{t('map.showHere')}</button>
            {!session && ev.status !== 'outside' && (
              <button className="btn primary" onClick={() => { startParking(tapped); goTo('now'); }}>{t('now.parkHere')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
