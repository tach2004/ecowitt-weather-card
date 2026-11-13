import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/config";

test("malformed YAML top levels fail with actionable configuration guidance", () => {
  for (const value of [
    null,
    undefined,
    "type: custom:ecowitt-weather-card",
    42,
    true,
    [],
  ])
    assert.throws(() => normalizeConfig(value), /YAML-Objekt/);
});
test("untyped labels, image sources and lists cannot crash card rendering", () => {
  const config = normalizeConfig({
    title: { unexpected: "object" },
    subtitle: ["array"],
    site_image: 42,
    background_image: false,
    entities: ["sensor.fixture"],
    extra_entities: { id: "sensor.fixture" },
    diagnostic_entities: "sensor.fixture",
  });
  assert.equal(config.title, undefined);
  assert.equal(config.subtitle, undefined);
  assert.equal(config.site_image, undefined);
  assert.equal(config.background_image, undefined);
  assert.deepEqual(config.entities, {});
  assert.equal(config.extra_entities, undefined);
  assert.equal(config.diagnostic_entities, undefined);
});
test("real source selections are retained, unknown keys and non-string IDs are removed", () => {
  const config = normalizeConfig({
    entities: {
      temperature: " sensor.fixture_temperature ",
      wind_speed: "sensor.missing_but_configured",
      rain_today: 23,
      rain_wet: { state: "on" },
      uv: " ",
      unknown_metric: "sensor.fixture_unknown",
    },
    extra_entities: [
      "sensor.fixture",
      null,
      " sensor.fixture ",
      {},
      "binary_sensor.fixture",
    ],
    diagnostic_entities: ["sensor.fixture_battery", false],
  });
  assert.deepEqual(config.entities, {
    temperature: "sensor.fixture_temperature",
    wind_speed: "sensor.missing_but_configured",
  });
  assert.deepEqual(config.extra_entities, [
    "sensor.fixture",
    "binary_sensor.fixture",
  ]);
  assert.deepEqual(config.diagnostic_entities, ["sensor.fixture_battery"]);
});
test("numeric editor options stay finite and inside their supported ranges", () => {
  const config = normalizeConfig({
    image_rotation: 900,
    image_target_x: -10,
    image_target_y: 101,
    history_hours: 1000,
    stale_after_minutes: -5,
  });
  assert.equal(config.image_rotation, 180);
  assert.equal(config.image_target_x, 10);
  assert.equal(config.image_target_y, 90);
  assert.equal(config.history_hours, 168);
  assert.equal(config.stale_after_minutes, 0);
  const invalid = normalizeConfig({
    image_rotation: "90",
    image_target_x: NaN,
    image_target_y: Infinity,
    history_hours: "24",
    stale_after_minutes: { value: 10 },
  });
  for (const key of [
    "image_rotation",
    "image_target_x",
    "image_target_y",
    "history_hours",
    "stale_after_minutes",
  ] as const)
    assert.equal(invalid[key], undefined);
});
test("config normalization preserves grid placement and does not mutate input YAML", () => {
  const input = {
    type: "custom:anything",
    title: " Wetter ",
    site_image: " /local/generic-example.svg ",
    entities: { temperature: "sensor.fixture" },
    grid_options: { columns: "full", rows: "auto" },
  };
  const result = normalizeConfig(input);
  assert.equal(result.type, "custom:ecowitt-weather-card");
  assert.equal(result.title, "Wetter");
  assert.equal(result.site_image, "/local/generic-example.svg");
  assert.deepEqual(result.grid_options, input.grid_options);
  assert.notEqual(result.grid_options, input.grid_options);
  assert.equal(input.title, " Wetter ");
  result.entities!.temperature = "sensor.changed";
  assert.equal(input.entities.temperature, "sensor.fixture");
});
