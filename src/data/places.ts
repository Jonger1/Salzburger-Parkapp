// Parkgaragen und Park & Ride. Koordinaten ungefähr, Preise Stand 2026 soweit bekannt (ohne Gewähr).

export interface Place {
  id: string;
  name: string;
  kind: 'garage' | 'pr' | 'mall';
  lat: number;
  lng: number;
  region: 'stadt' | 'umland';
  /** Freitext je Sprache */
  price?: { de: string; en: string };
  spaces?: number;
}

const PR_PRICE = {
  de: 'Kombiticket 15 € (Parken + Öffi-Tageskarte bis 5 Personen), Juli/August 7,50 €',
  en: 'Combo ticket €15 (parking + public transport day pass for up to 5 people), July/August €7.50',
};

export const PLACES: Place[] = [
  {
    id: 'altstadtgarage',
    name: 'Altstadtgarage A+B (Mönchsberg)',
    kind: 'garage',
    lat: 47.7987,
    lng: 13.0392,
    region: 'stadt',
    spaces: 1347,
    price: { de: '3,60 €/h, max. 25,90 €/Tag', en: '€3.60/h, max €25.90/day' },
  },
  { id: 'mirabell', name: 'Mirabell-Congress-Garage', kind: 'garage', lat: 47.8077, lng: 13.0428, region: 'stadt' },
  { id: 'linzergasse', name: 'Linzergassen-Garage', kind: 'garage', lat: 47.8058, lng: 13.0497, region: 'stadt', spaces: 400 },
  { id: 'bahnhof', name: 'Bahnhofsgarage', kind: 'garage', lat: 47.8136, lng: 13.0441, region: 'stadt' },
  { id: 'akademie', name: 'Garage Akademiestraße', kind: 'garage', lat: 47.7915, lng: 13.0575, region: 'stadt' },
  { id: 'hellbrunn', name: 'Parkplatz Zoo / Schloss Hellbrunn', kind: 'garage', lat: 47.7605, lng: 13.0615, region: 'stadt' },
  { id: 'pr-messe', name: 'P+R Messe', kind: 'pr', lat: 47.8212, lng: 13.0005, region: 'stadt', spaces: 3500, price: PR_PRICE },
  { id: 'pr-sued', name: 'P+R Süd (Alpenstraße)', kind: 'pr', lat: 47.7615, lng: 13.0705, region: 'stadt', spaces: 297, price: PR_PRICE },
  { id: 'pr-airport', name: 'P+R Airport', kind: 'pr', lat: 47.7955, lng: 13.0055, region: 'stadt', price: PR_PRICE },
  { id: 'pr-outlet', name: 'P+R Designer Outlet', kind: 'pr', lat: 47.8370, lng: 13.0600, region: 'umland', price: PR_PRICE },
  { id: 'europark', name: 'Europark (Wals-Siezenheim)', kind: 'mall', lat: 47.8170, lng: 12.9895, region: 'umland' },
];
