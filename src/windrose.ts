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


/**
 * The installed card does not emit a public event when its native speed selector
 * changes. The optional host-owned switch keeps its selected data source and
 * corner label in sync without reaching into the installed card's internals.
 * Manual upstream speed sources/selectors are never replaced.
 */
export function prepareEmbeddedSpeedSwitch(
  options: WindroseOptions | undefined,
  config: Record<string, unknown>,
  entities: WindroseEntities | undefined,
  hass: HomeAssistant,
  mode: "wind" | "gust",
): { config: Record<string, unknown>; managed: boolean } {
  const supplied = record(options?.config) ? options.config : {};
  const explicitSpeeds = supplied.windspeed_entities !== undefined;
  const manuallyConfiguredButtons = record(supplied.buttons_config) &&
    Array.isArray(supplied.buttons_config.buttons)
      ? supplied.buttons_config.buttons
      : [];
  const manualSelector = manuallyConfiguredButtons.some(
    (button) => record(button) && button.type === "windrose_speed_selector",
  );
  const speeds = config.windspeed_entities;
  const eligible = !explicitSpeeds && !manualSelector &&
    Array.isArray(speeds) && speeds.length === 2 &&
    record(speeds[0]) && record(speeds[1]) &&
    speeds[0].entity === entities?.wind_speed &&
    speeds[1].entity === entities?.wind_gust;
  if (!eligible) return { config, managed: false };
  const result = { ...config };
  const activeIndex = mode === "gust" ? 1 : 0;
  result.windspeed_entities = speeds.map((source, index) => ({
    ...source as Record<string, unknown>,
    use_for_windrose: index === activeIndex,
  }));
  // Keep unrelated native buttons; an empty button array is rejected upstream.
  const buttonSettings = record(config.buttons_config) ? config.buttons_config : {};
  const otherButtons = Array.isArray(buttonSettings.buttons)
    ? buttonSettings.buttons.filter(
        (button) => !(record(button) && button.type === "windrose_speed_selector"),
      )
    : [];
  if (otherButtons.length)
    result.buttons_config = { ...buttonSettings, buttons: otherButtons };
  else delete result.buttons_config;

  const directionId = entities?.wind_direction;
  const baseCorners = record(config.corner_info) ? config.corner_info : {};
  const configuredLeft = record(baseCorners.top_left) ? baseCorners.top_left : undefined;
  const configuredRight = record(baseCorners.top_right) ? baseCorners.top_right : undefined;
  const maximumId = entities?.wind_gust_max;
  const validMax = Boolean(maximumId &&
    hass.states[maximumId] &&
    typeof hass.states[maximumId].attributes.unit_of_measurement === "string" &&
    speedUnits[hass.states[maximumId].attributes.unit_of_measurement as string]);
  const shownId = mode === "wind"
    ? entities!.wind_speed!
    : validMax ? maximumId! : entities!.wind_gust!;
  const unit = hass.states[shownId]?.attributes.unit_of_measurement;
  result.corner_info = {
    ...baseCorners,
    ...(!configuredLeft && directionId ? {
      top_left: { label: "Windrichtung", entity: directionId, unit: " °", precision: 0 },
    } : {}),
    top_right: {
      ...(configuredRight ? {
        color: configuredRight.color,
        label_text_size: configuredRight.label_text_size,
        value_text_size: configuredRight.value_text_size,
      } : {}),
      label: mode === "wind" ? "Windgeschwindigkeit"
        : validMax ? "Max. Böe heute" : "Böen aktuell",
      entity: shownId,
      unit: typeof unit === "string" ? " " + unit : "",
      precision: 1,
    },
  };
  return { config: result, managed: true };
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
