import test from "node:test";
import assert from "node:assert/strict";
import { clearSkyIrradiance, observeWeather } from "../src/weather";
import type { Reading } from "../src/data";
import type { HassEntity } from "../src/types";

function reading(value: number | null, unit = "W/m²", status: Reading["status"] = "ok"): Reading {
  return { value, unit, text: String(value ?? "—"), status };
}
const sun = (state: string, elevation: number): HassEntity => ({
  entity_id: "sun.sun", state, attributes: { elevation },
});
test("clear-sky estimate stays finite only when the sun is above horizon", () => {
  assert.equal(clearSkyIrradiance(-5), null);
  assert.equal(clearSkyIrradiance(0), null);
  assert.equal(clearSkyIrradiance(95), null);
  assert((clearSkyIrradiance(45) ?? 0) > 500);
});
test("WH40 positive rate gets rain, a wet WS90 does not invent falling rain", () => {
  const sunny = sun("above_horizon", 45);
  assert.equal(observeWeather(sunny, reading(600), reading(1.2, "mm/h"), reading(0, "")).kind, "rain");
  const wet = observeWeather(sunny, reading(600), reading(0, "mm/h"), reading(1, ""));
  assert.equal(wet.kind, "wet");
  assert.match(wet.note, /nicht zwingend/);
  assert.equal(observeWeather(sunny, reading(600), reading(0, "mm/h"), reading(0, "")).kind, "sunny");
});
test("sunny/partial/cloudy are labelled estimates, never measured cloud cover", () => {
  const s = sun("above_horizon", 42);
  const clear = clearSkyIrradiance(42)!;
  const value = (ratio: number) => observeWeather(s, reading(clear * ratio), reading(0, "mm/h"), reading(0, ""));
  assert.equal(value(0.9).kind, "sunny");
  assert.equal(value(0.55).kind, "partlycloudy");
  assert.equal(value(0.2).kind, "cloudy");
  assert.equal(value(0.9).estimated, true);
  assert.match(value(0.9).note, /Schätzung/);
});
test("low solar elevation, missing irradiance and night never invent clear sky", () => {
  const rain = reading(0, "mm/h"), dry = reading(0, "");
  assert.equal(observeWeather(sun("above_horizon", 5), reading(20), rain, dry).kind, "unknown");
  assert.equal(observeWeather(sun("above_horizon", 35), reading(null, "W/m²", "missing"), rain, dry).kind, "unknown");
  assert.equal(observeWeather(sun("below_horizon", -5), reading(0), rain, dry).kind, "night");
});
