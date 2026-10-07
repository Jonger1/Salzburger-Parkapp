import { describe, expect, it } from 'vitest';
import { RULE_SETS } from '../data/rules';
import { estimateCost, evaluate } from './evaluate';
import { austrianHolidays, easterSunday } from './holidays';
import type { LatLng } from './geo';

const MIRABELL: LatLng = [47.8058, 13.0425];
const GETREIDEGASSE: LatLng = [47.8, 13.043];
const MAXGLAN: LatLng = [47.792, 13.017];
const HALLEIN: LatLng = [47.683, 13.097];
const VIENNA: LatLng = [48.2, 16.37];

// Lokale Zeit (TZ=Europe/Vienna im Test-Script)
const d = (s: string) => new Date(s);

describe('holidays', () => {
  it('computes Easter', () => {
    expect(easterSunday(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easterSunday(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
  it('includes moving holidays', () => {
    const h = austrianHolidays(2026);
    expect(h.has('2026-04-06')).toBe(true); // Ostermontag
    expect(h.has('2026-05-14')).toBe(true); // Christi Himmelfahrt
    expect(h.has('2026-06-04')).toBe(true); // Fronleichnam
    expect(h.has('2026-10-26')).toBe(true);
  });
});

describe('evaluate', () => {
  it('paid zone on a weekday morning requires a ticket with 3h limit', () => {
    const e = evaluate(MIRABELL, d('2026-10-07T10:00:00'));
    expect(e.zone?.id).toBe('kpz-zentrum');
    expect(e.status).toBe('pay');
    expect(e.maxMinutes).toBe(180);
    expect(e.deadline?.getHours()).toBe(13);
    expect(e.perHalfHour).toBe(1.1);
  });

  it('no deadline when the window ends before the max duration', () => {
    const e = evaluate(MIRABELL, d('2026-10-07T17:30:00'));
    expect(e.status).toBe('pay');
    expect(e.deadline).toBeNull();
    expect(e.windowEnd?.getHours()).toBe(19);
    expect(e.next?.at.getDate()).toBe(8);
    expect(e.next?.at.getHours()).toBe(9);
  });

  it('Saturday needs a parking disc, free of charge', () => {
    const e = evaluate(MIRABELL, d('2026-10-10T11:00:00'));
    expect(e.status).toBe('disc');
    expect(e.maxMinutes).toBe(180);
  });

  it('Sunday evening is free, next paid window Monday 9:00', () => {
    const e = evaluate(MIRABELL, d('2026-10-11T20:00:00'));
    expect(e.status).toBe('free');
    expect(e.next?.kind).toBe('pay');
    expect(e.next?.at.toDateString()).toBe(new Date(2026, 9, 12).toDateString());
  });

  it('public holiday on a weekday is free and skips to the next working day', () => {
    const e = evaluate(MIRABELL, d('2026-10-26T10:00:00'));
    expect(e.status).toBe('free');
    expect(e.next?.at.getDate()).toBe(27);
  });

  it('uses the 2027 tariff', () => {
    expect(evaluate(MIRABELL, d('2027-01-04T10:00:00')).perHalfHour).toBe(1.25);
  });

  it('pedestrian zone forbids parking', () => {
    expect(evaluate(GETREIDEGASSE, d('2026-10-07T10:00:00')).status).toBe('no_parking');
  });

  it('free short-term zone needs a disc on weekdays', () => {
    const e = evaluate(MAXGLAN, d('2026-10-07T10:00:00'));
    expect(e.zone?.kind).toBe('kpz_free');
    expect(e.status).toBe('disc');
    expect(evaluate(MAXGLAN, d('2026-10-10T10:00:00')).status).toBe('free');
  });

  it('disability permit exempts from fees and limits', () => {
    const e = evaluate(MIRABELL, d('2026-10-07T10:00:00'), { disabilityPermit: true });
    expect(e.status).toBe('free');
    expect(e.rawStatus).toBe('pay');
    expect(e.exempt).toBe('disability');
    expect(e.deadline).toBeNull();
  });

  it('surrounding municipalities say check signs', () => {
    expect(evaluate(HALLEIN, d('2026-10-07T10:00:00')).status).toBe('check_signs');
  });

  it('outside coverage', () => {
    expect(evaluate(VIENNA, d('2026-10-07T10:00:00')).status).toBe('outside');
  });

  it('Altstadt access overlay only in summer', () => {
    expect(evaluate(GETREIDEGASSE, d('2026-07-15T10:00:00')).overlays.length).toBe(1);
    expect(evaluate(GETREIDEGASSE, d('2026-10-07T10:00:00')).overlays.length).toBe(0);
  });
});

describe('estimateCost', () => {
  it('charges per started half hour, only within paid window', () => {
    const rs = RULE_SETS.sbg_paid;
    expect(estimateCost(rs, d('2026-10-07T10:00:00'), 45)).toBeCloseTo(2.2);
    expect(estimateCost(rs, d('2026-10-07T18:30:00'), 120)).toBeCloseTo(1.1);
    expect(estimateCost(rs, d('2026-10-10T10:00:00'), 120)).toBe(0);
  });
});
