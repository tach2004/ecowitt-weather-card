# Ecowitt Weather Card — current product specification

A standalone responsive Home Assistant Lovelace custom card for locally integrated Ecowitt weather stations. This describes the current product, **not** a pending implementation plan; no user's installation-specific details are assumed.

## Architecture
- `custom:ecowitt-weather-card` with native editor and optional YAML configuration. One card supports Panel and Sections views, sized by the card's available container width.
- Wind, outdoor climate, rain, pressure, solar/UV and device statuses use explicitly mapped **real HA entities**. Device and entity suggestions come dynamically from HA registries, never hard-coded personal IDs.
- Recorder history and optional calendar-day minimum/maximum load only when relevant details are opened. Missing data and unit differences are reported, never invented.
- HACS publishes a single local JS module; no remote map/weather API or required third-party frontend cards. The optional installed `custom:windrose-card` can replace the wind diagram in place and accepts its native options and variants.

## Visual and data semantics
- Default drawing is a generic independently designed north-up site illustration. Private backgrounds are configured by each user on their own Home Assistant installation and remain outside the public repository.
- Wind direction is the meteorological **source** bearing; an illustrative airflow arrow towards the target points at source bearing + 180°. Animate compass wraparound correctly.
- Sensor wetness is not proof of falling rain. Actual rain rate/accumulation and calendar-day vs rolling rainfall have separate sources.
- Weather overlays show sun, clouds, moon and rain using observed HA data or **explicitly labeled** local estimates. Solar measurements do not provide certain cloud coverage. Respect reduced-motion and user animation preferences; never alter the configured background or coordinate system.
- Show units, uncertainty, unavailable sources and errors clearly. Never invent connectivity, calculations or recorder measurements.

## Maintenance
- Verify mobile/desktop, Panel/Sections, themes, dialogs, missing sensors, graphs, windrose presence/absence and configuration compatibility.
- Preserve CI/HACS packaging and reliable tests. Only independent generic art and synthetic samples belong in public docs/tests.
- Mandatory privacy and contribution rules: [AGENTS.md](AGENTS.md). Work starts only after explicit instruction; **no automatic merge**.
