# Meilenstein 1 – funktionsfähige Entwicklungsfassung

Version 0.1.0 setzt die eigenständige Karte und ihren visuellen Editor um. Das öffentliche Paket enthält ausschließlich Code und eine unabhängig gezeichnete generische Beispielgrafik. Private Referenzbilder wurden weder in das Repository übernommen noch für öffentliche Tests verwendet.

## Umfang

- Native Custom-Card-Registrierung mit `getStubConfig`, `getConfigElement` und Sections-Größenangabe.
- Einrichtungshinweise für fehlende Sensoren; keine produktiven Testmesswerte und keine unbelegte Online-Anzeige.
- Konfigurierbare HA-Entitäten für Wind, WH40-Regen, WS90-Piezo, Außenklima, Druck und Sonne sowie Zusatzkanäle und Diagnosen.
- HA-Geräte-/Entitätsauswahl mit überprüfbaren Vorschlägen. Keine erzwungenen Sensor-IDs; WN32-Auswahl für Temperatur und Feuchte möglich.
- Nordorientierte generische Grafik mit getrennten Strömungspfeilen für aktuelle und mittlere Herkunftsrichtung; kürzester animierter Übergang über Nord.
- Containerabhängige Desktop-/Mobilanordnung, Touch-Ziele, HA-Themes und reduzierte Animation.
- Detailfenster und lazy angefragte lokale Recorder-Verläufe; fehlende Historie bleibt sichtbar. Tagesregen und gleitende 24 Stunden werden getrennt konfiguriert.
- Private HA-Bildquelle samt bewusster Bildrotation und einstellbarem Pfeilziel. Gleiche HA-Herkunft für direkte Bild-URLs und aufgelöste Media-Quellen, keine Upload-Funktion.
- Build als eine JavaScript-Datei, HACS-Metadaten, Panel-/Sections-Vorlagen, CI und Release-Workflow.

## Nachvollziehbare Prüfungen

Die Tests sind unter `tests/` und in der Playwright-Konfiguration reproduzierbar. Am 13.11.2026 bestanden Typecheck, Build, 37 Unit-/Vertragstests und alle 42 Chromium-Browsertests einschließlich Screenshot-Erzeugung. Getestet wurden Panel-/Sections-Container mit 320/375/390/402/430/600/768/1024/1440 CSS-Pixeln, iPhone-Hoch-/Querformatgrößen, helle/dunkle Themes, reduzierte Bewegung, echte SVG-Pfeilgeometrie und scrollbare Details. Beide öffentlichen Screenshots wurden zusätzlich visuell geprüft.

Reproduzierbare Befehle:

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
node scripts/audit-public-assets.mjs
```

Screenshots mit ausschließlich synthetischen Messwerten: [Desktop](screenshots/desktop.png) und [iPhone-17-Hochformatgröße](screenshots/mobile.png). Die Aktualisierung erfolgt bewusst mit `UPDATE_SCREENSHOTS=1 npm run test:browser`; im normalen Testlauf wird nur diese Dateierzeugung übersprungen.

Die Unit-Tests prüfen N/O/S/W und 292° → 112°, Übergänge über 359°/0°, Nass/Trocken/Unavailable, WH40/Piezo-Trennung, metrische und imperiale Einheiten, ungültige/fehlende/veraltete Quellen sowie echte API-Antworten mit Lücken und Einheitenwechseln. Recorder-Zustände werden bis zur nächsten aufgezeichneten Änderung gehalten; ein vorhandener Ausgangszustand vor dem Zeitfenster ist ausdrücklich beschriftet und zählt nicht als neuer Messpunkt. Weitere Tests validieren beide View-YAMLs, HACS-Metadaten, Gerätevorschläge und die Beschränkung von Bildquellen auf die HA-Herkunft.

Die Browserprüfung verwendet die tatsächlich gebaute Karte in einer lokalen, ausdrücklich als Test gekennzeichneten HA-Fixture. Alle Zustände sind synthetisch; alle Bilder sind generisch. Diese Prüfung ersetzt keine Integration in eine echte Home-Assistant-Instanz.

Öffentliche Screenshots dürfen nur `docs/screenshots/desktop.png` und `docs/screenshots/mobile.png` mit der generischen Grafik zeigen. Der Veröffentlichungsscan prüft Arbeitsbaum, Git-Index, gesamte verfügbare Git-Historie und das gebaute `dist`-Paket auf unerlaubte Bildpfade, Bilddateien und eingebettete Bilddaten. Er meldet die Hashes der erlaubten Assets zur visuellen Kontrolle. Er kann nicht selbst beurteilen, ob eine frei gezeichnete Geometrie eine private Immobilie erkennen lässt; die Grafik und beide Screenshots sind deshalb vor dem PR zusätzlich anzusehen.

## Offene Punkte und nächster Meilenstein

- Abnahme in echtem Home Assistant mit Ecowitt Local: tatsächliche Sensorsemantik, Geräte-/Entitätsregistry, Karteneditor, Recorder-Aufbewahrung und Berechtigungen prüfen.
- iPhone 17 im Hoch- und Querformat in iOS Safari und Companion App testen. Browseremulation unter Chromium ist keine Prüfung auf einem Apple-Gerät.
- Authentisierte HA-Media-Bildquelle auf der Zielinstanz testen, einschließlich Zugriff ohne Anmeldung. `/local/` ist nicht automatisch geschützt; es gibt keine Sicherheitsgarantie.
- Eine optionale 24h-Windrose mit seriöser Richtungs-/Geschwindigkeitsverteilung und bewusstem Umgang mit Messabständen bleibt für den nächsten Meilenstein offen. Kein Mittelrichtungswert wird als Windrose ausgegeben.
- Design mit den privaten Bildern ausschließlich in der privaten HA-Instanz abnehmen. Diese Bilder und daraus erkennbare Grafiken bleiben außerhalb von Git, PR und Release.
- Erst nach dieser Integration und Abnahme eine Versions-Release veröffentlichen und den HACS-Installationsweg an der tatsächlich veröffentlichten Release prüfen.

Der PR für diesen Meilenstein veröffentlicht weder eine Website noch eine Release und verändert kein bestehendes HA-Dashboard.
