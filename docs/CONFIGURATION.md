# Kartenkonfiguration

Die Einstellungen lassen sich im visuellen Karteneditor oder als Karten-YAML speichern. Wähle die Entitäten deiner Home-Assistant-Instanz aus. Vorschläge aus der Geräteauswahl kannst du einzeln übernehmen.

```yaml
type: custom:ecowitt-weather-card
title: Wetterstation
```

## Allgemeine Optionen

| Feld | Bedeutung |
| --- | --- |
| `type` | `custom:ecowitt-weather-card` |
| `title`, `subtitle` | Titel und Untertitel |
| `max_width` | Maximale Kartenbreite zwischen 900 und 3200 CSS-Pixeln, Standard 1380 |
| `theme_mode` | `auto` für das Home-Assistant-Theme, `light` oder `dark` |
| `weather_animation` | Standard `true`, bei `false` bleiben Wettereffekte statisch sichtbar |
| `weather_entity` | Optionale vorhandene `weather.*`-Entität für den aktuellen Himmelszustand. Nur ergänzend; Regenanimation ausschließlich aus positiver lokaler WH40- oder WS90-Regenrate. |
| `night_lux_threshold` | Nachtszene bei lokaler Beleuchtungsstärke höchstens diesem Wert in Lux, Standard **0** (0 ist ausdrücklich erlaubt). |
| `day_lux_threshold` | Tagesdarstellung ab dieser Beleuchtungsstärke in Lux, Standard **10**. Muss über `night_lux_threshold` liegen; ungültige Reihenfolge wird beim Speichern korrigiert. |
| `site_image`, `background_image` | Optionale Bildquelle, mit Vorrang für `site_image` |
| `image_rotation` | Drehung des Bildes im Uhrzeigersinn, −180 bis 180 Grad, Standard 0 |
| `image_target_x`, `image_target_y` | Pfeilziel in Prozent des sichtbaren quadratischen Bildausschnitts, 10 bis 90, Standard 50. Das Ziel bleibt innerhalb eines Radius von 40 % um die Mitte. |
| `entities` | Entitätszuordnung für die Messgrößen |
| `record_entities` | Zugeordnete Sensor-Entitäten, die in den Wetterrekorden erscheinen. Eine leere Liste blendet alle Rekorde aus. |
| `wind_average_period_minutes` | Bekannter Mittelungszeitraum der ausgewählten Richtungsquelle, 1 bis 1440 Minuten. Steuert die Beschriftung. |
| `device_roles` | Geräteauswahl für Vorschläge, siehe Gerätestatus |
| `device_status` | Gerätestatus und Zusatzmesswerte je Gerät |
| `extra_entities`, `diagnostic_entities` | Ältere Zusatz- und Diagnoselisten. Bestehende Zuordnungen werden weiter berücksichtigt. |
| `windrose.enabled` | Optionale Einbettung einer installierten Windrose, Standard `true` |
| `windrose.card_type` | Bereits geladener Kartentyp, Standard `custom:windrose-card` |
| `windrose.config`, `windrose.variants` | Native Windrosenoptionen und benannte Varianten |
| `history_hours` | Zeitfenster für Recorder-Verläufe zwischen 1 und 168 Stunden, Standard 24 |
| `stale_after_minutes` | Altersgrenze für Messwerte und Wettereffekte zwischen 0 und 10080 Minuten, Standard 0 ohne zusätzliche Altersgrenze. Das Alter bezieht sich auf `last_reported` oder `last_updated`. |
| `grid_options` | Home-Assistant-Rastergröße in Sections, zum Beispiel `columns: full` |

Ein eigenes Bild bleibt auf der Home-Assistant-Instanz. Dort lassen sich Auflösung, Zuschnitt und Zugriffsrechte festlegen. [Eigene Hintergrundbilder](PRIVATE_IMAGES.md)

## Messgrößen unter `entities`

| Schlüssel | Bedeutung |
| --- | --- |
| `temperature`, `humidity` | Außentemperatur und relative Luftfeuchte in Prozent |
| `absolute_humidity` | Optionale Entität für absolute Luftfeuchte in `g/m³` oder `g/m3`, keine Berechnung aus anderen Quellen |
| `feels_like`, `dew_point`, `vpd` | Gefühlte Temperatur, Taupunkt und Dampfdruckdefizit |
| `temperature_min`, `temperature_max` | Eigene Tagesextremwerte. Fehlt eine Zuordnung, kann der Recorder den Wert ergänzen. |
| `wind_speed`, `wind_gust`, `wind_gust_max` | Aktuelle Windgeschwindigkeit, aktuelle Böen und Tagesmaximalböe |
| `wind_direction`, `wind_direction_avg` | Aktuelle und mittlere Herkunftsrichtung in Grad |
| `wind_speed_avg` | Altes Feld, das beim Speichern bestehender Konfigurationen erhalten bleibt. Es gibt dafür keine Anzeige. |
| `rain_today`, `rain_rate` | Regenmenge am Kalendertag und aktuelle Regenrate |
| `rain_rate_secondary` | Optionale zweite Quelle für eine echte Regenrate |
| `rain_wet` | Oberflächenfeuchtigkeit aus einem `binary_sensor` mit `device_class: moisture` oder ohne Geräteklasse |
| `rain_24h`, `rain_week`, `rain_month`, `rain_year`, `rain_event` | Gleitende 24-Stunden-Menge, Wochen-, Monats-, Jahres- und Ereignismenge aus getrennten Quellen |
| `pressure_absolute`, `pressure` | Absoluter Druck in Hauptleiste und Details, relativer Druck in den Details |
| `uv`, `solar`, `solar_lux` | UV-Index, Solarstrahlung und Beleuchtungsstärke |

Die Wetterkarte nutzt `solar_lux` zur örtlichen Erkennung von Tag/Nacht. Im Bereich zwischen Nacht- und Tagesgrenze behält sie eine vorhandene Lichtphase bei und berücksichtigt die astronomische Dämmerung. Bei fehlendem/ungültigem Luxwert oder eindeutigen Widersprüchen dient die **lokal berechnete Home-Assistant-Integration `sun.sun`** zur Kontrolle und als Rückfallquelle; dafür wird kein Internet abgerufen. Der aktuelle regionale Zustand von `weather_entity` steuert nur Sonne/Wolken. Meldet die Wetterquelle Regen, ohne dass die Regenraten vor Ort positiv sind, wird **bewölkt statt Regen** gezeigt. Nachts zeigt klarer Himmel Mond und Sterne, bewölkter Himmel dunkle Wolken, lokal gemessener Regen Regentropfen bei Nacht.

Die Regenrate der Hauptkachel verwendet zuerst einen **positiven WH40-Wert**, andernfalls einen positiven WS90-Wert aus `rain_rate_secondary`. Sind beide null, wird null angezeigt; bei fehlender gültiger WH40-Messung kann eine gültige WS90-Rate einspringen. `rain_wet` (Piezo-NASS) ist kein Regenraten-Ersatz. In den Sensor-Details bleiben beide einzeln konfigurierten Quellmessungen erkennbar.

Die Karte übernimmt unterstützte Einheiten aus den Entitäten und kennzeichnet unpassende Einheiten. Der dimensionslose UV-Index wird auf eine ganze Zahl gerundet. Solarstrahlung und Beleuchtungsstärke benötigen getrennte Quellen.

## Gerätestatus

Unter **Geräte auswählen · Vorschläge prüfen** wird die Geräteauswahl für Sensorvorschläge gespeichert. Eine manuelle Auswahl ersetzt vorhandene Messquellen erst, wenn du einen Vorschlag übernimmst oder die Entität änderst. Ein explizit leerer Rolleneintrag wie `GW3000: ""` schaltet die automatische Auswahl für diese Rolle aus.

Unter **Zusatzsensoren & Diagnosen nach Gerät** lässt sich Folgendes je Gerät auswählen:

- **Batterie:** Prozentwerte füllen das Batteriesymbol. Spannung wird in Volt angezeigt.
- **Signal:** Die Einheit der gewählten Signalquelle bleibt erhalten.
- **Verbindung:** Ein passender Konnektivitätssensor oder Statuswert mit gültigem Zeitstempel zeigt die Verbindung. Fehlende oder nicht verfügbare Quellen bleiben erkennbar.
- **Auf Hauptkarte anzeigen:** Blendet den Status des Geräts ein. Sehr schmale Karten zeigen die Statusfelder am Kartenende, breite Karten nebeneinander.
- **Zusätzliche Messwerte:** Erscheinen in den passenden Details. Mehrere Zusatzgeräte lassen sich getrennt konfigurieren.

Beispiel mit Platzhaltern für ein Gerät:

```yaml
type: custom:ecowitt-weather-card
device_status:
  - device_id: "<HA-Geräte-ID>"
    role: WS90
    name: Wind
    show_on_main: true
    battery: "sensor.<batteriesensor>"
    signal: "sensor.<signalsensor>"
    connection: "binary_sensor.<verbindungssensor>"
    extra_entities:
      - "sensor.<zusatzmesswert>"
```

Bestehende Zuordnungen in `extra_entities` und `diagnostic_entities` bleiben erhalten. Quellen ohne verfügbare Gerätezuordnung erscheinen in der Kompatibilitätsansicht des Editors.

Weitere Einstellungen für die Anzeige und Windrosenvarianten stehen in [Darstellung und Windrosenvarianten](DASHBOARD_OPTIONS.md). Zu Messquellen, Recorder und Wetterrekorden siehe [Wettereffekte, Windrose und Verläufe](WEATHER_WINDROSE.md).
