import type { DeviceStatusConfig, HassEntity, HomeAssistant } from "./types";

export interface DeviceIndicator {
  label: string;
  state: "ok" | "bad" | "unknown";
  detail: string;
  /** Only a source with % units produces a battery fill. */
  percent?: number;
}
export interface DeviceIndicators {
  battery: DeviceIndicator;
  signal: DeviceIndicator;
  connection: DeviceIndicator;
}

function source(hass: HomeAssistant | undefined, id?: string): HassEntity | undefined {
  return id && hass ? hass.states[id] : undefined;
}
function missing(id?: string): DeviceIndicator {
  return {
    label: id ? "Nicht verfügbar" : "Nicht zugeordnet",
    state: "unknown",
    detail: id || "Im Karteneditor eine Quelle wählen",
  };
}
function numberState(value?: HassEntity): number | null {
  if (!value || !value.state.trim()) return null;
  const n = Number(value.state);
  return Number.isFinite(n) ? n : null;
}
function format(n: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}
export function deviceIndicators(
  hass: HomeAssistant | undefined,
  device: DeviceStatusConfig,
): DeviceIndicators {
  const batteryEntity = source(hass, device.battery);
  const signalEntity = source(hass, device.signal);
  const connectionEntity = source(hass, device.connection);
  const indicator = (entity: HassEntity | undefined, id?: string): DeviceIndicator => {
    const n = numberState(entity);
    if (n === null || entity?.state === "unknown" || entity?.state === "unavailable")
      return missing(id);
    const unit = entity?.attributes.unit_of_measurement || "";
    return {
      label: format(n) + (unit ? " " + unit : ""),
      detail: id || "",
      state: "ok",
      ...(unit === "%" && n >= 0 && n <= 100 ? { percent: n } : {}),
    };
  };
  let connection = missing(device.connection);
  if (connectionEntity && !["unknown", "unavailable"].includes(connectionEntity.state)) {
    const state = connectionEntity.state.toLowerCase();
    const deviceClass = connectionEntity.attributes.device_class;
    if (state === "connected" || state === "online" ||
      (deviceClass === "connectivity" && state === "on"))
      connection = { label: "Verbunden", state: "ok", detail: device.connection || "" };
    else if (state === "disconnected" || state === "offline" ||
      (deviceClass === "connectivity" && state === "off"))
      connection = { label: "Getrennt", state: "bad", detail: device.connection || "" };
    else
      connection = {
        label: "Status unklar", state: "unknown",
        detail: "Kein eindeutiger Verbindungszustand; Sensorsemantik prüfen.",
      };
  }
  return {
    battery: indicator(batteryEntity, device.battery),
    signal: indicator(signalEntity, device.signal),
    connection,
  };
}
