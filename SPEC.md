# Ecowitt Weather Card

Eine eigenständige Lovelace-Karte für lokale Wetterdaten aus Home Assistant. `custom:ecowitt-weather-card` unterstützt den visuellen Editor, YAML sowie Panel- und Sections-Ansichten. Das Layout richtet sich nach der verfügbaren Kartenbreite.

- Die Karte verwendet zugeordnete Home-Assistant-Entitäten. Gerätevorschläge stammen aus der Registry. Fehlende, ungültige und nicht verfügbare Werte bleiben erkennbar.
- Windrichtung bezeichnet die meteorologische Herkunft. Der Strömungspfeil zeigt von dort zum Ziel. Windrichtung und Norden bleiben auch bei einem gedrehten Bild eindeutig.
- Regenrate, Regenmenge und Oberflächenfeuchtigkeit sind getrennte Messgrößen. Wettereffekte folgen lokalen Quellen und kennzeichnen Schätzungen. Die Bewegungseinstellung des Systems wird berücksichtigt.
- Details und Wetterrekorde verwenden vorhandene Recorder-Daten. Tagesextrema der Außentemperatur können auch auf der Hauptkarte aus dem Recorder ergänzt werden, wenn eigene Extremwertsensoren fehlen.
- Die neutrale Windgrafik ist Bestandteil der Karte. Eigene Bilder werden über die Home-Assistant-Instanz bereitgestellt. Eine separat installierte Windrose lässt sich optional in die Karte einbetten.
- HACS bezieht das Kartenmodul aus dem GitHub-Release. Die Wetterkarte benötigt keine weiteren Frontend-Karten.

Die [Konfigurationsübersicht](docs/CONFIGURATION.md) beschreibt die verfügbaren Felder. Für die Pflege gelten die [Repository-Regeln](AGENTS.md).
