# Wettereffekte, Windrose und Verläufe

## Wettereffekte

Die Karte zeigt Wettereffekte auf der Windgrafik und der Regenkachel. Sie verwendet dafür Zustände aus Home Assistant.

| Quelle | Verwendung |
| --- | --- |
| `entities.rain_rate` | Eine positive gültige lokale Regenrate hat Vorrang. |
| `entities.rain_rate_secondary` | Optionale zweite lokale Regenrate, wenn die erste keinen aktuellen Regen belegt. |
| `entities.rain_wet` | Separater Status für eine nasse oder trockene Oberfläche. |
| `weather_entity` | Aktueller unterstützter Wetterzustand einer gewählten Home-Assistant-Entität. |
| `sun.sun`, `entities.solar` | Sonnenstand und Globalstrahlung als Grundlage einer lokalen Himmelsabschätzung. |

Die Regenanimation folgt einer positiven lokalen Regenrate. Eine nasse Oberfläche, die bisherige Tagesmenge oder eine meldende Wetterentität allein lösen sie nicht aus. Bei Regen laut Wetterentität ohne lokale Messung zeigt die Karte die Herkunft des Hinweises an. Sie fragt keine Vorhersage ab.

Für eine lokale Einschätzung vergleicht die Karte bei mindestens 12 Grad Sonnenhöhe die Globalstrahlung mit einem Klarhimmelmodell. Verschattung, Dunst und die Lage des Sensors können das Ergebnis beeinflussen. Bei tiefer Sonne erscheint neutrales Tageslicht. In der Nacht zeigt der Mond den astronomischen Zustand.

Unter der Windgrafik lässt sich die verwendete Quelle einsehen. Reduzierte Bewegung in den Systemeinstellungen oder `weather_animation: false` lassen die Effekte statisch erscheinen. Eine optional eingestellte Altersgrenze gilt auch für Wetterquellen.

## Windrose einbetten

1. Die Windrose Card separat installieren und deren JavaScript-Ressource als Modul in Home Assistant laden. [Lovelace Windrose Card](https://github.com/aukedejong/lovelace-windrose-card)
2. In der Ecowitt Weather Card die aktuelle Windrichtung und Windgeschwindigkeit zuordnen.
3. Zur Windrose wechseln, indem du die Windgrafik antippst oder **Windrose öffnen** wählst. **Windgrafik** führt zur Hauptansicht zurück.

Die Windrose verwendet standardmäßig die aufgezeichneten Windrichtungen und Geschwindigkeiten der letzten 24 Stunden. Sie benötigt Recorder-Daten der gewählten Quellen. Fehlt die separat installierte Ressource, zeigt die Karte einen Einrichtungshinweis. Die eingebettete Windrose bleibt nur während ihrer geöffneten Ansicht aktiv.

Eigene Varianten und alternative installierte Windrosen lassen sich im Karten-YAML einrichten. Im visuellen Karteneditor ist die Einbettung abschaltbar. [Darstellung und Windrosenvarianten](DASHBOARD_OPTIONS.md)

## Messverläufe und Tageswerte

Ein Tipp auf eine Messkachel öffnet deren Details mit zugeordneten Quellen, Einheiten und Zeitachsen. Die Diagramme verwenden aufgezeichnete Home-Assistant-Werte. Nicht verfügbare Messwerte oder Einheitenwechsel unterbrechen den Verlauf. Recorder-Aufbewahrung, ausgeschlossene Entitäten und Benutzerrechte bestimmen, welche Daten die Karte abrufen kann.

Eigene Quellen für Temperaturminimum und -maximum haben Vorrang. Fehlt eine Zuordnung, kann die Hauptkarte den Wert aus der aufgezeichneten Außentemperatur zwischen Mitternacht und jetzt ergänzen. Maßgeblich ist die Zeitzone von Home Assistant. Die Karte kennzeichnet unvollständige Daten und benötigt mindestens eine gültige Aufzeichnung des laufenden Tages.

Regenmengen für den heutigen Kalendertag und für die gleitenden letzten 24 Stunden werden getrennten Sensoren zugeordnet.

## Wetterrekorde

Unter **Wetterrekorde · Messquellen auswählen** im Karteneditor lassen sich zugeordnete numerische Entitäten einzeln anhaken, auch Zusatzsensoren weiterer Geräte. Wetterzustände und Ein/Aus-Sensoren haben keinen numerischen Rekord. Ungewählte Quellen werden weder abgefragt noch als Kachel angezeigt. Ohne gespeicherte Auswahl bleiben in bestehenden Karten die bisher angezeigten Rekordquellen ausgewählt. Neue Karten starten mit einer leeren Auswahl.

Die gewählten Außenklimaquellen stehen am Anfang. Temperatur, relative und absolute Luftfeuchte sowie gefühlte Temperatur erscheinen jeweils mit ihrem eigenen Quellnamen und Höchstwert im gewählten Zeitraum. Mehrere Sensoren derselben Messgröße bleiben getrennt.

Über die Schaltfläche **Wetterrekorde** lassen sich die aufgezeichneten Höchstwerte der ausgewählten Quellen ansehen. Standard ist **Heute**. Die Datumsauswahl bietet weitere Zeiträume und eine Kalenderwahl. Bei täglich zurückgesetzten Werten wie Tagesregen und Tagesmaximalböe berücksichtigt die Karte Tage mit erkennbarer Rücksetzung. Lücken im Recorder können deshalb die sichtbaren Höchstwerte begrenzen.
