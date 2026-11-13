import { METRICS, type CardConfig, type MetricKey } from "./types";

const knownMetrics = new Set<string>(METRICS.map((metric) => metric.key));
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function ids(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(value.flatMap((item) => (text(item) ? [text(item)!] : []))),
  ];
}
function bounded(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;
}

/** YAML is untyped at runtime. Preserve missing source IDs, but never consume objects as labels/lists. */
export function normalizeConfig(value: unknown): CardConfig {
  if (!record(value))
    throw new Error(
      "Bitte eine gültige Kartenkonfiguration als YAML-Objekt angeben.",
    );
  const entities: Partial<Record<MetricKey, string>> = {};
  if (record(value.entities)) {
    for (const [key, candidate] of Object.entries(value.entities)) {
      const id = text(candidate);
      if (knownMetrics.has(key) && id) entities[key as MetricKey] = id;
    }
  }
  return {
    type: "custom:ecowitt-weather-card",
    title: text(value.title),
    subtitle: text(value.subtitle),
    site_image: text(value.site_image),
    background_image: text(value.background_image),
    image_rotation: bounded(value.image_rotation, -180, 180),
    image_target_x: bounded(value.image_target_x, 10, 90),
    image_target_y: bounded(value.image_target_y, 10, 90),
    entities,
    extra_entities: ids(value.extra_entities),
    diagnostic_entities: ids(value.diagnostic_entities),
    history_hours: bounded(value.history_hours, 1, 168),
    stale_after_minutes: bounded(value.stale_after_minutes, 0, 10080),
    grid_options: record(value.grid_options)
      ? { ...value.grid_options }
      : undefined,
  };
}
