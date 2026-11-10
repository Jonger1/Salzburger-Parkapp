import { describe, expect, it } from 'vitest';
import { ParkingDetector, type Fix } from './location';

const fix = (lat: number, t: number, speed: number | null, accuracy = 10): Fix => ({ point: [lat, 13.04], accuracy, speed, time: t });

function drive(d: ParkingDetector) {
  d.handle(fix(47.8, 0, 10));
  d.handle(fix(47.801, 5_000, 12));
  d.handle(fix(47.802, 10_000, 12));
}

describe('ParkingDetector', () => {
  it('fires after driving and standing still', () => {
    const parked: Fix[] = [];
    const d = new ParkingDetector({ stopMinutes: 2, onPark: (f) => parked.push(f) });
    drive(d);
    d.handle(fix(47.803, 20_000, 0));
    d.handle(fix(47.8030001, 80_000, 0));
    expect(parked.length).toBe(0);
    d.handle(fix(47.8030002, 141_000, 0));
    expect(parked.length).toBe(1);
    expect(parked[0].point[0]).toBeCloseTo(47.803);
    d.handle(fix(47.8030002, 300_000, 0));
    expect(parked.length).toBe(1);
  });

  it('does not fire without prior driving', () => {
    const parked: Fix[] = [];
    const d = new ParkingDetector({ stopMinutes: 1, onPark: (f) => parked.push(f) });
    d.handle(fix(47.8, 0, 0));
    d.handle(fix(47.8, 600_000, 0));
    expect(parked.length).toBe(0);
  });

  it('ignores a single GPS jump while standing', () => {
    const parked: Fix[] = [];
    const d = new ParkingDetector({ stopMinutes: 1, onPark: (f) => parked.push(f) });
    d.handle(fix(47.8, 0, null));
    d.handle(fix(47.8005, 1_000, null)); // 55 m in 1 s, aber nur einmal
    d.handle(fix(47.8, 2_000, 0));
    d.handle(fix(47.8, 200_000, 0));
    expect(parked.length).toBe(0);
  });

  it('ignores inaccurate fixes', () => {
    const parked: Fix[] = [];
    const speeds: number[] = [];
    const d = new ParkingDetector({ stopMinutes: 1, onPark: (f) => parked.push(f), onFix: (_, v) => speeds.push(v) });
    for (let i = 0; i < 5; i++) d.handle(fix(47.8 + i * 0.001, i * 5_000, 20, 200));
    d.handle(fix(47.81, 30_000, 0));
    d.handle(fix(47.81, 300_000, 0));
    expect(parked.length).toBe(0);
    expect(speeds.slice(0, 5).every((v) => v === 0)).toBe(true);
  });

  it('derives speed from positions when the device reports none', () => {
    const parked: Fix[] = [];
    const d = new ParkingDetector({ stopMinutes: 1, onPark: (f) => parked.push(f) });
    for (let i = 0; i < 5; i++) d.handle(fix(47.8 + i * 0.001, i * 10_000, null)); // ≈ 40 km/h
    d.handle(fix(47.8041, 60_000, null));
    d.handle(fix(47.8041, 121_000, null));
    expect(parked.length).toBe(1);
  });
});
