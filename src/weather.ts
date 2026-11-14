import {
  entityFreshness,
  isUnitValid,
  numericState,
  type Reading,
} from "./data";
import type { HassEntity } from "./types";

/** Local observations only. Sky conditions are estimates, never a forecast. */
export type WeatherKind =
  | "rain"
  | "sunny"
  | "partlycloudy"
  | "cloudy"
  | "night"
  | "unknown";
export interface WeatherObservation {
  kind: WeatherKind;
  label: string;
  note: string;
  estimated: boolean;
  /** Irradiance/model ratio, not a measured fraction of cloud cover. */
  clearSkyRatio?: number;
}
export interface WeatherOptions {
  now?: number;
  staleAfterMinutes?: number;
}

/**
 * Conservative display policy, not a physical constant or a telemetry guarantee.
 * Weather inference never reuses observations older than 30 minutes; an explicit
 * shorter card freshness threshold can tighten this limit. last_reported helps
 * distinguish unchanged HA states from reports that have stopped arriving.
 */
export const WEATHER_MAX_AGE_MINUTES = 30;
const MIN_SKY_ELEVATION = 12;
// Heuristic irradiance thresholds: shading/haze can look like cloud attenuation.
const SUNNY_RATIO = 0.78;
const PARTLY_CLOUDY_RATIO = 0.4;

/** Haurwitz global horizontal clear-sky irradiance, W/m²; elevation is in degrees. */
export function clearSkyIrradiance(elevation: number): number | null {
  if (!Number.isFinite(elevation) || elevation <= 0 || elevation > 90)
    return null;
  // cos(zenith) = sin(elevation), not cos(elevation).
  const cosZenith = Math.sin((elevation * Math.PI) / 180);
  return 1098 * cosZenith * Math.exp(-0.059 / cosZenith);
}

function unknown(note: string): WeatherObservation {
  return {
    kind: "unknown",
    label: "Wetter nicht bestimmbar",
    note,
    estimated: false,
  };
}
function fresh(
  entity: HassEntity | undefined,
  options: WeatherOptions,
): boolean {
  if (!entity) return false;
  const configured = options.staleAfterMinutes;
  const minutes =
    typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured > 0
      ? Math.min(configured, WEATHER_MAX_AGE_MINUTES)
      : WEATHER_MAX_AGE_MINUTES;
  return (
    entityFreshness(entity, {
      now: options.now,
      staleAfterMinutes: minutes,
    }).status === "current"
  );
}
function validObservation(
  reading: Reading,
  key: "solar" | "rain_rate",
  options: WeatherOptions,
): reading is Reading & { value: number } {
  return (
    reading.status === "ok" &&
    reading.value !== null &&
    Number.isFinite(reading.value) &&
    reading.value >= 0 &&
    isUnitValid(key, reading.unit) &&
    fresh(reading.entity, options)
  );
}
function elevationOf(sun: HassEntity): number | null {
  const elevation = sun.attributes.elevation;
  if (
    (typeof elevation !== "number" && typeof elevation !== "string") ||
    (typeof elevation === "string" && !elevation.trim())
  )
    return null;
  const parsed = numericState(String(elevation));
  return parsed !== null && parsed >= -90 && parsed <= 90 ? parsed : null;
}

/**
 * WH40 measures rain rate. WS90 moisture is independent and stays in its own UI.
 * The unused fourth argument preserves callers while deliberately preventing a
 * wet surface from replacing a simultaneous sky estimate or astronomical night.
 */
export function observeWeather(
  sun: HassEntity | undefined,
  solar: Reading,
  rainRate: Reading,
  _wet: Reading,
  options: WeatherOptions = {},
): WeatherObservation {
  const measuredRate = validObservation(rainRate, "rain_rate", options);
  if (measuredRate && rainRate.value > 0)
    return {
      kind: "rain",
      label: "Regen",
      estimated: false,
      note: "Positive, aktuelle Niederschlagsrate vom WH40 gemessen.",
    };

  if (!sun || !["above_horizon", "below_horizon"].includes(sun.state))
    return unknown(
      "Für die lokale Himmelsabschätzung fehlt ein gültiger Sonnenstatus aus Home Assistant.",
    );
  if (!fresh(sun, options))
    return unknown(
      "Sonnenstand nicht aktuell oder ohne verlässlichen Aktualisierungszeitpunkt; keine Himmelsabschätzung.",
    );

  const altitude = elevationOf(sun);
  // A fresh below-horizon state is enough for astronomical night. A supplied
  // contradictory/invalid elevation must not silently become a night claim.
  if (sun.state === "below_horizon") {
    if (
      sun.attributes.elevation !== undefined &&
      (altitude === null || altitude > 0)
    )
      return unknown(
        "Sonnenstatus und Sonnenhöhe sind ungültig oder widersprüchlich.",
      );
    return {
      kind: "night",
      label: "Nacht",
      estimated: false,
      note: "Sonne unter dem Horizont. Dies ist kein Nachweis für eine wolkenfreie oder niederschlagsfreie Nacht.",
    };
  }
  if (altitude === null)
    return unknown(
      "Für die lokale Himmelsabschätzung fehlt eine gültige Sonnenhöhe.",
    );
  if (altitude < MIN_SKY_ELEVATION)
    return unknown(
      "Sonnenhöhe unter 12°: bei Sonnenaufgang, Sonnenuntergang und tiefem Sonnenstand wird keine Himmelsabschätzung ausgegeben.",
    );
  if (!validObservation(solar, "solar", options))
    return unknown(
      "Für die lokale Himmelsabschätzung fehlt eine gültige, aktuelle Globalstrahlung in W/m² oder kW/m².",
    );

  const scale = solar.unit === "kW/m²" || solar.unit === "kW/m2" ? 1000 : 1;
  const irradiance = solar.value * scale;
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
    ratio >= SUNNY_RATIO
      ? "sunny"
      : ratio >= PARTLY_CLOUDY_RATIO
        ? "partlycloudy"
        : "cloudy";
  return {
    kind,
    label:
      kind === "sunny"
        ? "Sonnig (geschätzt)"
        : kind === "partlycloudy"
          ? "Teilweise bewölkt (geschätzt)"
          : "Bewölkt (geschätzt)",
    estimated: true,
    clearSkyRatio: ratio,
    note:
      "Nur lokale Schätzung anhand WS90-Globalstrahlung und Sonnenhöhe (Haurwitz-Klarhimmelmodell), keine Vorhersage oder gemessene Wolkenbedeckung. Verschattung, Dunst, Sensorposition, Sensorabweichungen und Nebel können das Ergebnis verfälschen." +
      (measuredRate
        ? ""
        : " Die aktuelle Regenrate ist nicht verfügbar; die Himmelsabschätzung trifft keine Aussage über Niederschlag."),
  };
}
