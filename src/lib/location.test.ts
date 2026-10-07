import { describe, expect, it } from 'vitest';
import { ParkingDetector, type Fix } from './location';

const fix = (lat: number, t: number, speed: number | null): Fix => ({ point: [lat, 13.04], accuracy: 10, speed, time: t });

describe('ParkingDetector', () => {
  it('fires after driving and standing still', () => {
    const parked: Fix[] = [];
    const d = new ParkingDetector({ stopMinutes: 2, onPark: (f) => parked.push(f) });
    d.handle(fix(47.8, 0, 10));
    d.handle(fix(47.801, 10_000, 12));
    d.handle(fix(47.802, 20_000, 0));
    d.handle(fix(47.8020001, 80_000, 0));
    expect(parked.length).toBe(0);
    d.handle(fix(47.8020002, 141_000, 0));
    expect(parked.length).toBe(1);
    d.handle(fix(47.8020002, 300_000, 0));
    expect(parked.length).toBe(1);
  });

  it('does not fire without prior driving', () => {
    const parked: Fix[] = [];
    const d = new ParkingDetector({ stopMinutes: 1, onPark: (f) => parked.push(f) });
    d.handle(fix(47.8, 0, 0));
    d.handle(fix(47.8, 600_000, 0));
    expect(parked.length).toBe(0);
  });
});
