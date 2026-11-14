# Private Grundstücksgrafik sicher einsetzen

Dieses Repository ist öffentlich. Es darf nur **neutrale Beispielgrafiken** enthalten.

## Privater Codex-Handoff
Der Eigentümer besitzt ein separates, lokal herunterladbares ZIP-Paket mit den privaten Referenzen:
- ursprüngliches Luftbild (Nord oben),
- freigegebenes UI-Mockup,
- ästhetisch gezeichnetes 4:3-Grundstücksbild ohne Pfeile/Text,
- quadratischer Zuschnitt für einen Windkompass.

Die Dateien gehören NICHT ins Repo, in GitHub-Issues, PRs, Actions-Artefakte, Release-Pakete, Screenshots oder Codebeispiele. Codex sieht sie ausschließlich, wenn der Nutzer sie direkt als private Task-Anhänge bereitstellt. Fehlen die Dateien, darf Codex keine angeblich exakte Grundstücksdarstellung erfinden.

## Implementierte Bildquelle (Entwicklungsstand 0.1.0)
- Die Karte verwendet die konfigurierbare Hintergrundbildquelle `site_image` (alternativ `background_image`). HA-relative Pfade und URLs derselben HA-Herkunft werden unterstützt. Fremde Hosts, andere Protokolle und eingebettete Zugangsdaten werden vor dem Laden abgewiesen.
- Falls kein Bild konfiguriert ist, rendert sie eine generische, nicht identifizierende Standardeinstellung.
- Das Wind-Overlay (Kompass, Pfeil, Wetterzahlen) wird live auf dem Bild gezeichnet, **niemals** in ein neues festes Nutzerbild hinein gebacken.
- `media-source://`-IDs werden über Home Assistants `media_source/resolve_media` aufgelöst. Auch die resultierende URL muss dieselbe Herkunft haben. Das ist keine Zusicherung, dass die konkrete Media-Quelle authentisiert oder vom Browser darstellbar ist; auf der tatsächlichen Instanz prüfen.
- Es gibt keine Upload-Funktion. Die Karte setzt keine Cloud- oder Karten-API für Bilder ein.
- Die Grundstücksgrafik bleibt nordorientiert; Bildrotation wird nur bewusst eingestellt, keine automatische Annahme.

## Sicherheit von Bild-URLs
Bilder im Ordner `/config/www` werden von Home Assistant unter `/local/` bereitgestellt und sind **nicht automatisch zugriffsgeschützt**. Eine externe HA-Domain kann die Bildressource unter Umständen auch ohne angemeldeten Account verfügbar machen. Deshalb darf die Anleitung diesen Speicherweg niemals als sicher privat bezeichnen.

Vor dem finalen Einrichten sind Zugriffsmodell und öffentlich erreichbare HA-URL zu prüfen. Gegebenenfalls private authentisierte Media-Quellen verwenden, sofern deren Verwendung in der Custom-Card-Umgebung tatsächlich funktioniert. Nichts ohne Prüfung versprechen.

## Git-/PR-Checks
- `.gitignore` bietet nur versehentlichen Schutz. Es ist kein Sicherheitsmechanismus gegen manuelle Git-Force-Adds oder Uploads.
- Vor jedem PR `git status`, `git diff --cached --name-only`, Commits und öffentliche Screenshots auf private Details prüfen.
- Nach dem Build `node scripts/audit-public-assets.mjs` ausführen. Der Scan prüft Arbeitsbaum, Index, verfügbare Git-Historie und das ignorierte `dist`-Verzeichnis auf private Dateipfade, unerlaubte Bilddateien und eingebettete Bilddaten. Er ersetzt nicht die visuelle Prüfung der generischen SVG-Geometrie und der freigegebenen Screenshots.
- Das öffentliche Rasterbild-Allowlist ist auf `docs/screenshots/desktop.png` und `docs/screenshots/mobile.png` begrenzt. Beide dürfen ausschließlich die generische Grafik und synthetische Testdaten zeigen. CI und Release veröffentlichen nur das JavaScript-Bundle.
- Screenshots/Tests gegen neutrale Beispielobjekte durchführen, niemals mit Nutzerhaus, realen Koordinaten oder Original-Luftbild.
