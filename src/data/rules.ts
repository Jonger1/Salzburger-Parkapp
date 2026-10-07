// Regelwerke (Rule Sets) für die Zonen.
// Quellen (Stand Okt. 2026): stadt-salzburg.at/kurzparkzone, Gemeinderatsbeschluss 16.9.2026
// (Tarif ab 1.1.2027), Presseaussendungen der Stadt zu den gebührenfreien Kurzparkzonen.
// Alles ohne Gewähr – vor Ort gilt immer die Beschilderung.

/** 0 = Sonntag/Feiertag, 1 = Montag … 6 = Samstag */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WindowKind =
  /** gebührenpflichtig, Parkschein/Handyparken nötig */
  | 'pay'
  /** gebührenfrei, aber Parkscheibe/Parkuhr und Höchstparkdauer */
  | 'disc'
  /** Parken verboten (z. B. Fußgängerzone) */
  | 'no_parking';

export interface TimeWindow {
  days: Weekday[];
  /** "HH:MM" */
  from: string;
  /** "HH:MM" */
  to: string;
  kind: WindowKind;
  /** Höchstparkdauer in Minuten */
  maxMinutes?: number;
}

export interface Tariff {
  /** ISO-Datum, ab dem der Tarif gilt */
  validFrom: string;
  /** Euro je angefangene 30 Minuten */
  perHalfHour: number;
}

export interface RuleSet {
  id: string;
  /** i18n-Key für den Namen */
  labelKey: string;
  windows: TimeWindow[];
  tariffs?: Tariff[];
  /** Außerhalb der Fenster: frei parken (true) oder Beschilderung prüfen (false) */
  freeOutsideWindows: boolean;
  /** true = Regeln nicht verifiziert, nur Hinweis „Beschilderung beachten“ */
  unverified?: boolean;
  /** Bewohnerparkkarte befreit (innerhalb der eigenen Bewohnerzone) */
  residentExempt?: boolean;
  /** § 29b-Ausweis befreit von Gebühr und Höchstdauer */
  disabilityExempt?: boolean;
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export const RULE_SETS: Record<string, RuleSet> = {
  sbg_paid: {
    id: 'sbg_paid',
    labelKey: 'rule.sbg_paid',
    windows: [
      { days: WEEKDAYS, from: '09:00', to: '19:00', kind: 'pay', maxMinutes: 180 },
      { days: [6], from: '09:00', to: '16:00', kind: 'disc', maxMinutes: 180 },
    ],
    tariffs: [
      { validFrom: '2000-01-01', perHalfHour: 1.1 },
      { validFrom: '2027-01-01', perHalfHour: 1.25 },
    ],
    freeOutsideWindows: true,
    residentExempt: true,
    disabilityExempt: true,
  },
  sbg_free: {
    id: 'sbg_free',
    labelKey: 'rule.sbg_free',
    windows: [{ days: WEEKDAYS, from: '09:00', to: '19:00', kind: 'disc', maxMinutes: 180 }],
    freeOutsideWindows: true,
    residentExempt: true,
    disabilityExempt: true,
  },
  pedestrian: {
    id: 'pedestrian',
    labelKey: 'rule.pedestrian',
    windows: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '24:00', kind: 'no_parking' }],
    freeOutsideWindows: false,
  },
  municipal: {
    id: 'municipal',
    labelKey: 'rule.municipal',
    windows: [],
    freeOutsideWindows: false,
    unverified: true,
    disabilityExempt: true,
  },
};

/** Sommer-Zufahrtsbeschränkung Altstadt (Tagesgäste), 1.7.–31.8. */
export const ALTSTADT_ACCESS = { fromMonthDay: '07-01', toMonthDay: '08-31' };

export function tariffAt(rs: RuleSet, date: Date): Tariff | undefined {
  if (!rs.tariffs) return undefined;
  const iso = isoDate(date);
  return [...rs.tariffs].filter((t) => t.validFrom <= iso).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
