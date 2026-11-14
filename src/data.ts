import type { CardConfig, HassEntity, HomeAssistant, MetricKey } from "./types";

export type ReadingStatus =
  | "ok"
  | "missing"
  | "unavailable"
  | "invalid"
  | "stale";
export interface Reading {
  value: number | null;
  text: string;
  unit: string;
  status: ReadingStatus;
  entity?: HassEntity;
  note?: string;
}
export type WetStatus = "wet" | "dry" | "unavailable";

/** Meteorological bearing: north=0, east=90. Never rotate the background. */
export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
export function flowBearing(from: number): number {
  return normalizeDegrees(from + 180);
}
/** An accumulated rotation lets CSS animate across north by the shortest arc. */
export function unwrapDegrees(previous: number, next: number): number {
  return previous + normalizeDegrees(next - previous + 180) - 180;
}
export function directionLabel(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const compass = [
    "N",
    "NNO",
    "NO",
    "ONO",
    "O",
    "OSO",
    "SO",
    "SSO",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return compass[Math.round(normalizeDegrees(value) / 22.5) % 16];
}

/** Only HA's binary on/off states establish wet/dry. Amount or rate is unrelated. */
export function getWetStatus(entity?: HassEntity): WetStatus {
  if (
    typeof entity?.entity_id !== "string" ||
    !entity.entity_id.startsWith("binary_sensor.") ||
    (entity.attributes.device_class &&
      entity.attributes.device_class !== "moisture")
  )
    return "unavailable";
  if (entity?.state === "on") return "wet";
  if (entity?.state === "off") return "dry";
  return "unavailable";
}

const speed = new Set(["m/s", "km/h", "mph", "kn", "knots", "ft/s"]);
const temperature = new Set(["°C", "°F", "K"]);
const pressure = new Set([
  "Pa",
  "hPa",
  "kPa",
  "bar",
  "cbar",
  "mbar",
  "inHg",
  "mmHg",
  "psi",
]);
const precipitation = new Set(["mm", "cm", "m", "in"]);
const precipitationRate = new Set([
  "mm/h",
  "cm/h",
  "m/h",
  "in/h",
  "mm/hr",
  "cm/hr",
  "in/hr",
]);
const solar = new Set(["W/m²", "W/m2", "kW/m²", "kW/m2"]);
const illuminance = new Set(["lx", "lux", "klx"]);
const vpdUnits = new Set(["kPa", "hPa", "Pa"]);
// Ecowitt Local emits "UV Index". UVI is dimensionless; case changes do not
// change that meaning, while irradiance/illuminance units remain incompatible.
const uvUnits = new Set(["", "uv", "uvi", "uv index", "index"]);

export function isUnitValid(key: MetricKey, unit: string): boolean {
  if (typeof unit !== "string") return false;
  if (key === "rain_wet") return true;
  if (key === "solar_lux") return illuminance.has(unit);
  if (key === "vpd") return vpdUnits.has(unit);
  if (key === "wind_direction" || key === "wind_direction_avg")
    return ["°", "deg", "degrees"].includes(unit);
  if (key.startsWith("wind_")) return speed.has(unit);
  if (
    [
      "temperature",
      "feels_like",
      "dew_point",
      "temperature_min",
      "temperature_max",
    ].includes(key)
  )
    return temperature.has(unit);
  if (key === "humidity") return unit === "%";
  if (key === "pressure") return pressure.has(unit);
  if (key === "uv") return uvUnits.has(unit.trim().toLowerCase());
  if (key === "solar") return solar.has(unit);
  if (key === "rain_rate") return precipitationRate.has(unit);
  return precipitation.has(unit);
}

export function numericState(state: string): number | null {
  if (typeof state !== "string") return null;
  const text = state.trim();
  // HA numeric states are decimal numbers, not JavaScript hex/binary literals.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function validRange(key: MetricKey, value: number): boolean {
  if (key === "wind_direction" || key === "wind_direction_avg")
    return value >= 0 && value <= 360;
  if (key === "humidity") return value >= 0 && value <= 100;
  if (
    key.startsWith("wind_") ||
    key.startsWith("rain_") ||
    key === "solar" ||
    key === "solar_lux" ||
    key === "vpd" ||
    key === "uv" ||
    key === "pressure"
  )
    return value >= 0;
  return true;
}

function format(value: number, key: MetricKey): string {
  const whole = [
    "wind_direction",
    "wind_direction_avg",
    "humidity",
    "pressure",
    "solar",
    "solar_lux",
  ].includes(key);
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: whole ? 0 : 1,
    maximumFractionDigits: key.startsWith("wind_direction") ? 0 : 1,
  }).format(value);
}

/** Source units are displayed unchanged. No guessed unit conversions or fallback values. */
export function getReading(
  hass: HomeAssistant | undefined,
  config: CardConfig,
  key: MetricKey,
  now = Date.now(),
): Reading {
  const id = config.entities?.[key];
  const entity = id ? hass?.states[id] : undefined;
  const rawUnit = entity?.attributes.unit_of_measurement;
  const unit = typeof rawUnit === "string" ? rawUnit : "";
  if (!entity)
    return {
      value: null,
      text: "—",
      unit: "",
      status: "missing",
      note: id
        ? "Entität in Home Assistant nicht gefunden"
        : "Im Karteneditor zuordnen",
    };
  const base = { entity, unit };
  if (key === "rain_wet") {
    const wet = getWetStatus(entity);
    if (wet === "unavailable")
      return {
        ...base,
        value: null,
        text: "UNAVAILABLE",
        status: "unavailable",
        note: "WS90-Feuchtigkeitsquelle prüfen: binärer Feuchtesensor mit on/off erforderlich",
      };
    return withAge(
      {
        ...base,
        value: wet === "wet" ? 1 : 0,
        text: wet === "wet" ? "NASS" : "TROCKEN",
        unit: "",
        status: "ok",
      },
      config,
      now,
    );
  }
  if (["unknown", "unavailable"].includes(entity.state))
    return {
      ...base,
      value: null,
      text: "—",
      status: "unavailable",
      note: "Quelle meldet nicht verfügbar",
    };
  const value = numericState(entity.state);
  if (value === null || !validRange(key, value))
    return {
      ...base,
      value: null,
      text: "—",
      status: "invalid",
      note: "Kein gültiger Messwert für diese Messgröße",
    };
  if (
    (rawUnit != null && typeof rawUnit !== "string") ||
    !isUnitValid(key, unit)
  )
    return {
      ...base,
      value: null,
      text: "—",
      status: "invalid",
      note: unit
        ? `Unpassende Einheit: ${unit}`
        : "Die Quelle hat keine passende Einheit",
    };
  const normalized = key.startsWith("wind_direction")
    ? normalizeDegrees(value)
    : value;
  return withAge(
    { ...base, value: normalized, text: format(normalized, key), status: "ok" },
    config,
    now,
  );
}

export interface FreshnessOptions {
  staleAfterMinutes?: number;
  now?: number;
}
export interface EntityFreshness {
  status: "current" | "stale" | "invalid" | "unknown";
  timestamp?: number;
  note?: string;
}

/** Last reported refresh can be newer than the last *changed* HA state.
 * Missing timestamps never establish freshness. One minute of clock skew is
 * tolerated; a further future timestamp is invalid even with aging disabled.
 */
export function entityFreshness(
  entity: HassEntity | undefined,
  options: FreshnessOptions = {},
): EntityFreshness {
  const now = Number.isFinite(options.now) ? options.now! : Date.now();
  const timestamps = [entity?.last_reported, entity?.last_updated].flatMap(
    (value) => {
      if (typeof value !== "string") return [];
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? [timestamp] : [];
    },
  );
  if (!timestamps.length)
    return {
      status: "unknown",
      note: "Kein gültiger HA-Aktualisierungszeitpunkt verfügbar",
    };
  const timestamp = Math.max(...timestamps);
  if (timestamp > now + 60_000)
    return {
      status: "invalid",
      timestamp,
      note: "HA-Aktualisierungszeitpunkt liegt in der Zukunft; Uhrzeit prüfen",
    };
  const minutes = options.staleAfterMinutes;
  if (
    typeof minutes === "number" &&
    Number.isFinite(minutes) &&
    minutes > 0 &&
    now - timestamp > minutes * 60_000
  )
    return {
      status: "stale",
      timestamp,
      note: `Seit mehr als ${minutes} Minuten nicht aktualisiert`,
    };
  return { status: "current", timestamp };
}

function withAge(reading: Reading, config: CardConfig, now: number): Reading {
  const age = entityFreshness(reading.entity, {
    staleAfterMinutes: config.stale_after_minutes,
    now,
  });
  if (age.status === "invalid")
    return {
      ...reading,
      value: null,
      text: "—",
      status: "invalid",
      note: age.note,
    };
  if (
    age.status === "stale" ||
    (age.status === "unknown" && (config.stale_after_minutes ?? 0) > 0)
  ) {
    return {
      ...reading,
      status: "stale",
      note: age.note,
    };
  }
  return age.status === "unknown" ? { ...reading, note: age.note } : reading;
}
