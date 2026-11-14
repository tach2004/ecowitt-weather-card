import test from "node:test";
import assert from "node:assert/strict";
import { METRICS } from "../src/types";
import { normalizeConfig } from "../src/config";

/** Every metric reached by a detail view needs metadata, otherwise that view crashes. */
test("WS90 lux and VPD are registered for the visual editor and survive YAML normalization", () => {
  const metrics = new Map(METRICS.map((metric) => [metric.key, metric]));
  assert.equal(metrics.size, METRICS.length, "Duplicate metric metadata entry");
  assert.equal(metrics.get("vpd")?.group, "Außenklima");
  assert.equal(metrics.get("solar_lux")?.group, "Druck & Sonne");
  const card = normalizeConfig({
    type: "custom:ecowitt-weather-card",
    entities: {
      vpd: "sensor.fixture_vpd",
      solar_lux: "sensor.fixture_solar_lux",
    },
  });
  assert.equal(card.entities?.vpd, "sensor.fixture_vpd");
  assert.equal(card.entities?.solar_lux, "sensor.fixture_solar_lux");
});

test("every configured non-deprecated metric has a descriptive label", () => {
  for (const metric of METRICS) {
    assert(metric.key.length > 0);
    assert(metric.label.length > 0);
    assert(metric.group.length > 0);
  }
});
