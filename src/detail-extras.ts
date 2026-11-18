import type { CardConfig, HassEntity, HomeAssistant } from "./types";

export type WeatherDetail = "wind" | "rain" | "temperature" | "pressure" | "sun";

/** Place only explicitly selected extra sensors in a matching weather detail.
 * The diagnostics page remains the complete, unchanged list.
 * No measurement values or device capabilities are inferred.
 */
export function weatherExtraDetail(
  entityId: string,
  state?: HassEntity,
): WeatherDetail | null {
  if (!entityId.startsWith("sensor.")) return null;
  const deviceClass = state?.attributes.device_class?.toLowerCase() ?? "";
  // Never turn device diagnostics into weather readings.
  if ([
    "battery", "signal_strength", "connectivity", "voltage", "current",
    "power", "energy", "duration", "data_size", "data_rate", "enum",
  ].includes(deviceClass)) return null;

  switch (deviceClass) {
    case "precipitation":
    case "precipitation_intensity":
      return "rain";
    case "temperature":
    case "humidity":
      return "temperature";
    case "wind_speed":
      return "wind";
    case "atmospheric_pressure":
      return "pressure";
    case "illuminance":
    case "irradiance":
      return "sun";
  }

  const name = [
    state?.attributes.friendly_name ?? "",
    entityId.slice("sensor.".length).replace(/_/g, " "),
  ].join(" ").toLowerCase();
  // Avoid matching an identifier or status field just because it mentions rain.
  if (/batter|battery|signal|empfang|connect|verbindung|online|firmware|hardware|uptime|diagnos/.test(name))
    return null;

  if (/dampfdruckdefizit|\bvpd\b|vapor pressure deficit/.test(name))
    return "temperature";
  if (/regen|niederschlag|rain|precipitation/.test(name)) return "rain";
  if (/temperatur|temperature|\btemp\b|feuchte|humidity|taupunkt|dew.?point|feels.?like/.test(name))
    return "temperature";
  if (/wind|böe|boee|gust/.test(name)) return "wind";
  if (/luftdruck|barometer|pressure|\bdruck\b/.test(name)) return "pressure";
  if (/sonne|solar|lux|beleucht|uv.?index|\buv\b|irradian|strahlung/.test(name))
    return "sun";

  // Use only unambiguous physical units; "%" may also mean battery or signal.
  const unit = (state?.attributes.unit_of_measurement ?? "").trim().toLowerCase();
  if (["mm", "mm/h", "in", "in/h"].includes(unit)) return "rain";
  if (["°c", "°f"].includes(unit)) return "temperature";
  if (["km/h", "m/s", "mph", "kn", "kt"].includes(unit)) return "wind";
  if (["hpa", "mbar", "inhg", "pa"].includes(unit)) return "pressure";
  if (["w/m²", "w/m2", "lx", "lux", "klx"].includes(unit)) return "sun";
  return null;
}

/** Preserve config order, exclude duplicate main readings and status sources.
 * Legacy extra_entities are included; diagnostic_entities alone are not.
 */
export function selectWeatherDetailExtras(
  config: CardConfig,
  states: HomeAssistant["states"],
  detail: WeatherDetail,
): string[] {
  const devices = config.device_status ?? [];
  const excluded = new Set<string>([
    ...Object.values(config.entities ?? {}).filter((id): id is string => Boolean(id)),
    ...devices.flatMap((device) =>
      [device.battery, device.signal, device.connection]
        .filter((id): id is string => Boolean(id))),
  ]);
  const selected = [
    ...devices.flatMap((device) => device.extra_entities ?? []),
    ...(config.extra_entities ?? []),
  ];
  const seen = new Set<string>();
  return selected.filter((id) => {
    if (!id || seen.has(id) || excluded.has(id)) return false;
    seen.add(id);
    return weatherExtraDetail(id, states[id]) === detail;
  });
}
