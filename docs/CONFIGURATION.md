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
