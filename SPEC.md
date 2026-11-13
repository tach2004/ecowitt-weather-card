# Ecowitt Weather Card — Produktspezifikation

**Status:** Design und Einbindungswege freigegeben; Codex-Auftrag vorbereitet.
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
- Bei HA Sections View passende getGridOptions() und sinnvolle Größenveränderbarkeit anbieten; zusätzlich Panel View als Standard für einen eigenständigen Wetter-Tab.
- Zwei kurze View-YAML-Vorlagen (Panel, Sections) für dieselbe Karte; visueller Editor bleibt der Standard für Sensorzuordnung.

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


## Bestätigte Entscheidungen vom 13.11.2026 — verbindlicher Nachtrag

### Design und Grundstückskarte
- Der Nutzer hat das zweite, dunkle Premium-Mockup mit der Haus-/Grundstücksdraufsicht als Hauptdesign bestätigt, einschließlich der zuletzt aus seinem nordorientierten Luftbild erstellten grafischen Version.
- Eine hochwertige eigenständige gezeichnete 2D-Grundstücksgrafik als lokales SVG/Asset erstellen: Wohnhaus im östlich-rechten Zentrum mit zwei Dachflächen; Garage/Nebengebäude nordwestlich; kleiner Schuppen im nördlichen Garten; gebogene Straße auf West- und Südseite; Auffahrt/Parkplätze westlich des Hauses; Garten im Norden, Zaun/Grenze im Osten. Die Positionen bleiben relativ korrekt, Norden oben. Keine Live-Maps-API. Kein externes Copyright-/Kartenbild einbinden.
- Design-Mockup und echte vom Nutzer hochgeladene Luftbildvorlage sind Gesprächsanhänge, derzeit KEINE Dateien im GitHub-Repo. Codex hat nicht automatisch Zugriff auf diese Anhänge. Es soll die Geometrie gemäß Beschreibung zunächst als eigens gezeichnetes SVG umsetzen; keine Behauptung, die Originalgrafik sei bereits verfügbar.
- Großzügiger als das erste Kartenkonzept, aber kompakt und gut bedienbar. Hell-/Dunkelmodus, Kontrast, unaufdringliche Animationen und reduced-motion.

### Hauptbildschirm: immer sichtbar
- Temperatur und Luftfeuchte draußen (WN32 nach Konfiguration bevorzugt, ansonsten WS90); gefühlte Temperatur optional.
- Windgeschwindigkeit WS90, Böe, Richtungsgrad samt Himmelsrichtung, Mittelrichtung 10 min, Mittelgeschwindigkeit 10 min wenn vorhanden, Tagesmaximalböe.
- Vom Nutzer tatsächlich genannte Entity-ID für mittlere Windrichtung 10 min: sensor.ecowitt_wind_direction_avg_175da. Als konfigurierbare Auswahl, nicht als feste ID im Quellcode.
- WH40: heutige Niederschlagsmenge und Regenrate. WS90 Piezo: auffälliger Nass-/Trockenstatus. Feuchtesensor-Status (on = nass; off = trocken) ist NICHT gleichbedeutend mit garantiert aktuell fallendem Regen. Bei unknown/unavailable eindeutig neutral anzeigen.
- Relativer Luftdruck aus GW3000, UV-Index und Solarstrahlung W/m² aus WS90, bei verfügbarer Datenquelle Drucktendenz.
- WN31/WH31-Zusatzkanäle und Batterien/Signale zunächst in den Details; bei späterer Option als kleine Tiles direkt auf Hauptkarte aktivierbar.
- Keine erfundene Online-/Verfügbarkeitsanzeige und keine fest eingestellten Sensorzustände.

### Pfeile müssen physikalisch und meteorologisch stimmen
- Meteorologische Quelle 292° bedeutet Wind AUS 292° (WNW); eine bildhafte STRÖMUNGS-PFEILSPITZE zum Haus zeigt daher IN 112° (292+180 modulo 360). Die Texte und Pfeile müssen diese unterschiedlichen Bedeutungen eindeutig kommunizieren.
- Cyan: aktuelle Windströmung über Karte von Herkunftsseite auf Haus zu. Hellgrau: 10-min-Mittelrichtung, dezent. Sanfte Übergänge über 359° nach 0°, kein 359°-Sprung; Flaute/fehlende Richtung gesondert behandeln.
- Klassischer Windkompass ohne Grundstücksplan wäre optional, dort darf die Wetterfahnen-Nadel in Herkunftsrichtung zeigen. Nicht mit dem Strömungspfeil verwechseln.
- Die beispielhafte 24h-Windrose aus Weather Station Core ist eine Richtungs-/GeschwindigkeitsVERTEILUNG, nicht der 10-min-Mittelwert. Nur im Wind-Detailfenster, wenn echte Recorder-Daten verfügbar sind.

### Tap / Klick öffnet Detailansichten innerhalb derselben Custom Card
- Regen: WS90 nass/trocken, WH40 Regenrate, Regenereignis, Tagesmenge, letzte 24 h (gleitend), Woche, Monat, Jahr, Verlauf; optionale Gegenüberstellung WH40/Piezo-Quantitäten.
- Der KALENDERTAG und ein ROLLENDES 24h-Fenster sind nicht dasselbe. Historien nur aus HA Recorder bzw. seriösen verfügbaren Quellentitäten; wenn Daten fehlen, klar kennzeichnen.
- Wind: aktuelle und 10-min-Durchschnittswerte, Böen, Tagesmaximumböe, Zeitverlauf, optional Windrose.
- Temperatur: Min/Max, Taupunkt, gefühlt, Verlauf; ebenso klickbare Detailbereiche für Sonne/UV, Druck und WN31/WN32/Kanalübersicht und Signal-/Batteriediagnosen.
- Desktop Dialog und iPhone touchfreundliches scrollbares Detailblatt/Vollbild; Diagramme lazy laden und Native More-Info bei Bedarf anbieten.

### Dashboard-Einbindung: Eine Karte, zwei EINFACHE Wege
- Für einen eigenen Reiter Wetter ist eine PANEL VIEW die neue Standardempfehlung. Panel verwendet genau eine Karte über die ganze View-Breite. Die Karte begrenzt sich am großen Monitor selbst auf passende maximale Inhaltsbreite und zentriert sich. Es gibt keine Abschnitte oder Abschnittsüberschriften manuell einzurichten.
- Für die Integration in bereits vorhandene Ansichten bleibt SECTIONS unterstützt. Eine vorbereitete Sections View enthält genau eine Grid-Section, die sich über mehrere View-Spalten erstreckt, und genau eine Wetterkarte mit voller Breite. Keine unnötigen Heading-Cards.
- Beide Vorlagen liegen als View-YAML unter examples/view-panel.yaml und examples/view-sections.yaml; es sind NICHT zwei verschiedene Wetterkarten und keine kompletten Dashboards.
- Installation später: neues Wetter-Tab anlegen, dessen View-Einstellungen öffnen, über Menü In YAML bearbeiten EINE vorbereitete View-YAML einfügen. Alternativ Karte direkt im grafischen Karteneditor auswählen. Bestehende Dashboards nie ungefragt überschreiben.
- Visueller Karteneditor mit auswählbaren Ecowitt-Geräten (WS90, WH40, WN32, WN31/WH31, GW3000) und Feldern pro Messgröße; automatische Vorschläge, manuelle Korrektur, keine geratenen entity_ids. Konfiguration bleibt nach Neustart erhalten.
- Wenn noch keine Entitäten zugeordnet sind, zeigt die Karte einen verständlichen Einrichtungshinweis und keinen Fehler.

### Responsives Verhalten: iPhone 17 als Pflichtziel
- Maßgeblich ist die verfügbare BREITE DER KARTE, nicht der Name des Geräts. Beispieltests mit 320/375/390/430/600/768/1024/1440 CSS-Pixel.
- Mobile Hochformat: oben kompakte Temperatur- und Regenstatus-Zusammenfassung; darunter vollständig sichtbare Grundstücks-/Windgrafik, gut lesbare Winddaten und Regen; weitere Kennzahlen in bis zu zwei Spalten untereinander. Keine mikroskopische Skalierung des Desktop-Mockups.
- Breiter Desktop: Grundstückskarte links dominant, Wind- und Regenwerte rechts, übrige Kennzahlen unten. Gesamtkarte auf sehr großen Displays in einer sinnvollen Maximalbreite zentrieren.
- Interaktive Ziele mindestens etwa 44x44 CSS-Pixel; sicherer Abstand zu iPhone-Systemrändern, kein horizontales Scrollen, reduzierte Animation bei prefers-reduced-motion.

### Tests / Definition fertig
- N/O/S/W und 0/90/180/270/359/0°: Pfeile und Herkunftstexte korrekt; Nordausrichtung der Grundstückskarte bleibt fest.
- Rain status on/off/unavailable unterscheidbar; WH40 Tagesregen kann größer 0 sein, obwohl Piezo trocken ist.
- Funktion ohne Pflichtabhängigkeiten von Mushroom, Bubble, card-mod etc.; keine externen Runtime-APIs; nur HA-Daten.
- Tests in Sections und Panel auf iPhone-Hochformat, iPhone-Querformat, Desktop, hellem/dunklem Theme; Screenshots prüfen.
- Beispiel-YAML ist vor Fertigstellung der JS-Karte nicht funktionsfähig und dient der geplanten finalen Einrichtung.

**Projektstatus:** Planung ist freigegeben. Die eigentliche Codex-Programmierung wird als Aufgabe dokumentiert; sie startet erst, wenn Codex im Projekt explizit damit beauftragt wird.
