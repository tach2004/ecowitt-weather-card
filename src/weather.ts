import {
  entityFreshness,
  isUnitValid,
  numericState,
  type Reading,
} from "./data";
import type { HassEntity } from "./types";

/** Local observations and explicitly selected HA conditions; never a forecast. */
export type LightPhase = "day" | "twilight" | "night" | "unknown";
export type WeatherKind =
  | "rain"
  | "sunny"
  | "partlycloudy"
  | "cloudy"
  | "night"
  | "daylight"
  | "unknown";
export interface WeatherObservation {
  kind: WeatherKind;
  label: string;
  note: string;
  estimated: boolean;
  /** Applies the night sky even to locally confirmed rain and cloud scenes. */
  night?: boolean;
  lighting?: LightPhase;
  source?: "wh40" | "ws90" | "weather_entity" | "solar" | "sun" | "lux";
  /** Irradiance/model ratio, not a measured fraction of cloud cover. */
  clearSkyRatio?: number;
  /** Visual density derived only from a configured numerical rain-rate source. */
  rainIntensity?: "light" | "moderate" | "heavy";
}
export interface WeatherOptions {
  now?: number;
  /** Optional HA-state age policy. Zero leaves unchanged HA states usable. */
  staleAfterMinutes?: number;
  /** Optional, explicitly configured WS90 precipitation RATE, never wetness. */
  secondaryRainRate?: Reading;
  /** Local illuminance reading in lx or klx, independent of irradiance. */
  lux?: Reading;
  nightLuxThreshold?: number;
  dayLuxThreshold?: number;
  /** An earlier display phase keeps thresholds from causing rapid toggles. */
  previousLighting?: LightPhase;
  /** Actual HA state only. No forecast or external fetch is performed here. */
  conditionEntity?: HassEntity;
}
const MIN_SKY_ELEVATION = 12;
const SUNNY_RATIO = 0.78;
const PARTLY_CLOUDY_RATIO = 0.4;

/** Haurwitz global horizontal clear-sky irradiance, W/m²; elevation in degrees. */
export function clearSkyIrradiance(elevation: number): number | null {
  if (!Number.isFinite(elevation) || elevation <= 0 || elevation > 90)
    return null;
  const cosZenith = Math.sin((elevation * Math.PI) / 180);
  return 1098 * cosZenith * Math.exp(-0.059 / cosZenith);
}
function unknown(
  note: string,
  label = "Wetterdaten ergänzen",
): WeatherObservation {
  return { kind: "unknown", label, note, estimated: false };
}
/**
 * last_updated is a change timestamp, not a telemetry heartbeat. Do not impose an
 * undocumented 30-minute expiry on unchanged rain or solar values. The card's
 * explicit age policy and unavailable/stale Reading states remain authoritative.
 */
function usableTime(
  entity: HassEntity | undefined,
  options: WeatherOptions,
): boolean {
  const age = entityFreshness(entity, {
    now: options.now,
    staleAfterMinutes: options.staleAfterMinutes,
  });
  return (
    age.status === "current" ||
    (age.status === "unknown" &&
      !(
        Number.isFinite(options.staleAfterMinutes) &&
        options.staleAfterMinutes! > 0
      ))
  );
}
function validObservation(
  reading: Reading | undefined,
  key: "solar" | "rain_rate" | "solar_lux",
  options: WeatherOptions,
): reading is Reading & { value: number } {
  return Boolean(
    reading &&
    reading.status === "ok" &&
    reading.value !== null &&
    Number.isFinite(reading.value) &&
    reading.value >= 0 &&
    isUnitValid(key, reading.unit) &&
    usableTime(reading.entity, options),
  );
}
function elevationOf(sun: HassEntity): number | null {
  const elevation = sun.attributes.elevation;
  if (typeof elevation !== "number" && typeof elevation !== "string")
    return null;
  const parsed = numericState(String(elevation));
  return parsed !== null && parsed >= -90 && parsed <= 90 ? parsed : null;
}
function rateInMmPerHour(reading: Reading & { value: number }): number {
  const unit = reading.unit.replace(/\/hr$/, "/h");
  const scale =
    unit === "in/h" ? 25.4 : unit === "cm/h" ? 10 : unit === "m/h" ? 1000 : 1;
  return reading.value * scale;
}
function measuredRain(
  reading: Reading | undefined,
  source: "wh40" | "ws90",
  options: WeatherOptions,
): WeatherObservation | undefined {
  if (!validObservation(reading, "rain_rate", options) || reading.value <= 0)
    return undefined;
  const rate = rateInMmPerHour(reading);
  if (!Number.isFinite(rate)) return undefined;
  return {
    kind: "rain",
    label: "Regen",
    estimated: false,
    source,
    note: `${source === "wh40" ? "WH40" : "WS90"} meldet eine positive Niederschlagsrate. Die Anzeige folgt diesem HA-Messzustand; ein unveränderter Zustand ist kein Nachweis für ausgefallene Telemetrie.`,
    rainIntensity: rate < 2.5 ? "light" : rate < 10 ? "moderate" : "heavy",
  };
}
/** One local rain-rate priority for both scene and tiles:
 * positive WH40 > positive WS90 > valid zero WH40 > valid zero WS90.
 * Invalid, unavailable or stale readings are never treated as rain.
 */
export function selectRainRate(
  primary: Reading,
  secondary?: Reading,
  options: WeatherOptions = {},
): { reading: Reading; source: "wh40" | "ws90" } {
  const wh = validObservation(primary, "rain_rate", options);
  const ws = validObservation(secondary, "rain_rate", options);
  if (wh && primary.value > 0) return { reading: primary, source: "wh40" };
  if (ws && secondary!.value! > 0) return { reading: secondary!, source: "ws90" };
  if (wh) return { reading: primary, source: "wh40" };
  if (ws) return { reading: secondary!, source: "ws90" };
  return { reading: primary, source: "wh40" };
}

interface Lighting {
  phase: LightPhase;
  source: "lux" | "sun" | "unknown";
  note: string;
}
/** Sun is local to HA, not a weather forecast or external network request.
 * The civil-twilight band is an intentionally approximate -6° to +6°.
 */
function astronomicalPhase(
  sun: HassEntity | undefined,
  options: WeatherOptions,
): { phase: LightPhase; altitude: number | null } {
  if (!sun || !usableTime(sun, options) ||
      !["above_horizon", "below_horizon"].includes(sun.state))
    return { phase: "unknown", altitude: null };
  const altitude = elevationOf(sun);
  if (altitude === null) {
    if (sun.state === "below_horizon" &&
        sun.attributes.elevation === undefined)
      return { phase: "night", altitude };
    return { phase: "unknown", altitude };
  }
  if ((sun.state === "above_horizon" && altitude < 0) ||
      (sun.state === "below_horizon" && altitude > 0))
    return { phase: "unknown", altitude: null };
  if (altitude <= -6) return { phase: "night", altitude };
  if (altitude < 6) return { phase: "twilight", altitude };
  return { phase: "day", altitude };
}

/** Local lux has priority, with only strong astronomical contradictions
 * falling back to the HA Sun integration. 0 lux is a real sensor value.
 */
export function determineLighting(
  sun: HassEntity | undefined,
  options: WeatherOptions = {},
): Lighting {
  const astro = astronomicalPhase(sun, options);
  if (validObservation(options.lux, "solar_lux", options)) {
    const lux = options.lux.value *
      (options.lux.unit.toLowerCase() === "klx" ? 1000 : 1);
    const nightLimit = Math.max(0, options.nightLuxThreshold ?? 0);
    const dayLimit = Math.max(nightLimit + 1, options.dayLuxThreshold ?? 10);
    const phase: LightPhase =
      lux <= nightLimit ? "night" :
      lux >= dayLimit ? "day" :
      astro.phase === "twilight" ? "twilight" :
      options.previousLighting && options.previousLighting !== "unknown"
        ? options.previousLighting
        : astro.phase !== "unknown" ? astro.phase : "twilight";
    // A near-zero sensor at high noon, or artificial light at deep night,
    // must not be interpreted as a plausible day/night transition.
    const contradiction =
      (phase === "night" && astro.altitude !== null && astro.altitude >= 12) ||
      (phase === "day" && astro.altitude !== null && astro.altitude <= -6);
    if (!contradiction) {
      return {
        phase, source: "lux",
        note: `Lokal gemessene Beleuchtungsstärke ${lux} lx (Nacht ≤ ${nightLimit} lx, Tag ≥ ${dayLimit} lx). Dazwischen bleibt eine vorhandene Lichtphase erhalten; astronomische Dämmerung wird berücksichtigt.`,
      };
    }
    return {
      phase: astro.phase, source: "sun",
      note: "Beleuchtungsstärke und eindeutiger Sonnenstand widersprechen sich. Die lokale Home-Assistant-Sonnenhöhe wird als Plausibilitäts-Fallback verwendet.",
    };
  }
  if (astro.phase !== "unknown")
    return {
      phase: astro.phase, source: "sun",
      note: "Keine verwendbare lokale Luxmessung; Tag, Dämmerung und Nacht folgen dem lokal berechneten Home-Assistant-Sonnenstand.",
    };
  return {
    phase: "unknown", source: "unknown",
    note: "Weder eine gültige lokale Luxmessung noch ein verwendbarer Home-Assistant-Sonnenstand ist verfügbar.",
  };
}

function sourceCondition(
  entity: HassEntity | undefined,
  options: WeatherOptions,
  lighting: Lighting,
): WeatherObservation | undefined {
  if (!entity || !entity.entity_id.startsWith("weather.") ||
      !usableTime(entity, options)) return undefined;
  const state = entity.state.toLowerCase().trim();
  const name = typeof entity.attributes.friendly_name === "string"
    ? entity.attributes.friendly_name : "HA-Wetterquelle";
  const note = `Aktueller Zustand der optionalen HA-Wetterquelle „${name}“. Keine Vorhersage wird abgefragt. Lokale Regenraten haben Vorrang; regionale Angaben können keine lokale Niederschlagsmessung ersetzen.`;
  const night = lighting.phase === "night";
  if (["rainy", "pouring", "lightning-rainy"].includes(state))
    return {
      kind: "cloudy", night, lighting: lighting.phase,
      label: night ? "Nachts bewölkt · Wetterquelle" : "Bewölkt · Wetterquelle",
      estimated: false, source: "weather_entity",
      note: `${note} Die Wetterquelle meldet Regen, aber eine positive lokale Regenrate ist nicht bestätigt. Deshalb nur Wolken, kein künstlicher Regen. ${lighting.note}`,
    };
  if (state === "clear-night") {
    if (lighting.phase === "night")
      return {
        kind: "night", night: true, lighting: "night",
        label: "Klare Nacht · Wetterquelle", estimated: false,
        source: "weather_entity", note: `${note} ${lighting.note}`,
      };
    // A regional clear-night state cannot override actual local daylight.
    return undefined;
  }
  if (!["sunny", "partlycloudy", "cloudy"].includes(state))
    return undefined;
  if (night && state === "sunny")
    return {
      kind: "night", night: true, lighting: "night",
      label: "Klare Nacht · Wetterquelle", estimated: false,
      source: "weather_entity", note: `${note} ${lighting.note}`,
    };
  if (lighting.phase === "twilight" && state === "sunny")
    return {
      kind: "daylight", lighting: "twilight",
      label: "Dämmerung", estimated: false,
      source: "weather_entity", note: `${note} ${lighting.note}`,
    };
  const kind = state as "partlycloudy" | "cloudy" | "sunny";
  return {
    kind, night, lighting: lighting.phase,
    label: kind === "sunny" ? "Sonnig · Wetterquelle" :
      kind === "partlycloudy" ? night ? "Teilweise bewölkte Nacht" :
        "Teilweise bewölkt · Wetterquelle" :
        night ? "Bewölkte Nacht" : "Bewölkt · Wetterquelle",
    estimated: false, source: "weather_entity",
    note: `${note} ${lighting.note}`,
  };
}

/**
 * Positive local precipitation rates have priority. Surface moisture is ignored
 * for sky classification and remains a separate live status in the parent card.
 */
/**
 * Rain is always determined from local measurement, never from met.no.
 * Light is measured locally when possible, sun.sun is only the fallback
 * and a check against physically implausible day/night readings.
 */
export function observeWeather(
  sun: HassEntity | undefined,
  solar: Reading,
  rainRate: Reading,
  _wet: Reading,
  options: WeatherOptions = {},
): WeatherObservation {
  const lighting = determineLighting(sun, options);
  const selected = selectRainRate(rainRate, options.secondaryRainRate, options);
  const rain = measuredRain(selected.reading, selected.source, options);
  if (rain) return {
    ...rain, night: lighting.phase === "night", lighting: lighting.phase,
    note: `${rain.note} ${lighting.note}`,
  };

  const condition = sourceCondition(options.conditionEntity, options, lighting);
  if (condition) return condition;

  if (lighting.phase === "night")
    return {
      kind: "night", night: true, lighting: "night", label: "Nacht",
      estimated: false, source: lighting.source === "lux" ? "lux" : "sun",
      note: `${lighting.note} Eine wolkenfreie oder niederschlagsfreie Nacht wird daraus nicht abgeleitet. Die Nachtszene ist ohne Wetterquelle nur dekorativ.`,
    };
  if (lighting.phase === "twilight")
    return {
      kind: "daylight", lighting: "twilight", label: "Dämmerung",
      estimated: false, source: lighting.source === "lux" ? "lux" : "sun",
      note: `${lighting.note} Bei niedriger Helligkeit wird keine direkte Sonne behauptet.`,
    };
  if (lighting.phase === "unknown")
    return unknown(`${lighting.note} Für den Himmelszustand wird eine lokale Luxquelle oder sun.sun benötigt.`);

  const astro = astronomicalPhase(sun, options);
  const altitude = astro.altitude;
  if (altitude === null || altitude < MIN_SKY_ELEVATION)
    return {
      kind: "daylight", lighting: "day", label: "Tag · Sonnenstand niedrig oder unbekannt",
      estimated: false, source: lighting.source === "lux" ? "lux" : "sun",
      note: `${lighting.note} Bei niedrigem Sonnenstand: direkte Sonne wird nicht behauptet; aus einem Strahlungswert wird keine Wolkenbedeckung abgeleitet.`,
    };
  if (!validObservation(solar, "solar", options))
    return unknown(
      "Für eine lokale Himmelsabschätzung WS90-Globalstrahlung in W/m² oder kW/m² zuordnen und den Zustand prüfen. Eine ausgewählte HA-Wetterentität kann ihren aktuellen Zustand liefern.",
    );
  const irradiance =
    solar.value * (solar.unit === "kW/m²" || solar.unit === "kW/m2" ? 1000 : 1);
  const clear = clearSkyIrradiance(altitude);
  if (!Number.isFinite(irradiance) || clear === null || clear <= 0)
    return unknown(
      "Globalstrahlung und Sonnenhöhe ergeben keinen gültigen Klarhimmelvergleich.",
    );
  const ratio = irradiance / clear;
  if (!Number.isFinite(ratio))
    return unknown(
      "Globalstrahlung und Sonnenhöhe ergeben keinen endlichen Klarhimmelvergleich.",
    );
  const kind: WeatherKind =
    ratio >= SUNNY_RATIO ? "sunny" :
    ratio >= PARTLY_CLOUDY_RATIO ? "partlycloudy" : "cloudy";
  const rateKnown =
    validObservation(rainRate, "rain_rate", options) ||
    validObservation(options.secondaryRainRate, "rain_rate", options);
  return {
    kind, lighting: "day",
    label: kind === "sunny" ? "Sonnig (geschätzt)" :
      kind === "partlycloudy" ? "Teilweise bewölkt (geschätzt)" :
      "Bewölkt (geschätzt)",
    estimated: true, source: "solar", clearSkyRatio: ratio,
    note:
      "Grobe lokale Strahlungsschätzung aus WS90-Globalstrahlung und Sonnenhöhe (Haurwitz). Verschattung, Dunst, Sensorlage und Modellabweichungen können wie Wolken wirken; keine Vorhersage und keine gemessene Wolkenbedeckung. " +
      lighting.note +
      (rateKnown ? "" : " Eine verwendbare Regenrate fehlt; daraus folgt keine Niederschlagsfreiheit."),
  };
}
