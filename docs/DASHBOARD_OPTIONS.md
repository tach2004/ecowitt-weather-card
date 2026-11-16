# Kartenbreite, Windrosenvarianten und Leistung

## Kartenbreite und Messwerte

Unter **Darstellung, Wetteranimation und Theme → Maximale Kartenbreite** lässt sich die Obergrenze zwischen 900 und 3200 CSS-Pixeln einstellen. Standard ist die bisherige Breite 1380. Dasselbe Feld heißt im Karten-YAML `max_width`. Die Grafik kann mit der größeren Desktop-Karte wachsen; es wird kein CSS-Zoom benutzt. Auf dem Handy begrenzt weiterhin der verfügbare Platz die Karte, die Inhalte ordnen sich nach ihrer tatsächlichen Breite um. In Sections muss auch das HA-Grid genügend Breite bereitstellen.

Über Wind stehen Temperatur, Luftfeuchte und gefühlte Temperatur in einem eigenen Außenklima-Kasten. Wind zeigt oben Aktuell, Böen und Tagesmaximalböe; darunter aktuelle und mittlere Herkunft einschließlich farbiger Himmelsrichtung. Die mobile Temperatur-/Nass-Zusammenfassung über der Windgrafik bleibt bestehen. Der absolute Druck ist separat unter **Druck & Sonne → Absoluter Luftdruck** auswählbar und erscheint als „Luftdruck absolut“ in der unteren Hauptleiste. Die Druckdetails zeigen zusätzlich den relativen Druck. Beide Werte bleiben getrennten Entitäten zugeordnet; es wird nichts ineinander umgerechnet.

## Wo gehört `windrose.config` hin?

Im **Karteneditor der Ecowitt-Karte → Code-Editor anzeigen**, innerhalb derselben Kartenkonfiguration. Es ist weder eine Datei namens `windrose.config` noch die YAML einer Dashboard-Ansicht. Bestehende Sensor- und Bildeinstellungen beibehalten und diesen Abschnitt ergänzen:

```yaml
max_width: 1800
windrose:
  enabled: true
  card_type: custom:windrose-card
  config:
    hide_windspeed_bar: false
  variants:
    - title: 24 Stunden
      config:
        data_period:
          period_back: -24h
    - title: 7 Tage
      config:
        data_period:
          period_back: -7d
    - title: 30 Tage
      config:
        data_period:
          period_back: -30d
```

Die bereits ausgewählten echten Windgeschwindigkeits- und Richtungsquellen werden verwendet. Die Rückseite erhält eine Variantenauswahl; nur die ausgewählte Variante wird geladen. Beim Wechsel wird die vorherige Instanz entfernt und ihr Polling beendet.

Unter `config` kann die **vollständige native Konfiguration** einer bereits funktionierenden Windrose stehen: beispielsweise Titel, Geschwindigkeitsklassen, Beaufort, Farben, Statistikquellen und `buttons_config` mit Today/7-/30-Tage-Schaltflächen. Vorhandene native Quellen lassen sich dort ebenfalls ausdrücklich festlegen; es werden keine neuen Sensor-IDs erzeugt. Globale `windrose.config`-Felder gelten für alle Varianten, die jeweilige `variants[].config` überschreibt diese **auf oberster Ebene**. Ein `buttons_config`- oder `data_period`-Objekt deshalb jeweils vollständig angeben. Varianten können unterschiedliche `card_type`-Werte besitzen, wenn die entsprechenden Custom Elements bereits geladen sind. Alternativ wird ein vorhandenes natives `config.type` berücksichtigt. Der Standard bleibt `custom:windrose-card`.

### Alternative Windrose-Forks

Ein separat installierter Windrose-Fork mit dem Elementnamen `custom:windrose-card` kann ebenfalls verwendet werden. In HA die gewünschte **HACS-Ressource des Forks** laden; die Ecowitt-Karte verwendet dann das registrierte Element. Die Konfiguration benötigt keinen GitHub-Link und keine Dashboard-URL. Original und Fork können nicht als zwei Implementierungen desselben Elementnamens gleichzeitig ausgewählt werden: Der Browser registriert einen Custom-Element-Namen nur einmal. Für parallele Implementierungen müssten sie unterschiedliche Elementnamen besitzen. Mehrere Ansichten desselben Forks sind dagegen über die Varianten problemlos möglich.

Die Ecowitt-Karte lädt keinen fremden JavaScript-Code nach. HACS-Ressource und Berechtigungen verwaltet Home Assistant. Nach Ressourcenwechsel Browsercache/Frontend erneuern. Eine nicht geladene Implementierung erhält einen verständlichen Hinweis. Die Ressource des Forks wurde nur als ignoriertes lokales Testmaterial mit synthetischen Daten geprüft und wird nicht mitgeliefert.

## Welche Wetterquelle hat Vorrang?

Unverändert: positive gültige **WH40-Rate**, danach eine explizit zugeordnete positive **WS90-Rate**, erst danach die optionale `weather.*`-Quelle und die lokale Himmelsabschätzung. Auch bei met.no als HA-Wetterquelle überstimmen die lokalen Raten den regionalen Zustand. NASS allein ist kein Nachweis für gerade fallenden Regen. Die Tropfen in der Regenkachel verwenden jetzt eine deutlichere cyanfarbene Kontur auch im hellen Theme; die Bewegung über dem Bild bleibt geometrisch gleich.

## Sind die Mittelwerte zehn Minuten?

Die Karte liest `entities.wind_direction_avg`; sie berechnet keinen eigenen Mittelwert. Ecowitt Local führt ausdrücklich `winddir_avg10m` ("Wind Direction 10min Avg") **und** das Protokollfeld `0x6D` ("Wind Direction Avg"). Allein aus einer Entity-ID oder dem Gerätemodell WS90 lässt sich deren tatsächlicher Mittelungszeitraum nicht sicher ableiten. Quelle: [Ecowitt Local `const.py`](https://github.com/alexlenk/ecowitt_local/blob/main/custom_components/ecowitt_local/const.py), geprüft am 15.11.2026.

Die feste Zehn-Minuten-Beschriftung entfällt deshalb standardmäßig. Wenn der Zeitraum deiner ausgewählten Quelle bestätigt ist, im Editor unter **Wind → Bestätigter Mittelungszeitraum** beispielsweise 10 eintragen (`wind_average_period_minutes: 10`). Das ändert nur die Beschriftung; keine Daten werden umgerechnet oder zeitlich neu gemittelt.

## Leistung und Prüfgrenzen

Die Animation läuft im **Browser** über CSS; die Karte hat keine JavaScript-Schleife pro Bild. Home Assistant liefert aktuelle Zustände. Ohne geöffnetes Detail oder Windrose ruft die Karte keine Recorder-Historie ab. Das Alter der Zustände wird einmal pro Minute neu bewertet. Details und Tagesextrema laden beim Öffnen; die Windrose fragt nur während ihrer aktiven Ansicht nach ihrem eigenen Intervall ab.

Der Editor erzeugt nun nur die geöffneten Sensorfelder, initial fünf statt zuvor 26 native Picker. Geschlossene Sensorgruppen werden aus dem DOM entfernt; unveränderte Konfigurationsübergaben lösen keinen vollständigen Neuaufbau der Vorschau aus. Außerdem erhalten native Picker stabile Domain-Filter statt bei jedem Rendern neu erzeugter Listen sämtlicher Sensoren. Fallende Tropfen bewegen nur noch schmale 3-Pixel-Spalten anstelle vollflächiger Animationsträger; die sichtbaren Positionen und Bewegungsbahnen bleiben gleich.

Der lokale Ecowitt-Entwicklungsbuild umfasst rund **157 KiB JavaScript**, gzip-komprimiert rund **44 KiB**. Die private HA-Bildquelle wird separat von der eigenen Instanz geladen und ist darin nicht enthalten; die geladene Windrosen-Ressource ist ebenfalls separat. Diese Übertragungsgröße ist keine Aussage über den RAM-Verbrauch.

Eine feste CPU-, RAM- oder Wattangabe wäre ohne Messung des Zielgeräts unzuverlässig. Bildauflösung, Pixeldichte, GPU, Browser, Anzahl der HA-Entitäten und zusätzliche Karten beeinflussen den Bedarf. Browser-CPU-Zeit erfasst zudem weder vollständige GPU-Arbeit noch den Verbrauch des Displays. `weather_animation: false` lässt die Wetterdarstellung statisch sichtbar und kann die laufende Last reduzieren.

Der lokale synthetische Chromium-Vergleich mit 1.000 zusätzlichen Entitäten benötigte für 15 aufeinanderfolgende Editor-Updates ungefähr **5,7 s vorher gegenüber 1,1 s danach**. Das Test-Picker-Harness baut HTML-Auswahllisten und bildet nicht die vollständige native HA-Komponente nach. Diese Zahlen zeigen die reduzierte Arbeit dieses Harness, keine zugesicherte Firefox-Beschleunigung oder typische CPU-Auslastung. Im selben Test lag die gemessene Browser-Task-Zeit der unveränderten Regenansicht im einstelligen Millisekundenbereich pro fünf Sekunden; GPU-Arbeit ist darin nicht vollständig enthalten. Ein direkter Firefox-Lauf war hier nicht möglich: Der benötigte Engine-Download wurde durch die Netzwerkumgebung mit HTTP 403 blockiert. Das Verhalten auf der echten HA-/Firefox-Installation bleibt zu bestätigen.

Alle öffentlichen Abbildungen zeigen ausschließlich synthetische Daten und eine unabhängige generische Illustration. Die privaten Bilder werden nicht verändert oder veröffentlicht.
