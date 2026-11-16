import type { HomeAssistant, MetricKey } from "./types";

/** Options for the separately installed HACS windrose-card, never a runtime download. */
export interface WindroseVariant {
  title?: string;
  card_type?: string;
  config?: Record<string, unknown>;
}
export interface WindroseOptions extends WindroseVariant {
  enabled?: boolean;
  variants?: WindroseVariant[];
}
export interface WindrosePreferences {
  reducedMotion?: boolean;
  animation?: boolean;
}
export type WindroseEntities = Partial<Record<MetricKey, string>>;

const speedUnits: Record<string, string> = {
  "m/s": "mps",
  "km/h": "kph",
  mph: "mph",
  "ft/s": "fps",
  kn: "knots",
  knots: "knots",
  knot: "knots",
  kts: "knots",
};
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export function normalizeWindroseOptions(value: unknown): WindroseOptions {
  const input = record(value) ? value : {};
  const variant = (entry: Record<string, unknown>): WindroseVariant => {
    const result: WindroseVariant = {};
    if (typeof entry.title === "string") result.title = entry.title;
    if (typeof entry.card_type === "string")
      result.card_type = entry.card_type.trim();
    if (record(entry.config)) result.config = structuredClone(entry.config);
    return result;
  };
  return {
    ...variant(input),
    enabled: input.enabled !== false,
    variants: Array.isArray(input.variants)
      ? input.variants.filter(record).map(variant)
      : undefined,
  };
}
export function selectedWindrose(
  options: WindroseOptions | undefined,
  index = 0,
): WindroseOptions | undefined {
  const variant = options?.variants?.[index];
  return variant
    ? {
        enabled: options?.enabled,
        card_type: variant.card_type ?? options?.card_type,
        config: { ...options?.config, ...variant.config },
      }
    : options;
}
export function windroseElementName(type: unknown): string {
  if (
    typeof type !== "string" ||
    !/^custom:[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(type)
  )
    throw new Error(
      "Für die Windrose einen geladenen Kartentyp als custom:element-name angeben.",
    );
  return type.slice(7);
}

/** Clone because the upstream card is allowed to normalize its own config. */
function cloneConfig(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Die Windrosen-Konfiguration muss als gültiges YAML-/JSON-Objekt vorliegen.",
    );
  }
}

/** Construct the upstream API without inventing entity names or history samples. */
export function buildWindroseConfig(
  options: WindroseOptions | undefined,
  entities: WindroseEntities | undefined,
  hass: HomeAssistant | undefined,
  preferences: WindrosePreferences = {},
): Record<string, unknown> {
  if (options?.config !== undefined && !record(options.config))
    throw new Error("Die Windrosen-Konfiguration muss ein Objekt sein.");
  const supplied = cloneConfig(options?.config ?? {});
  const type = options?.card_type ?? supplied.type ?? "custom:windrose-card";
  windroseElementName(type);
  if (
    supplied.wind_direction_entity !== undefined &&
    !record(supplied.wind_direction_entity)
  )
    throw new Error(
      "Für die Windrose eine Richtungsquelle als Konfigurationsobjekt zuordnen.",
    );
  const direction = record(supplied.wind_direction_entity)
    ? supplied.wind_direction_entity
    : { entity: entities?.wind_direction };
  if (!record(supplied.wind_direction_entity) && hass) {
    const id = entities?.wind_direction;
    const unit = id
      ? hass.states[id]?.attributes.unit_of_measurement
      : undefined;
    if (typeof unit !== "string" || !["°", "deg", "degrees"].includes(unit))
      throw new Error(
        "Für die Windrose eine vorhandene Windrichtungsquelle in Grad zuordnen oder die native Karte konfigurieren.",
      );
  }
  const configuredSpeeds = supplied.windspeed_entities;
  let speeds: unknown[];
  let hasAutoGust = false;
  if (configuredSpeeds !== undefined) {
    if (!Array.isArray(configuredSpeeds) || !configuredSpeeds.length)
      throw new Error(
        "Für die Windrose mindestens eine Windgeschwindigkeitsquelle auswählen.",
      );
    speeds = configuredSpeeds;
  } else {
    const id = entities?.wind_speed;
    const sourceUnit = id
      ? hass?.states[id]?.attributes.unit_of_measurement
      : undefined;
    const unit =
      typeof sourceUnit === "string" ? speedUnits[sourceUnit] : undefined;
    if (!unit)
      throw new Error(
        "Für die Windrose eine Windgeschwindigkeit mit unterstützter Quelleneinheit zuordnen oder die installierte Karte konfigurieren.",
      );
    speeds = [
      {
        entity: id,
        name: "Wind",
        speed_unit: unit,
        output_speed_unit: unit,
        output_speed_unit_label: sourceUnit,
        speed_range_beaufort: false,
      },
    ];
    // Optional real gust source: retain the ordinary wind source and its output
    // unit; the installed windrose handles conversion from the gust input unit.
    const gustId = entities?.wind_gust;
    const gustSourceUnit = gustId
      ? hass?.states[gustId]?.attributes.unit_of_measurement
      : undefined;
    const gustUnit =
      typeof gustSourceUnit === "string"
        ? speedUnits[gustSourceUnit]
        : undefined;
    if (gustId && gustId !== id && gustUnit) {
      speeds.push({
        entity: gustId,
        name: "Böen",
        speed_unit: gustUnit,
        output_speed_unit: unit,
        output_speed_unit_label: sourceUnit,
        speed_range_beaufort: false,
      });
      hasAutoGust = true;
    }
  }
  const sources = [direction, ...speeds];
  for (const source of sources) {
    if (
      !record(source) ||
      typeof source.entity !== "string" ||
      !source.entity.trim()
    )
      throw new Error(
        "Für die Windrose vorhandene Richtungs- und Geschwindigkeitsquellen zuordnen.",
      );
    if (hass && !hass.states[source.entity])
      throw new Error(
        "Eine konfigurierte Windrosenquelle ist in Home Assistant nicht vorhanden.",
      );
  }
  // This selector is native to the separately installed Windrose Card.
  // Never overwrite explicit speed sources or existing speed-selector buttons.
  const buttonsSettings = record(supplied.buttons_config)
    ? supplied.buttons_config
    : undefined;
  const nativeButtons = Array.isArray(buttonsSettings?.buttons)
    ? buttonsSettings.buttons
    : undefined;
  const hasManualSpeedSelector = nativeButtons?.some(
    (button) => record(button) && button.type === "windrose_speed_selector",
  );
  const canAddSelectors =
    hasAutoGust &&
    !hasManualSpeedSelector &&
    (supplied.buttons_config === undefined ||
      (buttonsSettings !== undefined &&
        (buttonsSettings.buttons === undefined || nativeButtons !== undefined)));
  const automaticButtons = canAddSelectors
    ? {
        ...buttonsSettings,
        buttons: [
          {
            type: "windrose_speed_selector",
            button_text: "Windgeschwindigkeit",
            windspeed_entity_index: 0,
            active: true,
          },
          {
            type: "windrose_speed_selector",
            button_text: "Böen",
            windspeed_entity_index: 1,
          },
          ...(nativeButtons ?? []),
        ],
      }
    : supplied.buttons_config;
  const reduced = preferences.reducedMotion || preferences.animation === false;
  return {
    title: "",
    data_period: { period_back: "-24h" },
    matching_strategy: { name: "full-time" },
    hide_windspeed_bar: true,
    ...supplied,
    ...(canAddSelectors ? { buttons_config: automaticButtons } : {}),
    // This wrapper embeds precisely the installed windrose-card, not another element.
    type,
    wind_direction_entity: direction,
    windspeed_entities: reduced
      ? speeds.map((source) => ({
          ...(source as Record<string, unknown>),
          current_speed_arrow: false,
        }))
      : speeds,
    // Upstream disable_animations only covers the rose leaves and speed bars.
    // Its live arrows always animate, so omit those when motion is disabled.
    current_direction: reduced
      ? {
          ...(record(supplied.current_direction)
            ? supplied.current_direction
            : {}),
          show_arrow: false,
        }
      : (supplied.current_direction ?? { show_arrow: true }),
    ...(reduced && record(supplied.compass_direction)
      ? {
          compass_direction: {
            ...supplied.compass_direction,
            auto_rotate: false,
          },
        }
      : {}),
    disable_animations: Boolean(
      reduced || supplied.disable_animations === true,
    ),
  };
}

/** Stable comparison prevents HA state updates from reinitializing Recorder queries. */
export function windroseConfigKey(config: Record<string, unknown>): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (record(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    return value;
  };
  return JSON.stringify(canonical(config));
}
