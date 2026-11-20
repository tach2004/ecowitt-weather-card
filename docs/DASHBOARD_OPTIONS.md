# Darstellung und Windrosenvarianten

## Kartenbreite und Theme

Im Karteneditor unter **Darstellung, Wetteranimation und Theme** die gewünschte maximale Kartenbreite und das Theme wählen. Die Standardbreite beträgt 1380 CSS-Pixel. Auf einem Handy ordnen sich die Inhalte nach der verfügbaren Kartenbreite an. Eine Sections-Ansicht kann die Breite zusätzlich durch ihr Raster begrenzen.

Die Hauptkarte zeigt Temperatur, Luftfeuchte, gefühlte Temperatur, Wind und Regen. Die untere Kennzahlenleiste zeigt den absoluten Luftdruck, die Druckdetails zusätzlich den relativen Luftdruck. Beide lassen sich unter **Druck & Sonne** getrennt zuordnen.

Die mittlere Windrichtung stammt aus der ausgewählten Entität. Wenn ihr Zeitraum bekannt ist, unter **Wind → Bestätigter Mittelungszeitraum** die Minuten eintragen. Die Karte verwendet den Zeitraum für die Beschriftung.

Bei Bedarf unter **Darstellung, Wetteranimation und Theme** die Wetteranimation deaktivieren. So bleiben Wettereffekte sichtbar und bewegen sich nicht.

## Windrose konfigurieren

Im **Karteneditor → Code-Editor anzeigen** den Abschnitt `windrose` in der YAML der Ecowitt-Karte ergänzen. Unter `config` stehen die nativen Optionen der installierten Windrose. Unter `variants` lassen sich Ansichten mit eigenen Optionen anlegen:

```yaml
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

Die Auswahl erscheint direkt an der eingebetteten Windrose. Die jeweilige Variante überschreibt die gemeinsamen Optionen auf oberster Ebene. Verschachtelte Optionen wie `data_period` deshalb je Variante vollständig angeben.

Ohne eigene Windquellen verwendet die Windrose die zugeordneten Richtungs- und Geschwindigkeitsentitäten der Ecowitt-Karte. Mit einer geeigneten Böenquelle stehen **Windgeschwindigkeit** und **Böen** als Schaltflächen zur Verfügung. Die Böenverteilung verwendet aufgezeichnete Böen. Der Live-Bereich zeigt dabei die Tagesmaximalböe, wenn sie zugeordnet und verfügbar ist, sonst die aktuelle Böe. Eine native Quellen- oder Schaltflächenkonfiguration bleibt erhalten.

## Andere Windrosen verwenden

Die gewünschte Windrosenkarte in Home Assistant als Ressource laden und ihren Typ in `windrose.card_type` oder je Variante in `card_type` eintragen. Eine alternative Version mit demselben Typ `custom:windrose-card` wird über ihre Home-Assistant-Ressource geladen. Für parallele Versionen mit eigener Auswahl sind unterschiedliche Kartentypen erforderlich.

Hinweise zur Installation und benötigten Historie stehen in [Wettereffekte, Windrose und Verläufe](WEATHER_WINDROSE.md).
