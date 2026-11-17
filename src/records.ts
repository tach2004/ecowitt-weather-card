import { isUnitValid, numericState } from "./data";
import type { HassEntity, HomeAssistant, MetricKey } from "./types";

/** Only configured sensors and locally retained Recorder states are considered. */
export interface RecordDefinition {
  key: MetricKey;
  title: string;
  group: "wind" | "rain" | "light" | "pressure";
  icon: "wind" | "rain" | "sun" | "pressure";
  color: string;
}

export const RECORD_DEFINITIONS: readonly RecordDefinition[] = [
  { key: "wind_speed", title: "Windgeschwindigkeit", group: "wind", icon: "wind", color: "#209bb7" },
  { key: "wind_gust_max", title: "Stärkste Böe", group: "wind", icon: "wind", color: "#1582c5" },
  { key: "rain_rate", title: "Höchste Regenintensität", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_today", title: "Höchster Tagesregen", group: "rain", icon: "rain", color: "#6e62c9" },
  { key: "solar", title: "Solarstrahlung", group: "light", icon: "sun", color: "#b88117" },
  { key: "solar_lux", title: "Beleuchtungsstärke", group: "light", icon: "sun", color: "#b47b24" },
  { key: "uv", title: "UV-Index", group: "light", icon: "sun", color: "#ab5688" },
  { key: "pressure_absolute", title: "Luftdruck absolut", group: "pressure", icon: "pressure", color: "#6a83ad" },
  { key: "pressure", title: "Luftdruck relativ", group: "pressure", icon: "pressure", color: "#66789b" },
];

export interface WeatherRecord {
  key: MetricKey;
  entityId: string | null;
  value: number | null;
  unit: string;
  timestamp: number | null;
  samples: number;
  state: "ok" | "missing" | "empty" | "unit-conflict";
}
export interface WeatherRecordsResult {
  status: "ok" | "empty" | "unavailable" | "error";
  records: WeatherRecord[];
  from: string;
  to: string;
  start: number | null;
  end: number | null;
  timeZone: string;
  message: string;
}

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const utcNoon = (text: string): number | null => {
  if (!DATE.test(text)) return null;
  const ms = Date.parse(`${text}T12:00:00.000Z`);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString().slice(0, 10) === text
    ? ms : null;
};

/** A HA-local calendar midnight, including DST's 23/25-hour days. */
export function haMidnight(date: string, timeZone: string): number {
  const noon = utcNoon(date);
  if (noon === null) throw new Error("Ungültiges Datum");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const localDate = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const part = (key: string) => parts.find(p => p.type === key)?.value ?? "";
    return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
  };
  let lo = noon - 3 * DAY;
  let hi = noon + 3 * DAY;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(mid) >= date) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function haLocalDate(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find(p => p.type === key)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

export function daysBeforeDate(date: string, days: number): string {
  const noon = utcNoon(date);
  if (noon === null) return date;
  return new Date(noon - days * DAY).toISOString().slice(0, 10);
}

export function selectedRecordSources(
  configured: Partial<Record<MetricKey, string>>,
  states: HomeAssistant["states"],
): WeatherRecord[] {
  return RECORD_DEFINITIONS.map(({ key }) => {
    // A configured daily maximum gust is preferred; otherwise use the actual gust.
    const id = key === "wind_gust_max"
      ? [configured.wind_gust_max, configured.wind_gust].find(
          candidate => candidate && states[candidate],
        )
      : configured[key];
    return {
      key, entityId: id && states[id] ? id : null,
      value: null, unit: "", timestamp: null, samples: 0,
      state: id && states[id] ? "empty" as const : "missing" as const,
    };
  });
}

function acceptable(key: MetricKey, row: HassEntity) {
  const value = numericState(row.state);
  const unit = row.attributes?.unit_of_measurement ?? (key === "uv" ? "" : undefined);
  if (value === null || typeof unit !== "string" || !isUnitValid(key, unit))
    return null;
  if (value < 0) return null; // All displayed records are nonnegative physical metrics.
  return { value, unit };
}

/** Include only states recorded inside the selected HA-local calendar dates.
 * Never treat the Recorder's preceding boundary state as a new measurement.
 */
export async function loadWeatherRecords(
  hass: HomeAssistant,
  configured: Partial<Record<MetricKey, string>>,
  from: string,
  to: string,
  now = Date.now(),
): Promise<WeatherRecordsResult> {
  const timeZone = hass.config?.time_zone ?? "";
  const records = selectedRecordSources(configured, hass.states);
  const base = { records, from, to, start: null, end: null, timeZone };
  if (!timeZone) return {
    ...base, status: "unavailable", message: "Die Home-Assistant-Zeitzone fehlt.",
  };
  let start: number, end: number;
  try {
    if (from > to || utcNoon(from) === null || utcNoon(to) === null)
      throw new Error("Ungültiger Zeitraum");
    start = haMidnight(from, timeZone);
    end = Math.min(haMidnight(daysBeforeDate(to, -1), timeZone), now);
  } catch {
    return {
      ...base, status: "unavailable",
      message: "Bitte gültige Datumsangaben in aufsteigender Reihenfolge auswählen.",
    };
  }
  if (start >= end) return {
    ...base, start, end, status: "unavailable",
    message: "Der Zeitraum liegt in der Zukunft oder enthält keine vergangenen Stunden.",
  };
  if (!records.some(r => r.entityId)) return {
    ...base, start, end, status: "empty",
    message: "Für Rekorde sind noch keine passenden Messquellen zugeordnet.",
  };
  if (!hass.callApi) return {
    ...base, start, end, status: "unavailable",
    message: "Die lokale Home-Assistant-Recorder-API ist nicht verfügbar.",
  };

  const ids = [...new Set(records.flatMap(r => r.entityId ? [r.entityId] : []))];
  const query = new URLSearchParams({
    filter_entity_id: ids.join(","), end_time: new Date(end).toISOString(),
  });
  let response: unknown;
  try {
    response = await hass.callApi<unknown>(
      "GET", `history/period/${new Date(start).toISOString()}?${query}`,
    );
  } catch {
    return {
      ...base, start, end, status: "error",
      message: "Rekorde konnten nicht aus dem lokalen Recorder geladen werden. Aufbewahrung und Berechtigungen prüfen.",
    };
  }
  if (!Array.isArray(response) || response.some(group => !Array.isArray(group)))
    return {
      ...base, start, end, status: "error",
      message: "Home Assistant hat eine unerwartete Recorder-Antwort geliefert.",
    };
  const byId = new Map<string, HassEntity[]>();
  for (const row of response.flat()) {
    if (!row || typeof row !== "object") continue;
    const state = row as HassEntity;
    if (typeof state.entity_id !== "string" || !ids.includes(state.entity_id))
      continue;
    const timestamp = Date.parse(state.last_updated ?? state.last_changed ?? "");
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end)
      continue;
    const list = byId.get(state.entity_id) ?? [];
    list.push(state);
    byId.set(state.entity_id, list);
  }
  for (const record of records) {
    if (!record.entityId) continue;
    const rows = byId.get(record.entityId) ?? [];
    const entries = rows.flatMap(row => {
      const data = acceptable(record.key, row);
      if (!data) return [];
      return [{ ...data, timestamp: Date.parse(row.last_updated ?? row.last_changed ?? "") }];
    });
    const units = [...new Set(entries.map(entry => entry.unit))];
    if (units.length > 1) {
      record.state = "unit-conflict";
      continue;
    }
    record.samples = entries.length;
    if (!entries.length) continue;
    const max = entries.reduce((best, entry) =>
      entry.value > best.value ? entry : best);
    record.value = max.value;
    record.unit = max.unit;
    record.timestamp = max.timestamp;
    record.state = "ok";
  }
  return {
    ...base, start, end, status: records.some(r => r.state === "ok") ? "ok" : "empty",
    message: "Nur tatsächlich aufgezeichnete Recorder-Messwerte. Lücken und die Aufbewahrungsfrist können die wahren Höchstwerte verbergen.",
  };
}
