import { useCallback, useEffect, useState } from 'react';
import type { Lang } from './i18n';
import type { Status } from './evaluate';
import type { WindowKind } from '../data/rules';

export interface Settings {
  lang: Lang;
  theme: 'system' | 'light' | 'dark';
  notifications: boolean;
  notifyOnPark: boolean;
  leadMinutes: number[];
  notifyAtExpiry: boolean;
  notifyPayStart: boolean;
  payStartLead: number;
  serverPush: boolean;
  autoDetect: boolean;
  autoStart: boolean;
  stopMinutes: number;
  zoneEntryAlerts: boolean;
  wakeLock: boolean;
  residentPermit: boolean;
  residentZone: string;
  disabilityPermit: boolean;
  payment: 'ask' | 'easypark' | 'automat';
  showPlaces: boolean;
}

const browserLang: Lang = typeof navigator !== 'undefined' && !navigator.language?.startsWith('de') ? 'en' : 'de';

export const DEFAULT_SETTINGS: Settings = {
  lang: browserLang,
  theme: 'system',
  notifications: false,
  notifyOnPark: true,
  leadMinutes: [15, 5],
  notifyAtExpiry: true,
  notifyPayStart: true,
  payStartLead: 15,
  serverPush: false,
  autoDetect: false,
  autoStart: false,
  stopMinutes: 3,
  zoneEntryAlerts: true,
  wakeLock: true,
  residentPermit: false,
  residentZone: '',
  disabilityPermit: false,
  payment: 'ask',
  showPlaces: true,
};

export interface Session {
  id: string;
  lat: number;
  lng: number;
  startedAt: number;
  endedAt?: number;
  zoneId?: string;
  zoneName?: string;
  status: Status;
  /** Ende der Höchstparkdauer zum Parkbeginn */
  maxDeadline?: number | null;
  /** Ende des Zeitfensters zum Parkbeginn */
  windowEnd?: number;
  /** nächstes reguliertes Fenster */
  nextAt?: number;
  nextKind?: WindowKind;
  /** vom User eingegeben: Ticket gültig bis */
  ticketUntil?: number;
  note?: string;
  address?: string;
  /** IDs der serverseitig geplanten Push-Nachrichten */
  serverIds?: string[];
  /** bereits lokal ausgelöste Erinnerungen */
  fired?: string[];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

const listeners = new Map<string, Set<() => void>>();

/** localStorage-gestützter State, über Komponenten hinweg synchron */
export function useStored<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const fn = () => setValue(read(key, fallback));
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    return () => void listeners.get(key)!.delete(fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(read(key, fallback)) : v;
      write(key, next);
      listeners.get(key)?.forEach((fn) => fn());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void, () => void] {
  const [stored, setStored] = useStored<Partial<Settings>>('settings', {});
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const update = useCallback((patch: Partial<Settings>) => setStored((prev) => ({ ...prev, ...patch })), [setStored]);
  const reset = useCallback(() => setStored({}), [setStored]);
  return [settings, update, reset];
}

export const useSession = () => useStored<Session | null>('session', null);
export const useHistory = () => useStored<Session[]>('history', []);
