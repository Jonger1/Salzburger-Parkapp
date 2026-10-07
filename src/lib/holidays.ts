import { isoDate } from '../data/rules';

/** Ostersonntag (Gauß / anonymer gregorianischer Algorithmus) */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const cache = new Map<number, Set<string>>();

/** Gesetzliche Feiertage in Österreich */
export function austrianHolidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const plus = (n: number) => isoDate(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + n));
  const fixed = ['01-01', '01-06', '05-01', '08-15', '10-26', '11-01', '12-08', '12-25', '12-26'].map((md) => `${year}-${md}`);
  const set = new Set([...fixed, plus(1), plus(39), plus(50), plus(60)]);
  cache.set(year, set);
  return set;
}

export function isHoliday(d: Date): boolean {
  return austrianHolidays(d.getFullYear()).has(isoDate(d));
}
