import test from "node:test";
import assert from "node:assert/strict";
import { clearSkyIrradiance, observeWeather } from "../src/weather";
import type { Reading } from "../src/data";
import type { HassEntity } from "../src/types";

const now = Date.parse("2026-01-02T12:00:00Z");
const current = new Date(now).toISOString();
function reading(
  value: number | null,
  unit = "W/m²",
  status: Reading["status"] = "ok",
  lastUpdated: string | undefined = current,
): Reading {
  return {
    value,
    unit,
    text: String(value ?? "—"),
    status,
    entity: {
      entity_id: "sensor.demo_weather",
      state: String(value ?? "unavailable"),
      attributes: { unit_of_measurement: unit },
      last_updated: lastUpdated,
    },
  };
}
const sun = (
  state = "above_horizon",
  elevation: unknown = 45,
  lastUpdated: string | undefined = current,
): HassEntity => ({
  entity_id: "sun.sun",
  state,
  attributes: { elevation },
  last_updated: lastUpdated,
});
const dry = reading(0, "");
const noRain = () => reading(0, "mm/h");
const observe = (
  sourceSun: HassEntity | undefined = sun(),
  solar = reading(650),
  rate = noRain(),
  wet = dry,
  staleAfterMinutes?: number,
) => observeWeather(sourceSun, solar, rate, wet, { now, staleAfterMinutes });

test("Haurwitz formula uses elevation in degrees and matches independent reference values", () => {
  // Numeric references for 1098 cos(zenith) exp[-0.059/cos(zenith)] in W/m².
  assert.ok(Math.abs(clearSkyIrradiance(90)! - 1035.092032534495) < 1e-9);
  assert.ok(Math.abs(clearSkyIrradiance(30)! - 487.8941328854248) < 1e-9);
  assert.ok(clearSkyIrradiance(12)! > 150);
  for (const invalid of [-5, 0, 95, NaN, Infinity])
    assert.equal(clearSkyIrradiance(invalid), null);
  assert.ok(clearSkyIrradiance(5)! < clearSkyIrradiance(30)!);
  assert.ok(clearSkyIrradiance(30)! < clearSkyIrradiance(90)!);
});

test("wet WS90 never replaces simultaneous sunny, partial, cloudy or night classification", () => {
  const clear = clearSkyIrradiance(45)!;
  for (const [ratio, kind] of [
    [0.9, "sunny"],
    [0.55, "partlycloudy"],
    [0.2, "cloudy"],
  ] as const) {
    const solar = reading(clear * ratio);
    const wet = observe(sun(), solar, noRain(), reading(1, ""));
    assert.equal(wet.kind, kind);
    assert.deepEqual(wet, observe(sun(), solar, noRain(), reading(0, "")));
    assert.deepEqual(
      wet,
      observe(sun(), solar, noRain(), reading(null, "", "unavailable")),
    );
  }
  assert.equal(
    observe(sun("below_horizon", -15), reading(0), noRain(), reading(1, ""))
      .kind,
    "night",
  );
  assert.equal(
    observe(sun("below_horizon", -15), reading(0), noRain(), dry).kind,
    "night",
  );
});

test("only a finite, positive, fresh WH40 rate in a valid rain unit has first priority", () => {
  for (const unit of ["mm/h", "mm/hr", "cm/h", "in/h", "in/hr", "m/h"]) {
    const result = observeWeather(
      undefined,
      reading(null, "W/m²", "missing"),
      reading(0.2, unit),
      reading(1, ""),
      { now },
    );
    assert.equal(result.kind, "rain", unit);
    assert.equal(result.estimated, false);
  }
  assert.equal(
    observe(sun("below_horizon", -20), reading(0), reading(0.1, "mm/h"), dry)
      .kind,
    "rain",
  );
  for (const invalid of [
    reading(Infinity, "mm/h"),
    reading(-1, "mm/h"),
    reading(NaN, "mm/h"),
    reading(2, "mm"),
    reading(2, "°C"),
  ])
    assert.notEqual(observe(sun(), reading(650), invalid).kind, "rain");
  for (const status of ["stale", "unavailable", "invalid", "missing"] as const)
    assert.notEqual(
      observe(sun(), reading(650), reading(1, "mm/h", status)).kind,
      "rain",
    );
  assert.equal(
    observe(sun(), reading(650), noRain(), reading(1, "")).kind,
    "sunny",
  );
});

test("sky thresholds are explicit heuristics with a ratio, never measured cloud-cover percentage or forecasts", () => {
  const clear = clearSkyIrradiance(42)!;
  const value = (ratio: number) =>
    observe(sun("above_horizon", 42), reading(clear * ratio));
  assert.equal(value(0.78).kind, "sunny");
  assert.equal(value(0.779).kind, "partlycloudy");
  assert.equal(value(0.4).kind, "partlycloudy");
  assert.equal(value(0.399).kind, "cloudy");
  assert.equal(value(0).kind, "cloudy");
  // Cloud-edge enhancement may exceed the approximate clear-sky model.
  assert.equal(value(1.2).kind, "sunny");
  assert.ok(Math.abs(value(0.55).clearSkyRatio! - 0.55) < 1e-12);
  assert.equal(value(0.9).estimated, true);
  assert.match(value(0.9).label, /geschätzt/);
  assert.match(value(0.9).note, /Verschattung/);
  assert.match(value(0.9).note, /keine Vorhersage/);
  assert.match(value(0.9).note, /keine.*gemessene Wolkenbedeckung/);
});

test("W/m² and kW/m² are equivalent; lux, unrelated units and invalid solar numbers cannot create a sky estimate", () => {
  const watts = observe(sun(), reading(650, "W/m²"));
  for (const unit of ["W/m2", "kW/m²", "kW/m2"]) {
    const result = observe(
      sun(),
      reading(unit.startsWith("kW") ? 0.65 : 650, unit),
    );
    assert.deepEqual(result, watts, unit);
  }
  for (const solar of [
    reading(650, "lx"),
    reading(650, "UV Index"),
    reading(650, ""),
    reading(NaN),
    reading(Infinity),
    reading(-1),
    reading(Number.MAX_VALUE, "kW/m²"),
  ])
    assert.equal(observe(sun(), solar).kind, "unknown");
  for (const status of ["missing", "invalid", "unavailable", "stale"] as const)
    assert.equal(observe(sun(), reading(null, "W/m²", status)).kind, "unknown");
});

test("twilight and malformed solar elevations suppress sky inference without fabricating sunrise weather", () => {
  for (const elevation of [0, 5, 11.999, -5]) {
    const result = observe(sun("above_horizon", elevation));
    assert.equal(result.kind, "unknown");
    assert.match(result.note, /unter 12°/);
  }
  assert.notEqual(
    observe(sun("above_horizon", 12), reading(170)).kind,
    "unknown",
  );
  for (const elevation of [
    undefined,
    null,
    true,
    "",
    " ",
    NaN,
    Infinity,
    100,
    -100,
    "invalid",
    "0x20",
    "0b10000",
  ]) {
    const source = sun();
    source.attributes.elevation = elevation;
    assert.equal(observe(source).kind, "unknown");
  }
  assert.notEqual(observe(sun("above_horizon", "45")).kind, "unknown");
  assert.equal(observe(sun("below_horizon", 10), reading(0)).kind, "unknown");
  assert.equal(observe(sun("unavailable", 30)).kind, "unknown");
  assert.equal(
    observeWeather(undefined, reading(650), noRain(), dry, { now }).kind,
    "unknown",
  );
});

test("night is an astronomical status, independent of solar measurement or piezo, not a claim of clear or dry sky", () => {
  const result = observe(
    sun("below_horizon", -20),
    reading(null, "W/m²", "missing"),
    noRain(),
    reading(1, ""),
  );
  assert.equal(result.kind, "night");
  assert.equal(result.estimated, false);
  assert.match(result.note, /kein Nachweis.*wolkenfreie.*niederschlagsfreie/);
  const source = sun("below_horizon");
  delete source.attributes.elevation;
  assert.equal(observe(source).kind, "night");
});

test("weather inference enforces its 30-minute freshness cap even with general age hints disabled", () => {
  const tooOld = new Date(now - 31 * 60_000).toISOString();
  assert.equal(observe(sun("above_horizon", 45, tooOld)).kind, "unknown");
  assert.equal(observe(sun("below_horizon", -20, tooOld)).kind, "unknown");
  assert.equal(
    observe(sun(), reading(650, "W/m²", "ok", tooOld)).kind,
    "unknown",
  );
  assert.notEqual(
    observe(sun(), reading(650), reading(1, "mm/h", "ok", tooOld)).kind,
    "rain",
  );
  assert.equal(observe(sun(), reading(650), noRain(), dry, 0).kind, "sunny");
  assert.equal(
    observe(
      sun(),
      reading(650, "W/m²", "ok", new Date(now - 6 * 60_000).toISOString()),
      noRain(),
      dry,
      5,
    ).kind,
    "unknown",
  );
  assert.equal(
    observe(sun(), reading(650, "W/m²", "ok", tooOld), noRain(), dry, 120).kind,
    "unknown",
  );
});

test("future, missing and malformed report metadata never establish current weather; real last_reported can refresh an unchanged state", () => {
  const future = new Date(now + 120_000).toISOString();
  for (const timestamp of [undefined, "not-a-time", future]) {
    const source = sun();
    source.last_updated = timestamp;
    assert.equal(observe(source).kind, "unknown");
    const solar = reading(650);
    solar.entity!.last_updated = timestamp;
    assert.equal(observe(sun(), solar).kind, "unknown");
    const rain = reading(1, "mm/h");
    rain.entity!.last_updated = timestamp;
    assert.notEqual(observe(sun(), reading(650), rain).kind, "rain");
  }
  const freshReport = reading(
    650,
    "W/m²",
    "ok",
    new Date(now - 3_600_000).toISOString(),
  );
  freshReport.entity!.last_reported = current;
  assert.equal(observe(sun(), freshReport).kind, "sunny");
});

test("missing rainfall observation leaves an explicit limitation on an otherwise supported sky estimate", () => {
  const result = observe(sun(), reading(650), reading(null, "mm/h", "missing"));
  assert.equal(result.kind, "sunny");
  assert.match(result.note, /Regenrate ist nicht verfügbar/);
  assert.match(result.note, /keine Aussage über Niederschlag/);
});
