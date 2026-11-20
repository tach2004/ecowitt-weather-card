# Installation und Einbindung

Voraussetzung ist Home Assistant mit eingerichteten Ecowitt-Sensoren. Die Karte verwendet die vorhandenen Entitäten und deren Werte.

## Installation über HACS

1. In HACS unter **Benutzerdefinierte Repositories** die URL `https://github.com/tach2004/ecowitt-weather-card` als **Dashboard** hinzufügen. In älteren HACS-Versionen heißt die Kategorie **Lovelace** oder **Plugin**.
2. **Ecowitt Weather Card** installieren und das Dashboard neu laden.
3. Falls die Karte im Kartenkatalog fehlt, unter **Einstellungen → Dashboards → Ressourcen** prüfen, ob `/hacsfiles/ecowitt-weather-card/ecowitt-weather-card.js` als **JavaScript-Modul** eingetragen ist. Falls die Ressource fehlt, diese ergänzen.

## Manuelle Installation

1. Die fertige Datei `ecowitt-weather-card.js` aus dem aktuellen GitHub-Release herunterladen. [Aktuelles Release](https://github.com/tach2004/ecowitt-weather-card/releases/latest)
2. Die Datei auf der Home-Assistant-Instanz unter `/config/www/ecowitt-weather-card/ecowitt-weather-card.js` ablegen.
3. Unter **Einstellungen → Dashboards → Ressourcen** einen Eintrag mit `/local/ecowitt-weather-card/ecowitt-weather-card.js` als **JavaScript-Modul** hinzufügen. Falls das Ressourcenmenü fehlt, im Benutzerprofil den erweiterten Modus aktivieren.
4. Das Dashboard neu laden. Falls nach einem manuellen Update weiter die alte Version erscheint, den Browsercache leeren oder den Versionsparameter der Ressourcen-URL ändern.

Für jede Installation genügt eine Kartenressource. Beim Wechsel zu HACS den manuellen Ressourceneintrag entfernen.

## Karte und Sensoren einrichten

Im Dashboard **Karte hinzufügen → Ecowitt Weather Card** wählen und die bestehenden Entitäten im visuellen Editor auswählen. Der Geräteassistent verwendet zugeordnete Geräte für Vorschläge. Die Messquellen selbst werden in den jeweiligen Feldern ausgewählt.

- **Wind und Wetter:** Windgeschwindigkeit, Böen, Windrichtung, UV und Solarstrahlung.
- **Regen:** eine Tagesmenge für den Kalendertag, eine aktuelle Regenrate und gegebenenfalls getrennte Quellen für die letzten 24 Stunden, Woche, Monat und Jahr. Den Feuchtigkeitsstatus separat auswählen.
- **Außenklima:** Außentemperatur und Luftfeuchte. Eine passende WN32-Quelle kann bevorzugt werden. Gefühlte Temperatur und Tagesextrema sind optional.
- **Druck:** Absoluten Luftdruck für die Hauptleiste und optional relativen Luftdruck für die Druckdetails.
- **Geräte:** Batterie, Signal, Verbindungsstatus und Zusatzmesswerte nach Bedarf zuordnen.

Bei fehlender Zuordnung zeigt die Karte einen Einrichtungshinweis. Die Übersicht erklärt alle Felder und Voraussetzungen für Verläufe. [Kartenkonfiguration](CONFIGURATION.md)

## Ansichten

Für einen eigenen Wetterreiter eine **Panel-Ansicht** erstellen und die Wetterkarte als einzige Karte hinzufügen. In einer **Sections-Ansicht** lässt sich die Wetterkarte neben anderen Karten platzieren und bei Bedarf auf volle Breite setzen.

Die YAML-Vorlagen sind vollständige Konfigurationen für jeweils eine Ansicht. Zum Verwenden eine neue Ansicht öffnen und den passenden Inhalt unter **Ansicht bearbeiten → ⋮ → In YAML bearbeiten** einfügen. Anschließend die Sensoren im Karteneditor zuordnen. [Panel-Vorlage](../examples/view-panel.yaml) · [Sections-Vorlage](../examples/view-sections.yaml)

## Eigenes Hintergrundbild

Unter **Darstellung, Wetteranimation und Theme** eine Bildquelle aus der eigenen Home-Assistant-Instanz wählen. Bildrotation und Pfeilziel lassen sich im Editor anpassen. Ohne eigene Quelle erscheint die neutrale Beispielgrafik.

Bilder unter `/config/www` sind über `/local/` erreichbar und **nicht automatisch zugriffsgeschützt**. Für ein sensibles Bild die Zugriffsrechte der eigenen Home-Assistant-Medienquelle prüfen. [Private Bildquellen](PRIVATE_IMAGES.md)
