import { entityFreshness, isUnitValid, numericState } from "./data";
import type { HassEntity, HomeAssistant } from "./types";

export interface CalendarDayWindow {
  /** HA-local midnight and the following midnight, as UTC epoch milliseconds. */
  start: number;
  end: number;
  date: string;
  timeZone: string;
}
export interface DailyTemperatureOptions {
  now?: number;
  timeZone?: string;
  /** Coverage hint only; recorded extrema are retained when the live source ages. */
  staleAfterMinutes?: number;
}
export interface DailyTemperatureResult {
  status: "ok" | "partial" | "empty" | "unavailable" | "error";
  min: number | null;
  max: number | null;
  unit: string;
  start: number | null;
  /** The running day's actual request end, never tomorrow or a future timestamp. */
  end: number;
  dayEnd: number | null;
  date: string;
  timeZone: string;
  /** Actual valid Recorder entries in the current day; excludes prior-day context. */
  count: number;
  /** A real preceding HA state was held at midnight, not newly measured today. */
  boundaryContext: boolean;
  note: string;
}

/** Calendar boundaries are found in the HA zone, not the browser's local zone.
 * Searching actual instants handles both 23-hour and 25-hour DST days without
 * adding a fixed 24 hours to midnight.
 */
export function calendarDayWindow(
  timeZone: string,
  now = Date.now(),
): CalendarDayWindow {
  if (!Number.isFinite(now) || !timeZone)
    throw new Error("HA-Zeitzone oder Zeitpunkt fehlt.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: string) =>
      parts.find((item) => item.type === type)!.value;
    return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
  };
  const date = localDate(now);
  const boundary = (after: boolean) => {
    let low = now - 48 * 3_600_000;
    let high = now + 48 * 3_600_000;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      const candidate = localDate(middle);
      if (after ? candidate > date : candidate >= date) high = middle;
      else low = middle;
    }
    return high;
  };
  return { start: boundary(false), end: boundary(true), date, timeZone };
}

function temperatureValue(
  row: HassEntity,
): { value: number; unit: string } | null {
  const unit = row.attributes?.unit_of_measurement;
  const value = numericState(row.state);
  if (
    typeof unit !== "string" ||
    !isUnitValid("temperature", unit) ||
    value === null
  )
    return null;
  // Absolute-zero bounds are physical, not guessed device operating limits.
  if (
    (unit === "K" && value < 0) ||
    (unit === "°C" && value < -273.15) ||
    (unit === "°F" && value < -459.67)
  )
    return null;
  return { value, unit };
}

/** Only the selected temperature source is requested, lazily by the caller.
 * Results describe recorded values so far, not guaranteed physical day extrema.
 */
export async function loadDailyTemperature(
  hass: HomeAssistant,
  entityId: string,
  options: DailyTemperatureOptions = {},
): Promise<DailyTemperatureResult> {
  const now = Number.isFinite(options.now) ? options.now! : Date.now();
  const configuredZone = (
    hass as HomeAssistant & { config?: { time_zone?: string } }
  ).config?.time_zone;
  const timeZone = options.timeZone ?? configuredZone ?? "";
  const base: DailyTemperatureResult = {
    status: "unavailable",
    min: null,
    max: null,
    unit: "",
    start: null,
    end: now,
    dayEnd: null,
    date: "",
    timeZone,
    count: 0,
    boundaryContext: false,
    note: "",
  };
  let window: CalendarDayWindow;
  try {
    window = calendarDayWindow(timeZone, now);
  } catch {
    return {
      ...base,
      note: "Die Home-Assistant-Zeitzone fehlt oder ist ungültig; kein verlässlicher lokaler Kalendertag verfügbar.",
    };
  }
  const result = {
    ...base,
    start: window.start,
    dayEnd: window.end,
    date: window.date,
  };
  if (!entityId || !hass.states[entityId])
    return {
      ...result,
      note: "Für Tages-Minimum und -Maximum zuerst die vorhandene Außentemperaturquelle zuordnen.",
    };
  if (!hass.callApi)
    return {
      ...result,
      note: "Die Home-Assistant-Recorder-API ist nicht verfügbar.",
    };
  const query = new URLSearchParams({
    filter_entity_id: entityId,
    end_time: new Date(now).toISOString(),
  });
  const path = `history/period/${new Date(window.start).toISOString()}?${query}`;
  let response: unknown;
  try {
    response = await hass.callApi<unknown>("GET", path);
  } catch {
    return {
      ...result,
      status: "error",
      note: "Tageswerte konnten nicht aus Home Assistant geladen werden. Recorder, Aufbewahrung und Berechtigungen prüfen.",
    };
  }
  if (!Array.isArray(response) || response.some((rows) => !Array.isArray(rows)))
    return {
      ...result,
      status: "error",
      note: "Home Assistant hat eine unerwartete Recorder-Antwort für die Tageswerte geliefert.",
    };

  let malformed = false;
  const rows = response
    .flat()
    .filter((row): row is HassEntity =>
      Boolean(row && typeof row === "object" && row.entity_id === entityId),
    );
  const points = rows
    .flatMap((row) => {
      const timestamp = Date.parse(row.last_updated ?? row.last_changed ?? "");
      if (!Number.isFinite(timestamp)) {
        malformed = true;
        return [];
      }
      if (timestamp > now) {
        malformed = true;
        return [];
      }
      return [{ timestamp, sample: temperatureValue(row) }];
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  const initial = points
    .filter((point) => point.timestamp < window.start)
    .at(-1);
  const today = points.filter((point) => point.timestamp >= window.start);
  const valid = today.filter((point) => point.sample !== null);
  const count = valid.length;
  const units = [...new Set(valid.map((point) => point.sample!.unit))];
  if (!count)
    return {
      ...result,
      status: "empty",
      note: initial
        ? "Nur ein früherer Recorder-Ausgangszustand, keine gültigen Aufzeichnungen von heute. Daraus werden keine heutigen Extremwerte erzeugt."
        : "Keine gültigen aufgezeichneten Temperaturwerte von heute. Recorder, Aufbewahrung und Sensorverfügbarkeit prüfen.",
    };
  if (units.length !== 1)
    return {
      ...result,
      status: "partial",
      count,
      note: "Aufgezeichnete Werte mit Einheitenwechsel. Ohne gemeinsame Einheit werden keine Tages-Extremwerte berechnet.",
    };

  const unit = units[0];
  const ageLimit = options.staleAfterMinutes ?? 0;
  const boundaryStale = Boolean(
    initial &&
    ageLimit > 0 &&
    window.start - initial.timestamp > ageLimit * 60_000,
  );
  const boundaryContext = Boolean(
    initial?.sample && initial.sample.unit === unit && !boundaryStale,
  );
  let min = Infinity,
    max = -Infinity;
  if (boundaryContext) min = max = initial!.sample!.value;
  for (const point of valid) {
    min = Math.min(min, point.sample!.value);
    max = Math.max(max, point.sample!.value);
  }
  const reasons: string[] = [];
  if (!initial?.sample && today[0]?.timestamp !== window.start)
    reasons.push("Tagesanfang nicht vollständig aufgezeichnet");
  if (initial?.sample && initial.sample.unit !== unit)
    reasons.push("Einheitenwechsel am Tagesanfang");
  if (boundaryStale)
    reasons.push(
      "Ausgangszustand am Tagesanfang außerhalb der eingestellten Altersgrenze",
    );
  if (today.some((point) => point.sample === null) || malformed)
    reasons.push("ungültige oder nicht verfügbare Abschnitte");
  if (count < 2) reasons.push("erst ein gültiger Eintrag von heute");
  const live = hass.states[entityId];
  const age = entityFreshness(live, { now, staleAfterMinutes: ageLimit });
  if (!temperatureValue(live) || age.status !== "current")
    reasons.push("aktuelle Sensorabdeckung nicht bestätigt");
  if (temperatureValue(live)?.unit !== unit)
    reasons.push(
      "aktuelle Quell-Einheit weicht vom aufgezeichneten Zeitraum ab",
    );
  const boundaryNote = boundaryContext
    ? " Der echte Recorder-Ausgangszustand wird ab Mitternacht als gehaltener HA-Zustand berücksichtigt, nicht als neue Messung."
    : "";
  const prefix = `Aufgezeichnete Werte bisher · ${count} ${count === 1 ? "Eintrag" : "Einträge"} heute.${boundaryNote}`;
  return {
    ...result,
    status: reasons.length ? "partial" : "ok",
    min,
    max,
    unit,
    count,
    boundaryContext,
    note: reasons.length
      ? `${prefix} Zeitraum unvollständig: ${reasons.join("; ")}. Keine Garantie für die tatsächlichen Tagesextrema.`
      : `${prefix} Nur Recorder-Aufzeichnungen; Erfassungs- und Aufbewahrungslücken können tatsächliche Tagesextrema verbergen.`,
  };
}
