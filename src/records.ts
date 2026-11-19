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
  /** Number of selected calendar days whose daily reset was not demonstrated. */
  unverifiedDays?: number;
  state: "ok" | "partial" | "uncertain" | "missing" | "empty" | "unit-conflict";
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
    // The gateway daily gust maximum must stay its own measured HA sensor.
    // Sampling wind_gust periodically cannot reconstruct the true peak.
    const id = configured[key];
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

interface RecordedValue {
  value: number;
  unit: string;
  timestamp: number;
}

/** Daily counters/maxima may still expose yesterday's terminal value at 00:00.
 * Only begin counting a day after observing a reset (a decrease), an initial
 * zero, or a first reading below yesterday's last recorded value.
 * Values preceding a detected reset remain context, never today's extrema.
 * Do not guess a fixed reset time or synthesize max gusts from 7-second samples.
 */
function confirmedDailyReadings(
  all: RecordedValue[],
  start: number,
  end: number,
  zone: string,
): { verified: RecordedValue[]; unverifiedDays: number } {
  const days = new Map<string, RecordedValue[]>();
  for (const reading of all) {
    if (reading.timestamp < start || reading.timestamp >= end) continue;
    const day = haLocalDate(reading.timestamp, zone);
    const readings = days.get(day) ?? [];
    readings.push(reading);
    days.set(day, readings);
  }
  const verified: RecordedValue[] = [];
  let unverifiedDays = 0;
  for (const [day, readings] of days) {
    const midnight = haMidnight(day, zone);
    const previous = all.filter(reading => reading.timestamp < midnight).at(-1);
    const first = readings[0];
    const alreadyReset = first.value === 0 ||
      (previous?.unit === first.unit &&
        (previous.value === 0 || first.value < previous.value));
    if (alreadyReset) {
      verified.push(...readings);
      continue;
    }
    const resetAt = readings.findIndex((reading, i) =>
      i > 0 && reading.unit === readings[i - 1].unit &&
      reading.value < readings[i - 1].value,
    );
    if (resetAt === -1) {
      // No evidence that a positive first value belongs to this day.
      unverifiedDays++;
      continue;
    }
    verified.push(...readings.slice(resetAt));
  }
  return { verified, unverifiedDays };
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
    filter_entity_id: ids.join(","),
    end_time: new Date(end).toISOString(),
    significant_changes_only: "0",
  });
  // Intentionally retain HA's preceding initial state as comparison context.
  // Its timestamp is never eligible as a record if it predates the selection.
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
    if (!Number.isFinite(timestamp) || timestamp >= end)
      continue;
    const list = byId.get(state.entity_id) ?? [];
    list.push(state);
    byId.set(state.entity_id, list);
  }
  for (const record of records) {
    if (!record.entityId) continue;
    const rows = byId.get(record.entityId) ?? [];
    const all = rows.flatMap(row => {
      const data = acceptable(record.key, row);
      if (!data) return [];
      return [{ ...data, timestamp: Date.parse(row.last_updated ?? row.last_changed ?? "") }];
    }).sort((a, b) => a.timestamp - b.timestamp);
    const inRange = all.filter(entry => entry.timestamp >= start && entry.timestamp < end);
    const units = [...new Set(inRange.map(entry => entry.unit))];
    if (units.length > 1) {
      record.state = "unit-conflict";
      continue;
    }
    const isDaily = record.key === "rain_today" || record.key === "wind_gust_max";
    const daily = isDaily
      ? confirmedDailyReadings(all, start, end, timeZone)
      : { verified: inRange, unverifiedDays: 0 };
    const entries = daily.verified;
    record.samples = entries.length;
    record.unverifiedDays = daily.unverifiedDays;
    if (!entries.length) {
      if (daily.unverifiedDays) record.state = "uncertain";
      continue;
    }
    const max = entries.reduce((best, entry) =>
      entry.value > best.value ? entry : best);
    record.value = max.value;
    record.unit = max.unit;
    record.timestamp = max.timestamp;
    record.state = daily.unverifiedDays ? "partial" : "ok";
  }
  return {
    ...base, start, end, status: records.some(r => r.state === "ok" || r.state === "partial") ? "ok" : "empty",
    message: "Nur Recorder-Messwerte. Tagesmaxima und Tageszähler werden erst nach erkennbarer Rücksetzung berücksichtigt. Fehlende Rücksetz-Nachweise und Aufzeichnungslücken können Rekorde verbergen.",
  };
}
