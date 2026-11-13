# Installation und Einbindung

**Stand:** Version 0.1.0 ist der erste Entwicklungsmeilenstein. Es gibt noch keine veröffentlichte Release. Der lokale Build ist installierbar; die Abnahme in echtem Home Assistant, in der Companion App und in iOS Safari steht aus. Es werden keine bestehenden Dashboards automatisch verändert.

## Entwicklungsstand manuell installieren

1. Diesen Entwicklungsbranch auschecken. Node.js 22 oder neuer verwenden und im Repository `npm ci` sowie `npm run build` ausführen.
2. Ausschließlich `dist/ecowitt-weather-card.js` nach `/config/www/ecowitt-weather-card/ecowitt-weather-card.js` auf der eigenen HA-Instanz kopieren. Keine privaten Referenzbilder ins Repository oder Build-Verzeichnis kopieren.
3. In Home Assistant unter **Einstellungen → Dashboards → Ressourcen** eine Ressource hinzufügen. Gegebenenfalls zuerst den erweiterten Benutzermodus aktivieren:

   ```yaml
   url: /local/ecowitt-weather-card/ecowitt-weather-card.js?v=0.1.0
   type: module
   ```

4. Das Frontend neu laden. Im Dashboard **Karte hinzufügen → Ecowitt Weather Card** wählen. Falls die Karte fehlt, Ressource, Browserkonsole und Cache prüfen.
5. Die vorhandenen HA-Entitäten im grafischen Karteneditor auswählen. Ohne Zuordnung zeigt die Karte einen Einrichtungshinweis. Die Zuordnung wird mit der Kartenkonfiguration gespeichert.

Nach Updates den Browsercache erneuern oder den Versionsparameter der Ressource ändern. HACS und manuelle Installation nicht gleichzeitig mit zwei Ressourcen laden.

## Später über HACS

Die Projektstruktur und der Release-Workflow sind für HACS vorbereitet. Erst nach einer veröffentlichten Release mit dem Asset `ecowitt-weather-card.js` ist dieser Weg nutzbar; eine Aufnahme in den HACS-Standardkatalog wird nicht behauptet.

1. In HACS unter **Benutzerdefinierte Repositories** `https://github.com/tach2004/ecowitt-weather-card` als Kategorie **Dashboard** hinzufügen (in älteren HACS-Versionen **Lovelace/Plugin**).
2. **Ecowitt Weather Card** installieren und das Frontend neu laden.
3. Falls HACS die Ressource nicht angelegt hat, `/hacsfiles/ecowitt-weather-card/ecowitt-weather-card.js` als **JavaScript-Modul** ergänzen.
4. Karte hinzufügen und Sensorzuordnung im visuellen Editor vornehmen.

Das Repository enthält absichtlich kein versioniertes `dist`-Bundle. HACS lädt das einzelne JavaScript-Asset einer veröffentlichten Release; der unkompilierte Standardbranch ist deshalb in HACS ausgeblendet. Der Release-Workflow wird erst durch ein bewusst gepushtes Versions-Tag ausgelöst. Er veröffentlicht ausschließlich das geprüfte JavaScript-Bundle, keine Testbilder, Berichte oder Referenzdateien.

## Empfohlen: eigener Wetter-Reiter als Panel View

1. Gewünschtes Dashboard öffnen und einen **neuen** Reiter mit Titel **Wetter** anlegen.
2. Als Ansicht **Panel / Vollbildkarte** wählen.
3. Genau eine **Ecowitt Weather Card** hinzufügen und ihre Sensoren im grafischen Editor zuordnen.

Die Karte begrenzt und zentriert sich selbst auf großen Displays. Auf schmalen Containern ordnet sie Zusammenfassung, Windgrafik und Kennzahlen neu an. Es müssen keine Sections oder zusätzlichen Überschriften erstellt werden.

Alternativ den Inhalt von [view-panel.yaml](../examples/view-panel.yaml) über **Ansicht bearbeiten → ⋮ → In YAML bearbeiten** als vollständige **Ansichts-YAML** einfügen. Die Vorlage enthält absichtlich keine erfundenen Sensor-IDs. Sie benötigt das installierte Kartenmodul. Vorhandene Ansicht zuerst sichern; die Vorlage ersetzt deren Inhalt. Nicht die gesamte Dashboard-Rohkonfiguration durch ein View-Snippet ersetzen.

## Alternative: Sections View

[view-sections.yaml](../examples/view-sections.yaml) enthält eine vollständige Sections-Ansicht mit einer Grid-Section, die drei Ansichtsspalten überspannt, und genau einer Wetterkarte in voller Breite. Sie verwendet dieselbe Custom Card.

Wie beim Panel über die YAML-Bearbeitung einer neuen Ansicht einfügen. In einer bereits befüllten Sections-Ansicht die Karte besser einzeln hinzufügen und auf volle Breite setzen; deren gesamte Ansichts-YAML muss dafür nicht ersetzt werden.

## Sensoren und Recorder

- **WS90:** Wind, Böen, Richtung, UV, Solarstrahlung und Piezo-Feuchtigkeitsstatus.
- **WH40:** Regenrate und Regenmengen. Tagesmenge, Kalenderwoche und gleitende letzte 24 Stunden bewusst getrennt zuordnen.
- **WN32:** Außentemperatur und Feuchte bevorzugt, sofern vorhanden; alternativ passende WS90-Sensoren manuell auswählen.
- **GW3000:** relativer Luftdruck. Zusätzliche WN31/WH31-Kanäle und vorhandene Batterie-/Signalquellen in den Details zuordnen.

Es werden keine neuen HA-Entitäten angelegt. Der bekannte Mittelrichtungs-Sensor `sensor.ecowitt_wind_direction_avg_175da` ist lediglich ein auswählbarer Vorschlag, sofern tatsächlich vorhanden. Geräte- und Namenserkennung müssen im Editor überprüft werden.

Verläufe benötigen aufgezeichnete und für den angemeldeten Nutzer zugängliche HA-Recorder-Daten der ausgewählten Entitäten. Aufbewahrung und Recorder-Ausschlüsse bleiben HA-Konfiguration. Die Karte erfindet keine Historie und setzt Tagesregen nicht mit einer 24-Stunden-Summe gleich.

## Private Bildquelle

Im Editor einen HA-relativen Bildpfad, eine URL derselben HA-Herkunft oder eine `media-source://`-ID aus der eigenen Home-Assistant-Instanz eintragen. Media-IDs werden über die native HA-Media-API aufgelöst; nur URLs derselben Herkunft werden als Bild geladen. Die Karte bietet keinen Datei-Upload und überträgt kein Bild an einen Kartendienst. Ausrichtung und Pfeilziel an das eigene nordorientierte Bild anpassen. Das Bild wird quadratisch auf die runde Ansicht zugeschnitten; die Zielkoordinaten beziehen sich auf diese sichtbare Bildfläche. Das Pfeilziel wird bei Bedarf auf einen Kreisradius von 40 % um die Bildmitte begrenzt, damit es innerhalb der runden Ansicht bleibt. Ohne Bild wird die generische Beispielgrafik verwendet.

**`/config/www` → `/local/` ist nicht automatisch zugriffsgeschützt.** Bei extern erreichbarem HA kann eine Bild-URL ohne Anmeldung abrufbar sein. Für sensible Immobilienbilder eine authentisierte HA-Media-Lösung prüfen und den Zugriff auch ohne Anmeldung testen. Nicht jede Media-Source-ID ist direkt als Browserbild verwendbar; Unterstützung und Berechtigungen müssen an der tatsächlichen Instanz geprüft werden. Keine Sicherheitsgarantie. Details: [PRIVATE_IMAGES.md](PRIVATE_IMAGES.md).

Alle Konfigurationsfelder stehen in [CONFIGURATION.md](CONFIGURATION.md).
