/** [Breite, Länge] */
export type LatLng = [number, number];
/** Polygon = äußerer Ring + Löcher; MultiPolygon = mehrere davon */
export type MultiPolygon = LatLng[][][];
export type BBox = [south: number, west: number, north: number, east: number];

/** Ray casting für einen Ring */
export function pointInRing([lat, lng]: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt im MultiPolygon (Löcher werden berücksichtigt) */
export function pointInMultiPolygon(p: LatLng, mp: MultiPolygon): boolean {
  return mp.some(([outer, ...holes]) => pointInRing(p, outer) && !holes.some((h) => pointInRing(p, h)));
}

export function bboxOf(points: Iterable<LatLng>): BBox {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lng < w) w = lng;
    if (lng > e) e = lng;
  }
  return [s, w, n, e];
}

export function inBBox([lat, lng]: LatLng, [s, w, n, e]: BBox, marginDeg = 0): boolean {
  return lat >= s - marginDeg && lat <= n + marginDeg && lng >= w - marginDeg && lng <= e + marginDeg;
}

/** Entfernung in Metern (Haversine) */
export function distanceM([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Abstand Punkt–Strecke in Metern (lokale ebene Näherung, für kurze Distanzen) */
export function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);
  const ky = 110540;
  const px = (p[1] - a[1]) * kx;
  const py = (p[0] - a[0]) * ky;
  const bx = (b[1] - a[1]) * kx;
  const by = (b[0] - a[0]) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

export function distanceToLineM(p: LatLng, line: LatLng[]): number {
  if (line.length === 1) return distanceM(p, line[0]);
  let min = Infinity;
  for (let i = 1; i < line.length; i++) min = Math.min(min, distanceToSegmentM(p, line[i - 1], line[i]));
  return min;
}
