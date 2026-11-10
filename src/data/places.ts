// Parkgaragen, Parkplätze, P+R und Parkscheinautomaten aus den offiziellen Geodaten der Stadt Salzburg.
// Die JSON-Dateien unter ./geo werden mit `npm run update-geodata` neu erzeugt.
import carparkData from './geo/carparks.json';
import machineData from './geo/machines.json';
import disabledData from './geo/disabled.json';
import { distanceM, type LatLng } from '../lib/geo';

export interface Place {
  id: number;
  name: string;
  address: string | null;
  kind: 'garage' | 'lot' | 'pr';
  url: string | null;
  /** true = die Stadt liefert für diesen Standort eine Live-Belegung */
  live: boolean;
  pos: LatLng;
}

export interface Machine {
  name: string;
  pos: LatLng;
}

export const PLACES = carparkData as unknown as Place[];
export const MACHINES = machineData as unknown as Machine[];
/** Barrierefreie Parkplätze (§ 29b) */
export const DISABLED_SPOTS = disabledData as unknown as LatLng[];

/** Preise, soweit bekannt (Stand 2026, ohne Gewähr) – Zuordnung über den Namen */
const PR_PRICE = {
  de: 'Kombiticket 15 € (Parken + Öffi-Tageskarte bis 5 Personen), Juli/August 7,50 €',
  en: 'Combo ticket €15 (parking + public transport day pass for up to 5 people), July/August €7.50',
};
const ALTSTADT_PRICE = { de: '3,60 €/h, max. 25,90 €/Tag', en: '€3.60/h, max €25.90/day' };

export function priceOf(p: Place): { de: string; en: string } | undefined {
  if (p.kind === 'pr') return PR_PRICE;
  if (p.name.startsWith('Altstadtgarage')) return ALTSTADT_PRICE;
  return undefined;
}

export function nearestMachine(point: LatLng, maxM = 400): { machine: Machine; distance: number } | null {
  let best: { machine: Machine; distance: number } | null = null;
  for (const machine of MACHINES) {
    const distance = distanceM(point, machine.pos);
    if (distance <= maxM && (!best || distance < best.distance)) best = { machine, distance };
  }
  return best;
}

// ---------- Live-Belegung ----------

export interface Occupancy {
  /** z. B. „82 (13%)“ */
  free: string;
  updated: string | null;
  trend: string | null;
}

const LIVE_URL =
  'https://maps.stadt-salzburg.at/geodaten/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=ogdsbg:parkplatz&outputFormat=application/json&propertyName=ID,FREIE_PLAETZE,FREIE_PLAETZE_STATUS,BELEGUNG_AKTUALISIERT,BELEGUNG_TENDENZ';

let cache: { at: number; data: Map<number, Occupancy> } | null = null;

/** Aktuelle freie Plätze je Standort-ID, direkt vom Stadtplan-Server der Stadt (2 Minuten gecacht) */
export async function fetchOccupancy(): Promise<Map<number, Occupancy>> {
  if (cache && Date.now() - cache.at < 120000) return cache.data;
  const res = await fetch(LIVE_URL);
  if (!res.ok) throw new Error(`occupancy: ${res.status}`);
  const json = (await res.json()) as { features: { properties: Record<string, unknown> }[] };
  const data = new Map<number, Occupancy>();
  for (const f of json.features) {
    const p = f.properties;
    if (p.FREIE_PLAETZE_STATUS === 0 || typeof p.FREIE_PLAETZE !== 'string' || !/^\d/.test(p.FREIE_PLAETZE)) continue;
    data.set(Number(p.ID), {
      free: p.FREIE_PLAETZE,
      updated: typeof p.BELEGUNG_AKTUALISIERT === 'string' ? p.BELEGUNG_AKTUALISIERT : null,
      trend: typeof p.BELEGUNG_TENDENZ === 'string' ? p.BELEGUNG_TENDENZ : null,
    });
  }
  cache = { at: Date.now(), data };
  return data;
}
