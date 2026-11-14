# Ecowitt Weather Card

Eine eigenständige Home-Assistant-Lovelace-Karte für lokale Ecowitt-Wetterdaten: Wind und Regen im Mittelpunkt, nordorientierte Windgrafik, grafischer Karteneditor und ein Layout, das sich an der tatsächlichen Kartenbreite orientiert.

**Entwicklungsstand:** erster funktionsfähiger Meilenstein, Version 0.1.0 im Entwicklungsbranch. Noch keine veröffentlichte HACS-Release und keine Abnahme auf einer echten Home-Assistant-Instanz oder im iPhone-Safari. Der Build liefert eine installierbare JavaScript-Datei; die [Prüfergebnisse und offenen Punkte](docs/MILESTONE_1.md) benennen die Grenzen.

- `custom:ecowitt-weather-card` mit Kartenkatalog, Startkonfiguration und visuellem Editor.
- Windgeschwindigkeit, Böen, Herkunftsrichtung, 10-Minuten-Mittelwerte und Tagesmaximalböe aus auswählbaren HA-Entitäten.
- WH40-Regenmenge und Regenrate getrennt vom WS90-Piezo-Status **NASS / TROCKEN / UNAVAILABLE**.
- Außentemperatur und Feuchte, Druck, UV und Solarstrahlung; zusätzliche Kanäle und Diagnosen in den Details.
- Detailfenster mit lokalen HA-Recorder-Abfragen beim Öffnen; fehlende Historie bleibt erkennbar.
- Neutrale, eigens gezeichnete Beispielgrafik. Optionale private Bildquelle aus Home Assistant, ohne Upload-Funktion.
- Keine Pflichtabhängigkeit von Mushroom, Bubble, card-mod oder anderen Frontend-Karten; keine Cloud-, Karten- oder Wetter-API.

Fehlende Sensoren zeigen einen Einrichtungshinweis. Die produktive Karte erzeugt keine Beispielmesswerte. Die lokale Entwicklungsansicht verwendet ausdrücklich gekennzeichnete synthetische Testdaten.

## Einrichtung

[Installationsanleitung](docs/INSTALLATION.md) lesen, den Build als JavaScript-Modul laden und **Ecowitt Weather Card** im Kartenkatalog auswählen. Anschließend die tatsächlich vorhandenen Sensoren im visuellen Editor zuordnen.

Für einen eigenen Wetter-Reiter empfehlen wir die [Panel View](examples/view-panel.yaml): eine Karte, keine manuell zu erstellenden Sections. Als Alternative gibt es eine fertige [Sections View](examples/view-sections.yaml) für dieselbe Karte.

## Entwicklung

Node.js 22 oder neuer:

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
node scripts/audit-public-assets.mjs
npm run dev
```

Der Build bündelt die Karte und ihren Editor in `dist/ecowitt-weather-card.js`. `npm run dev` startet ausschließlich die lokale Testansicht; sie ist kein Wetterdienst und wird nicht veröffentlicht. Für einen vorhandenen Chromium kann `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` verwendet werden.

## Datenschutz und Windrichtung

Private Luftbilder und erkennbare Grundstückszeichnungen gehören niemals in dieses öffentliche Repository, in PR-Screenshots oder Releases. Die Demo-Grafik hat keinen Bezug zu einer realen Immobilie. Bilder unter `/config/www` beziehungsweise `/local/` sind **nicht automatisch zugriffsgeschützt**. Für sensible Bilder eine authentisierte HA-Media-Lösung und deren tatsächliches Zugriffsverhalten prüfen; diese Karte verspricht keine Zugriffssicherheit. Siehe [private Bildquellen](docs/PRIVATE_IMAGES.md).

Die Gradangabe bezeichnet die meteorologische **Herkunft**. Ein Wind aus 292° kommt aus WNW; der Strömungspfeil läuft von dort zum Haus und zeigt nach 112°. Heute und ein gleitendes 24-Stunden-Regenfenster sind ebenfalls unterschiedliche Messgrößen.

Weitere Dokumentation: [Konfiguration](docs/CONFIGURATION.md), [Produktspezifikation](SPEC.md), [Umsetzungsphasen](docs/CODEX_IMPLEMENTATION.md) und [Agentenanweisungen](AGENTS.md).

Lizenz: MIT.
