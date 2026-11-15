# Wettereffekte, eingebettete Windrose und Temperatur-Tageswerte

Diese Erweiterung verwendet die bestehende Ecowitt-Karte weiter. Wettereffekte liegen als dekorative Ebene über dem konfigurierten Bild und an der Regenkachel. Die Windrose wird bei Bedarf innerhalb derselben Karte eingeblendet. Hintergrundbild, Nordausrichtung und die vorhandene Strömungspfeil-Geometrie werden dafür nicht neu gezeichnet oder in eine Bilddatei eingebrannt.

## Aufteilung des Auftrags

Der Korrekturbranch `codex/ha-layout-corrections` und der Erweiterungsbranch `codex/immersive-weather-windrose` behandeln zusammen die elf Punkte des Auftrags. Der zweite Branch ergänzt die Darstellung und Datenfunktionen; er ersetzt die kleinen Korrekturen des ersten Branches nicht.

| Punkt | Umsetzung | Bereich |
| --- | --- | --- |
| 1 | Geräteauswahl dauerhaft als `device_roles` speichern und beim erneuten Öffnen des Editors wiederherstellen, einschließlich Gatewayauswahl. Vorhandene Sensoren werden dadurch nicht überschrieben. | Korrekturen |
| 2 | Wettereffekte direkt im vorhandenen Bild und an Kacheln; nachvollziehbare Quellenpriorität und erklärende Hinweise bei unzureichenden Daten. | Erweiterung |
| 3 | Überschrift mit gesicherter Breite, Status unter dem Titel auf schmalen Karten; Detailfenster mit begrenztem Inhalts-Scrollbereich. | Korrekturen |
| 4 | Ursprüngliche Bildkreisgröße, kleine Gradangaben außerhalb und exakt auf ihren Winkelachsen; keine tangentiale Verschiebung. | Korrekturen |
| 5 | Kurze Rollenlabels wie WS90/WH40/WN31; pro Statuskasten eine Zeile, auf breiten Karten nebeneinander und auf schmalen untereinander. | Korrekturen |
| 6 | UV-Index auf der Hauptkarte ohne Nachkommastelle anzeigen. | Korrekturen |
| 7 | SVG-Rand des Feuchtigkeitstropfens vollständig anzeigen. | Korrekturen |
| 8 | Überholten Hinweis auf eine nicht enthaltene Windrose aus dem Winddetail entfernen. | Korrekturen |
| 9 | Tatsächlich installierte `custom:windrose-card` optional einbetten und innerhalb der bestehenden Windgrafik umschalten. | Erweiterung |
| 10 | Menschliche Quellnamen mit belegter Geräteherkunft; Verlauf mit Wert-/Einheiten- und Zeitachsen, native More-Info bleibt erhalten. | Erweiterung |
| 11 | Fehlende Temperatur-Min-/Max-Sensoren durch echte Recorder-Auswertung des bisherigen HA-Kalendertags ergänzen, mit sichtbaren Abdeckungsgrenzen. | Erweiterung |

## Lokale Wettereffekte und erforderliche Quellen

Die Karte ruft keine externe Wetter- oder Karten-API auf. Vorhandene Home-Assistant-Zustände und Recorder-Daten genügen. Für die lokale Auswertung sind die folgenden Zuordnungen relevant:

| Quelle | Verwendung | Grenze |
| --- | --- | --- |
| `entities.rain_rate` | Numerische WH40-Regenrate; positive gültige Rate hat Vorrang. | Eine Kalendertagssumme ist keine aktuelle Regenrate. |
| `entities.rain_rate_secondary` | Optional eine tatsächlich vorhandene WS90-Regenratenquelle. | Keine Piezo-Feuchtigkeitsquelle auswählen; es wird kein Sensorname erfunden oder automatisch angelegt. |
| `entities.rain_wet` | Separater WS90-Oberflächenstatus NASS/TROCKEN/UNAVAILABLE. | NASS allein begründet keine Regenanimation und unterdrückt weder Sonne noch Nacht. |
| `entities.solar` | WS90-Globalstrahlung in W/m² oder kW/m² für eine grobe Himmelsabschätzung. | Lux wird nicht in Globalstrahlung umgerechnet. |
| `sun.sun` | Astronomischer Tag-/Nachtstatus und Sonnenhöhe. | Sonnenhöhe allein misst keine Bewölkung. |
| `weather_entity` | Optional der aktuelle Zustand einer ausdrücklich ausgewählten vorhandenen `weather.*`-Entität. | Es wird keine Vorhersage abgerufen; die bestehende HA-Integration dieser Entität kann eigene, auch externe Datenquellen haben. |

Die Reihenfolge ist bewusst begrenzt: Eine positive verwendbare WH40-Rate, andernfalls eine positive explizit zugeordnete WS90-Rate, begründet lokalen Regen. Ohne solchen Messnachweis kann eine ausgewählte HA-Wetterentität ihren unterstützten aktuellen Himmelszustand liefern. Danach werden astronomische Nacht beziehungsweise die lokale Strahlungsschätzung verwendet. Oberflächenfeuchtigkeit bleibt davon unabhängig.

Eine HA-Wetterentität mit Regenzustand, aber ohne bestätigte lokale Rate, erhält den Hinweis „Regen laut Wetterquelle“. Daraus wird keine gemessene lokale Regenrate und keine lokale Regenanimation erzeugt. Nicht unterstützte Wetterzustände werden nicht frei in Schnee, Gewitter oder andere Sensorbeobachtungen umgedeutet.

Die lokale Schätzung vergleicht Globalstrahlung mit dem Haurwitz-Klarhimmelmodell. `kW/m²` wird dazu mit 1000 multipliziert. Die bisherigen Verhältnisgrenzen von 0,78 für sonnig und 0,40 für teilweise bewölkt bleiben Heuristiken. Verschattung, Dunst, Nebel, Sensorlage und Modellabweichungen können wie Bewölkung wirken. Temperatur, Luftfeuchte und Luftdruck liefern daraus keine eindeutige Wolken- oder Regenbestimmung.

Bei bestätigtem Tageslicht und einer Sonnenhöhe unter 12° erscheint eine neutrale Tageslichtszene. Sie behauptet weder direkte Sonne noch Bewölkung. Das ersetzt eine pauschale Fehlermeldung bei tiefem Sonnenstand, ohne den physikalisch unsicheren Klarhimmelvergleich dort zu erzwingen. Astronomische Nacht bedeutet ebenfalls weder einen wolkenfreien Himmel noch Niederschlagsfreiheit.

### Aktualität und Animation

Die zuvor eingeführte starre 30-Minuten-Verfallsgrenze für Wetterzustände entfällt. `last_updated` ist ein Änderungszeitpunkt und kein sicherer Telemetrie-Heartbeat: Eine unveränderte Regenrate darf nicht allein deshalb verschwinden. Die explizite Einstellung `stale_after_minutes` und die tatsächlichen HA-Zustände `unknown`/`unavailable` bleiben maßgeblich. Bei `stale_after_minutes: 0` gilt keine zusätzliche Altersgrenze. Das ist keine Zusicherung, dass ein unveränderter Wert weiterhin gemessen wird; bei Bedarf eine zur eigenen Integration passende Altersregel wählen. Ungültige Werte, falsche Einheiten und unplausible Zeitangaben werden weiterhin abgewiesen.

Sonne, Wolken, Mond beziehungsweise Regen mit Tropfen und Spritzern werden als CSS-Ebenen dargestellt. Die Regendichte folgt ausschließlich einer gültigen numerischen lokalen Rate; sie ist eine Illustration und keine Messung von Tropfengröße oder räumlicher Niederschlagsverteilung. Unzureichende Quellen erhalten einen lesbaren Hinweis.

`weather_animation: false` schaltet die Wetterbewegung ab; `prefers-reduced-motion` wird ebenfalls berücksichtigt. Die vorhandene Windrichtungslogik und ihre kurze Animation über Nord bleiben erhalten; die Systemeinstellung für reduzierte Bewegung gilt weiterhin auch für deren Übergänge.

## Installierte Windrose innerhalb derselben Karte

Verwendet wird die separate [Lovelace Windrose Card von aukedejong](https://github.com/aukedejong/lovelace-windrose-card). Die Ecowitt-Karte enthält keinen Ersatz und lädt dieses Plugin nicht selbst aus dem Internet nach. Nutzer ohne Windrose benötigen es nicht.

1. Die Windrose Card separat in HACS installieren und deren JavaScript-Ressource als Modul in Home Assistant laden. Der Upstream dokumentiert beispielsweise `/hacsfiles/lovelace-windrose-card/windrose-card.js`; der tatsächlich von der eigenen HACS-Installation angelegte Ressourcenpfad ist maßgeblich.
2. In Ecowitt vorhandene Windgeschwindigkeits- und aktuelle Windrichtungsquellen zuordnen.
3. Die Einbettung ist standardmäßig aktiv. Im visuellen Editor lässt sie sich deaktivieren; ausdrücklich aktiviert wird sie so:

   ```yaml
   windrose:
     enabled: true
   ```

4. Die bestehende Windgrafik antippen, um innerhalb derselben Dashboardkarte zur Windrose zu wechseln. Die Drehung blendet die bisherige Ansicht aus und die echte Windrose ein; die Rückkehr bleibt an derselben Stelle möglich. Es erfolgt kein Seitenwechsel. Die Rückseite wächst bei Bedarf auf die tatsächliche Höhe der installierten Karte, damit ihre Windrose auf dem Handy vollständig sichtbar bleibt.

Die Hauptkarte erzeugt dafür ein echtes `<windrose-card>`-Element, übergibt dessen `setConfig()`-Konfiguration und das vorhandene `hass`-Objekt. Fehlt die Ressource, erscheint ein Einrichtungshinweis mit „Erneut prüfen“. Falsche oder nicht vorhandene Quellen führen ebenfalls zu einem Hinweis, nicht zu einer nachgebildeten Windrose.

### Standard und freie Upstream-Konfiguration

Ohne eigene Windrosenkonfiguration werden die bereits ausgewählten `entities.wind_direction` und `entities.wind_speed` verwendet. Der Standardzeitraum ist der zurückliegende 24-Stunden-Zeitraum (`data_period.period_back: -24h`). Die Windrose benötigt tatsächliche Richtungs- und Geschwindigkeitsverläufe; die mittlere Richtung der letzten zehn Minuten ist keine Verteilung.

Unter `windrose.config` kann eine native Windrose-Konfiguration ergänzt werden, etwa:

```yaml
windrose:
  enabled: true
  config:
    data_period:
      period_back: -24h
    rose_config:
      wind_direction_count: 16
```

Die Upstream-Felder `wind_direction_entity` und `windspeed_entities` erlauben bei Bedarf andere tatsächlich vorhandene Quellen. Es werden keine festen Entity-IDs vorgeschrieben. `type` bleibt für die Einbettung `custom:windrose-card`. Für zusätzliche Upstream-Optionen wie Zeitwahl, Geschwindigkeitsklassen, Aktionen und Statistikdaten gilt die Dokumentation der installierten Windrose-Version.

Der Adapter bildet unterstützte Quellgeschwindigkeiten auf die nativen Einheiten der Windrose ab und verwendet standardmäßig dieselbe Ausgabeeinheit. Er erfindet keine Messpunkte, Recorder-Historie oder Statistik. Aufbewahrung, ausgeschlossene Entitäten, Statistikverfügbarkeit und die gewählte Messwert-Zuordnung begrenzen die Aussage der Windrose. Ein leerer oder kurzer Recorder-Zeitraum wird durch das Einbetten nicht vollständiger.

Bei reduzierter Bewegung beziehungsweise deaktivierter Wetteranimation werden außerdem die bewegten Live-Pfeile der eingebetteten Windrose ausgeblendet und eine konfigurierte automatische Kompassrotation abgeschaltet. Allein die Upstream-Option `disable_animations` würde deren Live-Pfeile nicht stilllegen; der Adapter berücksichtigt das ausdrücklich.

Beim Rückwechseln wird das fremde Kartenelement entfernt; dessen eigene Abfragen werden damit beendet. Normale HA-Zustandsupdates aktualisieren dieselbe Instanz. Eine tatsächlich geänderte Windrosenkonfiguration erzeugt eine neue Instanz, damit auch deren Abfrageintervall konsistent neu eingerichtet wird.

## Tages-Minimum und -Maximum aus Recorder

Explizit konfigurierte `entities.temperature_min` und `entities.temperature_max` haben weiterhin Vorrang. Fehlt eine dieser Zuordnungen, kann der entsprechende Wert aus der tatsächlich konfigurierten Außentemperaturquelle `entities.temperature` und ihrer lokalen HA-Recorder-Historie ergänzt werden. Ein explizit zugeordneter, aber momentan nicht verfügbarer Min-/Max-Sensor wird nicht still durch einen anderen Wert ersetzt.

Der Zeitraum beginnt um Mitternacht in **Home Assistants konfigurierter Zeitzone** (`hass.config.time_zone`) und endet beim tatsächlichen Anfragezeitpunkt. Er ist kein rollierendes 24h-Fenster. Sommer-/Winterzeitwechsel mit 23 beziehungsweise 25 Stunden werden berücksichtigt; ohne verlässliche HA-Zeitzone wird kein Kalendertag geraten.

Berechnet werden die kleinsten und größten **aufgezeichneten gültigen Temperaturwerte bisher**. Mindestens ein echter gültiger Eintrag des aktuellen Tages ist erforderlich. Ein früherer Recorder-Ausgangszustand kann als gehaltener HA-Zustand ab Mitternacht berücksichtigt werden, wird aber ausdrücklich gekennzeichnet und nicht als neue Messung gezählt. Nur ein alter Zustand ohne heutigen Eintrag erzeugt keine heutigen Extremwerte.

Unbekannte/ungültige Abschnitte, fehlender Tagesanfang, erst ein heutiger Eintrag oder nicht bestätigte aktuelle Sensorabdeckung werden als unvollständiger Zeitraum erklärt. Aufgezeichnete gültige Werte gehen dadurch nicht verloren, sind aber keine Garantie für die tatsächlichen Tagesextrema. Bei unterschiedlichen Temperatureinheiten im Zeitraum werden keine gemeinsamen Extremwerte erfunden. Fehler, fehlende Recorder-API oder leere Historie erhalten einen Hinweis. Der aktuelle Live-Wert wird nicht als Ersatzhistorie eingesetzt.

## Details mit Quellnamen und Achsen

Details verwenden den menschlichen `friendly_name` eines Sensors und eine belegte Herkunftsrolle, etwa „Außentemperatur · WS90“. Ein bevorzugtes Gerät im allgemeinen Feldtitel ist kein Herkunftsnachweis. Rollen werden aus tatsächlichen Registry-Verknüpfungen oder expliziter Quellzuordnung zu einer Gerätekonfiguration abgeleitet; ohne solche Metadaten bleibt die Herkunft neutral. Die Geräteauswahl allein beweist nicht, dass ein Sensor zu diesem Gerät gehört.

Technische Entity-IDs bleiben intern für Abfragen und native HA-More-Info erhalten; sie werden nicht überall als sichtbare Überschrift ausgeschrieben. Die Möglichkeit „In Home Assistant öffnen“ bleibt verfügbar.

Die Recorder-Diagramme zeigen Wertbeschriftungen einschließlich Einheit und eine Zeitachse mit Beginn, Mitte und Ende des angefragten Zeitraums. Bei gültiger HA-Zeitzone wird diese verwendet und benannt; andernfalls ist die Browserzeit ausdrücklich gekennzeichnet. Konstante Werte erhalten eine einzige sinnvolle Wertmarke. Nicht verfügbare Abschnitte und Einheitenwechsel bleiben getrennt; es werden keine Messungen zwischen den empfangenen Zuständen erfunden.

## Prüfung und verbleibende Grenzen

Alle öffentlichen Tests verwenden generische Illustrationen, synthetische HA-Zustände und synthetische Registry-Einträge. Das native HA-Kartenharness bildet relevantes Host-/Slot-/Größenverhalten nach; es ist keine vollständige Home-Assistant-Installation. Tatsächliches Lovelace-Mounting, native Picker, HA-Berechtigungen und Companion-WebView-/Safari-Verhalten müssen weiterhin auf der Zielinstanz geprüft werden.

Der Windrosenadapter wird zusätzlich mit der unmodifizierten echten Upstream-Ausgabe **v2.8.0** unter Chromium geprüft. Diese Distribution bleibt ein ignoriertes Entwicklungsartefakt und wird nicht in das Ecowitt-Bundle oder Repository übernommen. Die optionale Integrationsprüfung lässt sich mit einer lokal vorhandenen Distribution ausführen:

```sh
WINDROSE_UPSTREAM_JS=/absoluter/pfad/windrose-card.js \
  npx tsx --test tests/windrose.integration.test.ts
```

Ohne diese Umgebungsvariable wird nur diese gesonderte Upstream-Integrationsprüfung übersprungen; die regulären Adaptertests bleiben aktiv. Die Ergebnisse des abschließenden gemeinsamen Builds und der Browserprüfungen werden im zugehörigen PR dokumentiert.

Private Grundstücksfotos und private HA-Screenshots werden nicht verändert, in Testansichten eingebaut, kopiert oder veröffentlicht. Für sensible Bilder gilt weiterhin: `/config/www` → `/local/` ist nicht automatisch zugriffsgeschützt; eine HA-Media-Quelle und deren Zugriff ohne Anmeldung müssen auf der tatsächlichen Instanz geprüft werden. Es gibt keine Sicherheitsgarantie. Dieser Auftrag erzeugt keine Tags oder Releases und mergt keinen PR.
