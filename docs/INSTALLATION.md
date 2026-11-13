# Geplante Installation / Einbindung

**Status:** Die JavaScript-Karte ist noch in Entwicklung. Die hier abgelegten View-Vorlagen sind Vorlagen für die spätere Installation, nicht sofort nutzbar.

## Für den Nutzer: Einfachster Weg (Panel View)

1. Später die Ecowitt Weather Card über HACS / den HA Marketplace installieren und Frontend neu laden.
2. In Home Assistant das gewünschte eigene Dashboard öffnen und einen neuen Reiter/Ansicht mit dem Titel **Wetter** erstellen.
3. Bei der Ansicht **Panel / Vollbildkarte** wählen.
4. Im Karteneditor **Ecowitt Weather Card** hinzufügen und die vorhandenen Ecowitt-Local-Sensoren im grafischen Editor auswählen.
5. Fertig. Die Karte organisiert Temperatur, Wind, Regen, Sonne und Druck eigenständig, auch auf dem iPhone.

Für die möglichst reproduzierbare Einrichtung statt einzelner Layoutklicks:
- Ansicht im Bearbeitungsmodus öffnen, Stift an der **Ansicht**, dort im Drei-Punkte-Menü **In YAML bearbeiten**.
- Den Inhalt von [../examples/view-panel.yaml](../examples/view-panel.yaml) als **Ansichts-YAML** einfügen.
- Nicht die gesamte Dashboard-Rohkonfiguration durch ein View-Snippet ersetzen!
- Vor dem Einfügen vorhandene Ansicht sichern/erst neuen leeren Reiter anlegen. Bereits vorhandene Ansichtsdaten werden sonst ersetzt.
- Anschließend die Sensorzuordnung im grafischen Editor vornehmen.

## Alternative: Sections View

Für ein Dashboard, in dem du neben der Wetterkarte weitere Karten haben möchtest, kann die Ansicht als Sections aufgebaut werden. Die Datei [../examples/view-sections.yaml](../examples/view-sections.yaml) enthält bereits:
- alle Strukturangaben der Ansicht;
- eine Section, die sich auf breiten Bildschirmen über drei Section-Spalten erstreckt;
- eine Custom Card in voller Breite;
- keine zusätzliche Titel-/Heading-Card innerhalb der Section.

Einfügen wie oben über **Ansicht bearbeiten → ⋮ → In YAML bearbeiten**. Für die Integration in eine **bereits befüllte** Sections-Ansicht besser im normalen Editor die Karte hinzufügen und auf volle Breite setzen, statt deren gesamte View-YAML zu ersetzen.

## Kein automatisches Manipulieren anderer Dashboards

Ein reines Custom-Card-Frontend darf/soll nicht ungefragt fremde Dashboard-Dateien oder HA-Storagedaten verändern. Beim Einfügen einer einzigen Karte brauchst du weder mehrere Dashboard-YAMLs noch eigene Sections pro Messgröße.

Die **Karte selbst** ist responsiv: In Panel View auf Desktop maximal sinnvoll breit und zentriert, auf dem iPhone im Hochformat vertikal neu strukturiert. Sie richtet sich nach ihrer Containerbreite.

## Geplante Sensorauswahl

- WS90: Wind, Sonne/UV, Piezo-Status; WN32: Außentemperatur + Luftfeuchte (optional, wenn vorhanden);
- WH40: Regenrate und Regenmengen; GW3000: relativer Luftdruck; WN31/WH31: zusätzliche Kanäle/Innenklima.
- Tatsächlich bekannt: sensor.ecowitt_wind_direction_avg_175da = 10-Minuten-Mittelwindrichtung.
- Keine weiteren Entity-IDs raten, alle anderen Werte im Editor auswählen.
