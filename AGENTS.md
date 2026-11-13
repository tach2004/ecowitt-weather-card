# Codex / Agent instructions — Ecowitt Weather Card

## Purpose
Create a standalone, production-quality, mobile-first Home Assistant custom Lovelace weather card for Ecowitt weather stations, especially `alexlenk/ecowitt_local`.

## Source of truth and status
- Read `SPEC.md` before any implementation.
- **The planning decisions in SPEC.md are approved. Implementation begins only on an explicit Codex task (for example the prepared GitHub implementation issue / a direct user request in Codex). Never assume GitHub file changes automatically launch Codex.**
- Preserve the distinction between confirmed requirements and proposals/open decisions.
- Never invent actual entity IDs, user sensor values, or the appearance/orientation of their property. The one user-supplied ID is `sensor.ecowitt_wind_direction_avg_175da` (10-minute average wind direction), used only as a suggested editable configuration.
- If technical details are ambiguous, document the uncertainty instead of silently guessing.

## Implementation principles (when explicitly requested)
- A single standalone `custom:ecowitt-weather-card` without mandatory dependencies on other HACS cards.
- Visual editor, native card picker, optional manual YAML example; no automated edits to the user's dashboard.
- Responsive to **card container width**, especially iPhone 17 portrait and landscape.
- Respect HA theme variables and reduced-motion preferences.
- Semantically accurate wind direction: meteorological "wind from" vs physically moving arrows towards the property; include direction tests (N/E/S/W, 359°→0°).
- Wind and rain receive visual priority; WH40 measures rain quantity and WS90 piezo determines wet status as separate sources.
- Gracefully handle missing, unavailable, unknown or stale sensors.
- Use local Home Assistant state/history APIs, no cloud or map calls, and do not modify Ecowitt Local.
- Support two example VIEW YAMLs for the SAME card: Panel View (default for dedicated weather tab; one card) and Sections View (for integration with other dashboard cards). Do not auto-edit existing dashboards.
- Deliver small, reviewable PRs, tests, setup documentation, screenshots/demos and honest limitations.

## Workflow
1. Discuss and finalize UI/spec in ChatGPT; keep SPEC.md updated.
2. When user authorizes coding, produce a PR plan with discrete milestones.
3. Implement only approved scope and verify on mobile/desktop.
4. Do not mark design or feature as complete on the basis of a mockup alone.


## Current implementation priorities
1. Read SPEC.md, docs/CODEX_IMPLEMENTATION.md and examples/ before editing code.
2. Build the actual custom-card foundation and visual editor first, with deterministic demo states and an explicit setup placeholder.
3. Build a **generic, non-identifying** north-up 2D site-plan demo SVG and accurately transformed wind arrows. The private real-world site photo or any derived recognizable asset must never be committed or included in public PRs/screenshots. Accept private reference images only through explicit Codex task attachments and keep personalized visual output out of the public repo.
4. Add high-visibility wet/dry/unavailable rain status using WS90 piezo, WH40 accumulation/rate as distinct inputs.
5. Implement responsive layout and tap-details with live HA data/recorder access; iPhone 17 portrait, iPhone landscape and desktop screenshot verification.
6. Package for HACS, give a reliable visual editor and test the prepared View-YAML examples. Do not invent device entity IDs.

## Quality gates
- Test wind arrow semantics: meteorological FROM bearing vs movement arrow direction toward the house (bearing+180 degrees); north stays at image top.
- Test rain wet/dry/unavailable, card in panel/sections, missing entities, 359-to-0 animation, all unit handling.
- Prefer small reviewable PRs, include test results and known limitations; preserve scope, do not overwrite the user's other repositories.


### PRIVATSPHÄRE – wichtige verbindliche Architekturentscheidung
- Dieses Repo ist öffentlich. Keine persönlichen Luftbilder, Standortdaten, wiedererkennbaren Grundstückszeichnungen oder auf der privaten Vorlage basierenden Assets in Git-Commits, Issues, PR-Anhängen, Release-Assets, Testfixtures oder Screenshots veröffentlichen.
- Codex darf die Originalvorlage nur erhalten, wenn der Nutzer sie separat als **privaten Task-Anhang** bereitstellt; nicht über GitHub-Issues oder Commits übertragen.
- Die Custom Card benötigt ein editierbares Feld `background_image` / `site_image` für eine nutzereigene Bildquelle aus Home Assistant. Bei fehlendem Bild generische, nicht personenbezogene Standardillustration verwenden.
- Realistisches Grundstücksbild optional **außerhalb des Git-Repositories** auf der privaten HA-Instanz hinterlegen und dort als Bildquelle konfigurieren. `/config/www` bzw. `/local/` ist nicht notwendigerweise zugriffsgeschützt; dies muss vor Auswahl der Speicherstrategie klar dokumentiert und bei externer HA-Erreichbarkeit geprüft werden. Wenn möglich, HA-Authentisierung/Media-Verwaltung nutzen und das Zugriffskonzept testen.
- Niemals private Bilder in Build-Artefakte einbetten, die mit HACS verteilt werden. Keine Bild-Upload-Funktion implementieren, die private Nutzerbilder unbemerkt an Dritte übermittelt.
