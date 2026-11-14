import { type HassEntity, type HomeAssistant, type MetricKey } from "./types";
import { isUnitValid } from "./data";

import type { DeviceRole } from "./types";
export type { DeviceRole } from "./types";
export interface RegistryDevice {
  id: string;
  name?: string;
  name_by_user?: string;
  model?: string;
  manufacturer?: string;
}
export interface RegistryEntity {
  entity_id: string;
  device_id?: string | null;
  original_name?: string | null;
  disabled_by?: string | null;
}
export const DEVICE_ROLES: DeviceRole[] = [
  "WS90",
  "WH40",
  "WN32",
  "WN31",
  "GW3000",
];

/** Match registry model aliases first; a user label must not override a known model. */
export function roleForDevice(device: RegistryDevice): DeviceRole | undefined {
  const rolesIn = (text: string): DeviceRole[] => {
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return DEVICE_ROLES.filter((role) =>
      tokens.some((token) => {
        if (role === "WS90") return token === "ws90" || token === "wh90";
        if (role === "WN31") return token === "wn31" || token === "wh31";
        if (role === "WN32") return token === "wn32" || token === "wh32";
        if (role === "GW3000") return /^gw3000[a-z]?$/.test(token);
        return token === "wh40";
      }),
    );
  };
  const modelRoles = rolesIn(device.model || "");
  if (modelRoles.length)
    return modelRoles.length === 1 ? modelRoles[0] : undefined;
  const nameRoles = rolesIn(
    [device.name, device.name_by_user].filter(Boolean).join(" "),
  );
  return nameRoles.length === 1 ? nameRoles[0] : undefined;
}
export function deviceLabel(device: RegistryDevice): string {
  return [device.name_by_user || device.name || device.id, device.model]
    .filter(Boolean)
    .join(" · ");
}
export function uniqueRoleDevices(
  devices: RegistryDevice[],
): Partial<Record<DeviceRole, string>> {
  const result: Partial<Record<DeviceRole, string>> = {};
  for (const role of DEVICE_ROLES) {
    const matches = devices.filter((device) => roleForDevice(device) === role);
    if (matches.length === 1) result[role] = matches[0].id;
  }
  return result;
}

export function metricRole(
  key: MetricKey,
  selected: Partial<Record<DeviceRole, string>>,
): DeviceRole {
  if (key.startsWith("rain_")) return key === "rain_wet" ? "WS90" : "WH40";
  if (key === "pressure") return "GW3000";
  if (
    [
      "temperature",
      "humidity",
      "feels_like",
      "dew_point",
      "temperature_min",
      "temperature_max",
    ].includes(key)
  )
    return selected.WN32 ? "WN32" : "WS90";
  return "WS90";
}

// Suggestions only rank actual entities attached to a selected registry device.
// Every assignment still requires an explicit click in the editor.
export function candidateEntities(
  key: MetricKey,
  hass: HomeAssistant,
  registry: RegistryEntity[],
  selected: Partial<Record<DeviceRole, string>>,
): string[] {
  const role = metricRole(key, selected);
  const device = selected[role];
  if (!device) return [];
  const matches = (deviceId: string) =>
    registry
      .filter(
        (item) =>
          item.device_id === deviceId &&
          !item.disabled_by &&
          hass.states[item.entity_id],
      )
      .filter((item) =>
        matchesMetric(
          key,
          hass.states[item.entity_id],
          item.original_name || "",
        ),
      )
      .map((item) => item.entity_id)
      .sort();
  const candidates = matches(device);
  // An actual WS90 may supply a derived climate value absent from WN32.
  // This remains an explicit, labelled suggestion; it never changes config itself.
  return candidates.length || role !== "WN32" || !selected.WS90
    ? candidates
    : matches(selected.WS90);
}

function matchesMetric(
  key: MetricKey,
  state: HassEntity,
  originalName: string,
): boolean {
  const name =
    `${state.entity_id} ${state.attributes.friendly_name || ""} ${originalName}`.toLowerCase();
  const dc = state.attributes.device_class;
  if (
    key === "rain_wet"
      ? !state.entity_id.startsWith("binary_sensor.")
      : !state.entity_id.startsWith("sensor.")
  )
    return false;
  if (!isUnitValid(key, state.attributes.unit_of_measurement || ""))
    return false;
  const average = /(?:avg|average|mittel|mean|10.?min)/.test(name);
  const maximum = /(?:max|maximum|höchst)/.test(name);
  const minimum = /(?:(?:^|[\s_])min(?:imum)?(?:$|[\s_])|minimum|tiefst)/.test(
    name,
  );
  const daily =
    /(?:(?:^|[\s_])(?:daily|today|heute|day)(?:$|[\s_])|tages)/.test(name);
  const longerPeriod =
    /(?:hour|stunde|week|woche|month|monat|year|jahr|lifetime|all.?time)/.test(
      name,
    );
  const direction =
    /(?:direction|richtung|bearing)/.test(name) || dc === "wind_direction";
  const gust = /(?:gust|böe|boee)/.test(name);
  const wind = /(?:wind)/.test(name) || dc === "wind_speed";
  const rain =
    /(?:rain|regen|precipitation)/.test(name) ||
    ["precipitation", "precipitation_intensity"].includes(dc || "");
  if (key === "wind_direction")
    return direction && !average && !maximum && !minimum && !longerPeriod;
  if (key === "wind_direction_avg")
    return direction && average && !longerPeriod;
  if (key === "wind_gust")
    return wind && gust && !maximum && !average && !daily && !longerPeriod;
  if (key === "wind_gust_max")
    return wind && gust && maximum && daily && !longerPeriod;
  if (key === "wind_speed_avg")
    return wind && !direction && !gust && average && !longerPeriod;
  if (key === "wind_speed")
    return (
      wind &&
      !direction &&
      !gust &&
      !average &&
      !maximum &&
      !minimum &&
      !daily &&
      !longerPeriod
    );
  if (key === "rain_wet")
    return (
      state.entity_id.startsWith("binary_sensor.") &&
      (dc === "moisture" || /(?:piezo|wet|nass|feucht|raining)/.test(name))
    );
  if (key === "rain_rate")
    return (
      rain &&
      (dc === "precipitation_intensity" ||
        /(?:rate|intensity|intensität)/.test(name))
    );
  if (key === "rain_today")
    return (
      rain &&
      /(?:(?:^|[\s_])(?:daily|today|heute|day)(?:$|[\s_])|tages(?:menge|regen|summe))/.test(
        name,
      ) &&
      !/(?:rate|24.?h|rolling|gleitend)/.test(name)
    );
  if (key === "rain_24h") return rain && /(?:24.?h|24.?hour)/.test(name);
  if (key === "rain_week") return rain && /(?:week|woche)/.test(name);
  if (key === "rain_month") return rain && /(?:month|monat)/.test(name);
  if (key === "rain_year") return rain && /(?:year|jahr)/.test(name);
  if (key === "rain_event") return rain && /(?:event|ereignis)/.test(name);
  if (key === "temperature_min")
    return dc === "temperature" && minimum && daily && !longerPeriod;
  if (key === "temperature_max")
    return dc === "temperature" && maximum && daily && !longerPeriod;
  if (key === "feels_like")
    return (
      dc === "temperature" &&
      /(?:feels|gefühl|apparent)/.test(name) &&
      !maximum &&
      !minimum &&
      !average &&
      !longerPeriod
    );
  if (key === "dew_point")
    return (
      dc === "temperature" &&
      /(?:dew|taupunkt)/.test(name) &&
      !maximum &&
      !minimum &&
      !average &&
      !longerPeriod
    );
  if (key === "temperature")
    return (
      dc === "temperature" &&
      !/(?:feels|gefühl|apparent|dew|taupunkt)/.test(name) &&
      !maximum &&
      !minimum &&
      !average &&
      !longerPeriod
    );
  if (key === "humidity")
    return (
      dc === "humidity" && !maximum && !minimum && !average && !longerPeriod
    );
  if (key === "pressure")
    return (
      ["atmospheric_pressure", "pressure"].includes(dc || "") &&
      /(?:relative|relativ)/.test(name) &&
      !maximum &&
      !minimum &&
      !average &&
      !longerPeriod
    );
  if (key === "uv")
    return (
      /(?:\buv\b|_uv_|uv_index|ultraviolet)/.test(name) &&
      !maximum &&
      !minimum &&
      !average &&
      !longerPeriod
    );
  if (key === "solar_lux")
    return (
      (dc === "illuminance" ||
        /(?:lux|beleuchtungsstärke|illuminance|lichtstärke)/.test(name)) &&
      !maximum &&
      !minimum &&
      !average &&
      !daily &&
      !longerPeriod
    );
  if (key === "vpd")
    return (
      /(?:vpd|dampfdruckdefizit|vapor.pressure.deficit)/.test(name) &&
      !maximum &&
      !minimum &&
      !average &&
      !daily &&
      !longerPeriod
    );
  if (key === "solar")
    return (
      (dc === "irradiance" || /(?:solar|strahlung|irradiance)/.test(name)) &&
      !maximum &&
      !minimum &&
      !average &&
      !longerPeriod
    );
  return false;
}
