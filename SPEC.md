# Ecowitt Weather Card — Produktspezifikation

**Status:** ENTWURF / PLANUNG — noch kein Implementierungsauftrag.
**Projekt:** `tach2004/ecowitt-weather-card`
**Ziel:** Eine einzige hochwertige, kompakte, mobile-first und vollständig lokal arbeitende Home-Assistant-Lovelace-Karte für Ecowitt Local. Keine umfangreiche Dashboard-Sammlung.

## Verbindlich beschlossene Grundlagen
- Designbasis ist das zweite gemeinsam betrachtete Konzeptbild: stilisierte 2D-Draufsicht eines Grundstücks/Hauses mit darübergelegter Windvisualisierung und klar abgegrenzten Wetterwerten.
- Die gezeigte Grundstücksgrafik ist ein Platzhalter, **keine** Abbildung des echten Grundstücks. Benutzer kann später ein eigenes, nordorientiertes Bild oder eine gezeichnete Draufsicht hinterlegen; ohne Bild ist ein stilisierter Ersatz nötig.
- Starke visuelle Hierarchie: Temperatur, Wind, Niederschlag / Nass-Trocken sofort erkennbar.
- Große, gut lesbare Windgeschwindigkeit und Böen; aktuelle Windrichtung mit grafischem Pfeil; zusätzlich 10-Minuten-Mittelrichtung und möglichst Mittelgeschwindigkeit.
- Tatsächlich bekannter HA-Entity-ID für die mittlere Windrichtung bei diesem Nutzer: `sensor.ecowitt_wind_direction_avg_175da`. **Konfigurierbar** gestalten, nicht hart in Programmlogik einbauen.
- Pfeile eindeutig beschriften. Meteorologische Gradangaben bezeichnen die **Herkunftsrichtung** des Windes. Auf einer Gebäudedraufsicht kann ein Strömungspfeil dagegen **auf das Haus zu** zeigen (Bewegungsrichtung = Herkunftsgrad + 180°). Diese Semantik muss im Design bewusst definiert und getestet werden.
- Prägnanter Nass-/Trockenstatus aus WS90 Piezo, separate WH40-Regenmenge und -Regenrate. Unsichere oder nicht verfügbare Zustände nicht zu "trocken" uminterpretieren.
- Deutsch zuerst; helles/dunkles HA-Theme; barrierearme Kontraste und reduzierte Animation bei prefers-reduced-motion.
- iPhone 17 im Hochformat ist primäres Zielgerät; außerdem iPhone Querformat, Tablet, Desktop.
- Eigenständige JavaScript-Custom-Card, ohne zwingende Abhängigkeiten von Bubble Card, Mushroom, card-mod oder anderen HACS-Frontend-Karten. Ecowitt Local bleibt Datenquelle; keine Veränderungen daran.
- Eine einzige Karte, nicht mehrere DASHBOARD-Versionen. UI passt sich **der Containerbreite** an, nicht ausschließlich Gerätemodell/Viewport.

## Vorgesehener Hauptbildschirm (noch zur finalen Abstimmung)
- Außen: Temperatur (vorrangig WN32, falls verfügbar; sonst manuell konfigurierter Sensor), Luftfeuchte, ggf. gefühlte Temperatur.
- Wind: WS90 Windgeschwindigkeit, Böen, Richtung, Richtung Ø 10 min, Geschwindigkeit Ø 10 min, ggf. Tagesmaximumböe.
- Regen: WS90 Piezo-Nassstatus, WH40 Regen heute, WH40 Regenrate.
- Weitere Messwerte: relativer Luftdruck aus GW3000, UV-Index und Strahlung in W/m² aus WS90.
- Sensorstatus nur, wenn tatsächlich messbar; keine unbewiesene "Online"-Anzeige.

## Vorgesehene Detailansichten
- Tippen auf Regen: 24h gleitend, heute, Woche, Monat, Jahr, Ereignis, Regenrate, Verlauf; Vergleich WH40/WS90 optional. Daten bevorzugt aus entsprechenden verfügbaren Ecowitt-Entitäten; für echte Zeitverläufe HA Recorder/Statistik nutzen. **Heute** und **letzte 24 Stunden** nicht verwechseln; Recorder-Aufbewahrung beachten.
- Tippen auf Wind: Geschwindigkeit/Böen über Zeit, mittlere Richtung, ggf. 24h-Windrose. Eine **Windrose über 24h** ist eine Verteilung von Windrichtungen und Geschwindigkeitsklassen, nicht derselbe Wert wie die mittlere Richtung der letzten 10 Minuten.
- Weitere Details: Temperaturtrend, Max/Min, Taupunkt, gefühlte Temperatur, Luftdrucktrend, Sonne/UV und zusätzliche WN31/WH31-Kanäle.
- Diagnosen (separat/aufklappbar): Batterien, Signalstärke/letzte Aktualisierung der WS90, WH40, WN32, WN31, GW3000, **nur bei vorhandenen Quellentitäten**.
- Desktop-Dialog / mobiles gut bedienbares Detailfenster; optional HA-eigene More-Info-Ansicht je Sensor.

## Einbindung in Home Assistant
- Custom Card `custom:ecowitt-weather-card` (geplanter Name; noch prüfen).
- Im Dashboard-Kartenkatalog sichtbar via `window.customCards`, mit Startkonfiguration (`getStubConfig`) und visuellem Editor (`getConfigElement`).
- Assistent im Karteneditor für Zuordnung WS90, WH40, WN32, WN31/WH31, GW3000 und Einzelsensoren. Automatische **Vorschläge**, aber keine unbelegten Zuordnungen; manuelle Auswahl und klare Meldung bei fehlender Quelle.
- Kein automatisches ungefragtes Verändern bereits bestehender Dashboards. Nutzer fügt die Karte einmalig in der HA-Oberfläche hinzu.
- Responsive Layout mit CSS Container Queries oder gleichwertiger Messung der Kartenbreite; eine Codebasis für schmal/normal/breit.
- Bei HA Sections View passende `getGridOptions()` und sinnvolle Größenveränderbarkeit anbieten; keine starre Annahme von 1448px Breite des Mockups.
- Ein einziges kleines YAML-Beispiel für manuelle Einrichtung als Alternative zum visuellen Editor, keine Sammlung von unterschiedlichen Dashboard-YAMLs.

## Nicht beschlossen / offen
- Genaue Gestaltung der mobilen Stapelung und der Größe des Hintergrundbildes.
- Ob Regen- und Winddetails als eigenes Popup oder andere HA-konforme Präsentation erscheinen.
- Welche zusätzlichen WN31-Kanäle auf der Hauptkarte sichtbar sind.
- Genauer Umgang mit Bilddateien (Einbindung via HA `/local/` oder hochgeladenem Bild, keine externe Google-Maps-Abhängigkeit).
- Optionaler Windrose-Detailmodus und dessen Historien-Aufbereitung.
- Genaues Animationsverhalten/Schwellwerte; kein Flackern, keine erfundenen Werte.
- Finale Freigabe des Layouts durch Nutzer.

## Qualitätskriterien
- Mobile-first und bedienbar mit Touch, ohne horizontales Scrollen.
- Test mit Mock-Entitäten für wet/dry/unavailable, Wind 359°→0°, Ausfall einzelner Ecowitt-Sensoren, Einheitenwechsel, hell/dunkel, kleinen Containern und dynamisch eingeblendeten Details.
- Nordausrichtung eines benutzerdefinierten Grundstücksbildes prüfbar/konfigurierbar; keine versehentlich verkehrte Windrichtung.
- Minimaler Netzwerkbedarf: Daten aus HA; keine externen Render-/Karten- oder Cloud-APIs.
- Keine Manipulation bestehender Entity-IDs, Sensor-Statistiken oder HA-Integrationen.
