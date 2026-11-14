import { entityFreshness, numericState, type FreshnessOptions } from "./data";
import type { DeviceStatusConfig, HassEntity, HomeAssistant } from "./types";

export interface DeviceIndicator {
  label: string;
  state: "ok" | "bad" | "unknown";
  detail: string;
  /** Only the explicitly selected battery source with % units produces a fill. */
  percent?: number;
}
export interface DeviceIndicators {
  battery: DeviceIndicator;
  signal: DeviceIndicator;
  connection: DeviceIndicator;
}

function source(
  hass: HomeAssistant | undefined,
  id?: string,
): HassEntity | undefined {
  return id && hass ? hass.states[id] : undefined;
}
function missing(id?: string): DeviceIndicator {
  return {
    label: id ? "Nicht verfügbar" : "Nicht zugeordnet",
    state: "unknown",
    detail: id || "Im Karteneditor eine Quelle wählen",
  };
}
function invalid(detail: string): DeviceIndicator {
  return { label: "Quelle prüfen", state: "unknown", detail };
}
function available(entity?: HassEntity): entity is HassEntity {
  return Boolean(
    entity &&
    typeof entity.state === "string" &&
    !["unknown", "unavailable", ""].includes(entity.state.trim()),
  );
}
function format(n: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}
function deviceClass(entity: HassEntity): string | undefined {
  const value = entity.attributes.device_class;
  return value == null || value === ""
    ? undefined
    : typeof value === "string"
      ? value
      : "invalid";
}
function unitOf(entity: HassEntity): string | null {
  const value = entity.attributes.unit_of_measurement;
  return value == null ? "" : typeof value === "string" ? value : null;
}
function inDomain(entity: HassEntity, domain: string): boolean {
  return (
    typeof entity.entity_id === "string" &&
    entity.entity_id.startsWith(`${domain}.`)
  );
}
function aged(
  indicator: DeviceIndicator,
  entity: HassEntity,
  options: FreshnessOptions,
  requireTimestamp = false,
): DeviceIndicator {
  const age = entityFreshness(entity, options);
  if (
    age.status === "invalid" ||
    age.status === "stale" ||
    (age.status === "unknown" &&
      (requireTimestamp || (options.staleAfterMinutes ?? 0) > 0))
  )
    return {
      label:
        age.status === "stale"
          ? "Veraltet"
          : age.status === "invalid"
            ? "Zeitpunkt ungültig"
            : "Zeitpunkt unbekannt",
      state: "unknown",
      detail: `${age.note}. Quellzustand: ${indicator.label}`,
    };
  return age.status === "unknown"
    ? { ...indicator, detail: `${indicator.detail} · ${age.note}` }
    : indicator;
}
function batteryIndicator(
  entity: HassEntity | undefined,
  id: string | undefined,
  options: FreshnessOptions,
): DeviceIndicator {
  if (!available(entity)) return missing(id);
  const dc = deviceClass(entity);
  const unit = unitOf(entity);
  // The HA battery binary class means on=low, off=normal, never a percentage.
  if (
    inDomain(entity, "binary_sensor") &&
    dc === "battery" &&
    unit === "" &&
    ["on", "off"].includes(entity.state)
  )
    return aged(
      {
        label: entity.state === "on" ? "Schwach" : "Normal",
        state: entity.state === "on" ? "bad" : "ok",
        detail: id || "",
      },
      entity,
      options,
    );
  const n = numericState(entity.state);
  if (!inDomain(entity, "sensor") || n === null || unit === null)
    return invalid(
      "Batterie benötigt einen numerischen Batterie-/Spannungssensor oder eine binäre Batteriequelle.",
    );
  if (unit === "%" && n >= 0 && n <= 100 && (!dc || dc === "battery"))
    return aged(
      { label: `${format(n)} %`, state: "ok", detail: id || "", percent: n },
      entity,
      options,
    );
  // Preserve explicitly supplied voltage, including legacy battery-class sources.
  // No discharge curve, percentage or health threshold is assumed.
  if (
    (unit === "V" || unit === "mV") &&
    n >= 0 &&
    (!dc || dc === "voltage" || dc === "battery")
  )
    return aged(
      { label: `${format(n)} ${unit}`, state: "ok", detail: id || "" },
      entity,
      options,
    );
  return invalid(
    "Batteriequelle und Einheit prüfen: Prozentwerte 0–100 % oder nichtnegative Spannung in V/mV erforderlich.",
  );
}
function signalIndicator(
  entity: HassEntity | undefined,
  id: string | undefined,
  options: FreshnessOptions,
): DeviceIndicator {
  if (!available(entity)) return missing(id);
  const n = numericState(entity.state);
  const unit = unitOf(entity);
  const dc = deviceClass(entity);
  if (!inDomain(entity, "sensor") || n === null || unit === null)
    return invalid(
      "Signal benötigt eine numerische Empfangs-/Qualitätsquelle.",
    );
  // HA signal_strength uses dB/dBm. Ecowitt quality percentages have no class.
  const radio =
    (unit === "dB" || unit === "dBm") && (!dc || dc === "signal_strength");
  const quality = !dc && ((unit === "%" && n >= 0 && n <= 100) || unit === "");
  if (!radio && !quality)
    return invalid(
      "Signalquelle und Einheit prüfen: dB/dBm, Quell-Prozentwerte 0–100 % oder unveränderte dimensionslose Qualität erforderlich.",
    );
  return aged(
    {
      label: format(n) + (unit ? ` ${unit}` : ""),
      state: "ok",
      detail: id || "",
    },
    entity,
    options,
  );
}
function connectionIndicator(
  entity: HassEntity | undefined,
  id: string | undefined,
  options: FreshnessOptions,
): DeviceIndicator {
  if (!available(entity)) return missing(id);
  const state = entity.state.toLowerCase();
  const dc = deviceClass(entity);
  let connected: boolean | undefined;
  if (
    inDomain(entity, "binary_sensor") &&
    dc === "connectivity" &&
    unitOf(entity) === ""
  ) {
    if (state === "on") connected = true;
    else if (state === "off") connected = false;
  } else if (
    inDomain(entity, "sensor") &&
    (!dc || dc === "enum") &&
    unitOf(entity) === ""
  ) {
    if (["connected", "online"].includes(state)) connected = true;
    else if (["disconnected", "offline"].includes(state)) connected = false;
  }
  if (connected === undefined)
    return invalid(
      "Verbindung benötigt binary_sensor/connectivity mit on/off oder einen Statussensor mit online/offline/connected/disconnected.",
    );
  // A status without a usable timestamp cannot establish a current connection.
  return aged(
    {
      label: connected ? "Verbunden" : "Getrennt",
      state: connected ? "ok" : "bad",
      detail: id || "",
    },
    entity,
    options,
    true,
  );
}

export function deviceIndicators(
  hass: HomeAssistant | undefined,
  device: DeviceStatusConfig,
  options: FreshnessOptions = {},
): DeviceIndicators {
  return {
    battery: batteryIndicator(
      source(hass, device.battery),
      device.battery,
      options,
    ),
    signal: signalIndicator(
      source(hass, device.signal),
      device.signal,
      options,
    ),
    connection: connectionIndicator(
      source(hass, device.connection),
      device.connection,
      options,
    ),
  };
}
