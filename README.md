# Salzburg Parken 🅿️

Web-App (PWA) für iPhone und Android: Wo darf ich in Salzburg parken? Wo gilt eine Kurzparkzone, wann muss ich ein Ticket lösen und wann läuft meine Parkzeit ab? Mit Benachrichtigungen.

> ⚠️ **Ohne Gewähr.** Die Zonen stammen aus den offenen Geodaten der Stadt Salzburg (siehe [Datenquellen](#datenquellen)). Vor Ort gilt immer die Beschilderung: Auch in einer Kurzparkzone gibt es Halte- und Parkverbote oder Ladezonen.

## Funktionen

- **Jetzt:** Regeln am aktuellen Standort, z. B. „Ticket nötig“, „Parkscheibe nötig“, „Frei“ oder „Parken verboten“. Dazu Höchstparkdauer, Uhrzeit fürs spätestens Wegfahren, Tarif, Kosten und die nächste Änderung (z. B. „Ticket nötig ab morgen 09:00“). Außerdem eine Wochenübersicht und eine Prüfung für beliebige Zeitpunkte.
- **Ich parke hier:** speichert den Parkplatz. Du kannst die Ticketdauer eintragen (30–180 Min. oder eigene), siehst einen Countdown und bekommst Erinnerungen vor dem Ablauf (frei einstellbar), beim Ablauf und bevor die Gebührenpflicht beginnt. Navigation zum Auto per Google oder Apple Maps, Notizfeld, Kalender-Export (.ics).
- **Bezahlen:** Link zu EasyPark (Handyparken) und Hinweise für den Automaten. Die bevorzugte Zahlungsart ist einstellbar.
- **Karte:** die offiziellen Flächen der Kurzparkzonen (dunkelblau = gebührenpflichtig, hellblau = gratis mit Parkscheibe, wie im Stadtplan der Stadt), Fußgängerzonen, Bewohnerparkzonen zum Einblenden, Parkscheinautomaten, Garagen und P+R mit **Live-Belegung**. Tippe auf einen Punkt, um zu sehen, was dort gilt.
- **Nächster Parkscheinautomat** mit Entfernung und Fußweg, wenn ein Ticket nötig ist.
- **Fahrmodus / automatische Erkennung:** erkennt, wenn du nach einer Fahrt stehen bleibst, und zeigt die Regeln an. Optional startet er den Parkvorgang automatisch, meldet Zonenwechsel beim Einfahren und hält den Bildschirm an.
- **Ausnahmen:** Bewohnerparkkarte (Zonen 3, 21, A–K): Die App erkennt, ob der Standort in deiner Zone liegt, und zeigt dort „Frei parken“. § 29b-Ausweis: befreit, und die Karte zeigt barrierefreie Parkplätze.
- **Verlauf** aller Parkvorgänge mit Adresse (über OpenStreetMap Nominatim).
- **Deutsch und Englisch**, Hell- und Dunkelmodus, offline nutzbar, auf dem Homescreen installierbar.

### Hinterlegte Regeln (Stand November 2026)

| Zone | Regel |
|---|---|
| Gebührenpflichtige Kurzparkzone | Mo–Fr 9–19 Uhr, max. 3 h, 1,10 € je angefangene 30 Min. (ab 1.1.2027 1,25 €). Sa 9–16 Uhr gratis mit Parkscheibe, max. 3 h. So und Feiertage frei. |
| Gebührenfreie Kurzparkzone | Mo–Fr 9–19 Uhr mit Parkscheibe, max. 3 h. In einzelnen Zonen (z. B. Nonntal) zusätzlich Sa 9–16 Uhr. |
| Fußgängerzonen | Parkverbot (erkannt bis ca. 8 m neben der Straßenachse) |
| Stadtgebiet ohne Kurzparkzone | „Keine Kurzparkzone“, Beschilderung beachten |
| Umland | keine offenen Daten → nur der Hinweis „Beschilderung beachten“ |

Welche Regel in welcher Zone gilt, steht in den Daten der Stadt und wird beim Aktualisieren übernommen. Die österreichischen Feiertage werden automatisch berechnet, auch Ostern und die davon abhängigen Feiertage.

Wer vor Beginn der Kurzparkzeit parkt oder über Nacht stehen bleibt, bekommt die Höchstparkdauer ab Beginn der Kurzparkzeit gerechnet und wird rechtzeitig vorher erinnert.

## Datenquellen

- **Zonen, Automaten, Garagen, Stadtteile:** Stadt Salzburg, [data.stadt-salzburg.at](https://data.stadt-salzburg.at/) (CC BY 4.0), abgerufen über den Kartendienst von [maps.stadt-salzburg.at](https://maps.stadt-salzburg.at). Die aufbereiteten Dateien liegen in `src/data/geo/`.
- **Aktualisieren:** `npm run update-geodata` lädt den aktuellen Stand und schreibt die Dateien neu. Das Skript bricht ab, wenn die Stadt eine Regelbeschreibung liefert, die die App noch nicht kennt. In einer Umgebung mit Proxy: `NODE_USE_ENV_PROXY=1 npm run update-geodata`.
- **Live-Belegung der Garagen:** wird in der App direkt beim Kartendienst der Stadt abgefragt.
- **Altstadt-Zufahrt im Sommer:** Dazu gibt es keine Geodaten. Die Fläche ist nur grob eingezeichnet, der Text ist ein Hinweis auf die Regelung von Sommer 2026.
- **Tarife und Zeiten:** [stadt-salzburg.at/kurzparkzone](https://www.stadt-salzburg.at/kurzparkzone); Tarif ab 2027 laut Gemeinderatsbeschluss vom 16.9.2026.

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
npm test           # Tests (Regeln, Zonen, Erinnerungen, Parkerkennung, Server)
npm run check      # Typprüfung, Übersetzungen und Tests
npm run build      # Produktions-Build
```

## Daten anpassen

- **Zonen, Automaten, Garagen:** nicht von Hand ändern, sondern mit `npm run update-geodata` neu laden (`scripts/update-geodata.mjs`).
- **Regeln, Zeiten, Tarife:** `src/data/rules.ts`
- **Preise der Garagen und P+R:** `src/data/places.ts`
- **Texte und Übersetzungen:** `src/lib/i18n.ts`

## Technik

Vite, React, TypeScript, Leaflet mit OpenStreetMap-Kacheln, Service Worker (Offline-Cache und Push), Vercel Functions (`api/`) mit `web-push` und Upstash QStash.
