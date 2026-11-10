// Lädt die offiziellen Geodaten der Stadt Salzburg (Open Government Data, WFS)
// und schreibt sie kompakt nach src/data/geo/. Aufruf: npm run update-geodata
//
// Quelle: https://maps.stadt-salzburg.at (Stadt Salzburg, data.stadt-salzburg.at, CC BY 4.0)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://maps.stadt-salzburg.at/geodaten';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'geo');

async function wfs(typeName, prefix = '') {
  const url = `${BASE}/${prefix}wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${typeName}&outputFormat=application/json&srsName=EPSG:4326`;
  const res = await fetch(url, { headers: { 'User-Agent': 'salzburger-parkapp geodata updater' } });
  if (!res.ok) throw new Error(`${typeName}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.features) || data.features.length === 0) throw new Error(`${typeName}: keine Features`);
  return data.features;
}

const round = (n) => Math.round(n * 1e6) / 1e6;
/** GeoJSON [lng, lat] → [lat, lng] */
const flip = ([lng, lat]) => [round(lat), round(lng)];

/** Abstand Punkt–Strecke in Metern (lokale ebene Näherung) */
function segDist(p, a, b) {
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);
  const ky = 110540;
  const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky;
  const bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Douglas-Peucker, Toleranz in Metern */
function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(points[i], points[s], points[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ring(coords, tol) {
  const pts = coords.map(flip);
  // Ring für die Vereinfachung an einem zweiten Stützpunkt teilen, damit er nicht kollabiert
  const mid = Math.floor(pts.length / 2);
  const a = simplify(pts.slice(0, mid + 1), tol);
  const b = simplify(pts.slice(mid), tol);
  const out = [...a, ...b.slice(1)];
  return out.length >= 4 ? out : pts;
}

/** Fläche eines Rings in m² (Gaußsche Trapezformel, lokale ebene Näherung) */
function ringArea(coords) {
  const kx = 111320 * Math.cos((coords[0][1] * Math.PI) / 180);
  const ky = 110540;
  let a = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    a += (coords[j][0] * kx) * (coords[i][1] * ky) - (coords[i][0] * kx) * (coords[j][1] * ky);
  }
  return Math.abs(a / 2);
}

/** Die Quelldaten enthalten vereinzelt Splitterflächen von wenigen m² (Zeichenreste) – die fallen weg */
const MIN_AREA_M2 = 25;

const multiPolygon = (geom, tol) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.filter((poly) => ringArea(poly[0]) >= MIN_AREA_M2).map((poly) => poly.map((r) => ring(r, tol)));
};

const titleCase = (s) =>
  /[a-zäöü]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s\-/.(])([a-zäöü])/g, (_, sep, c) => sep + c.toUpperCase());

/** Zeitstempel (UTC) → Datum in Salzburger Ortszeit, JJJJ-MM-TT */
const localDate = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

const isActive = (p, now) =>
  (p.STATUS ?? 'aktiv') === 'aktiv' && (!p.GILT_BIS || new Date(p.GILT_BIS) > now);

function kpzRule(p) {
  const g = p.GEBUEHRENPFLICHT ?? '';
  if (/gebührenpflichtig/i.test(g)) return 'sbg_paid';
  if (/Samstag/i.test(g)) return 'sbg_free_sat';
  return 'sbg_free';
}

async function main() {
  const now = new Date();
  const [kpzRaw, resRaw, fuzoRaw, machRaw, parkRaw, distRaw, disRaw] = await Promise.all([
    wfs('ogdsbg:kurzparkzone'),
    wfs('ogdsbg:bewohnerparkzone'),
    wfs('landsbg:fussgaengerzone', 'landsbg/'),
    wfs('ogdsbg:parkscheinautomat'),
    wfs('ogdsbg:parkplatz'),
    wfs('ogdsbg:stadtteil'),
    wfs('ogdsbg:behindertenstellplatz'),
  ]);

  // Unbekannte Regelbeschreibungen sollen auffallen, statt still falsch zugeordnet zu werden
  const known = /^gebühren(pflichtig \(Gebühreneinhebung mit Parkscheinautomat\) werktags Montag bis Freitag 9-19 Uhr; gebührenfrei \(aber Parkuhrenpflicht\) Samstag 9-16 Uhr|frei \(aber Parkuhrenpflicht\) werktags Montag bis Freitag 9-19 Uhr( und Samstag 9-16 Uhr)?( - gilt nicht zum Dauerparken mit Ausnahmebewilligung)?)$/;
  const unknown = [...new Set(kpzRaw.map((f) => f.properties.GEBUEHRENPFLICHT).filter((g) => !known.test(g ?? '')))];
  if (unknown.length) throw new Error(`Unbekannte Kurzparkzonen-Regel(n), bitte rules.ts/kpzRule anpassen:\n${unknown.join('\n')}`);
  const badDuration = kpzRaw.filter((f) => f.properties.MAXIMALE_PARKDAUER !== '3 Stunden').map((f) => f.properties.MAXIMALE_PARKDAUER);
  if (badDuration.length) throw new Error(`Unerwartete Höchstparkdauer: ${[...new Set(badDuration)].join(', ')}`);

  const kpz = kpzRaw
    .filter((f) => isActive(f.properties, now))
    .map((f) => {
      const p = f.properties;
      return {
        id: `kpz-${p.ID}`,
        name: titleCase(p.NAME).replace('Lehensüd', 'Lehen-Süd').replace('Bndstr.', 'Bundesstraße'),
        rule: kpzRule(p),
        group: p.GRUPPE ?? null,
        noResident: p.KEIN_BEWOHNERPARKEN === 'Ja',
        validFrom: p.GILT_VON ? localDate(p.GILT_VON) : null,
        polygons: multiPolygon(f.geometry, 1),
      };
    })
    .filter((z) => z.polygons.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  const resident = resRaw
    .filter((f) => isActive(f.properties, now))
    .map((f) => ({ id: `bw-${f.properties.ID}`, name: f.properties.NAME, polygons: multiPolygon(f.geometry, 1) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));

  const pedestrian = fuzoRaw.flatMap((f) => {
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return lines.map((l) => simplify(l.map(flip), 0.5));
  });

  const machines = machRaw
    .filter((f) => f.properties.STATUS === 'In Betrieb')
    .map((f) => ({ name: f.properties.STANDORTNAME, pos: flip(f.geometry.coordinates) }));

  const carparks = parkRaw
    .map((f) => {
      const p = f.properties;
      return {
        id: p.ID,
        name: p.BEZEICHNUNG,
        address: p.ADRESSE ?? null,
        kind: /park\s*&\s*ride/i.test(p.BEZEICHNUNG) ? 'pr' : p.TYP === 'Parkplatz' ? 'lot' : 'garage',
        url: p.URL ?? null,
        live: p.FREIE_PLAETZE_STATUS !== 0,
        pos: flip(f.geometry.coordinates),
      };
    })
    .sort((a, b) => a.id - b.id);

  // Nur das Stadtgebiet; der Layer enthält auch Randflächen der Nachbargemeinden
  const districts = distRaw
    .filter((f) => f.properties.GEMEINDE === 'Salzburg')
    .map((f) => ({ name: f.properties.STADTTEIL ?? f.properties.ORTSTEIL ?? f.properties.LANDSCHAFTSRAUM ?? 'Salzburg', polygons: multiPolygon(f.geometry, 10) }));
  if (districts.length === 0) {
    throw new Error(`Stadtteil-Layer unerwartet – Felder: ${Object.keys(distRaw[0].properties).join(', ')}`);
  }

  const disabled = disRaw.map((f) => {
    const g = f.geometry;
    const c = g.type === 'Point' ? g.coordinates : g.type === 'MultiPoint' ? g.coordinates[0] : null;
    if (!c) throw new Error(`behindertenstellplatz: unerwartete Geometrie ${g.type}`);
    return flip(c);
  });

  await mkdir(OUT, { recursive: true });
  const files = { kpz, resident, pedestrian, machines, carparks, districts, disabled, meta: { fetchedAt: now.toISOString().slice(0, 10), source: 'Stadt Salzburg – data.stadt-salzburg.at (CC BY 4.0)' } };
  for (const [name, data] of Object.entries(files)) {
    const json = JSON.stringify(data);
    await writeFile(join(OUT, `${name}.json`), json + '\n');
    console.log(`${name}.json  ${(json.length / 1024).toFixed(0)} kB  (${Array.isArray(data) ? data.length : 1})`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
