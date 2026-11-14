# Unabhängiges Review von PR #4

## Prüfgegenstand und Grenzen

Geprüft wurden die vollständigen **31 ursprünglichen Commits** von `cbc740e` bis `547e6cd` auf `feat/weather-visuals-device-status`, jeweils gegen den Ausgangsstand `1c5097c`, sowie der resultierende Stand auf `main` (`75f619b`). Der ursprüngliche PR verändert **16 Dateien** mit 997 hinzugefügten und 74 entfernten Zeilen. Der neue Korrekturbranch baut auf diesem bereits gemergten Stand auf; Tags, Releases, Versionsdateien und Release-Workflows werden nicht verändert.

Das Review umfasst den gesamten PR-Diff, seine Zwischenstände, die sieben fehlgeschlagenen GitHub-Actions-Läufe, vorhandene Tests sowie die angrenzenden Bild-, Recorder-, Konfigurations- und Lifecycle-Pfade. Öffentliche Beispiele und Tests verwenden ausschließlich generische Grafiken und synthetische Geräte und Messwerte. Private Referenzen, reale Kennungen, Netzwerkinformationen und persönliche Konfigurationen sind nicht Bestandteil dieses Berichts.

Schweregrade: **P1** = wesentliche Funktion fällt aus; **P2** = relevante falsche Anzeige oder Bedienung; **P3** = begrenzte Robustheits- oder Dokumentationslücke. Ein reproduzierbarer Code-/Fixture-Test ist keine Abnahme in echtem Home Assistant, in der Companion App oder in iOS Safari.

## Feststellungen am gemergten Stand und Korrekturen

| Nr. | Grad | Nachweis und Auswirkung | Korrektur und Regression |
| --- | --- | --- | --- |
| F1 | P1 | `observeWeather()` gab bei nassem Piezo sofort `wet` zurück. Dadurch wurden Sonne, Wolkenschätzung und Nacht trotz verfügbarer Quellen unterdrückt. Der bisherige Unit-Test schrieb genau dieses Verhalten fest. | Oberflächenfeuchtigkeit von Himmelsklassifizierung trennen. Positive gültige WH40-Rate behält Regenpriorität; Piezo-Feuchtigkeit bleibt zusätzlicher Status. Kombinationen nass/sonnig, nass/Regen und trocken/Nacht separat prüfen. |
| F2 | P2 | Der Gradkreis lag bei Radius 42 innerhalb des Bildkreises; weiße SVG-Schrift wuchs proportional mit der Grafik. Der Test zählte nur acht Texte und erkannte diese Darstellungsfehler nicht. | Gradbeschriftung außerhalb des Bildkreises mit kleiner gedämpfter Schrift, Abstand zu N/O/S/W und Containerprüfung einschließlich schmaler Karten. Bildausrichtung und Windpfeilgeometrie bleiben erhalten. |
| F3 | P2 | `isUnitValid('uv', …)` akzeptierte `UV index`, aber nicht die gültige Ecowitt-Schreibweise `UV Index`. Ein numerischer echter UV-Wert wurde dadurch als ungültige Quelle angezeigt. | Eng begrenzte Normalisierung der anerkannten UV-Einheiten; Tests für `UV Index`, kompatible Varianten, inkompatible Einheiten sowie fehlende/ungültige Zustände. |
| F4 | P2 | `icon('signal')` verwendete mangels Pfaddefinition den allgemeinen Fallback `paths.sun`; Empfang wurde mit einer Sonne dargestellt. | Eigener eindeutiger Signalpfad; DOM-Regression für Empfangssymbol und Abgrenzung vom Sonnensymbol. |
| F5 | P2 | Neue Gerätestatusfelder bestanden neben zwei globalen Sensorlisten und einem zusätzlichen WN31-Shortcut. Dieselben IDs konnten in Gerätestatus, Zusatzsensoren, Diagnosen und Wetterquellen mehrfach erscheinen. | Eine geräteorientierte Konfiguration mit Status und optionalen Messwerten; Kompatibilität der bisherigen Listen erhalten, Detailzeilen zentral deduplizieren. Kein stiller Datenverlust beim Laden oder Speichern. |
| F6 | P2 | `roleForDevice()` und `uniqueRoleDevices()` verwendeten unterschiedliche Erkennungslogik. Exakte Wortgrenzen verfehlten `GW3000A`; das reale WS90-Modell `wh90` wurde ebenfalls nicht konsistent erkannt. | Eine gemeinsame modellbasierte Zuordnung mit ausdrücklich erlaubten Varianten; tatsächliche Registry-Geräte verwenden, Mehrdeutigkeiten offenlassen und vorhandene Entitätszuordnungen erhalten. |
| F7 | P2 | Der obere Geräteassistent speicherte lediglich vorübergehende Vorschlagsfilter, während weiter unten dauerhafte Gerätestatusfelder standen. Diese unterschiedlichen Wirkungen waren nicht ausreichend erklärt. | Vorübergehenden Vorschlagsfilter und gespeicherte Gerätekonfiguration ausdrücklich benennen; Änderung des Filters darf keine bestehenden Sensorzuordnungen überschreiben. |
| F8 | P2 | `observeWeather()` vertraute allein auf `status: ok`; weder Einheiten und endliche Zahlen noch Sonnenmetadaten und Datenalter wurden eigenständig abgesichert. Alte Regenwerte konnten aktuelle Regenanimationen auslösen. | Einheiten, Werte und Zeitstempel prüfen; die eigenständige konservative Wetter-Altersgrenze beträgt 30 Minuten und kann durch kleinere konfigurierte Grenzen verkürzt werden. Fehlende/ungültige Daten zeigen einen begründeten unbekannten Status. |
| F9 | P2 | Der gemeinsame Zahlenhelfer für Batterie und Signal akzeptierte ungeeignete Einheiten, Bereiche und Quellenklassen. Verbindungsstrings konnten ohne passende Domain und ohne Zeitnachweis als verbunden gelten. | Statusarten getrennt validieren, Prozentfüllung nur bei passender Batterie-Prozentquelle, Rohspannung und Rohsignal erhalten. Geeignete Connectivity-Quellen und gültige Zeitpunkte verlangen; stale/unknown bleiben neutral. |
| F10 | P1 | Zusätzlich reproduziert am gemergten Stand: `setConfig()` setzte den Bildquellen-Cache auf leer, behielt aber das alte Bild. Beim Leeren des Bildfelds blieb die alte private Quelle sichtbar; eine verspätete Media-Antwort konnte sie wieder einsetzen. Dieser angrenzende Fehler bestand bereits vor PR #4. | Nur tatsächlich geänderte Quellen neu auflösen, alte Auflösung invalidieren und bei Entfernen des Bilds auf die generische Grafik zurückschalten. Asynchrone Bild- und unveränderte Konfigurationspfade sind Browserregressionen. |
| F11 | P2 | Zusätzlich reproduziert: Detailöffnung, gefolgt von `setConfig()` im selben Aktualisierungsschritt, konnte trotz gelöschter Detailauswahl ein leeres Modal öffnen. Der redundante `updated()`-Hook konnte entfernte Modalzustände erneut öffnen. | Einen Öffnungspfad nach dem Lit-DOM-Commit verwenden; Request, gewünschtes Detail und Verbindung zum DOM vor Öffnung/Recorder-Anfrage prüfen. Beim Trennen Detailzustand und Timer aufräumen. |
| F12 | P2 | Ungültige Objektwerte für `theme_mode` wurden über `String()` erzwungen und konnten bei bestimmten YAML-Objekten werfen. Lux-/VPD-Vorschläge schlossen historische Aggregate nicht zuverlässig aus. | Konfigurations-Typen ohne Objekt-Konvertierung prüfen und aktuelle Lux-/VPD-Quellen von erkennbaren Aggregaten trennen. |
| F13 | P3 | Der Medienbrowser erkannte Ordner/Bilder nur eingeschränkt und konnte überholte Antworten nach Navigation oder Entfernen anzeigen. | Native `can_expand`, `media_class` und MIME-Angaben berücksichtigen; nur lokale Media-IDs anbieten und alte Antworten verwerfen. Manuelles Feld bleibt als Alternative erhalten. |
| F14 | P2 | Ergänzende iPhone-Meldung: Mehrere Statuskästen konnten Überschrift/Beschriftung überlagern; die bisherigen Tests verwendeten höchstens ein Statusgerät. | Header bis 900 CSS-Pixel als feste Titelzeile mit eigenem Statusbereich darunter; mehrere Geräte in einer Spalte, Desktop nebeneinander. Tests mit einem/drei Geräten, langen Namen, schmalem Container und beiden Themes. |
| F15 | P3 | Nach Ergänzung der sechsten Kennzahl spannte die letzte mobile Kachel weiterhin beide Spalten auf; davor blieb eine halbe Zeile leer. | Das mobile Raster zeigt sechs Kennzahlen in drei gleichmäßigen Zweispalten-Zeilen. Die vorhandene Strahlungs- und Lux-Zuordnung bleibt unverändert. |

Für F10/F11 wurden die ursprünglichen Quellen isoliert aus dem alten Git-Stand unter dem ignorierten Arbeitsverzeichnis gebaut und mit ausschließlich generischer Grafik reproduziert. Anschließend wurden die gleichen Abläufe gegen den Korrekturstand abgesichert. Keine privaten Bilddateien waren an diesen Tests beteiligt.

## Wettermodell und Quellenbewertung

Der bestehende Haurwitz-Ausdruck `1098 · sin(h) · exp(−0,059 / sin(h))` ist die gebräuchliche Näherung für globale horizontale Klarhimmel-Einstrahlung bei Sonnenhöhe `h`. Das Modell ist keine Wolkenmessung. Das Verhältnis gemessener Globalstrahlung zum Modellwert erlaubt lediglich eine grobe lokale Schätzung; Verschattung, Dunst, Nebel, Sensorlage und Modellabweichungen sind nicht unterscheidbar.

Die ursprünglichen Grenzen 0,78 beziehungsweise 0,40 sind heuristische Klassen, keine empirisch belegten Ecowitt-Grenzwerte. Der Ausschluss von Sonnenhöhen unter 12° verhindert besonders instabile Verhältnisse nahe Sonnenauf- und Sonnenuntergang. `kW/m²` muss vor dem Vergleich mit dem Modellwert in `W/m²` umgerechnet werden; Lux liefert dafür keinen belastbaren Ersatz. Eine nasse Oberfläche darf die Schätzung weder ersetzen noch einen Nachweis für aktuellen Regen liefern. Umgekehrt hat eine tatsächlich gültige positive WH40-Regenrate Vorrang vor einer Himmelsabschätzung.

Weder Schneefall, Gewitter noch eine wolkenfreie Nacht können aus diesen Quellen abgeleitet werden. Der astronomische Nachtstatus beschreibt ausschließlich die Sonnenposition. Fehlende oder nicht verwendbare Quellen müssen einen erklärenden Status ergeben, keinen erfundenen Wetterzustand. Die endgültigen Regeln zur Quellenaktualität und zu ungewöhnlichen Kombinationen sind im Abschnitt „Lokale Wetterabschätzung“ der [Konfiguration](CONFIGURATION.md) dokumentiert.

### Belege zur Sensorsemantik und bewusst erhaltene Grenzen

Der vorhandene Ecowitt-Local-Quelltext wurde ausschließlich gelesen: `const.py` definiert die UV-Einheit ausdrücklich als `UV Index` und den Piezo-Binärsensor als `moisture`. `coordinator.py` liefert Signalqualität bereits als `%` ohne Geräteklasse sowie RSSI als `dBm` mit `signal_strength`; `sensor.py` beschreibt echte Batterie-Prozentsensoren. Daraus folgt keine frei erfundene Signal- oder Spannungskurve. Es wurden keine HA-Konfigurationen oder anderen Repositories verändert.

`last_reported` wird, soweit von HA geliefert, zusammen mit `last_updated` für die letzte gültige Meldung verwendet. Statische, unveränderte Zustände sind nicht automatisch offline; umgekehrt ist ein fehlender Zeitpunkt kein Nachweis für eine aktuelle Verbindung. Die Wetter-Abschätzung verwendet vorsichtigere Frischeanforderungen als die optionalen allgemeinen Aktualitätshinweise. Ob die konkrete HA-Version diese Metadaten bereitstellt und ob ein Bild tatsächlich authentisiert erreichbar ist, bleibt an der realen Instanz zu prüfen.

## Untersuchung sämtlicher sieben fehlgeschlagener CI-Läufe

Quelle sind die originalen GitHub-Actions-Run-, Job- und Logdaten. Bei **allen sieben Läufen** waren Checkout, Node-Setup, `npm ci`, Typecheck, Unit-Tests, Build und Chromium-Installation erfolgreich. Fehlgeschlagen ist jeweils Schritt 9, `npm run test:browser`. Der nachfolgende Veröffentlichungsaudit und der Artefakt-Upload wurden deshalb übersprungen. Es handelte sich nicht um sieben unterschiedliche Infrastruktur- oder Auditfehler.

| Lauf | Commit | Run-ID / Link | Ergebnis und konkreter Beleg |
| --- | --- | --- | --- |
| #8 | `9ba10fb` | [43574830944](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43574830944) | 1 fehlgeschlagen / 41 bestanden. iPhone-Querformat-Test: Temperaturdialog nach Klick nicht sichtbar. |
| #9 | `2ef8a12` | [43575126911](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575126911) | 1 / 41. Gleicher Fehler; Diagnose: `detail=temperature`, Dialog im DOM vorhanden, `open=false`. |
| #10 | `68fd71e` | [43575164375](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575164375) | 3 / 42. Zusätzlich `.sky-banner` fehlend und Timeout beim erneuten Aktivieren der Zusatzsensor-Checkbox nach dem Deaktivieren. |
| #11 | `af178e8` | [43575180506](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575180506) | 3 / 42. Dieselben drei Fehler. Die korrigierte Promise-Assertion am Ende des Editortests wurde wegen des vorherigen Checkbox-Timeouts noch nicht erreicht. |
| #12 | `8193916` | [43575319576](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575319576) | 3 / 42. Dieselben Fehler trotz des zusätzlichen `updated()`-/`showModal()`-Hooks. Damit ist diese Änderung nicht als Behebung der Dialogursache belegt. |
| #13 | `e7f4010` | [43575410703](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575410703) | 1 / 44. Banner und Checkbox funktionieren nach ihren Korrekturen; Temperaturdialog bleibt unsichtbar. |
| #14 | `80f3921` | [43575608764](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575608764) | 1 / 44. Instrumentierung belegt: `open detail rejected: TypeError: Cannot read properties of undefined (reading 'label')`. |

### Tatsächliche Ursache des vermeintlichen Querformatfehlers

Die neuen Detail-Keys `vpd` und `solar_lux` fehlten zunächst in `METRICS`. `_detailReading()` griff über `METRICS.find(…)!.label` auf den nicht vorhandenen Metadateneintrag zu. Dadurch brach Lit bereits beim Rendern ab; der Dialog konnte nicht regulär geöffnet werden. Das betraf grundsätzlich Temperatur- und Sonnendetails und war **keine nachgewiesene iPhone-spezifische CSS-Ursache**.

`b8cecb2` ergänzt beide Metadateneinträge und ist die tatsächliche Produktionskorrektur. Danach bestand Lauf [#15 / 43575886245](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575886245) mit 45 erfolgreichen Browsertests. `2d8bcd6` entfernt nur die vorübergehende Diagnoseinstrumentierung; [#16 / 43575908529](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575908529) besteht ebenfalls. `547e6cd` ergänzt gezielte Metadaten-/Normalisierungstests; [#17 / 43575926061](https://github.com/tach2004/ecowitt-weather-card/actions/runs/43575926061) besteht erneut.

Die Sichtbarkeitsprüfung des Dialogs, die Prüfung des Schließen-Knopfs und die Reduced-Motion-Prüfung bleiben erhalten. Im ursprünglichen 31-Commit-Diff wurden keine neuen `skip`-/`fixme`-Anweisungen, Wiederholungen, erhöhten Timeouts oder abgeschwächten Dialogassertionen eingeführt. Der jeweils eine übersprungene Test erzeugt nur auf ausdrücklichen Aufruf öffentliche generische Screenshots (`UPDATE_SCREENSHOTS`) und war schon vorher bedingt deaktiviert.

### Bewertung der übrigen Testkorrekturen

- `93fde22` bindet die zuvor nur definierte `_sky()`-Darstellung tatsächlich in das Haupttemplate ein. Das ist eine Produktionskorrektur für den fehlenden Wetterbanner.
- `e7f4010` ersetzt den veränderlichen Locator `input:checked` durch eine stabile Sensorzeile mit Checkbox. Nach `uncheck()` kann `:checked` definitionsgemäß nicht mehr dasselbe Element treffen. Die Persistenzprüfungen auf null und anschließend eine Auswahl bleiben bestehen; die Korrektur verschweigt keinen Produktfehler.
- `af178e8` ersetzt die nicht unterstützte `.resolves`-Verkettung durch `expect(await count())`. Das erhält die Aussage der Assertion.
- `8193916` war durch die CI-Historie nicht als Ursache der erfolgreichen Dialogreparatur belegt. Im Korrekturbranch entfällt der redundante Hook zugunsten eines einzigen gegen Abbruch und Entfernen abgesicherten Öffnungspfads (F11).
- Der Metadatentest für `vpd`/`solar_lux` schützt den konkreten Fehler. Der zweite Test iteriert lediglich über vorhandene Registereinträge und wäre allein kein Beweis dafür, dass künftig jeder neue Detail-Key registriert ist. Deshalb werden zusätzlich die tatsächlich gerenderten Detailansichten geprüft.

## Vollständige Dateiabdeckung des ursprünglichen PR-Diffs

| Datei | Review-Schwerpunkte und Ergebnis |
| --- | --- |
| `README.md` | Alle zwölf Ergänzungszeilen gelesen; Darstellung neuer Funktionen mit tatsächlicher Implementierung und den Grenzen lokaler Schätzungen abgeglichen. Keine privaten Bildreferenzen übernommen. |
| `docs/CONFIGURATION.md` | Neue Optionen, Modellgrenzen, Einheiten und Alt-Konfigurationen geprüft; Beschreibung von Feuchtigkeit/Himmel, Gerätelogik und kompatibler Sensorzuordnung berichtigt. |
| `docs/INSTALLATION.md` | Neue Medien- und Statushinweise geprüft. HA-Media ist eine zu prüfende Alternative, keine Zugriffsgarantie; `/local/` bleibt ausdrücklich ungeschützt. |
| `src/config.ts` | Neue Felder, Typ-/Bereichsprüfung, doppelte Geräte und Beibehaltung alter Listen/`wind_speed_avg` geprüft. Neue optionale Gerätemesswerte werden kompatibel normalisiert. |
| `src/data.ts` | Lux/VPD-Erweiterungen, numerische Bereiche und originale Einheiten geprüft. UV-Schreibweise ist F3; ungültige und nicht verfügbare Zustände bleiben neutral. |
| `src/device-status.ts` | Prozent/Volt, Rohsignal, Verbindung und fehlende Quellen geprüft; keine Spannungskurve oder RSSI-Prozentumrechnung erfunden. Ungeeignete Statusquellen dürfen keine beleglose Verbindungsanzeige erzeugen. |
| `src/ecowitt-weather-card.ts` | Sämtliche 157 hinzugefügten/entfernten Zeilen einschließlich Banner, Gradkreis, Batteriegrafik, Signalpfad, Geräte-/Sensordetails, Windmittel-Entfernung und Lifecycle-Hook geprüft. F2/F4/F5 sowie Metadaten-Historie oben. |
| `src/editor.ts` | Alle neuen Gerätebereiche, Checkboxlisten, Such-/Auswahlpersistenz, Medienbrowser und gespeicherte/temporäre Auswahlpfade geprüft. F5/F7; Quellen werden nicht automatisch überschrieben. |
| `src/styles.ts` | Alle 156 neuen Zeilen einschließlich expliziter Themes, Gradschrift, Headerumbruch, Regen-/Sonnenanimation und Reduced Motion geprüft. Gradkreis zu groß/innen (F2); Layout, Statusumbruch, Dialoge und Animationen durch DOM-/Browserprüfungen abgesichert. |
| `src/suggestions.ts` | Neue Modell-/Rollen- und Lux/VPD-Vorschläge geprüft; divergierende Rollenmatcher und fehlende Modellvarianten sind F6. Keine Zuordnung bei mehreren gleichwertigen Geräten. |
| `src/types.ts` | Gesamte Typ-/Metadatenänderung geprüft; deprecated Windmittel-Key bleibt lesbar. Fehlende VPD-/Lux-Metadaten wurden noch im ursprünglichen PR behoben; neue Gerätemesswerte müssen optional bleiben. |
| `src/weather.ts` | Vollständiges neues Modul geprüft: Haurwitz-Ausdruck, Strahlungseinheiten, Grenzwerte, Sonnenzustand, Regenpriorität, Feuchtigkeit und Aktualität. F1; kein externer Wetterdienst. |
| `tests/browser.spec.ts` | Gesamter Diff und frühere Diagnose-/Locatoränderungen geprüft. Gradtest zählte bislang nur Texte; Wet-Test bestätigte die falsche Exklusivität. Keine Testabschwächung zur Dialogreparatur nachgewiesen. |
| `tests/device-status.test.ts` | Beide ursprünglichen Tests gelesen: Volt/Prozent und Verbindung abgedeckt; fehlende Quelle, ungeeignete Quellen und Empfangssymbol brauchten zusätzliche Regressionen. |
| `tests/metric-registry.test.ts` | Beide ursprünglichen Tests und Einführungscommit geprüft; konkrete Metadatenkorrektur richtig, allgemeiner Testtitel stärker als seine Registeriteration. |
| `tests/weather.test.ts` | Alle vier ursprünglichen Tests geprüft; Modell- und Klassentests vorhanden, aber NASS-Erwartung schrieb F1 fest und Datenalter/Einheiten-/Sonnenrandfälle waren unzureichend abgedeckt. |

Angrenzend geprüft: `src/image.ts` (HA-Herkunftsprüfung, Media-Auflösung, keine Uploads), `src/history.ts` und `src/chart.ts` (lokale begrenzte Recorder-Anfrage, reale Ausgangszustände, Lücken und Einheitenwechsel), vorhandene Konfigurations-/Daten-/Suggestion-/Bild-/Recorder-/Chart-/Server-/Privacy-Tests sowie CI-/Release-Workflow. Diese Dateien waren überwiegend nicht Teil von PR #4. Die bestehende Release-Automatik reagiert erst auf einen tatsächlich gemergten PR beziehungsweise einen expliziten manuellen Workflowstart; dieser Korrekturauftrag führt beides nicht aus.

## Chronologie aller 31 ursprünglichen Commits

| Nr. | Commit | Inhalt / Reviewbezug |
| --- | --- | --- |
| 1 | `cbc740e` | Gerätetypen, Wetteroptionen, Lux/VPD; Metadaten zunächst unvollständig. |
| 2 | `5909628` | Normalisierung und Kompatibilität neuer Konfiguration. |
| 3 | `3141cc2` | Lux-/VPD-Einheiten und Wertebereiche. |
| 4 | `d53d9a8` | Lokale Wetterklassifizierung; Ursprung von F1. |
| 5 | `3a7f23d` | Quellbasierte Batterie-/Signal-/Verbindungsdaten. |
| 6 | `dbbd45d` | Lux/VPD- und Modellvorschläge. |
| 7 | `f60f152` | Rollenmatcher ohne Regex-Escaping; Modellvarianten blieben offen. |
| 8 | `27b804e` | Gerätebezogene Diagnose-/Checkbox-/Medieneditorarbeit. |
| 9 | `ed6bc5e` | Weitere Editorgruppen, Suche, Theme und Medienbrowser. |
| 10 | `262ad8b` | Gradkreis, Lux-/Statuswidgets, Mittelgeschwindigkeit ausgeblendet. |
| 11 | `56745de` | Wetterillustration und Statusbadges; Signalpfad fehlte. |
| 12 | `de687a2` | Regenanimation nur bei gemessener positiver Rate. |
| 13 | `9c03e4f` | Gerätebezogene Detaildiagnosen. |
| 14 | `77fd719` | Theme-/Grad-/Animations-/Responsive-Stile. |
| 15 | `d4b295b` | Wettertests, einschließlich fehlerhafter exklusiver NASS-Erwartung. |
| 16 | `69cceec` | Zwei Statuslogiktests. |
| 17 | `6434da4` | Sonnenillustration in Regenkachel. |
| 18 | `73ea2bd` | Sonnenglühen und Reduced Motion. |
| 19 | `fa6e20c` | Konfigurationsdokumentation. |
| 20 | `8208645` | README-Erweiterung. |
| 21 | `9ba10fb` | Installationshinweise; erster der sieben fehlgeschlagenen CI-Läufe. |
| 22 | `2ef8a12` | Diagnose des unsichtbaren Dialogs. |
| 23 | `68fd71e` | Drei neue Browserregressionen; weitere Fehler sichtbar. |
| 24 | `af178e8` | Unterstützte Promise-/Count-Assertion. |
| 25 | `8193916` | Zusätzlicher Modal-Lifecycle-Hook; Ursache weiterhin vorhanden. |
| 26 | `93fde22` | Wetterbanner tatsächlich im Haupttemplate rendern. |
| 27 | `e7f4010` | Stabiler Checkbox-Locator. |
| 28 | `80f3921` | Diagnose belegt Metadaten-TypeError. |
| 29 | `b8cecb2` | Tatsächlicher Dialogfix: Lux und VPD im Register. |
| 30 | `2d8bcd6` | Diagnose entfernen, fachliche Assertionen erhalten. |
| 31 | `547e6cd` | Metadaten-/Normalisierungsregressionen. |

## Abschlussprüfung und verbleibende Grenzen

Die Prüfungen verwenden Node.js 24.22.1 und das vorhandene Chromium 156.0.8078.79. Der bestehende GitHub-Workflow prüft zusätzlich mit Node.js 22 und seiner frisch installierten Playwright-Chromium-Version; dessen Ergebnis wird im PR mit dem jeweiligen Commit verlinkt.

| Befehl | Tatsächliches Ergebnis lokal |
| --- | --- |
| `npm ci` | Bestanden; Projektcache im ignorierten `work/` verwendet. |
| `npm run typecheck` | Bestanden. |
| `npm test` | 69 Unit-/Vertragstests bestanden. |
| `npm run build` | Einzelnes gebündeltes JavaScript-Modul erfolgreich gebaut. |
| `npx playwright install --with-deps chromium` | Ausgeführt, aber die lokale Systeminstallation scheiterte an `su: Authentication failure`. Es wurde kein Passwort eingegeben oder in Dateien gespeichert. Die Browserprüfungen verwenden deshalb das bereits installierte `/usr/bin/chromium`; der CI-Workflow führt die Installation unverändert erneut aus. |
| `UPDATE_SCREENSHOTS=1 npm run test:browser` | 99 von 99 Browserfällen bestanden, einschließlich öffentlicher generischer Screenshot-Erzeugung und direkter Touch-Emulation. |
| `npm run audit` | Bestanden für Arbeitsbaum, Git-Index, gesamte verfügbare Historie und `dist`; vor dem PR erneut geprüft. |

Die Browsermatrix deckt Panel/Sections mit 320/375/390/402/430/600/768/874/1024/1440 CSS-Pixeln ab. Alle sechs Detailtypen werden bei 402×874 und 874×402 in hellen/dunklen Karten geöffnet, gescrollt und geschlossen; Fokus und JavaScript-Fehler bleiben prüfbar. Auto-Theme folgt auch einem laufenden HA-Themewechsel. Weitere Fälle prüfen N/O/S/W/292°/359→0° anhand tatsächlich transformierter Windpfeile, äußere Gradtext-Geometrie, unabhängige Feuchtigkeit/Himmel/Regen, UV-Einheiten, Quellstatus, GW3000A/WH90, Alt-Konfiguration, deduplizierte Zusatzwerte, native Media-Metadaten und verworfene alte Bild-/Dialogaktionen. Ein zusätzlicher Mobile-/Touch-Kontext tippt die gestapelten Statuskästen und Wetterdetails in beiden Orientierungen an.

Die Statusprüfungen verwenden ein beziehungsweise drei Geräte mit langen synthetischen Namen und beiden Themes. Bis 900 Pixel Kartenbreite liegen die Kästen unter der Überschrift und untereinander, auf breiten Desktop-Karten nebeneinander. Auch eine schmale Karte in einem großen Viewport wird geprüft. Die sechs unteren Kennzahlen bilden auf dem iPhone drei vollständige Zweispalten-Zeilen.

[Desktop](screenshots/desktop.png) und [Mobile](screenshots/mobile.png) zeigen ausschließlich das unveränderte generische Demoobjekt und synthetische Zustände, einschließlich mehrerer Statusgeräte und gleichzeitig geschätzter Sonne/NASS. Sie werden zusätzlich visuell kontrolliert. Die geometrischen Regressionen prüfen tatsächlich gerenderte Begrenzungen und Überschneidungen; es wird keine plattformunabhängige Pixelgleichheit oder echte iPhone-Hardware-Abnahme behauptet.

Eine echte Home-Assistant-/Ecowitt-Local-Instanz wurde im Review nicht bedient. Tatsächliche Registry-Berechtigungen, Recorder-Aufbewahrung, native Picker und Media-Authentisierung müssen dort geprüft werden. Die Browserprüfungen verwenden Chromium mit real gerenderter Karte und synthetischem HA-Harness; sie ersetzen weder iPhone-Hardware noch Safari/Companion-App-Tests. Eine 24h-Windrose und eine empirisch kalibrierte Wolkenbestimmung werden durch diese Fehlerkorrektur nicht eingeführt. Der neue PR bleibt zur Prüfung offen und wird nicht durch diesen Auftrag gemergt.
