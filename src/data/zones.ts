// Zonen aus den offiziellen Geodaten der Stadt Salzburg (Open Government Data).
// Die JSON-Dateien unter ./geo werden mit `npm run update-geodata` neu erzeugt – nicht von Hand ändern.
import kpzData from './geo/kpz.json';
import residentData from './geo/resident.json';
import pedestrianData from './geo/pedestrian.json';
import districtData from './geo/districts.json';
import meta from './geo/meta.json';
import { bboxOf, type BBox, type LatLng, type MultiPolygon } from '../lib/geo';

export type ZoneKind = 'kpz_paid' | 'kpz_free' | 'pedestrian';

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Verweis auf RULE_SETS */
  ruleSet: string;
  /** Buchstabe/Nummer der zugehörigen Bewohnerparkzone */
  group: string | null;
  /** true = Bewohnerparkkarte gilt hier nicht */
  noResident: boolean;
  /** ISO-Datum, ab dem die Zone gilt */
  validFrom: string | null;
  polygons: MultiPolygon;
  bbox: BBox;
}

export interface Area {
  name: string;
  polygons: MultiPolygon;
  bbox: BBox;
}

const bboxOfPolygons = (mp: MultiPolygon) => bboxOf(mp.flatMap((poly) => poly[0]));

// Bei Überlappung gewinnt die strengere Regel, bei gleicher Regel der Abschnitt ohne Bewohnerparken
const RULE_ORDER = ['sbg_paid', 'sbg_free_sat', 'sbg_free'];

type RawKpz = Omit<Zone, 'kind' | 'ruleSet' | 'bbox'> & { rule: string };

export const ZONES: Zone[] = (kpzData as unknown as RawKpz[])
  .map(({ rule, ...rest }) => ({
    ...rest,
    ruleSet: rule,
    kind: (rule === 'sbg_paid' ? 'kpz_paid' : 'kpz_free') as ZoneKind,
    bbox: bboxOfPolygons(rest.polygons),
  }))
  .sort((a, b) => RULE_ORDER.indexOf(a.ruleSet) - RULE_ORDER.indexOf(b.ruleSet) || Number(b.noResident) - Number(a.noResident));

/** Bewohnerparkzonen (3, 21, A–K) */
export const RESIDENT_ZONES: Area[] = (residentData as unknown as Omit<Area, 'bbox'>[]).map((r) => ({
  name: r.name,
  polygons: r.polygons,
  bbox: bboxOfPolygons(r.polygons),
}));

export const RESIDENT_ZONE_NAMES = RESIDENT_ZONES.map((r) => r.name);

/** Fußgängerzonen als Straßenachsen */
export const PEDESTRIAN_LINES: { line: LatLng[]; bbox: BBox }[] = (pedestrianData as unknown as LatLng[][]).map((line) => ({
  line,
  bbox: bboxOf(line),
}));

/** Wer näher als so viele Meter an einer Fußgängerzonen-Achse steht, steht in der Fußgängerzone */
export const PEDESTRIAN_RADIUS_M = 8;

export const PEDESTRIAN_ZONE: Zone = {
  id: 'fuzo',
  name: 'Fußgängerzone',
  kind: 'pedestrian',
  ruleSet: 'pedestrian',
  group: null,
  noResident: true,
  validFrom: null,
  polygons: [],
  bbox: bboxOf(PEDESTRIAN_LINES.flatMap((l) => l.line)),
};

/** Stadtteile – zusammen ergeben sie das Stadtgebiet */
export const DISTRICTS: Area[] = (districtData as unknown as Omit<Area, 'bbox'>[]).map((d) => ({
  name: d.name,
  polygons: d.polygons,
  bbox: bboxOfPolygons(d.polygons),
}));

export const CITY_BBOX: BBox = bboxOf(DISTRICTS.flatMap((d) => [[d.bbox[0], d.bbox[1]], [d.bbox[2], d.bbox[3]]] as LatLng[]));

/** Grobe Grenze des Abdeckungsgebiets (Stadt Salzburg + Umland) */
export const COVERAGE_BOUNDS = { south: 47.62, north: 47.98, west: 12.85, east: 13.3 };

/**
 * Bereich der Sommer-Zufahrtsbeschränkung in die Altstadt. Dazu gibt es keine Geodaten:
 * die Fläche ist nur eine grobe Näherung und dient ausschließlich als Hinweis.
 */
export const ALTSTADT_ACCESS_AREA: LatLng[] = [
  [47.8068, 13.0355], [47.8065, 13.044], [47.8052, 13.0505], [47.8, 13.0525],
  [47.7948, 13.0505], [47.7942, 13.042], [47.7978, 13.0368], [47.804, 13.0338],
];

export const DATA_DATE: string = meta.fetchedAt;
export const DATA_SOURCE: string = meta.source;
