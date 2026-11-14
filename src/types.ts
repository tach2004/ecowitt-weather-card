export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    unit_of_measurement?: string;
    friendly_name?: string;
    device_class?: string;
  };
  last_changed?: string;
  last_updated?: string;
}
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language?: string;
  callApi?<T>(method: string, path: string): Promise<T>;
  callWS?<T>(message: Record<string, unknown>): Promise<T>;
}
export type MetricKey =
  | "temperature"
  | "humidity"
  | "feels_like"
  | "dew_point"
  | "temperature_min"
  | "temperature_max"
  | "wind_speed"
  | "wind_gust"
  | "wind_direction"
  | "wind_direction_avg"
  | "wind_speed_avg"
  | "wind_gust_max"
  | "rain_today"
  | "rain_rate"
  | "rain_wet"
  | "rain_24h"
  | "rain_week"
  | "rain_month"
  | "rain_year"
  | "rain_event"
  | "pressure"
  | "uv"
  | "solar"
  | "solar_lux"
  | "vpd";
export type DeviceRole = "WS90" | "WH40" | "WN32" | "WN31" | "GW3000";
export interface DeviceStatusConfig {
  /** Actual device registry identifier; several WN31/WH31 devices are supported. */
  device_id: string;
  role: DeviceRole;
  name?: string;
  show_on_main?: boolean;
  battery?: string;
  signal?: string;
  connection?: string;
}
export interface CardConfig {
  type: string;
  title?: string;
  subtitle?: string;
  site_image?: string;
  background_image?: string;
  image_rotation?: number;
  image_target_x?: number;
  image_target_y?: number;
  entities?: Partial<Record<MetricKey, string>>;
  extra_entities?: string[];
  /** Per-device status selections; no values are inferred or fabricated. */
  device_status?: DeviceStatusConfig[];
  /** Automatic uses the parent HA theme. */
  theme_mode?: "auto" | "light" | "dark";
  weather_animation?: boolean;
  diagnostic_entities?: string[];
  history_hours?: number;
  stale_after_minutes?: number;
  grid_options?: Record<string, unknown>;
}
export const METRICS: {
  key: MetricKey;
  label: string;
  group: string;
  unit?: string;
  deviceClass?: string;
}[] = [
  {
    key: "wind_speed",
    label: "Windgeschwindigkeit · WS90",
    group: "Wind",
    deviceClass: "wind_speed",
  },
  {
    key: "wind_gust",
    label: "Böen · WS90",
    group: "Wind",
    deviceClass: "wind_speed",
  },
  {
    key: "wind_direction",
    label: "Aktuelle Herkunftsrichtung · WS90",
    group: "Wind",
    unit: "°",
  },
  {
    key: "wind_direction_avg",
    label: "Mittlere Richtung · 10 Minuten",
    group: "Wind",
    unit: "°",
  },
  {
    key: "wind_gust_max",
    label: "Tagesmaximalböe",
    group: "Wind",
    deviceClass: "wind_speed",
  },
  { key: "rain_today", label: "Regen heute · WH40", group: "Regen" },
  { key: "rain_rate", label: "Regenrate · WH40", group: "Regen" },
  {
    key: "rain_wet",
    label: "Feuchtigkeitsstatus · WS90 Piezo (on/off)",
    group: "Regen",
  },
  {
    key: "rain_24h",
    label: "Regen letzte 24 Stunden · gleitend",
    group: "Regen",
  },
  { key: "rain_week", label: "Regen diese Woche", group: "Regen" },
  { key: "rain_month", label: "Regen diesen Monat", group: "Regen" },
  { key: "rain_year", label: "Regen dieses Jahr", group: "Regen" },
  { key: "rain_event", label: "Regenereignis", group: "Regen" },
  {
    key: "temperature",
    label: "Außentemperatur · WN32 bevorzugt",
    group: "Außenklima",
    deviceClass: "temperature",
  },
  {
    key: "humidity",
    label: "Luftfeuchte · WN32 bevorzugt",
    group: "Außenklima",
    deviceClass: "humidity",
  },
  {
    key: "feels_like",
    label: "Gefühlte Temperatur",
    group: "Außenklima",
    deviceClass: "temperature",
  },
  {
    key: "dew_point",
    label: "Taupunkt",
    group: "Außenklima",
    deviceClass: "temperature",
  },
  {
    key: "temperature_min",
    label: "Temperatur Tagesminimum",
    group: "Außenklima",
    deviceClass: "temperature",
  },
  {
    key: "temperature_max",
    label: "Temperatur Tagesmaximum",
    group: "Außenklima",
    deviceClass: "temperature",
  },
  {
    key: "pressure",
    label: "Relativer Luftdruck · GW3000",
    group: "Druck & Sonne",
    deviceClass: "atmospheric_pressure",
  },
  { key: "uv", label: "UV-Index · WS90", group: "Druck & Sonne" },
  {
    key: "solar",
    label: "Solarstrahlung · WS90",
    group: "Druck & Sonne",
    deviceClass: "irradiance",
  },
];
