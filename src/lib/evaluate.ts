import { ALTSTADT_ACCESS, RULE_SETS, isoDate, tariffAt, type RuleSet, type TimeWindow, type Weekday, type WindowKind } from '../data/rules';
import {
  ALTSTADT_ACCESS_AREA, CITY_BBOX, COVERAGE_BOUNDS, DISTRICTS, PEDESTRIAN_LINES, PEDESTRIAN_RADIUS_M, PEDESTRIAN_ZONE,
  RESIDENT_ZONES, ZONES, type Zone,
} from '../data/zones';
import { distanceToLineM, inBBox, pointInMultiPolygon, pointInRing, type LatLng } from './geo';
import { isHoliday } from './holidays';

export type Status =
  | WindowKind
  /** jetzt frei, ohne Zeitlimit */
  | 'free'
  /** keine Daten (Umland) – Beschilderung beachten */
  | 'check_signs'
  /** Stadtgebiet, aber keine Kurzparkzone */
  | 'unregulated'
  /** außerhalb des Abdeckungsgebiets */
  | 'outside';

export interface Profile {
  residentPermit: boolean;
  residentZone: string;
  disabilityPermit: boolean;
}

export interface Evaluation {
  at: Date;
  zone: Zone | null;
  ruleSet: RuleSet | null;
  status: Status;
  /** Status ohne Berücksichtigung persönlicher Ausnahmen */
  rawStatus: Status;
  exempt?: 'disability' | 'resident';
  /** Höchstparkdauer im aktuellen Zeitfenster */
  maxMinutes?: number;
  /** Beginn und Ende des aktuellen Zeitfensters */
  windowStart?: Date;
  windowEnd?: Date;
  /** Spätestens wegfahren (Höchstparkdauer), null wenn das Fenster vorher endet */
  deadline: Date | null;
  /** Nächstes regulierte Zeitfenster nach dem aktuellen */
  next?: { kind: WindowKind; at: Date; maxMinutes?: number };
  /** Euro je angefangene 30 Minuten */
  perHalfHour?: number;
  /** Sommer-Zufahrtsbeschränkung Altstadt ist an diesem Ort und Tag aktiv */
  altstadtAccess: boolean;
  inCity: boolean;
  /** Stadtteil, falls im Stadtgebiet */
  district?: string;
  /** Bewohnerparkzone, in der der Punkt liegt */
  residentZone?: string;
}

export function dayType(d: Date): Weekday {
  return isHoliday(d) ? 0 : (d.getDay() as Weekday);
}

export function atTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function currentWindow(rs: RuleSet, at: Date): TimeWindow | undefined {
  const day = dayType(at);
  const min = minutesOfDay(at);
  return rs.windows.find((w) => w.days.includes(day) && min >= toMin(w.from) && min < toMin(w.to));
}

/** Nächster Fensterbeginn strikt nach `after` (sucht bis zu 10 Tage voraus) */
export function nextWindowStart(rs: RuleSet, after: Date): { window: TimeWindow; at: Date } | undefined {
  for (let offset = 0; offset <= 10; offset++) {
    const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset);
    const type = dayType(day);
    const candidates = rs.windows
      .filter((w) => w.days.includes(type))
      .map((w) => ({ window: w, at: atTime(day, w.from) }))
      .filter((c) => c.at.getTime() > after.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (candidates.length) return candidates[0];
  }
  return undefined;
}

export function inPedestrianZone(point: LatLng): boolean {
  const margin = 0.0002; // ≈ 20 m
  if (!inBBox(point, PEDESTRIAN_ZONE.bbox, margin)) return false;
  return PEDESTRIAN_LINES.some((l) => inBBox(point, l.bbox, margin) && distanceToLineM(point, l.line) <= PEDESTRIAN_RADIUS_M);
}

/** Kurzparkzone am Punkt (Fußgängerzone hat Vorrang), gültig am Datum `at` */
export function zoneAt(point: LatLng, at: Date = new Date()): Zone | null {
  if (inPedestrianZone(point)) return PEDESTRIAN_ZONE;
  const iso = isoDate(at);
  return (
    ZONES.find((z) => (!z.validFrom || z.validFrom <= iso) && inBBox(point, z.bbox) && pointInMultiPolygon(point, z.polygons)) ?? null
  );
}

export function residentZoneAt(point: LatLng): string | undefined {
  return RESIDENT_ZONES.find((r) => inBBox(point, r.bbox) && pointInMultiPolygon(point, r.polygons))?.name;
}

export function districtAt(point: LatLng): string | undefined {
  if (!inBBox(point, CITY_BBOX)) return undefined;
  return DISTRICTS.find((d) => inBBox(point, d.bbox) && pointInMultiPolygon(point, d.polygons))?.name;
}

export function isAltstadtAccessActive(at: Date): boolean {
  const md = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return md >= ALTSTADT_ACCESS.fromMonthDay && md <= ALTSTADT_ACCESS.toMonthDay;
}

export function inCoverage([lat, lng]: LatLng): boolean {
  const b = COVERAGE_BOUNDS;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/** Gilt die Bewohnerparkkarte des Profils an diesem Punkt in dieser Zone? */
function residentExempt(zone: Zone, rs: RuleSet, residentZone: string | undefined, profile?: Partial<Profile>): boolean {
  if (!profile?.residentPermit || !profile.residentZone || !rs.residentExempt || zone.noResident) return false;
  return zone.group === profile.residentZone || residentZone === profile.residentZone;
}

export function evaluate(point: LatLng, at: Date, profile?: Partial<Profile>): Evaluation {
  const zone = zoneAt(point, at);
  const district = districtAt(point);
  const inCity = district !== undefined;
  const residentZone = inCity ? residentZoneAt(point) : undefined;
  const altstadtAccess = isAltstadtAccessActive(at) && pointInRing(point, ALTSTADT_ACCESS_AREA);
  const base = { at, altstadtAccess, inCity, district, residentZone, deadline: null } as const;

  if (!zone) {
    const status: Status = inCity ? 'unregulated' : inCoverage(point) ? 'check_signs' : 'outside';
    return { ...base, zone: null, ruleSet: null, status, rawStatus: status };
  }

  const rs = RULE_SETS[zone.ruleSet];
  const win = currentWindow(rs, at);
  let rawStatus: Status;
  let windowStart: Date | undefined;
  let windowEnd: Date | undefined;
  let deadline: Date | null = null;
  let maxMinutes: number | undefined;

  if (win) {
    rawStatus = win.kind;
    windowStart = atTime(at, win.from);
    windowEnd = win.to === '24:00' ? atTime(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1), '00:00') : atTime(at, win.to);
    maxMinutes = win.maxMinutes;
    if (maxMinutes) {
      const limit = new Date(at.getTime() + maxMinutes * 60000);
      deadline = limit < windowEnd ? limit : null;
    }
  } else {
    rawStatus = rs.freeOutsideWindows ? 'free' : 'check_signs';
  }

  const nxt = nextWindowStart(rs, windowEnd ?? at);
  const next = nxt ? { kind: nxt.window.kind, at: nxt.at, maxMinutes: nxt.window.maxMinutes } : undefined;

  let status = rawStatus;
  let exempt: Evaluation['exempt'];
  if (rawStatus === 'pay' || rawStatus === 'disc') {
    if (profile?.disabilityPermit && rs.disabilityExempt) exempt = 'disability';
    else if (residentExempt(zone, rs, residentZone, profile)) exempt = 'resident';
    if (exempt) {
      status = 'free';
      deadline = null;
    }
  }

  return {
    ...base,
    zone,
    ruleSet: rs,
    status,
    rawStatus,
    exempt,
    maxMinutes,
    windowStart,
    windowEnd,
    deadline,
    next,
    perHalfHour: tariffAt(rs, at)?.perHalfHour,
  };
}

/** Ist das Profil in dieser Zone dauerhaft von Gebühr und Höchstdauer befreit? */
export function isExemptIn(point: LatLng, zone: Zone, profile?: Partial<Profile>): boolean {
  const rs = RULE_SETS[zone.ruleSet];
  if (profile?.disabilityPermit && rs.disabilityExempt) return true;
  return residentExempt(zone, rs, residentZoneAt(point), profile);
}

/** Parkgebühr in Euro für `minutes` Minuten ab `start`, nur die gebührenpflichtigen Anteile */
export function estimateCost(rs: RuleSet, start: Date, minutes: number): number {
  let paidMinutes = 0;
  let perHalfHour = 0;
  for (let m = 0; m < minutes; m++) {
    const t = new Date(start.getTime() + m * 60000);
    if (currentWindow(rs, t)?.kind === 'pay') {
      paidMinutes++;
      perHalfHour = tariffAt(rs, t)?.perHalfHour ?? perHalfHour;
    }
  }
  return Math.ceil(paidMinutes / 30) * perHalfHour;
}
