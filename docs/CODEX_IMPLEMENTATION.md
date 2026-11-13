# Umsetzungsauftrag für Codex

**Projekt:** tach2004/ecowitt-weather-card

## Verbindliche Grundlagen
- Lies vor Code-Änderungen **SPEC.md** und **AGENTS.md**, einschließlich des Nachtrags vom 13.11.2026.
- Das Design orientiert sich an der vom Nutzer bestätigten dunklen, hochwertigen Wetterkarte mit nordorientierter stilisierter 2D-Haus-/Grundstücksansicht. Dieses Ziel ist **eine einzige responsive Lovelace Card**, kein mehrteiliges Dashboard.
- Persönliche Design-/Luftbilder gehören nicht in das öffentliche Repository. Wenn der Nutzer Bildreferenzen direkt an den Codex-Task hängt, darfst du sie dort zur Orientierung ansehen, aber **niemals** Originale oder wiedererkennbare abgeleitete Immobilien-/Grundstücksgrafiken committen oder in öffentlichen PR-Screenshots veröffentlichen. Ohne private Vorlage nicht raten; generische lokale Demo-Draufsicht bereitstellen. Private Grafik wird später in Home Assistant vom Nutzer ausgewählt.
- Implementierung ist freigegeben für einen **reviewbaren Entwicklungsstart**. Keine automatischen Writes an bestehende Home-Assistant-Dashboards des Nutzers und keine Änderungen an dessen Ecowitt-Local-Fork oder HausKlima-Card.

## Phasen / PR-Milestones
1. **Architektur und Grundkarte:** HACS-kompatibles Repository, Build-/Testkonzept, Custom Card unter custom:ecowitt-weather-card, Registrierung im Kartenkatalog, getStubConfig, getConfigElement und eigener visueller Karteneditor. Karte mit gut sichtbarem Konfigurationshinweis für fehlende Sensoren. CSS-Containerbreiten-Responsivität. Beispiel-View-Dateien als Tests validieren.
2. **Design und Wind:** eigenständig gezeichnetes **generisches, nicht identifizierendes** nordorientiertes Demo-SVG plus Möglichkeit zur Auswahl einer **privaten Home-Assistant-Bildquelle** im Editor. Überlagerung mit Strömungspfeilen, Windgeschwindigkeit/Böen, 10-Minuten-Mittelwerten, Tagesmax und Richtungstests. Die persönlichen Vorlagen bleiben außerhalb von GitHub.
3. **Regen und Hauptmesswerte:** Regenmenge/-rate WH40, NASS/TROCKEN/NICHT VERFÜGBAR WS90 Piezo, Temperatur/Feuchte, relativer Druck, UV, Solarstrahlung; Farben/Animationen, fehlende Werte und unpassende Einheiten.
4. **Interaktive Detailansichten:** Regen 24h, heute, Woche, Monat, Jahr, Ereignis, Verlauf; Winddiagramm und optionale Windrose; Temperatur-, Sonnen-, Druck-Details und WN31/WH31/GW3000-Diagnosen. Nutze HA Recorder/API und nur reale Historien; bei fehlenden Daten klaren Hinweis.
5. **Qualität und Release:** iPhone 17 Hoch-/Querformat in der HA-App/Safari testen, Tablet/Desktop, helle/dunkle Themes, Accessibility, prefers-reduced-motion, Touch-Flächen, keine horizontalen Überläufe, Dokumentation und HACS-Installation. Vor erster Release Screenshots vom tatsächlich gerenderten Frontend vorlegen.

## UX: die Einrichtungsfrage des Nutzers lösen
- **Empfohlen:** Panel View für einen eigenen Wetter-Reiter; keine manuell anzulegenden Abschnitte. Panel zeigt genau eine Karte; sie muss intern sinnvoll zentriert und in der Breite begrenzt sein.
- Alternativ Sections für die Einbindung zwischen anderen Karten. examples/view-panel.yaml und examples/view-sections.yaml wurden als vollständige Ansichts-YAMLs vorbereitet. Beide verwenden die **gleiche** Custom Card.
- Die Karte bietet eine komfortable grafische Sensorzuordnung mit möglichen Ecowitt-Gerätevorschlägen; keine harten Entity-IDs außer einem optionalen, editierbaren Vorschlag für sensor.ecowitt_wind_direction_avg_175da.
- Keine Pflicht-Frontend-Abhängigkeiten wie Mushroom/Bubble/card-mod.

## Abnahme / Tests
- Mobile Layout darf nicht durch bloßes Herunterskalieren der 1448-Pixel-Designvorlage entstehen.
- Nord ist oben, West links, Ost rechts, Süd unten, bei 292° kommt Wind aus WNW; Strömungspfeil zum Haus bewegt sich nach 112°.
- WS90 Piezo-Nassstatus und WH40-Mengen nicht vermischen; NASS/TROCKEN/nicht verfügbar müssen klar zu unterscheiden sein.
- Keine fiktiven Entitätswerte, UV-/Druck-/Rain-Daten; kein zusätzlicher Cloud-Zwang.
- Bitte PRs zur Kontrolle und kurze Hinweise, was getestet wurde und was noch offen ist.


### PRIVATSPHÄRE – wichtige verbindliche Architekturentscheidung
- Dieses Repo ist öffentlich. Keine persönlichen Luftbilder, Standortdaten, wiedererkennbaren Grundstückszeichnungen oder auf der privaten Vorlage basierenden Assets in Git-Commits, Issues, PR-Anhängen, Release-Assets, Testfixtures oder Screenshots veröffentlichen.
- Codex darf die Originalvorlage nur erhalten, wenn der Nutzer sie separat als **privaten Task-Anhang** bereitstellt; nicht über GitHub-Issues oder Commits übertragen.
- Die Custom Card benötigt ein editierbares Feld `background_image` / `site_image` für eine nutzereigene Bildquelle aus Home Assistant. Bei fehlendem Bild generische, nicht personenbezogene Standardillustration verwenden.
- Realistisches Grundstücksbild optional **außerhalb des Git-Repositories** auf der privaten HA-Instanz hinterlegen und dort als Bildquelle konfigurieren. `/config/www` bzw. `/local/` ist nicht notwendigerweise zugriffsgeschützt; dies muss vor Auswahl der Speicherstrategie klar dokumentiert und bei externer HA-Erreichbarkeit geprüft werden. Wenn möglich, HA-Authentisierung/Media-Verwaltung nutzen und das Zugriffskonzept testen.
- Niemals private Bilder in Build-Artefakte einbetten, die mit HACS verteilt werden. Keine Bild-Upload-Funktion implementieren, die private Nutzerbilder unbemerkt an Dritte übermittelt.
