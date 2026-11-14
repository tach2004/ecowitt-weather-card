# Kartenkonfiguration

Der visuelle Lovelace-Editor ist der empfohlene Weg. Er speichert dieselbe Konfiguration wie YAML. Es gibt keine Pflicht-Entitätsnamen. Die Felder werden mit tatsächlich vorhandenen HA-Entitäten belegt; Namens- oder Gerätevorschläge sind vor dem Speichern zu prüfen.

Minimaler Start:

```yaml
type: custom:ecowitt-weather-card
title: Wetterstation
```

Ohne Sensorzuordnung zeigt die Karte die Einrichtung. Die Beispiele enthalten absichtlich keine geratenen `entity_id`s.

## Allgemeine Optionen

| Feld | Bedeutung |
| --- | --- |
| `type` | Immer `custom:ecowitt-weather-card` |
| `title` | Eigener Kartentitel |
| `subtitle` | Eigene Unterzeile |
| `site_image` | Optionale HA-relative Bildquelle, URL derselben Herkunft oder `media-source://`-ID; leer = generische Grafik |
| `background_image` | Alternativer Feldname für `site_image`; `site_image` hat Vorrang |
| `image_rotation` | Bildrotation im Uhrzeigersinn, −180 bis 180 Grad, Standard 0; Kompass bleibt nordorientiert |
| `image_target_x`, `image_target_y` | Pfeilziel in Prozent der sichtbaren quadratisch zugeschnittenen Bildfläche, 10 bis 90, Standard 50; außerhalb eines Radius von 40 % um die Mitte auf diesen Kreis begrenzt |
| `entities` | Zuordnung der Messgrößen aus der folgenden Tabelle |
| `extra_entities` | Liste zusätzlicher WN31/WH31-/Klimasensoren für das Detailfenster |
| `diagnostic_entities` | Liste vorhandener Diagnosequellen, etwa Batterie und Signal |
| `history_hours` | Angefragtes Recorder-Zeitfenster: 1 bis 168 Stunden, Standard 24 |
| `stale_after_minutes` | Hinweis nach dieser Zeit seit letztem HA-Update; Standard 0 = aus, maximal 10080 Minuten. Ein alter Wert beweist keinen Offline-Status. |
| `grid_options` | Native Lovelace-Sections-Größe; in der Sections-Vorlage `columns: full` |

Eigene Bilder werden mit `object-fit: cover` quadratisch zugeschnitten und rund maskiert. Die Zielkoordinaten gelten für diese sichtbare Fläche nach der Bildrotation; sie drehen das Bild nicht mit. Ein Haus außerhalb der sichtbaren Fläche benötigt einen passenden privaten Bildzuschnitt.

Einheiten stammen aus den Sensorattributen. Die Karte gibt keinen °C-, km/h- oder mm-Wert vor, wenn der Sensor eine andere unterstützte Einheit liefert. Eine unpassende Einheit oder ein nicht numerischer Zustand wird erkennbar behandelt. Für den Piezo-Status sind `on` = nass und `off` = trocken vorgesehen; unbekannt oder nicht verfügbar bleibt neutral.

## Messgrößen unter `entities`

| Schlüssel | Quelle und Bedeutung |
| --- | --- |
| `temperature`, `humidity` | Außenklima; WN32 bevorzugt, alternativ manuell WS90 |
| `feels_like`, `dew_point` | Gefühlt und Taupunkt, optional |
| `temperature_min`, `temperature_max` | Tagesminimum und Tagesmaximum aus eigenen Quellentitäten |
| `wind_speed`, `wind_gust` | Aktuelle Windgeschwindigkeit und Böen, WS90 |
| `wind_direction` | Meteorologische Herkunft in Grad, WS90 |
| `wind_direction_avg` | Mittlere Herkunftsrichtung der letzten 10 Minuten |
| `wind_speed_avg` | Mittlere Geschwindigkeit der letzten 10 Minuten |
| `wind_gust_max` | Tagesmaximalböe |
| `rain_today`, `rain_rate` | WH40-Kalendertag und aktuelle WH40-Regenrate |
| `rain_wet` | WS90-Piezo-Feuchtigkeitsstatus; kein Niederschlagszähler |
| `rain_24h` | Gleitende letzte 24 Stunden, wenn eine entsprechende Quelle existiert |
| `rain_week`, `rain_month`, `rain_year` | Zugeordnete Wochen-, Monats- und Jahressummen |
| `rain_event` | Regenereignis aus einer vorhandenen Quellentität |
| `pressure` | Relativer Luftdruck, GW3000 |
| `uv`, `solar` | UV-Index und Solarstrahlung, WS90 |

Die mittlere Richtung ist keine Windrose. Eine Windrose benötigt eine echte Richtungs- und Geschwindigkeitsverteilung; sie wird in diesem Meilenstein nicht aus einem einzelnen Mittelwert erzeugt.

## Details und Historie

Tippen auf Wind, Regen, Temperatur, Druck oder Sonne öffnet das jeweilige Detailfenster innerhalb der Karte. Die Hauptwerte bleiben ihre konfigurierten HA-Zustände. Recorder-Verläufe werden erst beim Öffnen angefragt. Nicht verfügbare APIs, leere Aufzeichnung oder fehlende Entitäten erhalten einen Hinweis. Die Diagramme zeigen die empfangenen Recorder-Messpunkte; unbekannte Zustände und Einheitenwechsel trennen die Linien. Es werden keine Zwischenmessungen erzeugt und keine Daten aus fremden Diensten geladen. Zusätzliche Kanäle und Diagnosen zeigen nur zugeordnete Quellen; die native HA-More-Info-Ansicht kann einzelne Entitäten ergänzen.

Private Bilder außerhalb des Repositories verwalten. `/local/` bietet allein keinen Zugriffsschutz; siehe [PRIVATE_IMAGES.md](PRIVATE_IMAGES.md). Die Karte lädt keine Bilder zu Dritten hoch.


## Wetter- und Gerätestatus in der erweiterten Karte

- `theme_mode`: `auto` (HA-Theme, Standard), `light` oder `dark`.
- `weather_animation`: `true` (Standard) oder `false`. Die Systemeinstellung „Bewegung reduzieren“ schaltet Animationen ebenfalls ab.
- `entities.solar_lux`: WS90-Beleuchtungsstärke in lx/lux oder klx. Keine Umrechnung von Lux in W/m².
- `entities.vpd`: Dampfdruckdefizit in kPa, hPa oder Pa. Das ist ein eigener Quellwert, keine erfundene Berechnung.
- `entities.wind_speed_avg`: bisheriger optionaler Key wird nur aus Gründen der Rückwärtskompatibilität behalten, aber in der Hauptkarte und im Editor **nicht mehr angeboten**. Die mittlere Windrichtung bleibt `entities.wind_direction_avg`.

### Lokale Wetterabschätzung (keine Vorhersage)

Die Karte verwendet **positive WH40-Regenrate** für die Anzeige fallenden Regens; eine nasse WS90-Piezo-Oberfläche ist kein Beweis für anhaltenden Regen. Für eine grobe, ausdrücklich als **Schätzung** bezeichnete Sonnig/Teilbewölkt/Bewölkt-Anzeige vergleicht sie WS90-Globalstrahlung mit dem Haurwitz-Klarhimmelmodell bei der Sonnenhöhe aus `sun.sun`. Die Schätzung wird bei tiefem Sonnenstand unter 12° oder fehlender/ungültiger Einstrahlung unterdrückt. Verschattung, Dunst und Sensorposition können das Ergebnis verfälschen; Schneefall, Hagel und Gewitter werden nicht ohne zusätzliche zuverlässige Quelle behauptet. Nachts wird nur der astronomische Nachtstatus angezeigt, keine wolkenfreie Nacht.

### Gerätestatus pro Ecowitt-Gerät

Im visuellen Editor unter **Zusatzsensoren & Diagnosen nach Gerät** können WS90, WH40, WN32, mehrere WN31/WH31 und GW3000 anhand ihrer tatsächlichen HA-Geräteregistereinträge ausgewählt werden. Jede Auswahl hat die folgenden Felder:

- **Batterie**: expliziter Batteriesensor. Die grafische Füllung gibt es nur bei einem echten Prozent-Sensor (`%`); Batteriespannung wird in V angezeigt, nicht in einen erfundenen Prozentwert umgerechnet.
- **Signal**: expliziter RSSI-/Signal-/Qualitätssensor; dBm wird ohne willkürliche Schwellen als dBm angezeigt.
- **Verbindung**: `binary_sensor` mit `device_class: connectivity` oder explizit `online/offline/connected/disconnected` meldende Quelle. Fehlt der Sensor, steht „Nicht zugeordnet“ statt eines erfundenen Online-Häkchens.
- **Auf Hauptkarte anzeigen**: per Gerät aktiviert; WS90 wird beim Hinzufügen als Vorschlag ausgewählt, weitere Geräte standardmäßig nur in den Details. Mehrere WN31/WH31 können getrennt ausgewählt werden.

Die zusätzliche Sensorliste verwendet Suchfelder und Checkboxen, gruppiert nach Geräten. Strg-/⌘-Mehrfachauswahl entfällt. Alte `extra_entities` und `diagnostic_entities` bleiben erhalten.

Beispielkonfiguration **ausschließlich als Struktur** (keine echten Entity-IDs):
```yaml
type: custom:ecowitt-weather-card
theme_mode: auto
weather_animation: true
device_status:
  - device_id: "<HA-Geräte-ID-aus-dem-Editor>"
    role: WS90
    name: "Wetterstation"
    show_on_main: true
    battery: "sensor.<vorhandener_batteriesensor>"
    signal: "sensor.<vorhandener_signalsensor>"
    connection: "binary_sensor.<vorhandener_connectivity_sensor>"
```

### Privates Bild

Empfohlener Speicherort: `/media/ecowitt/Wohnhaus.png`. Kartenfeld:

```yaml
site_image: media-source://media_source/local/ecowitt/Wohnhaus.png
```

Der neue Editor kann außerdem das HA-Medienverzeichnis über eine WebSocket-Abfrage durchsuchen, sofern der angemeldete Benutzer entsprechende Rechte besitzt. Dies ist kein Upload. Ohne Zugriffsberechtigung oder bei inkompatiblen Medienquellen bleibt das Textfeld verwendbar. Den Zugriff auf das private Bild unbedingt ohne Anmeldung testen; `/local` ist öffentlich erreichbar und wird nicht empfohlen.
