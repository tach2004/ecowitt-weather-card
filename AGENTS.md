# AGENTS.md

Ecowitt Weather Card ist eine eigenständige Home-Assistant-Dashboardkarte in einem öffentlichen Repository. Diese Regeln gelten für Codex und alle Mitwirkenden. Lies vor Arbeitsbeginn `SPEC.md` und den aktuellen ausdrücklichen Auftrag.

## Zusammenarbeit und Prüfungen

- Arbeite im freigegebenen Umfang auf einem separaten Branch vom aktuellen `main`. Bereite Änderungen zur Begutachtung vor. Kläre oder dokumentiere offene Anforderungen und Unsicherheiten zu Entitäts-IDs, Messwerten und unterstützten Gerätefunktionen. Verwende im Kartenbetrieb belegte Angaben.
- Erhalte bestehendes Verhalten, freigegebenes Layout, Abwärtskompatibilität und Tests im Rahmen des Auftrags. Vermeide überraschende Änderungen und wiederholt fehlerhafte Zwischencommits. Schwäche Tests nicht ab, um ein bestandenes Prüfergebnis zu erzwingen.
- Führe vor einem Push die für die Änderung vorgesehenen Prüfungen aus. Prüfe Darstellungsänderungen auf Desktop und Mobilgeräten. Berichte, welche Prüfungen tatsächlich liefen, welche bestanden oder fehlschlugen und was an einer echten Home-Assistant-Installation oder auf realen Mobilgeräten offenbleibt. Kennzeichne simulierte Prüfungen als solche.

## Datenschutz

- Behandle private Bilder, Screenshots, Konfigurationen, Logs, Prompts, Anhänge und Referenzen vertraulich. Nutze sie ausschließlich in ausdrücklich autorisierten privaten Aufgaben. Halte sie aus dem Repository, der Git-Historie, öffentlichen PRs und Issues, Demos, Testdaten, Screenshots, GitHub-Actions-Artefakten und Releases heraus.
- Erstelle öffentliche Grafiken eigenständig und generisch. Verwende synthetische Geräte, Entitäten und Messwerte sowie neutrale Geräte- und Quellennamen. Kennzeichne Demowerte. Zeichne keine reale Grundstücksgeometrie nach. Aus privaten Bildern erzeugte Ausschnitte, Nachzeichnungen und stilistische Bearbeitungen bleiben vertraulich.
- Veröffentliche keine identifizierbaren Grundstücksgeometrien, Luftbilder, Screenshots aus Nutzerinstallationen, Adressen, Koordinaten, Personennamen, privaten Kontaktdaten, privaten IP-Adressen, Hostnamen oder MAC-Adressen, Zugangsdaten, Kontodaten, installationsspezifischen Sensor-, Geräte- oder Entitäts-IDs und vertraulichen Prüfbefunde.

## Prüfung vor Veröffentlichung

- Prüfe vor Push, PR, Merge oder Release den vollständigen Diff, gestagte Dateien und jeden Commit, der dadurch öffentlich erreichbar wird. Prüfe auch Zwischencommits, deren Inhalte später geändert oder gelöscht wurden. Kontrolliere Dateinamen, Dokumentation, Codekommentare, Testdaten, UI-Beispiele, Bilder, Build- und Release-Artefakte sowie PR- und Release-Texte.
- Prüfe die tatsächlichen Git-Metadaten. Dazu gehören Autor- und Committername, beide E-Mail-Adressen, Zeitstempel und Zeitzonen, Commit-Nachrichten und Einträge wie `Co-authored-by` und `Signed-off-by`. Prüfe bei Tags auch Namen, Nachrichten und gegebenenfalls Tagger-Daten. Verwende als Autor und Committer den vorgesehenen öffentlichen Accountnamen oder ein freigegebenes Pseudonym und eine `noreply`-Adresse. Private Namen und E-Mail-Adressen gehören auch dann nicht in Commits, wenn GitHub sie in der Oberfläche ausblendet.
- Prüfe Branch-Namen und eingebettete Dateimetadaten wie EXIF- und GPS-Daten, Dokumentautor, lokale Dateipfade und Angaben in Source Maps. Lies Texte und sichte jedes Bild zusätzlich zu den automatischen Prüfungen manuell. Behalte Datenschutzmaßnahmen auch bei fehlgeschlagener CI bei.
- Stoppe die Veröffentlichung bei einem Datenschutzfund. Melde private Daten in bereits öffentlichen Commits vertraulich. Beschreibe die Entfernung öffentlich mit neutralen Begriffen, damit Dateinamen oder Kennungen nicht erneut offengelegt werden. Frühere Commits, Forks und Caches können die Daten weiterhin enthalten.

## Ecowitt Weather Card

- Öffne einen PR zur Begutachtung. Direkte Pushes auf `main`, Merges, Tags, Releases und Änderungen an anderen Repositories erfordern eine separate ausdrückliche Freigabe des Nutzers. Force-Pushes und das Umschreiben der Git-Historie erfordern eine gesondert abgestimmte ausdrückliche Zustimmung.
- Erhalte eine eigenständige Karte `custom:ecowitt-weather-card`, Panel- und Sections-Ansichten, den nativen Editor, containerabhängige Layouts, Home-Assistant-Themes, barrierefreie Bedienelemente und die Unterstützung für reduzierte Bewegung.
- Ermittle Geräte und Entitäten dynamisch aus Home Assistant und lasse Nutzer auswählen. Verwende keine persönlichen Sensor-IDs als Standardwerte oder Vorschläge. Beziehe Messwerte, Verläufe und Verbindungsinformationen ausschließlich aus vorhandenen Daten der konfigurierten Home-Assistant-Entitäten und des Recorders.
- Unterscheide Windherkunft und Zielrichtung des Luftstroms, gemessenen Niederschlag und Hinweise auf eine nasse Oberfläche sowie Kalendertage und rollierende Zeiträume.
- Die optionale Windrose Card bleibt separat installiert und außerhalb des Bundles. Lade sie zur Laufzeit nicht von GitHub.
- Nutzerhintergründe verbleiben auf der jeweiligen Home-Assistant-Instanz. Halte sie aus Repository und HACS-Bundle heraus. Verwende keinen externen Upload-Dienst. Weise darauf hin, dass direkte `/local/`-Bild-URLs für sich genommen keinen Zugriffsschutz garantieren.
- Führe vor einem Push oder PR `npm run check` einschließlich der Datenschutzprüfung von Assets, Git-Historie und aktuellen Texten aus. Erhalte CI, HACS-Release-Automatisierung und Regressionstests. Verwende für visuelle Prüfungen auf Desktop und Mobilgeräten ausschließlich Screenshots mit synthetischen Daten.
- Prüfe vor einem Release die Prüfergebnisse, den Datenschutz und die Herkunft der verwendeten Materialien. Stelle den PR dem Nutzer zur Begutachtung bereit. Ein Merge setzt die ausdrückliche Freigabe des Nutzers voraus.
