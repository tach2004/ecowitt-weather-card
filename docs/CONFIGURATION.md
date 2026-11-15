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
| `max_width` | Maximale Kartenbreite 900–3200 CSS-Pixel, Standard 1380; Handy passt sich automatisch an |
| `wind_average_period_minutes` | Optional bestätigter Quellzeitraum für die Mittelrichtungs-Beschriftung, keine Berechnung |
| `subtitle` | Eigene Unterzeile |
| `site_image` | Optionale HA-relative Bildquelle, URL derselben Herkunft oder `media-source://`-ID; leer = generische Grafik |
| `background_image` | Alternativer Feldname für `site_image`; `site_image` hat Vorrang |
| `image_rotation` | Bildrotation im Uhrzeigersinn, −180 bis 180 Grad, Standard 0; Kompass bleibt nordorientiert |
| `image_target_x`, `image_target_y` | Pfeilziel in Prozent der sichtbaren quadratisch zugeschnittenen Bildfläche, 10 bis 90, Standard 50; außerhalb eines Radius von 40 % um die Mitte auf diesen Kreis begrenzt |
| `entities` | Zuordnung der Messgrößen aus der folgenden Tabelle |
| `extra_entities` | Kompatible bisherige Zusatzsensorliste; für neue Zuordnungen `device_status[].extra_entities` verwenden |
| `diagnostic_entities` | Kompatible bisherige Diagnoseliste; im Geräteeditor weiter lesbar und bewusst abwählbar |
| `device_status` | Dauerhafte Gerätebereiche mit Statusquellen und optionalen Zusatzmesswerten; siehe unten |
| `device_roles` | Gespeicherte Registry-Geräteauswahl für Vorschläge; leerer Rolleneintrag deaktiviert die automatische Auswahl |
| `theme_mode` | `auto` (HA-Theme), `light` oder `dark` |
| `weather_animation` | Standard `true`; `false` lässt statische Wettereffekte sichtbar |
| `weather_entity` | Optionale vorhandene `weather.*`-Quelle für aktuellen Himmelszustand, keine Vorhersageabfrage |
| `windrose.enabled` | Standard `true`: installierte Windrose per Bild-Tap einbetten; `false` deaktiviert die Einbettung |
| `windrose.card_type` | Geladener Custom-Card-Typ, Standard `custom:windrose-card`; Fork mit gleichem Typ über seine HA-Ressource laden |
| `windrose.variants` | Benannte Ansichten mit eigener `config` und optionalem `card_type` |
| `windrose.config` | Optionale native Windrosenkonfiguration; Standard nutzt ausgewählte Windquellen und letzte 24 h |
| `history_hours` | Angefragtes Recorder-Zeitfenster: 1 bis 168 Stunden, Standard 24 |
| `stale_after_minutes` | Aktualitätshinweis nach dieser Zeit seit letztem gültigen `last_reported`/`last_updated`; Standard 0 = aus, maximal 10080 Minuten. Diese Regel gilt auch für Wettereffekte. Ein alter Wert beweist keinen Offline-Status. |
| `grid_options` | Native Lovelace-Sections-Größe; in der Sections-Vorlage `columns: full` |

Eigene Bilder werden mit `object-fit: cover` quadratisch zugeschnitten und rund maskiert. Die Zielkoordinaten gelten für diese sichtbare Fläche nach der Bildrotation; sie drehen das Bild nicht mit. Ein Haus außerhalb der sichtbaren Fläche benötigt einen passenden privaten Bildzuschnitt.

Einheiten stammen aus den Sensorattributen. Die Karte gibt keinen °C-, km/h- oder mm-Wert vor, wenn der Sensor eine andere unterstützte Einheit liefert. Eine unpassende Einheit oder ein nicht numerischer Zustand wird erkennbar behandelt. Für den Piezo-Status sind bei einem passenden `binary_sensor` (`device_class: moisture`, oder ohne Klassenmetadaten) `on` = nass und `off` = trocken vorgesehen. Andere Domains/Klassen sowie unbekannte oder nicht verfügbare Zustände bleiben neutral. UV akzeptiert ausschließlich dimensionslose UV-Schreibweisen wie `UV Index`, `UV index`, `UVI`, `UV`, `index` oder eine leere Einheit; Groß-/Kleinschreibung und äußere Leerzeichen sind dabei ohne Bedeutung. Der angezeigte UV-Index wird auf eine ganze Zahl gerundet; der ursprüngliche Messwert bleibt intern unverändert. Einstrahlungs-, Lux- oder Prozenteinheiten sind keine UV-Index-Einheit.

## Messgrößen unter `entities`

| Schlüssel | Quelle und Bedeutung |
| --- | --- |
| `temperature`, `humidity` | Außenklima; WN32 bevorzugt, alternativ manuell WS90 |
| `feels_like`, `dew_point` | Gefühlt und Taupunkt, optional |
| `temperature_min`, `temperature_max` | Eigene Tagesminimum-/Maximumquellen haben Vorrang; ohne Zuordnung Recorder-Auswertung ab HA-Mitternacht |
| `wind_speed`, `wind_gust` | Aktuelle Windgeschwindigkeit und Böen, WS90 |
| `wind_direction` | Meteorologische Herkunft in Grad, WS90 |
| `wind_direction_avg` | Mittlere Herkunftsrichtung der ausgewählten Quelle; Zeitraum nicht pauschal angenommen |
| `wind_speed_avg` | Historischer optionaler Key für mittlere Geschwindigkeit; bleibt gespeichert, wird aber nicht mehr auf der Hauptkarte oder im Editor angeboten |
| `wind_gust_max` | Tagesmaximalböe |
| `rain_today`, `rain_rate` | WH40-Kalendertag und aktuelle WH40-Regenrate |
| `rain_rate_secondary` | Optionale echte WS90-Piezo-Regenrate als zweite Regenquelle, kein Feuchtigkeitsstatus |
| `rain_wet` | Passender WS90-Piezo-Binärsensor für Feuchtigkeit; kein Niederschlagszähler |
| `rain_24h` | Gleitende letzte 24 Stunden, wenn eine entsprechende Quelle existiert |
| `rain_week`, `rain_month`, `rain_year` | Zugeordnete Wochen-, Monats- und Jahressummen |
| `rain_event` | Regenereignis aus einer vorhandenen Quellentität |
| `pressure` | Relativer Luftdruck, GW3000, in den Druckdetails |
| `pressure_absolute` | Absoluter Druck aus eigener GW3000-Quelle auf der Hauptleiste und in den Druckdetails |
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

### Lokale Wetterdarstellung

Wettereffekte liegen direkt über dem unveränderten Bild und an der Regenkachel: Regen mit fallenden Tropfen und Bodenspritzern, Sonne, Wolken, Mond oder neutrales Tageslicht. Der kleine Wetterbanner oberhalb der Grafik entfällt. Der aufklappbare Hinweis unter der Grafik erklärt die tatsächlich verwendete Quelle und Grenzen.

Positive gültige **WH40-Regenrate**, andernfalls eine explizit zugeordnete echte **WS90-Regenrate** unter `entities.rain_rate_secondary`, löst lokalen Regen aus. Oberflächenstatus **NASS** ist davon unabhängig; eine Tagesmenge ist keine aktuelle Rate. Eine optionale vorhandene `weather_entity` liefert unterstützte aktuelle Himmelszustände, ohne Vorhersageabfrage. Ein Regenzustand dieser Quelle ohne positive lokale Rate wird als unbestätigt erklärt und erzeugt keine gemessene lokale Regenanimation.

Ohne zusätzliche Wetterquelle wird bei mindestens 12° Sonnenhöhe WS90-Globalstrahlung grob mit dem Haurwitz-Klarhimmelmodell verglichen: `1098 · sin(h) · exp(−0,059 / sin(h)) W/m²`. Verhältnis ab 0,78 = sonnig, ab 0,40 = teilweise bewölkt, darunter bewölkt; das bleibt eine **Schätzung**, keine gemessene Wolkenbedeckung. `kW/m²` wird mit 1000 multipliziert; Lux wird nicht umgerechnet. Bei tiefer Sonne erscheint neutrales Tageslicht statt einer unzuverlässigen Wolkeneinstufung. Astronomische Nacht sagt nichts über Bewölkung oder Niederschlag aus.

Die starre 30-Minuten-Grenze entfällt: `last_updated` misst Zustandsänderungen, keine gesicherte Telemetrie. `stale_after_minutes: 0` lässt unveränderte gültige Zustände verwendbar; eine explizite positive Altersgrenze sowie `unknown`/`unavailable` werden weiterhin beachtet. Ungültige und unplausible Zeitangaben werden abgewiesen. Verschattung, Dunst, Nebel und Sensorlage begrenzen die Schätzung; Temperatur, Feuchte und Druck können keinen eindeutigen Himmelszustand beweisen.

`weather_animation: false` und reduzierte Bewegung lassen statische Wettereffekte sichtbar. Die Windrose wird nur bei geöffneter Rückseite aktiv gehalten und benötigt ihre separat geladene HACS-Ressource. Ohne Ressource erscheint ein Setup-Hinweis, kein Nachbau.

Temperatur-Minimum und -Maximum ohne eigene Quellzuordnung werden beim Öffnen aus dem Recorder der ausgewählten Außentemperatur ab HA-Mitternacht ermittelt, einschließlich korrekter Sommer-/Winterzeittage. Explizite Min-/Max-Quellen haben Vorrang. Datenlücken und unvollständige Abdeckung werden benannt; ohne echte Daten werden keine Extremwerte erfunden.

Details, Quellenregeln, native Windrose-Konfiguration und Prüfgrenzen: [WEATHER_WINDROSE.md](WEATHER_WINDROSE.md).

### Gerätestatus pro Ecowitt-Gerät

Der obere Assistent **Geräte auswählen · Vorschläge prüfen** speichert die gewählten HA-Geräte dauerhaft unter `device_roles` und verwendet sie für passende Sensorvorschläge. Eine manuelle Auswahl – insbesondere des Gateways – löst eine speicherbare Konfigurationsänderung aus und wird nach dem Neuladen wiederhergestellt. Vorhandene Entitätszuordnungen werden dabei nicht überschrieben; zum Zuordnen einer neuen Messquelle weiterhin einen Vorschlag übernehmen oder die Entität auswählen. Ein leer gespeicherter Eintrag (`GW3000: ""`) bedeutet bewusst „kein Gerät“; nur fehlende Rollen verwenden die bisherige automatische Erkennung.

Im Bereich **Zusatzsensoren & Diagnosen nach Gerät** stehen dagegen die **dauerhaft gespeicherten** Einstellungen. WS90 (auch Registry-Modell `wh90`), WH40, optional WN32, mehrere WN31/WH31 sowie Gatewayvarianten wie GW3000A werden anhand tatsächlicher HA-Registry-Einträge angeboten. Modellangaben haben Vorrang vor frei gewählten Gerätenamen; mehrere gleichwertige Kandidaten werden nicht willkürlich ausgewählt. WN32 bleibt optional; ohne WN32 können passende WS90-Quellen manuell oder als Vorschlag zugeordnet werden. Jede Geräteauswahl bietet:

- **Batterie**: expliziter Batteriesensor. Die grafische Füllung gibt es nur bei einem echten Prozent-Sensor (`%`); Batteriespannung wird in V angezeigt, nicht in einen erfundenen Prozentwert umgerechnet.
- **Signal**: passende numerische RSSI-/Signal-/Qualitätsquelle. dB/dBm, bereits von der Quelle gelieferte Prozentwerte oder dimensionslose Qualitätswerte bleiben in ihrer ursprünglichen Einheit. Es werden keine RSSI-Prozentwerte oder Signalstufen errechnet; inkompatible Klassen/Einheiten sind als zu prüfende Quelle erkennbar.
- **Verbindung**: `binary_sensor` mit `device_class: connectivity` und `on/off` oder ein klassenloser/Enum-Statussensor mit `online/offline/connected/disconnected`. Andere Binärsensoren begründen keine Verbindung. Ohne geeigneten Zeitstempel bleibt die aktuelle Verbindung unbekannt; eine aktivierte Altersgrenze gilt auch hier. Fehlt die Quelle, steht „Nicht zugeordnet“ statt eines erfundenen Online-Häkchens.
- **Auf Hauptkarte anzeigen**: schaltet den Status dieses Geräts frei. Alle Geräte beginnen ohne automatisch aktivierte Hauptkartenanzeige; die Auswahl wird bewusst pro Gerät gespeichert. Mehrere WN31/WH31 können getrennt konfiguriert werden.
- **Zusätzliche Messwerte**: durchsuchbare Checkboxen pro Gerät, etwa WN31-Temperatur/Feuchte. Diese Auswahl wird unter `device_status[].extra_entities` gespeichert und erscheint in den passenden Geräte-/Sensordetails, nicht als weitere Hauptkartenkachel.

Es gibt keine zweite allgemeine Diagnose-Auswahlliste neben den Gerätestatusfeldern und keine Strg-/⌘-Mehrfachauswahl.

**Schmale Karten und iPhone:** Bis 900 CSS-Pixel Kartenbreite stehen die Statuskästen unter der Überschrift und untereinander. Dies gilt auch für iPhone-Querformat und eine schmale Karte auf einem großen Bildschirm. Auf breiteren Desktop-Karten stehen sie nebeneinander; lange Namen und Quellstatus können innerhalb des Kastens umbrechen.

**Kompatibilität:** Die bisherigen top-level-Felder `extra_entities` und `diagnostic_entities` werden beim Laden und Speichern weiterhin gelesen und erhalten; es gibt keine stille Migration, die IDs verwirft. Zugeordnete alte Quellen werden in den passenden Gerätebereich eingeordnet. Alte Quellen ohne verfügbare Gerätezuordnung bleiben in einer kompakten Kompatibilitätsansicht sichtbar, einschließlich momentan fehlender Entitäten. Erst bewusstes Abwählen entfernt eine Auswahl. Statusquellen, neue Gerätemesswerte, alte Listen und Wetterquellen werden in den Details je Entity-ID nur einmal als Sensorzeile dargestellt.

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
    extra_entities:
      - "sensor.<vorhandener_zusatzmesswert>"
```

### Privates Bild

Empfohlener Speicherort: `/media/ecowitt/Wohnhaus.png`. Kartenfeld:

```yaml
site_image: media-source://media_source/local/ecowitt/Wohnhaus.png
```

Der Editor kann das lokale HA-Medienverzeichnis über eine WebSocket-Abfrage durchsuchen, sofern der angemeldete Benutzer entsprechende Rechte besitzt. Er berücksichtigt native Ordner-/Bildangaben und bietet ausschließlich lokale HA-Media-IDs an. Überholte Antworten nach einer späteren Auswahl oder beim Entfernen des Editors werden verworfen. Dies ist kein Upload. Ohne Zugriffsberechtigung oder bei inkompatiblen Medienquellen bleibt das Textfeld verwendbar.

Ein gelöschtes Bildfeld zeigt wieder die generische Grafik; eine noch ausstehende Antwort der alten Bildauflösung darf die frühere Quelle nicht erneut einsetzen. Geänderte Sensorauswahl allein lädt das unveränderte Hintergrundbild nicht neu.

Den Zugriff auf das private Bild unbedingt ohne Anmeldung testen. HA-Media ist eine zu prüfende Möglichkeit, keine Sicherheitsgarantie. `/config/www` → `/local/` ist nicht automatisch zugriffsgeschützt und wird für sensible Bilder nicht empfohlen.

Karten-YAML für Forks und Varianten, Breitenregler und Leistungsgrenzen: [DASHBOARD_OPTIONS.md](DASHBOARD_OPTIONS.md).
