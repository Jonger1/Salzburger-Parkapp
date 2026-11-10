import { useEffect, useState } from 'react';
import { distanceM, type LatLng } from './geo';

export interface Fix {
  point: LatLng;
  accuracy: number;
  /** m/s, falls verfügbar */
  speed: number | null;
  time: number;
}

const toFix = (p: GeolocationPosition): Fix => ({
  point: [p.coords.latitude, p.coords.longitude],
  accuracy: p.coords.accuracy,
  speed: p.coords.speed,
  time: p.timestamp,
});

export function useLocation(active = true) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (!('geolocation' in navigator)) {
      setError('unsupported');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setFix(toFix(p));
        setError(null);
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, nonce]);
  return { fix, error, retry: () => setNonce((n) => n + 1) };
}

export interface DetectorOptions {
  stopMinutes: number;
  onPark: (fix: Fix) => void;
  onFix?: (fix: Fix, speedKmh: number) => void;
}

/** Schlechtere Messungen werden für die Parkerkennung ignoriert */
const MAX_ACCURACY_M = 50;
const DRIVE_KMH = 15;
/** So viele schnelle Messungen in Folge gelten als Fahrt (einzelne GPS-Sprünge nicht) */
const DRIVE_FIXES = 3;
const STOP_RADIUS_M = 40;

/**
 * Parkerkennung: Nach einer Fahrt (mehrere Messungen > 15 km/h) und anschließendem Stillstand
 * (< 40 m Bewegung) über `stopMinutes` wird `onPark` ausgelöst.
 */
export class ParkingDetector {
  private watchId: number | null = null;
  private last: Fix | null = null;
  private fastCount = 0;
  private hasDriven = false;
  private anchor: Fix | null = null;
  private opts: DetectorOptions;

  constructor(opts: DetectorOptions) {
    this.opts = opts;
  }

  update(opts: Partial<DetectorOptions>) {
    this.opts = { ...this.opts, ...opts };
  }

  start() {
    if (this.watchId !== null || !('geolocation' in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition((p) => this.handle(toFix(p)), undefined, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 30000,
    });
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.last = null;
    this.anchor = null;
    this.fastCount = 0;
    this.hasDriven = false;
  }

  /** öffentlich für Tests */
  handle(fix: Fix) {
    if (fix.accuracy > MAX_ACCURACY_M) {
      this.opts.onFix?.(fix, 0);
      return;
    }
    let speed = fix.speed;
    if (speed === null || Number.isNaN(speed)) {
      speed = 0;
      if (this.last) {
        const dt = (fix.time - this.last.time) / 1000;
        const moved = distanceM(this.last.point, fix.point);
        // Bewegung innerhalb der Messungenauigkeit ist keine Bewegung
        if (dt >= 1 && moved > fix.accuracy + this.last.accuracy) speed = moved / dt;
      }
    }
    const kmh = speed * 3.6;
    this.last = fix;
    this.opts.onFix?.(fix, kmh);

    if (kmh > DRIVE_KMH) {
      this.fastCount++;
      if (this.fastCount >= DRIVE_FIXES) this.hasDriven = true;
      this.anchor = null;
      return;
    }
    this.fastCount = 0;
    if (!this.hasDriven) return;
    if (!this.anchor || distanceM(this.anchor.point, fix.point) > STOP_RADIUS_M) {
      this.anchor = fix;
      return;
    }
    if (fix.time - this.anchor.time >= this.opts.stopMinutes * 60000) {
      this.hasDriven = false;
      const parked = this.anchor;
      this.anchor = null;
      this.opts.onPark(parked);
    }
  }
}

export async function reverseGeocode(point: LatLng, lang: string): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${point[0]}&lon=${point[1]}&accept-language=${lang}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    const street = [a.road ?? a.pedestrian ?? a.square, a.house_number].filter(Boolean).join(' ');
    const place = a.suburb ?? a.city_district ?? a.town ?? a.village ?? a.city;
    return [street, place].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}
