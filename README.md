# Salzburg Parken 🅿️

Web-App (PWA) für iPhone und Android: Wo darf ich in Salzburg parken? Wo gilt eine Kurzparkzone, wann muss ich ein Ticket lösen und wann läuft meine Parkzeit ab? Mit Benachrichtigungen.

> ⚠️ **Ohne Gewähr.** Die Zonengrenzen sind von Hand gezeichnete **Näherungen** nach den öffentlichen Plänen der Stadt Salzburg. Bitte gegen den [offiziellen Plan](https://www.stadt-salzburg.at/kurzparkzone) prüfen. Vor Ort gilt immer die Beschilderung.

## Funktionen

- **Jetzt:** Regeln am aktuellen Standort, z. B. „Ticket nötig“, „Parkscheibe nötig“, „Frei“ oder „Parken verboten“. Dazu Höchstparkdauer, Uhrzeit fürs spätestens Wegfahren, Tarif, Kosten und die nächste Änderung (z. B. „Ticket nötig ab morgen 09:00“). Außerdem eine Wochenübersicht und eine Prüfung für beliebige Zeitpunkte.
- **Ich parke hier:** speichert den Parkplatz. Du kannst die Ticketdauer eintragen (30–180 Min. oder eigene), siehst einen Countdown und bekommst Erinnerungen vor dem Ablauf (frei einstellbar), beim Ablauf und bevor die Gebührenpflicht beginnt. Navigation zum Auto per Google oder Apple Maps, Notizfeld, Kalender-Export (.ics).
- **Bezahlen:** Link zu EasyPark (Handyparken) und Hinweise für den Automaten. Die bevorzugte Zahlungsart ist einstellbar.
- **Karte:** farbige Zonen (gebührenpflichtig, gebührenfrei, Fußgängerzone, Altstadt-Zufahrt im Sommer, Umland), Parkgaragen und P+R mit Preisen. Tippe auf einen Punkt, um zu sehen, was dort gilt.
- **Fahrmodus / automatische Erkennung:** erkennt, wenn du nach einer Fahrt stehen bleibst, und zeigt die Regeln an. Optional startet er den Parkvorgang automatisch, meldet Zonenwechsel beim Einfahren und hält den Bildschirm an.
- **Ausnahmen:** Bewohnerparkkarte (mit Zone und Link zum Zonenplan) und § 29b-Ausweis.
- **Verlauf** aller Parkvorgänge mit Adresse (über OpenStreetMap Nominatim).
- **Deutsch und Englisch**, Hell- und Dunkelmodus, offline nutzbar, auf dem Homescreen installierbar.

### Hinterlegte Regeln (Stand Oktober 2026)

| Zone | Regel |
|---|---|
| Gebührenpflichtige Kurzparkzone (Innenstadt) | Mo–Fr 9–19 Uhr, max. 3 h, 1,10 € je angefangene 30 Min. (ab 1.1.2027 1,25 €). Sa 9–16 Uhr gratis mit Parkuhr, max. 3 h. So und Feiertage frei. |
| Gebührenfreie Kurzparkzone (Maxglan, Lehen/Liefering, Parsch/Aigen) | Mo–Fr 9–19 Uhr mit Parkscheibe, max. 3 h |
| Fußgängerzonen (Altstadt, Linzer Gasse) | Parkverbot |
| Altstadt-Zufahrt | 1.7.–31.8. für Tagesgäste gesperrt (Hinweis) |
| Umland (Hallein, Seekirchen, Oberndorf) | nur markiert, Regeln nicht geprüft → „Beschilderung beachten“ |

Die österreichischen Feiertage werden automatisch berechnet, auch Ostern und die davon abhängigen Feiertage.

## Wichtige Einschränkungen von Web-Apps

- **Standort im Hintergrund:** Browser geben den Standort nur heraus, solange die App geöffnet ist. Die automatische Erkennung funktioniert deshalb nur im Fahrmodus bei offener App.
- **iPhone:** Benachrichtigungen gehen erst ab iOS 16.4 und nur, wenn die App über *Safari → Teilen → Zum Home-Bildschirm* installiert ist.
- **Erinnerungen bei geschlossener App** brauchen den Push-Server (siehe unten). Ohne ihn kommen Erinnerungen nur, solange die App läuft. Als Alternative gibt es den Kalender-Export.

## Deployment auf Vercel

1. Repository in Vercel importieren (*Add New → Project*). Framework „Vite“ wird erkannt, Build `npm run build`, Output `dist`.
2. Deploy, fertig. Die App läuft dann ohne weitere Konfiguration.

### Optional: Push-Erinnerungen bei geschlossener App

Vercel-Cronjobs laufen im kostenlosen Plan nur einmal täglich. Für zeitgenaue Erinnerungen nutzt die App deshalb [Upstash QStash](https://upstash.com/docs/qstash) (Free Tier), das die Nachrichten zum richtigen Zeitpunkt an `/api/send` schickt.

1. VAPID-Schlüssel erzeugen: `npx web-push generate-vapid-keys`
2. In Vercel unter *Storage/Marketplace* „Upstash QStash“ verbinden, oder die Schlüssel aus der Upstash-Konsole kopieren.
3. Umgebungsvariablen in Vercel setzen (siehe `.env.example`):
   - `VITE_VAPID_PUBLIC_KEY` und `VAPID_PUBLIC_KEY`: Public Key (beide gleich)
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`, z. B. `mailto:du@example.com`
   - `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
4. Neu deployen. Danach in der App unter *Einstellungen → Benachrichtigungen* „Erinnerungen auch bei geschlossener App“ aktivieren.

`/api/config` zeigt an, ob der Push-Server vollständig konfiguriert ist.

## Lokale Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Tests (Regeln, Feiertage, Parkerkennung)
npm run build      # Produktions-Build
```

## Daten anpassen

- **Zonen:** `src/data/zones.ts`. Polygone als `[Breite, Länge]`; bei Überlappung gewinnt die höhere `priority`.
- **Regeln, Zeiten, Tarife:** `src/data/rules.ts`
- **Garagen und P+R:** `src/data/places.ts`
- **Texte und Übersetzungen:** `src/lib/i18n.ts`

Wenn du eine Zonengrenze korrigierst, reicht es, die Koordinaten im Polygon anzupassen. Koordinaten bekommst du z. B. per Rechtsklick in Google Maps oder auf openstreetmap.org.

## Technik

Vite, React, TypeScript, Leaflet mit OpenStreetMap-Kacheln, Service Worker (Offline-Cache und Push), Vercel Functions (`api/`) mit `web-push` und Upstash QStash.
