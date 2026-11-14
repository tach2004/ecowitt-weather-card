import type { HassEntity } from "./types";
import type { Reading } from "./data";

/** Local observations only. Sky conditions are estimates, never a forecast. */
export type WeatherKind =
  | "rain" | "wet" | "sunny" | "partlycloudy" | "cloudy" | "night" | "unknown";
export interface WeatherObservation {
  kind: WeatherKind;
  label: string;
  note: string;
  estimated: boolean;
  clearSkyRatio?: number;
}
/** Haurwitz approximate global horizontal clear-sky irradiance (W/m²). */
export function clearSkyIrradiance(elevation: number): number | null {
  if (!Number.isFinite(elevation) || elevation <= 0 || elevation > 90)
    return null;
  const cosZenith = Math.sin((elevation * Math.PI) / 180);
  return 1098 * cosZenith * Math.exp(-0.059 / cosZenith);
}
const unknown: WeatherObservation = {
  kind: "unknown",
  label: "Wetter nicht bestimmbar",
  note: "Für eine lokale Wetterabschätzung fehlen geeignete aktuelle Messwerte.",
  estimated: false,
};
/** Keep rainfall and surface moisture separate. A wet piezo is not proof of falling rain. */
export function observeWeather(
  sun: HassEntity | undefined,
  solar: Reading,
  rainRate: Reading,
  wet: Reading,
): WeatherObservation {
  if (rainRate.status === "ok" && rainRate.value !== null && rainRate.value > 0)
    return {
      kind: "rain", label: "Regen", estimated: false,
      note: "Niederschlagsrate vom WH40 gemessen.",
    };
  if (wet.status === "ok" && wet.value === 1)
    return {
      kind: "wet", label: "Oberfläche nass", estimated: false,
      note: "WS90-Piezo meldet Feuchtigkeit; daraus folgt nicht zwingend fallender Regen.",
    };
  if (sun?.state === "below_horizon")
    return {
      kind: "night", label: "Nacht", estimated: false,
      note: "Sonne unter dem Horizont. Eine wolkenfreie Nacht wird nicht behauptet.",
    };
  const altitude = Number(sun?.attributes.elevation);
  if (sun?.state !== "above_horizon" || !Number.isFinite(altitude) || altitude < 12)
    return unknown;
  if (solar.status !== "ok" || solar.value === null) return unknown;
  const scale = solar.unit === "kW/m²" || solar.unit === "kW/m2" ? 1000 : 1;
  const clear = clearSkyIrradiance(altitude);
  if (!clear || clear < 80) return unknown;
  const ratio = Math.max(0, (solar.value * scale) / clear);
  const kind: WeatherKind = ratio >= 0.78 ? "sunny" : ratio >= 0.40 ? "partlycloudy" : "cloudy";
  return {
    kind,
    label: kind === "sunny" ? "Sonnig (geschätzt)"
      : kind === "partlycloudy" ? "Teilweise bewölkt (geschätzt)"
      : "Bewölkt (geschätzt)",
    estimated: true,
    clearSkyRatio: ratio,
    note: "Nur Schätzung anhand WS90-Solarstrahlung und Sonnenhöhe (Haurwitz-Klarhimmelmodell). Verschattung, Dunst, Sensorabweichungen und Nebel können das Ergebnis verfälschen.",
  };
}
