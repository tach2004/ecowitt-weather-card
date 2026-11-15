import {
  entityFreshness,
  isUnitValid,
  numericState,
  type Reading,
} from "./data";
import type { HassEntity } from "./types";

/** Local observations and explicitly selected HA conditions; never a forecast. */
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
  source?: "wh40" | "ws90" | "weather_entity" | "solar" | "sun";
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
  key: "solar" | "rain_rate",
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
function sourceCondition(
  entity: HassEntity | undefined,
  options: WeatherOptions,
  isNight: boolean,
  isDay: boolean,
): WeatherObservation | undefined {
  if (
    !entity ||
    !entity.entity_id.startsWith("weather.") ||
    !usableTime(entity, options)
  )
    return undefined;
  const state = entity.state.toLowerCase().trim();
  const label =
    typeof entity.attributes.friendly_name === "string"
      ? entity.attributes.friendly_name
      : "HA-Wetterquelle";
  const note = `Aktueller Zustand der ausgewählten HA-Wetterquelle „${label}“. Keine Vorhersage wird abgerufen; der Anbieter dieser HA-Entität kann eigene Datenquellen verwenden.`;
  if (["rainy", "pouring", "lightning-rainy"].includes(state))
    return {
      kind: "unknown",
      label: "Regen laut Wetterquelle",
      estimated: false,
      source: "weather_entity",
      note: `${note} Eine positive lokale Regenrate wurde nicht bestätigt. Für eine lokale Regenanimation WH40 oder eine tatsächliche WS90-Regenrate zuordnen; Piezo-NASS genügt nicht.`,
    };
  if (state === "clear-night" && isDay)
    return unknown(
      "Wetterquelle und Sonnenstatus widersprechen sich; keine Nachtanzeige bei bestätigtem Tageslicht.",
    );
  if (
    state === "clear-night" ||
    (isNight && ["sunny", "partlycloudy", "cloudy"].includes(state))
  )
    return {
      kind: "night",
      label: "Nacht",
      estimated: false,
      source: "weather_entity",
      note,
    };
  const kind = (
    { sunny: "sunny", partlycloudy: "partlycloudy", cloudy: "cloudy" } as const
  )[state as "sunny" | "partlycloudy" | "cloudy"];
  if (!kind) return undefined;
  return {
    kind,
    label:
      kind === "sunny"
        ? "Sonnig · Wetterquelle"
        : kind === "partlycloudy"
          ? "Teilweise bewölkt · Wetterquelle"
          : "Bewölkt · Wetterquelle",
    estimated: false,
    source: "weather_entity",
    note,
  };
}

/**
 * Positive local precipitation rates have priority. Surface moisture is ignored
 * for sky classification and remains a separate live status in the parent card.
 */
export function observeWeather(
  sun: HassEntity | undefined,
  solar: Reading,
  rainRate: Reading,
  _wet: Reading,
  options: WeatherOptions = {},
): WeatherObservation {
  const rain =
    measuredRain(rainRate, "wh40", options) ??
    measuredRain(options.secondaryRainRate, "ws90", options);
  if (rain) return rain;
  const validSun = Boolean(
    sun &&
    ["above_horizon", "below_horizon"].includes(sun.state) &&
    usableTime(sun, options),
  );
  const altitude = validSun && sun ? elevationOf(sun) : null;
  const isNight = Boolean(
    validSun &&
    sun?.state === "below_horizon" &&
    (sun.attributes.elevation === undefined ||
      (altitude !== null && altitude <= 0)),
  );
  const condition = sourceCondition(
    options.conditionEntity,
    options,
    isNight,
    Boolean(
      validSun &&
      sun?.state === "above_horizon" &&
      altitude !== null &&
      altitude >= 0,
    ),
  );
  if (condition) return condition;
  if (!validSun || !sun)
    return unknown(
      "Für Tag/Nacht und die lokale Himmelsabschätzung fehlt ein verwendbarer Sonnenzustand aus sun.sun. Regen benötigt davon unabhängig eine zugeordnete Regenrate.",
    );
  if (sun.state === "below_horizon") {
    if (!isNight)
      return unknown(
        "Sonnenstatus und Sonnenhöhe sind ungültig oder widersprüchlich.",
      );
    return {
      kind: "night",
      label: "Nacht",
      estimated: false,
      source: "sun",
      note: "Astronomischer Nachtstatus aus Home Assistant. Eine wolkenfreie oder niederschlagsfreie Nacht wird daraus nicht abgeleitet.",
    };
  }
  if (altitude === null || altitude < 0)
    return unknown(
      "Für die lokale Himmelsabschätzung fehlt eine gültige Sonnenhöhe.",
    );
  if (altitude < MIN_SKY_ELEVATION)
    return {
      kind: "daylight",
      label: "Tag · tiefer Sonnenstand",
      estimated: false,
      source: "sun",
      note: "Die Sonne steht über dem Horizont. Bei tiefem Sonnenstand sind Wolken aus einem einzelnen Strahlungswert nicht zuverlässig bestimmbar. Eine neutrale Tageslichtszene ersetzt deshalb die bisherige Fehlermeldung; direkte Sonne wird nicht behauptet.",
    };
  if (!validObservation(solar, "solar", options))
    return unknown(
      "Für eine lokale Himmelsabschätzung WS90-Globalstrahlung in W/m² oder kW/m² zuordnen und den Zustand der Quelle prüfen. Eine ausgewählte HA-Wetterentität kann alternativ ihren aktuellen Zustand liefern.",
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
    ratio >= SUNNY_RATIO
      ? "sunny"
      : ratio >= PARTLY_CLOUDY_RATIO
        ? "partlycloudy"
        : "cloudy";
  const rateKnown =
    validObservation(rainRate, "rain_rate", options) ||
    validObservation(options.secondaryRainRate, "rain_rate", options);
  return {
    kind,
    label:
      kind === "sunny"
        ? "Sonnig (geschätzt)"
        : kind === "partlycloudy"
          ? "Teilweise bewölkt (geschätzt)"
          : "Bewölkt (geschätzt)",
    estimated: true,
    source: "solar",
    clearSkyRatio: ratio,
    note:
      "Grobe lokale Strahlungsschätzung aus WS90-Globalstrahlung und Sonnenhöhe (Haurwitz). Verschattung, Dunst, Sensorlage und Modellabweichungen können wie Wolken wirken. Temperatur, Feuchte und Luftdruck erlauben keine eindeutige Wolken- oder Regenbestimmung; keine Vorhersage und keine gemessene Wolkenbedeckung." +
      (rateKnown
        ? ""
        : " Eine verwendbare Regenrate fehlt; daraus folgt keine Niederschlagsfreiheit."),
  };
}
