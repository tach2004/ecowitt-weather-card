# Private Grundstücksgrafik sicher einsetzen

Dieses Repository ist öffentlich. Es darf nur **neutrale Beispielgrafiken** enthalten.

## Privater Codex-Handoff
Der Eigentümer besitzt ein separates, lokal herunterladbares ZIP-Paket mit den privaten Referenzen:
- ursprüngliches Luftbild (Nord oben),
- freigegebenes UI-Mockup,
- ästhetisch gezeichnetes 4:3-Grundstücksbild ohne Pfeile/Text,
- quadratischer Zuschnitt für einen Windkompass.

Die Dateien gehören NICHT ins Repo, in GitHub-Issues, PRs, Actions-Artefakte, Release-Pakete, Screenshots oder Codebeispiele. Codex sieht sie ausschließlich, wenn der Nutzer sie direkt als private Task-Anhänge bereitstellt. Fehlen die Dateien, darf Codex keine angeblich exakte Grundstücksdarstellung erfinden.

## Technisches Ziel
- Komponente verwendet eine konfigurierbare private Hintergrundbildquelle (e.g. `site_image`).
- Falls kein Bild konfiguriert ist, rendert sie eine generische, nicht identifizierende Standardeinstellung.
- Das Wind-Overlay (Kompass, Pfeil, Wetterzahlen) wird live auf dem Bild gezeichnet, **niemals** in ein neues festes Nutzerbild hinein gebacken.
- Die Grundstücksgrafik bleibt nordorientiert; Bildrotation wird nur bewusst eingestellt, keine automatische Annahme.

## Sicherheit von Bild-URLs
Bilder im Ordner `/config/www` werden von Home Assistant unter `/local/` bereitgestellt und sind **nicht automatisch zugriffsgeschützt**. Eine externe HA-Domain kann die Bildressource unter Umständen auch ohne angemeldeten Account verfügbar machen. Deshalb darf die Anleitung diesen Speicherweg niemals als sicher privat bezeichnen.

Vor dem finalen Einrichten sind Zugriffsmodell und öffentlich erreichbare HA-URL zu prüfen. Gegebenenfalls private authentisierte Media-Quellen verwenden, sofern deren Verwendung in der Custom-Card-Umgebung tatsächlich funktioniert. Nichts ohne Prüfung versprechen.

## Git-/PR-Checks
- `.gitignore` bietet nur versehentlichen Schutz. Es ist kein Sicherheitsmechanismus gegen manuelle Git-Force-Adds oder Uploads.
- Vor jedem PR `git status`, `git diff --cached --name-only`, Commits und öffentliche Screenshots auf private Details prüfen.
- Screenshots/Tests gegen neutrale Beispielobjekte durchführen, niemals mit Nutzerhaus, realen Koordinaten oder Original-Luftbild.
