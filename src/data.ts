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

export function isUnitValid(key: MetricKey, unit: string): boolean {
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
  if (key === "uv")
    return ["", "UV", "UVI", "UV index", "index"].includes(unit);
  if (key === "solar") return solar.has(unit);
  if (key === "rain_rate") return precipitationRate.has(unit);
  return precipitation.has(unit);
}

export function numericState(state: string): number | null {
  if (typeof state !== "string" || state.trim() === "") return null;
  const value = Number(state);
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
  const unit = entity?.attributes.unit_of_measurement ?? "";
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
        note: "WS90-Feuchtigkeitsstatus ist nicht verfügbar oder nicht on/off",
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
  if (!isUnitValid(key, unit))
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

function withAge(reading: Reading, config: CardConfig, now: number): Reading {
  const minutes = config.stale_after_minutes ?? 0;
  const updated = Date.parse(reading.entity?.last_updated ?? "");
  if (
    minutes > 0 &&
    Number.isFinite(updated) &&
    now - updated > minutes * 60_000
  ) {
    return {
      ...reading,
      status: "stale",
      note: `Seit mehr als ${minutes} Minuten nicht aktualisiert`,
    };
  }
  return reading;
}
