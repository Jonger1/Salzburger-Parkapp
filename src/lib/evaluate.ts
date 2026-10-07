import { ALTSTADT_ACCESS, RULE_SETS, tariffAt, type RuleSet, type TimeWindow, type Weekday, type WindowKind } from '../data/rules';
import { CITY_POLYGON, COVERAGE_BOUNDS, ZONES, type Zone } from '../data/zones';
import { pointInPolygon, type LatLng } from './geo';
import { isHoliday } from './holidays';

export type Status =
  | WindowKind
  /** jetzt frei, ohne Zeitlimit */
  | 'free'
  /** Regeln unbekannt – Beschilderung beachten */
  | 'check_signs'
  /** keine Kurzparkzone erfasst */
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
  exempt?: 'disability';
  /** Höchstparkdauer im aktuellen Zeitfenster */
  maxMinutes?: number;
  /** Ende des aktuellen Zeitfensters */
  windowEnd?: Date;
  /** Spätestens wegfahren (Höchstparkdauer), null wenn das Fenster vorher endet */
  deadline: Date | null;
  /** Nächstes regulierte Zeitfenster nach dem aktuellen */
  next?: { kind: WindowKind; at: Date; maxMinutes?: number };
  /** Euro je angefangene 30 Minuten */
  perHalfHour?: number;
  /** Info-Ebenen, z. B. Altstadt-Zufahrt */
  overlays: Zone[];
  inCity: boolean;
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

export function zonesAt(point: LatLng): Zone[] {
  return ZONES.filter((z) => pointInPolygon(point, z.polygon)).sort((a, b) => b.priority - a.priority);
}

export function isAltstadtAccessActive(at: Date): boolean {
  const md = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return md >= ALTSTADT_ACCESS.fromMonthDay && md <= ALTSTADT_ACCESS.toMonthDay;
}

export function inCoverage([lat, lng]: LatLng): boolean {
  const b = COVERAGE_BOUNDS;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function evaluate(point: LatLng, at: Date, profile?: Partial<Profile>): Evaluation {
  const zones = zonesAt(point);
  const overlays = zones.filter((z) => z.kind === 'altstadt_access' && isAltstadtAccessActive(at));
  const zone = zones.find((z) => z.ruleSet) ?? null;
  const inCity = pointInPolygon(point, CITY_POLYGON);
  const base = { at, overlays, inCity, deadline: null } as const;

  if (!zone) {
    const status: Status = inCoverage(point) ? 'unregulated' : 'outside';
    return { ...base, zone: null, ruleSet: null, status, rawStatus: status };
  }

  const rs = RULE_SETS[zone.ruleSet!];
  if (rs.unverified) {
    return { ...base, zone, ruleSet: rs, status: 'check_signs', rawStatus: 'check_signs' };
  }

  const win = currentWindow(rs, at);
  let rawStatus: Status;
  let windowEnd: Date | undefined;
  let deadline: Date | null = null;
  let maxMinutes: number | undefined;

  if (win) {
    rawStatus = win.kind;
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
  if (profile?.disabilityPermit && rs.disabilityExempt && (rawStatus === 'pay' || rawStatus === 'disc')) {
    status = 'free';
    exempt = 'disability';
    deadline = null;
  }

  const tariff = tariffAt(rs, at);
  return {
    ...base,
    zone,
    ruleSet: rs,
    status,
    rawStatus,
    exempt,
    maxMinutes,
    windowEnd,
    deadline,
    next,
    perHalfHour: tariff?.perHalfHour,
  };
}

/** Parkgebühr in Euro für `minutes` Minuten ab `start`, nur die gebührenpflichtigen Anteile */
export function estimateCost(rs: RuleSet, start: Date, minutes: number): number {
  let paidMinutes = 0;
  let perHalfHour = 0;
  const step = 1;
  for (let m = 0; m < minutes; m += step) {
    const t = new Date(start.getTime() + m * 60000);
    const w = currentWindow(rs, t);
    if (w?.kind === 'pay') {
      paidMinutes += step;
      perHalfHour = tariffAt(rs, t)?.perHalfHour ?? perHalfHour;
    }
  }
  return Math.ceil(paidMinutes / 30) * perHalfHour;
}
