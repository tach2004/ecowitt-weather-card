import { numericState } from "./data";
import type { HassEntity, HomeAssistant } from "./types";

export interface HistoryPoint {
  timestamp: number;
  value: number | null;
  unit: string;
}
export interface HistorySeries {
  entityId: string;
  unit: string;
  points: HistoryPoint[];
}
export interface HistoryResult {
  status: "ok" | "empty" | "unavailable" | "error";
  series: HistorySeries[];
  start: number;
  end: number;
  message?: string;
}

/** Lazy, bounded request to the signed-in Home Assistant's own Recorder API. */
export async function loadHistory(
  hass: HomeAssistant,
  entityIds: string[],
  hours = 24,
): Promise<HistoryResult> {
  const end = Date.now();
  const boundedHours = Number.isFinite(hours)
    ? Math.max(1, Math.min(168, hours))
    : 24;
  const start = end - boundedHours * 3_600_000;
  const ids = [...new Set(entityIds)].filter((id) => Boolean(hass.states[id]));
  const base = { series: [] as HistorySeries[], start, end };
  if (ids.length === 0)
    return {
      ...base,
      status: "empty",
      message:
        "Für diesen Verlauf ist noch keine vorhandene Entität zugeordnet.",
    };
  if (!hass.callApi)
    return {
      ...base,
      status: "unavailable",
      message: "Die Home-Assistant-Historien-API ist nicht verfügbar.",
    };
  const query = new URLSearchParams({
    filter_entity_id: ids.join(","),
    end_time: new Date(end).toISOString(),
  });
  // Keep full states: minimized responses may omit unit changes or availability gaps.
  const path = `history/period/${new Date(start).toISOString()}?${query}`;
  try {
    const raw = await hass.callApi<unknown>("GET", path);
    if (!Array.isArray(raw) || raw.some((rows) => !Array.isArray(rows)))
      return {
        ...base,
        status: "error",
        message:
          "Home Assistant hat eine unerwartete Historienantwort geliefert.",
      };
    const series = ids.map((entityId) => {
      const rows = raw
        .flat()
        .filter((row): row is HassEntity =>
          Boolean(row && typeof row === "object" && row.entity_id === entityId),
        );
      const points = rows
        .flatMap((row) => {
          const timestamp = Date.parse(
            row.last_updated ?? row.last_changed ?? "",
          );
          if (!Number.isFinite(timestamp) || timestamp > end) return [];
          const unit =
            typeof row.attributes?.unit_of_measurement === "string"
              ? row.attributes.unit_of_measurement
              : "";
          return [{ timestamp, value: numericState(row.state), unit }];
        })
        .sort((a, b) => a.timestamp - b.timestamp);
      // Recorder may include the real state preceding start; keep it for honest context.
      return {
        entityId,
        unit: points.find((point) => point.value !== null)?.unit ?? "",
        points,
      };
    });
    if (
      !series.some((item) => item.points.some((point) => point.value !== null))
    )
      return {
        ...base,
        series,
        status: "empty",
        message:
          "Keine numerischen Recorder-Daten im angefragten Zeitraum. Aufbewahrung, Recorder-Ausschlüsse und Berechtigungen prüfen.",
      };
    return { ...base, series, status: "ok" };
  } catch {
    // Do not expose response bodies that can contain server internals or credentials.
    return {
      ...base,
      status: "error",
      message:
        "Verlauf konnte nicht aus Home Assistant geladen werden. Recorder, Aufbewahrung und Berechtigungen prüfen.",
    };
  }
}
