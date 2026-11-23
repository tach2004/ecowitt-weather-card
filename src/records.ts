import { isUnitValid, isValueValid, numericState } from "./data";
import { weatherExtraDetail } from "./detail-extras";
import type { CardConfig, HassEntity, HomeAssistant, MetricKey } from "./types";

/** Only configured sensors and locally retained Recorder states are considered. */
export const RECORD_GROUPS = {
  temperature: { title: "Temperatur", icon: "temperature", color: "#d77940" },
  wind: { title: "Wind", icon: "wind", color: "#209bb7" },
  rain: { title: "Niederschlag", icon: "rain", color: "#326bd5" },
  humidity: { title: "Luftfeuchte", icon: "humidity", color: "#209bb7" },
  sun: { title: "Sonne & UV", icon: "sun", color: "#b88117" },
  pressure: { title: "Luftdruck", icon: "pressure", color: "#6a83ad" },
  extra: { title: "Weitere Messwerte", icon: "sensors", color: "#6a83ad" },
} as const;

interface RecordDefinition {
  key: MetricKey | "extra";
  title: string;
  group: keyof typeof RECORD_GROUPS;
  icon: string;
  color: string;
}

const recordDefinitions: readonly RecordDefinition[] = [
  { key: "temperature", title: "Temperatur", group: "temperature", icon: "temperature", color: "#d77940" },
  { key: "feels_like", title: "Gefühlte Temperatur", group: "temperature", icon: "temperature", color: "#d77940" },
  { key: "temperature_min", title: "Höchstes Tagesminimum", group: "temperature", icon: "temperature", color: "#d77940" },
  { key: "temperature_max", title: "Temperatur-Tagesmaximum", group: "temperature", icon: "temperature", color: "#d77940" },
  { key: "vpd", title: "Dampfdruckdefizit", group: "temperature", icon: "humidity", color: "#209bb7" },
  { key: "wind_speed", title: "Windgeschwindigkeit", group: "wind", icon: "wind", color: "#209bb7" },
  { key: "wind_gust_max", title: "Stärkste Böe", group: "wind", icon: "wind", color: "#1582c5" },
  { key: "wind_gust", title: "Höchste aufgezeichnete Einzelböe", group: "wind", icon: "wind", color: "#1582c5" },
  { key: "wind_speed_avg", title: "Mittlere Windgeschwindigkeit", group: "wind", icon: "wind", color: "#209bb7" },
  { key: "wind_direction", title: "Größter Richtungswinkel", group: "wind", icon: "wind", color: "#209bb7" },
  { key: "wind_direction_avg", title: "Größter mittlerer Richtungswinkel", group: "wind", icon: "wind", color: "#209bb7" },
  { key: "rain_rate", title: "Höchste Regenintensität", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_today", title: "Höchster Tagesregen", group: "rain", icon: "rain", color: "#6e62c9" },
  { key: "rain_rate_secondary", title: "Zusätzliche Regenrate", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_24h", title: "Regen in gleitenden 24 Stunden", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_week", title: "Regen in der Kalenderwoche", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_month", title: "Regen im Kalendermonat", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_year", title: "Regen im Kalenderjahr", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "rain_event", title: "Regenereignis", group: "rain", icon: "rain", color: "#326bd5" },
  { key: "humidity", title: "Rel. Luftfeuchte", group: "humidity", icon: "humidity", color: "#209bb7" },
  { key: "absolute_humidity", title: "Abs. Luftfeuchte", group: "humidity", icon: "humidity", color: "#209bb7" },
  { key: "dew_point", title: "Taupunkt", group: "humidity", icon: "temperature", color: "#d77940" },
  { key: "solar", title: "Solarstrahlung", group: "sun", icon: "sun", color: "#b88117" },
  { key: "solar_lux", title: "Beleuchtungsstärke", group: "sun", icon: "sun", color: "#b47b24" },
  { key: "uv", title: "UV-Index", group: "sun", icon: "sun", color: "#ab5688" },
  { key: "pressure", title: "Luftdruck relativ", group: "pressure", icon: "pressure", color: "#66789b" },
  { key: "pressure_absolute", title: "Luftdruck absolut", group: "pressure", icon: "pressure", color: "#6a83ad" },
];

const legacyRecordKeys: readonly MetricKey[] = [
  "wind_speed", "wind_gust_max", "rain_rate", "rain_today",
  "solar", "solar_lux", "uv", "pressure_absolute", "pressure",
];
const definitions = new Map(recordDefinitions.map(definition => [definition.key, definition]));
const recordOrder = new Map(recordDefinitions.map((definition, index) => [definition.key, index]));

interface RecordSource extends RecordDefinition {
  entityId: string;
}

export interface WeatherRecord extends RecordSource {
  /** The highest recorded value and its time. */
  value: number | null;
  unit: string;
  timestamp: number | null;
  minimum?: Pick<RecordedValue, "value" | "timestamp">;
  samples: number;
  /** Number of selected calendar days whose daily reset was not demonstrated. */
  unverifiedDays?: number;
  state: "ok" | "partial" | "uncertain" | "missing" | "empty" | "unit-conflict";
}

export function recordHasExtremaPair(record: WeatherRecord): boolean {
  return record.key === "temperature" || record.key === "feels_like" ||
    record.group === "humidity" || record.group === "pressure";
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

export function enabledRecordEntities(config: CardConfig): Set<string> {
  return new Set(config.record_entities ?? legacyRecordKeys.flatMap(key => {
    const id = config.entities?.[key];
    return id ? [id] : [];
  }));
}

function additionalDefinition(id: string, entity?: HassEntity): RecordDefinition {
  const attributes = entity?.attributes;
  const unit = attributes?.unit_of_measurement ?? "";
  const deviceClass = attributes?.device_class;
  const name = `${attributes?.friendly_name ?? ""} ${id}`;
  if (deviceClass === "absolute_humidity" ||
      (isUnitValid("absolute_humidity", unit) && /(?:feucht|humidity)/i.test(name)))
    return definitions.get("absolute_humidity")!;
  if (deviceClass === "humidity" ||
    (!deviceClass && unit === "%" && /luftfeucht|humidity/i.test(name)))
    return definitions.get("humidity")!;
  if (deviceClass === "temperature" || isUnitValid("temperature", unit)) {
    const key = /gefühl|feels.?like|apparent/i.test(name) ? "feels_like" :
      /taupunkt|dew.?point/i.test(name) ? "dew_point" : "temperature";
    return definitions.get(key)!;
  }
  const group = weatherExtraDetail(id, entity) ?? "extra";
  return {
    ...RECORD_GROUPS[group],
    key: "extra", group,
    title: attributes?.friendly_name || "Zusätzlicher Messwert",
  };
}

/** One record per assigned sensor, including additional devices and older lists. */
export function configuredRecordSources(
  config: CardConfig,
  states: HomeAssistant["states"],
): RecordSource[] {
  const sources = new Map<string, RecordSource>();
  const add = (id: string | undefined, definition?: RecordDefinition) => {
    if (!id?.startsWith("sensor.") || sources.has(id)) return;
    const entity = states[id];
    if (["enum", "connectivity"].includes(entity?.attributes.device_class ?? "")) return;
    sources.set(id, { ...(definition ?? additionalDefinition(id, entity)), entityId: id });
  };
  for (const definition of recordDefinitions) {
    if (definition.key !== "extra") add(config.entities?.[definition.key], definition);
  }
  for (const device of config.device_status ?? []) {
    add(device.battery);
    add(device.signal);
    for (const id of device.extra_entities ?? []) add(id);
  }
  for (const id of [...(config.extra_entities ?? []), ...(config.diagnostic_entities ?? [])])
    add(id);
  return [...sources.values()].sort((a, b) =>
    (recordOrder.get(a.key) ?? recordDefinitions.length) -
    (recordOrder.get(b.key) ?? recordDefinitions.length));
}

export function selectedRecordSources(
  config: CardConfig,
  states: HomeAssistant["states"],
): WeatherRecord[] {
  const enabled = enabledRecordEntities(config);
  return configuredRecordSources(config, states)
    .filter(source => enabled.has(source.entityId))
    .map(source => ({
      ...source,
      value: null, unit: "", timestamp: null, samples: 0,
      state: states[source.entityId] ? "empty" : "missing",
    }));
}

function acceptable(key: RecordDefinition["key"], row: HassEntity) {
  const value = numericState(row.state);
  const unit = row.attributes?.unit_of_measurement ?? "";
  if (value === null || typeof unit !== "string") return null;
  if (key !== "extra" && (!isUnitValid(key, unit) || !isValueValid(key, value))) return null;
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
  config: CardConfig,
  from: string,
  to: string,
  now = Date.now(),
): Promise<WeatherRecordsResult> {
  const timeZone = hass.config?.time_zone ?? "";
  const records = selectedRecordSources(config, hass.states);
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
  if (!records.length) return {
    ...base, start, end, status: "empty",
    message: "Im Karteneditor unter Wetterrekorde Messquellen auswählen.",
  };
  const ids = new Set(records.filter(r => r.state !== "missing").map(r => r.entityId));
  if (!ids.size) return {
    ...base, start, end, status: "empty",
    message: "Die für Rekorde ausgewählten Entitäten sind derzeit nicht in Home Assistant verfügbar.",
  };
  if (!hass.callApi) return {
    ...base, start, end, status: "unavailable",
    message: "Die lokale Home-Assistant-Recorder-API ist nicht verfügbar.",
  };

  const query = new URLSearchParams({
    filter_entity_id: [...ids].join(","),
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
    if (typeof state.entity_id !== "string" || !ids.has(state.entity_id))
      continue;
    const timestamp = Date.parse(state.last_updated ?? state.last_changed ?? "");
    if (!Number.isFinite(timestamp) || timestamp >= end)
      continue;
    const list = byId.get(state.entity_id) ?? [];
    list.push(state);
    byId.set(state.entity_id, list);
  }
  for (const record of records) {
    if (record.state === "missing") continue;
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
    if (recordHasExtremaPair(record)) {
      const min = entries.reduce((best, entry) =>
        entry.value < best.value ? entry : best);
      record.minimum = { value: min.value, timestamp: min.timestamp };
    }
    record.state = daily.unverifiedDays ? "partial" : "ok";
  }
  const hasDailySource = records.some(r => r.key === "rain_today" || r.key === "wind_gust_max");
  return {
    ...base, start, end, status: records.some(r => r.state === "ok" || r.state === "partial") ? "ok" : "empty",
    message: hasDailySource
      ? "Nur Recorder-Messwerte. Tagesregen und die gespeicherte Tagesmaximalböe werden erst nach erkennbarer Rücksetzung berücksichtigt. Fehlende Rücksetz-Nachweise und Aufzeichnungslücken können Rekorde verbergen."
      : "Nur aufgezeichnete Recorder-Messwerte im ausgewählten Zeitraum.",
  };
}
