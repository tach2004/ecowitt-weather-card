# Ecowitt Weather Card

Eine eigenständige, kompakte, hochwertige Home-Assistant-Lovelace-Karte für lokale Ecowitt-Wetterdaten.

**Projektstatus: Konzeption abgeschlossen, Umsetzung vorbereitet. Die JavaScript-Karte ist noch nicht fertig und noch nicht installierbar.**

## Zielbild
- Die vom Nutzer bestätigte elegante Dark-Mode-Wetterkarte mit stilisierter, **nordorientierter 2D-Grundstücksgrafik** und überlagerten Windpfeilen.
- Eine einzige responsive Custom Card statt eines großen, separaten Wetterstation-Dashboards.
- Sofort sichtbar: Außentemperatur, Luftfeuchtigkeit, aktuelle Windgeschwindigkeit, Böen, mittlere Windrichtung, Nass-/Trockenstatus, Regenrate und -menge, Druck, UV, Sonneneinstrahlung.
- Beim Tippen weitere Daten (Windrose/Verlauf, Regen 24h/Woche/Monat/Jahr, Temperaturtrends, WS90/WH40/WN32/WN31/GW3000-Sensordetails).
- Für iPhone 17 (Hochformat) und Desktop; kein Fremd-Cards-Zwang (Mushroom, Bubble, card-mod etc.).
- Ausgelegt für Ecowitt Local; tatsächliche HA-Entitäten werden im grafischen Editor ausgewählt.

## Schnell zur späteren Wetteransicht

**Unsere Empfehlung: eigener Wetter-Reiter als Panel View.** Home Assistant legt dann genau eine Karte über die ganze Ansichtsbreite; diese richtet sich selbst responsiv aus. Es müssen keine Sections, Spalten oder Überschriften konfiguriert werden.

Zwei Vorlagen für dieselbe Karte:

- [Panel View — eigener Wetter-Reiter](examples/view-panel.yaml)
- [Sections View — Wetterkarte neben anderen Karten](examples/view-sections.yaml)

**Wichtig:** Beide Vorlagen sind derzeit nur die geplante Konfiguration. Sie funktionieren erst nach Fertigstellung und Installation des Custom-Card-JavaScripts.

## Dokumentation

- [SPEC.md](SPEC.md) — gesamte verbindliche Produktspezifikation
- [AGENTS.md](AGENTS.md) — dauerhafte Arbeitsanweisungen für Codex
- [docs/CODEX_IMPLEMENTATION.md](docs/CODEX_IMPLEMENTATION.md) — Phasen, Aufgaben und Abnahmekriterien für die Umsetzung
- [docs/INSTALLATION.md](docs/INSTALLATION.md) — geplante Home-Assistant-Einbindung ohne manuelle Layoutarbeit

## Technischer Rahmen

- Lokale Home-Assistant-Daten aus Ecowitt Local, keine Cloud-Pflicht.
- Kein Zugriff auf oder Veränderungen an bestehenden Entity-IDs, HA-Langzeitstatistiken, anderen Repositories oder bestehenden Dashboards.
- Regen WH40 und Piezo-Nassstatus WS90 bleiben unterschiedliche Messquellen.
- Windrichtung meteorologisch als **Wind kommt aus ...** benannt; der auf das Haus zulaufende Strömungspfeil zeigt in die um 180° gedrehte Bewegungsrichtung.

Lizenz: MIT.
