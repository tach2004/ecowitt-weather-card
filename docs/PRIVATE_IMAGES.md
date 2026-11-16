# Private images and user data

This repository is public. Private images, HA screenshots, addresses, coordinates, authentic network/device identifiers, credentials and site-plan derivatives must **never** be published in source files, test fixtures, GitHub issues/PRs, Actions artifacts, screenshots or releases.

## Background image handling
- Public images are independently created generic artwork with synthetic data.
- Owners may configure optional `site_image` or `background_image` using their own Home Assistant instance. This does **not** upload the picture to GitHub.
- References supplied privately to an agent are for viewing **only** during an authorized task. Do not trace recognizable property geometry or add those reference files to a public checkout.
- `media-source://` image resolution uses Home Assistant's media API. Access controls must be tested on the actual installation. `/config/www` exposed through `/local/` is **not automatically authenticated**; do not present it as a secure store for personal images.
- No automatic image uploads, remote image hosts or external weather-map services.

## Before any PR
- Manually review the complete diff, staged paths, docs, generated assets, tests and each screenshot.
- Run `npm run check`, which includes a public assets/history audit and basic current-text identifier screening. Detectors cannot identify every sensitive description or image: manual review is mandatory.
- Editing today's files does **not** erase already public Git history, forks or caches. History rewrites need a separate coordinated decision.
- [AGENTS.md](../AGENTS.md) contains the binding Codex/agent confidentiality and no-merge rules.
