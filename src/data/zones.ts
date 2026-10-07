// Zonen-Geometrien.
//
// WICHTIG: Die Umrisse sind NÄHERUNGEN, von Hand nach den öffentlichen Plänen der Stadt Salzburg
// gezeichnet (www.stadt-salzburg.at/kurzparkzone, Parkzonenpläne www.stadt-salzburg.at/parkzone/<Nr>).
// Bitte gegen den offiziellen Plan prüfen und hier korrigieren. Koordinaten als [Breite, Länge].
// Überlappen sich Zonen, gewinnt die mit der höchsten `priority`.

export type ZoneKind = 'kpz_paid' | 'kpz_free' | 'pedestrian' | 'altstadt_access' | 'municipal';

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Verweis auf RULE_SETS; `altstadt_access` ist eine reine Info-Ebene */
  ruleSet?: string;
  region: 'stadt' | 'umland';
  priority: number;
  verified: boolean;
  polygon: [number, number][];
  note?: string;
}

export const ZONES: Zone[] = [
  {
    id: 'fuzo-altstadt',
    name: 'Fußgängerzone Altstadt (Getreidegasse, Dom)',
    kind: 'pedestrian',
    ruleSet: 'pedestrian',
    region: 'stadt',
    priority: 100,
    verified: false,
    polygon: [
      [47.8012, 13.0398], [47.8013, 13.0452], [47.7999, 13.0472], [47.7968, 13.0492],
      [47.7953, 13.0470], [47.7962, 13.0440], [47.7978, 13.0418], [47.7992, 13.0394],
    ],
    note: 'Ladetätigkeit und Zufahrt nur zu den beschilderten Zeiten.',
  },
  {
    id: 'fuzo-linzergasse',
    name: 'Fußgängerzone Linzer Gasse',
    kind: 'pedestrian',
    ruleSet: 'pedestrian',
    region: 'stadt',
    priority: 100,
    verified: false,
    polygon: [
      [47.8027, 13.0458], [47.8042, 13.0461], [47.8049, 13.0512], [47.8040, 13.0516], [47.8026, 13.0470],
    ],
  },
  {
    id: 'kpz-zentrum',
    name: 'Gebührenpflichtige Kurzparkzone Innenstadt',
    kind: 'kpz_paid',
    ruleSet: 'sbg_paid',
    region: 'stadt',
    priority: 50,
    verified: false,
    polygon: [
      [47.8188, 13.0302], [47.8190, 13.0420], [47.8178, 13.0520], [47.8160, 13.0610],
      [47.8105, 13.0650], [47.8040, 13.0640], [47.7990, 13.0610], [47.7930, 13.0612],
      [47.7878, 13.0600], [47.7858, 13.0520], [47.7880, 13.0440], [47.7905, 13.0380],
      [47.7928, 13.0300], [47.7975, 13.0268], [47.8040, 13.0252], [47.8100, 13.0245],
      [47.8155, 13.0262],
    ],
  },
  {
    id: 'kpz-maxglan',
    name: 'Gebührenfreie Kurzparkzone Maxglan / Riedenburg-West',
    kind: 'kpz_free',
    ruleSet: 'sbg_free',
    region: 'stadt',
    priority: 40,
    verified: false,
    polygon: [
      [47.8035, 13.0255], [47.8030, 13.0120], [47.7990, 13.0040], [47.7900, 13.0020],
      [47.7840, 13.0100], [47.7835, 13.0220], [47.7880, 13.0330], [47.7928, 13.0300],
      [47.7975, 13.0268],
    ],
  },
  {
    id: 'kpz-liefering-lehen',
    name: 'Gebührenfreie Kurzparkzone Lehen / Liefering',
    kind: 'kpz_free',
    ruleSet: 'sbg_free',
    region: 'stadt',
    priority: 40,
    verified: false,
    polygon: [
      [47.8360, 12.9990], [47.8370, 13.0180], [47.8300, 13.0300], [47.8188, 13.0302],
      [47.8155, 13.0262], [47.8100, 13.0245], [47.8105, 13.0140], [47.8160, 13.0040],
      [47.8250, 12.9960],
    ],
    note: 'Liefering-Süd seit 13.4.2026 Teil der gebührenfreien Kurzparkzone.',
  },
  {
    id: 'kpz-parsch-aigen',
    name: 'Gebührenfreie Kurzparkzone Parsch / Aigen',
    kind: 'kpz_free',
    ruleSet: 'sbg_free',
    region: 'stadt',
    priority: 40,
    verified: false,
    polygon: [
      [47.8105, 13.0650], [47.8095, 13.0820], [47.8020, 13.0920], [47.7920, 13.0960],
      [47.7820, 13.0910], [47.7830, 13.0740], [47.7878, 13.0600], [47.7930, 13.0612],
      [47.7990, 13.0610], [47.8040, 13.0640],
    ],
  },
  {
    id: 'altstadt-zufahrt',
    name: 'Altstadt-Zufahrtsbeschränkung (Sommer)',
    kind: 'altstadt_access',
    region: 'stadt',
    priority: 0,
    verified: false,
    polygon: [
      [47.8068, 13.0355], [47.8065, 13.0440], [47.8052, 13.0505], [47.8000, 13.0525],
      [47.7948, 13.0505], [47.7942, 13.0420], [47.7978, 13.0368], [47.8040, 13.0338],
    ],
    note: '1.7.–31.8.: Zufahrt über Müllner Hügel, Neutor, Imbergstraße und Schwarzstraße für Tagesgäste gesperrt – Ausnahmen u. a. für Hotelgäste und Anrainer. Bitte P+R nutzen.',
  },
  // ---- Umland (Regeln nicht verifiziert → „Beschilderung beachten“) ----
  {
    id: 'hallein-zentrum',
    name: 'Hallein Zentrum',
    kind: 'municipal',
    ruleSet: 'municipal',
    region: 'umland',
    priority: 30,
    verified: false,
    polygon: [
      [47.6865, 13.0925], [47.6865, 13.1010], [47.6800, 13.1015], [47.6795, 13.0930],
    ],
  },
  {
    id: 'seekirchen-zentrum',
    name: 'Seekirchen Zentrum',
    kind: 'municipal',
    ruleSet: 'municipal',
    region: 'umland',
    priority: 30,
    verified: false,
    polygon: [
      [47.9010, 13.1240], [47.9010, 13.1340], [47.8960, 13.1345], [47.8955, 13.1245],
    ],
  },
  {
    id: 'oberndorf-zentrum',
    name: 'Oberndorf Zentrum',
    kind: 'municipal',
    ruleSet: 'municipal',
    region: 'umland',
    priority: 30,
    verified: false,
    polygon: [
      [47.9475, 12.9370], [47.9475, 12.9450], [47.9430, 12.9455], [47.9428, 12.9372],
    ],
  },
];

/** Grobe Grenze des Abdeckungsgebiets (Stadt Salzburg + Umland) */
export const COVERAGE_BOUNDS = { south: 47.62, north: 47.98, west: 12.85, east: 13.30 };

/** Grobe Stadtgrenze Salzburg */
export const CITY_POLYGON: [number, number][] = [
  [47.8550, 12.9850], [47.8530, 13.0700], [47.8250, 13.1100], [47.7900, 13.1150],
  [47.7600, 13.0900], [47.7550, 13.0400], [47.7700, 12.9950], [47.8100, 12.9700],
];
