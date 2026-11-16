# Ecowitt Weather Card — mandatory agent instructions

This is a **public** repository. The following rules apply to Codex and every other contributor. Read `SPEC.md` and the current explicit user request before acting.

## Task and merge authorization
- Only implement the user's approved scope. Never guess entity IDs, sensor readings, supported device features, or undisclosed requirements; ask or document uncertainty.
- Always work in a **separate branch**, based on the latest `main`. Open a reviewable PR. **Never push directly to main, merge, tag/release, rewrite Git history, or edit another repository without separate, explicit user approval.**
- Preserve existing behavior, approved visual layout, backwards compatibility and tests. Avoid surprise changes and repeated broken intermediate commits. Tests must not be weakened to manufacture a passing result.
- Run applicable checks before pushing. State exactly which checks passed or failed and what remains unverified in real Home Assistant / mobile hardware. Simulated tests are not a real-device validation.

## Privacy rules — binding publication gate
- Treat **every private user-supplied image, screenshot, config, log, prompt, attachment or reference** as confidential. It may be viewed in an explicitly authorized private task, but **never** added to source control, public PRs/issues, demos, GitHub Actions artifacts, screenshots, release assets or example fixtures.
- Do not publish identifiable property geometry or private-image derivatives, aerial photographs, home addresses, coordinates, personal names, private IP addresses/hostnames/MACs, credentials, accounts, or installation-specific sensor/device/entity IDs. Cropping or stylistically transforming a private property image does not make it a safe public demo.
- Public imagery must be **independently generic**, with **synthetic** entities, measurements and device names. Never trace real geometry. Do not publish actual screenshots from a user's HA instance.
- Never hard-code personal sensor IDs as defaults or suggestions. Discover actual devices/entities dynamically from Home Assistant and let users choose.
- User background images stay on the user's own HA instance, never in the repository or HACS bundle. Direct `/local/` image URLs are **not automatically private**; warn about access control. No remote image-upload service.
- Before any push/PR inspect the **complete diff, staged files, documentation, code comments, UI fixtures, screenshots, build assets and PR body**. Run `npm run check` including the asset/history and current-text privacy audit. Never switch off a privacy safeguard just to pass CI.
- Automatic scanning is only defense in depth. Manually inspect ordinary prose and every visual. If private information exists in **historical** public commits, report it privately; editing today's files does not erase history/forks/caches. **Never force-push or rewrite history without separately coordinated consent.**
- Do not repeat identifying filenames/identifiers in a public PR while describing their removal; use neutral generic wording.

## Product and engineering requirements
- Maintain one standalone `custom:ecowitt-weather-card`, Panel/Sections views, native editor, container-responsive layouts, HA themes, accessible controls and reduced-motion support.
- Use only actual configured HA states/Recorder data; do not invent histories or connectivity. Preserve wind-from direction vs airflow-to target, measured rainfall vs wet-surface indication, and calendar-day vs rolling period.
- An optional installed Windrose Card is separate from this project's bundle and is not fetched from GitHub at runtime.
- Keep CI, HACS release automation and regression tests. Review changes on desktop/mobile using **synthetic-only** screenshots.

**Release gate:** checks reviewed, privacy and provenance verified, PR ready for user review; **no merge before explicit user approval**.
