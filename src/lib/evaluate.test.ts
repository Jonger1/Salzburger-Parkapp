import { describe, expect, it } from 'vitest';
import { RULE_SETS } from '../data/rules';
import { RESIDENT_ZONES, ZONES, type Zone } from '../data/zones';
import { estimateCost, evaluate, zoneAt } from './evaluate';
import { distanceToLineM, pointInMultiPolygon, type LatLng } from './geo';
import { austrianHolidays, easterSunday } from './holidays';

// Punkte in den offiziellen Zonen der Stadt (siehe src/data/geo)
const MIRABELL: LatLng = [47.8058, 13.0425]; // gebührenpflichtig, Bewohnerzone 3
const NONNTAL_K: LatLng = [47.7935, 13.053]; // gebührenpflichtig, Bewohnerzone K
const GETREIDEGASSE: LatLng = [47.8, 13.044]; // Fußgängerzone
const SCHALLMOOS: LatLng = [47.812, 13.058]; // gebührenfrei Mo–Fr, Bewohnerzone B
const NONNTAL_WEST: LatLng = [47.789585, 13.049082]; // gebührenfrei Mo–Sa
const LEOPOLDSKRON: LatLng = [47.785, 13.035]; // Stadtgebiet ohne Kurzparkzone
const HALLEIN: LatLng = [47.683, 13.097];
const VIENNA: LatLng = [48.2, 16.37];

/** Sucht einen Punkt, der sicher in genau dieser Zone ausgewertet wird */
function pointIn(zone: Zone): LatLng {
  for (const [ring] of zone.polygons) {
    const half = Math.floor(ring.length / 2);
    for (let i = 0; i < ring.length; i++) {
      for (const j of [half, Math.floor(ring.length / 3), 2]) {
        const q = ring[(i + j) % ring.length];
        const p: LatLng = [(ring[i][0] + q[0]) / 2, (ring[i][1] + q[1]) / 2];
        if (zoneAt(p, new Date(WED))?.id === zone.id) return p;
      }
    }
  }
  throw new Error(`kein Punkt in ${zone.id} gefunden`);
}

// Lokale Zeit (TZ=Europe/Vienna im Test-Script)
const d = (s: string) => new Date(s);
const WED = '2026-11-11T10:00:00';

describe('geo', () => {
  it('respects holes in polygons', () => {
    const square: LatLng[] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const hole: LatLng[] = [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]];
    expect(pointInMultiPolygon([2, 2], [[square, hole]])).toBe(true);
    expect(pointInMultiPolygon([5, 5], [[square, hole]])).toBe(false);
    expect(pointInMultiPolygon([12, 5], [[square, hole]])).toBe(false);
  });
  it('measures distance to a line in metres', () => {
    const line: LatLng[] = [[47.8, 13.04], [47.8, 13.05]];
    expect(distanceToLineM([47.8001, 13.045], line)).toBeCloseTo(11.05, 0);
    expect(distanceToLineM([47.8, 13.045], line)).toBeCloseTo(0, 5);
  });
});

describe('official data', () => {
  it('is loaded and plausible', () => {
    expect(ZONES.length).toBeGreaterThan(30);
    expect(RESIDENT_ZONES.map((r) => r.name)).toEqual(expect.arrayContaining(['3', '21', 'A', 'K']));
    for (const z of ZONES) {
      expect(RULE_SETS[z.ruleSet], z.id).toBeDefined();
      expect(z.polygons.length, z.id).toBeGreaterThan(0);
      for (const poly of z.polygons) expect(poly[0].length, z.id).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('holidays', () => {
  it('computes Easter', () => {
    expect(easterSunday(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easterSunday(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
  it('includes moving holidays', () => {
    const h = austrianHolidays(2026);
    for (const day of ['2026-04-06', '2026-05-14', '2026-05-25', '2026-06-04', '2026-10-26']) expect(h.has(day), day).toBe(true);
  });
});

describe('evaluate', () => {
  it('paid zone on a weekday morning requires a ticket with 3h limit', () => {
    const e = evaluate(MIRABELL, d(WED));
    expect(e.zone?.ruleSet).toBe('sbg_paid');
    expect(e.status).toBe('pay');
    expect(e.maxMinutes).toBe(180);
    expect(e.deadline?.getHours()).toBe(13);
    expect(e.windowStart?.getHours()).toBe(9);
    expect(e.perHalfHour).toBe(1.1);
    expect(e.district).toBe('Altstadt');
    expect(e.residentZone).toBe('3');
  });

  it('no deadline when the window ends before the max duration', () => {
    const e = evaluate(MIRABELL, d('2026-11-11T17:30:00'));
    expect(e.status).toBe('pay');
    expect(e.deadline).toBeNull();
    expect(e.windowEnd?.getHours()).toBe(19);
    expect(e.next?.at.getDate()).toBe(12);
    expect(e.next?.at.getHours()).toBe(9);
  });

  it('Saturday in a paid zone needs a parking disc, free of charge', () => {
    const e = evaluate(MIRABELL, d('2026-11-14T11:00:00'));
    expect(e.status).toBe('disc');
    expect(e.maxMinutes).toBe(180);
    expect(evaluate(MIRABELL, d('2026-11-14T16:30:00')).status).toBe('free');
  });

  it('Sunday evening is free, next paid window Monday 9:00', () => {
    const e = evaluate(MIRABELL, d('2026-11-15T20:00:00'));
    expect(e.status).toBe('free');
    expect(e.next?.kind).toBe('pay');
    expect(e.next?.at.toDateString()).toBe(new Date(2026, 10, 16).toDateString());
  });

  it('public holiday on a weekday is free and skips to the next working day', () => {
    const e = evaluate(MIRABELL, d('2026-12-08T10:00:00'));
    expect(e.status).toBe('free');
    expect(e.next?.at.getDate()).toBe(9);
  });

  it('uses the 2027 tariff', () => {
    expect(evaluate(MIRABELL, d('2027-01-04T10:00:00')).perHalfHour).toBe(1.25);
  });

  it('pedestrian zone forbids parking at any time', () => {
    expect(evaluate(GETREIDEGASSE, d(WED)).status).toBe('no_parking');
    expect(evaluate(GETREIDEGASSE, d('2026-11-15T03:00:00')).status).toBe('no_parking');
  });

  it('free zone needs a disc Mon–Fri only', () => {
    const e = evaluate(SCHALLMOOS, d(WED));
    expect(e.zone?.ruleSet).toBe('sbg_free');
    expect(e.status).toBe('disc');
    expect(e.perHalfHour).toBeUndefined();
    expect(evaluate(SCHALLMOOS, d('2026-11-14T10:00:00')).status).toBe('free');
  });

  it('some free zones also need a disc on Saturday', () => {
    expect(zoneAt(NONNTAL_WEST)?.ruleSet).toBe('sbg_free_sat');
    expect(evaluate(NONNTAL_WEST, d('2026-11-14T10:00:00')).status).toBe('disc');
    expect(evaluate(NONNTAL_WEST, d('2026-11-14T17:00:00')).status).toBe('free');
  });

  it('disability permit exempts from fees and limits', () => {
    const e = evaluate(MIRABELL, d(WED), { disabilityPermit: true });
    expect(e.status).toBe('free');
    expect(e.rawStatus).toBe('pay');
    expect(e.exempt).toBe('disability');
    expect(e.deadline).toBeNull();
  });

  it('resident permit exempts only in the own zone', () => {
    const own = evaluate(NONNTAL_K, d(WED), { residentPermit: true, residentZone: 'K' });
    expect(own.rawStatus).toBe('pay');
    expect(own.status).toBe('free');
    expect(own.exempt).toBe('resident');
    const other = evaluate(NONNTAL_K, d(WED), { residentPermit: true, residentZone: 'B' });
    expect(other.status).toBe('pay');
    expect(other.exempt).toBeUndefined();
    // Zone ohne Gruppenangabe: Zuordnung über die Fläche der Bewohnerzone
    expect(evaluate(MIRABELL, d(WED), { residentPermit: true, residentZone: '3' }).exempt).toBe('resident');
    expect(evaluate(MIRABELL, d(WED), { residentPermit: true, residentZone: '' }).exempt).toBeUndefined();
  });

  it('resident permit is not valid in sections marked accordingly', () => {
    const zone = ZONES.find((z) => z.noResident)!;
    const p = pointIn(zone);
    const e = evaluate(p, d(WED), { residentPermit: true, residentZone: zone.group! });
    expect(e.zone?.id).toBe(zone.id);
    expect(e.status).toBe('disc');
    expect(e.exempt).toBeUndefined();
  });

  it('every zone can be hit by a point', () => {
    for (const z of ZONES) expect(() => pointIn(z), z.id).not.toThrow();
  });

  it('zones only apply from their start date', () => {
    const newest = ZONES.find((z) => z.validFrom === '2026-04-13')!;
    const inside = pointIn(newest);
    expect(zoneAt(inside, d(WED))?.id).toBe(newest.id);
    expect(zoneAt(inside, d('2026-04-10T10:00:00'))?.id).not.toBe(newest.id);
  });

  it('city area without a short-term zone', () => {
    const e = evaluate(LEOPOLDSKRON, d(WED));
    expect(e.status).toBe('unregulated');
    expect(e.inCity).toBe(true);
  });

  it('surroundings have no data, far away is outside', () => {
    expect(evaluate(HALLEIN, d(WED)).status).toBe('check_signs');
    expect(evaluate(HALLEIN, d(WED)).inCity).toBe(false);
    expect(evaluate(VIENNA, d(WED)).status).toBe('outside');
  });

  it('Altstadt access hint only in summer', () => {
    expect(evaluate(GETREIDEGASSE, d('2026-07-15T10:00:00')).altstadtAccess).toBe(true);
    expect(evaluate(GETREIDEGASSE, d(WED)).altstadtAccess).toBe(false);
    expect(evaluate(SCHALLMOOS, d('2026-07-15T10:00:00')).altstadtAccess).toBe(false);
  });
});

describe('estimateCost', () => {
  it('charges per started half hour, only within paid window', () => {
    const rs = RULE_SETS.sbg_paid;
    expect(estimateCost(rs, d(WED), 45)).toBeCloseTo(2.2);
    expect(estimateCost(rs, d(WED), 180)).toBeCloseTo(6.6);
    expect(estimateCost(rs, d('2026-11-11T18:30:00'), 120)).toBeCloseTo(1.1);
    expect(estimateCost(rs, d('2026-11-14T10:00:00'), 120)).toBe(0);
  });
});
