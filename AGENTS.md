# Codex / Agent instructions — Ecowitt Weather Card

## Purpose
Create a standalone, production-quality, mobile-first Home Assistant custom Lovelace weather card for Ecowitt weather stations, especially `alexlenk/ecowitt_local`.

## Source of truth and status
- Read `SPEC.md` before any implementation.
- **SPEC.md is currently a planning DRAFT. Do not begin implementing solely because this repository is present; wait for an explicit user implementation task.**
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
- Avoid duplicate views or multiple full dashboard YAMLs unless user explicitly decides otherwise.
- Deliver small, reviewable PRs, tests, setup documentation, screenshots/demos and honest limitations.

## Workflow
1. Discuss and finalize UI/spec in ChatGPT; keep SPEC.md updated.
2. When user authorizes coding, produce a PR plan with discrete milestones.
3. Implement only approved scope and verify on mobile/desktop.
4. Do not mark design or feature as complete on the basis of a mockup alone.
