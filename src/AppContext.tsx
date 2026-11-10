import { createContext, useContext } from 'react';
import type { LatLng } from './lib/geo';
import type { Lang } from './lib/i18n';
import type { Fix } from './lib/location';
import type { Settings } from './lib/store';
import type { Profile } from './lib/evaluate';

export interface AppCtx {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Ausnahmen des Users (Bewohnerparkkarte, § 29b) */
  profile: Profile;
  fix: Fix | null;
  locError: string | null;
  retryLocation: () => void;
  /** manuell auf der Karte gewählter Punkt */
  picked: LatLng | null;
  setPicked: (p: LatLng | null) => void;
  goTo: (tab: Tab) => void;
  startParking: (point: LatLng) => void;
}

export type Tab = 'now' | 'map' | 'history' | 'info' | 'settings';

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
