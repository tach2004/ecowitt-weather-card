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
test("night and day lux thresholds preserve zero and form an ordered pair", () => {
  const defaults = normalizeConfig({ type: "custom:ecowitt-weather-card" });
  assert.equal(defaults.night_lux_threshold, 0);
  assert.equal(defaults.day_lux_threshold, 10);
  const zero = normalizeConfig({
    night_lux_threshold: 0, day_lux_threshold: 0,
  });
  assert.equal(zero.night_lux_threshold, 0);
  assert.equal(zero.day_lux_threshold, 1);
  const custom = normalizeConfig({
    night_lux_threshold: 5, day_lux_threshold: 80,
  });
  assert.equal(custom.night_lux_threshold, 5);
  assert.equal(custom.day_lux_threshold, 80);
  const invalid = normalizeConfig({
    night_lux_threshold: -500, day_lux_threshold: Infinity,
  });
  assert.equal(invalid.night_lux_threshold, 0);
  assert.equal(invalid.day_lux_threshold, 10);
  const reverse = normalizeConfig({
    night_lux_threshold: 100, day_lux_threshold: 10,
  });
  assert.equal(reverse.day_lux_threshold, 101);
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

test("device supplemental measurements normalize without dropping v0.1.2 legacy selections", () => {
  const input = {
    entities: {
      pressure: "sensor.fixture_pressure",
      wind_speed_avg: "sensor.fixture_mean_speed",
    },
    extra_entities: ["sensor.fixture_legacy_extra", "sensor.fixture_missing"],
    diagnostic_entities: [
      "sensor.fixture_legacy_status",
      "sensor.fixture_missing",
    ],
    device_status: [
      {
        device_id: " fixture-device ",
        role: "GW3000",
        show_on_main: true,
        battery: "sensor.fixture_battery",
        signal: "sensor.fixture_rssi",
        extra_entities: [
          " sensor.fixture_temperature ",
          "sensor.fixture_temperature",
          null,
          {},
          "sensor.fixture_missing",
        ],
      },
    ],
  };
  const before = structuredClone(input);
  const normalized = normalizeConfig(input);
  assert.deepEqual(normalized.extra_entities, input.extra_entities);
  assert.deepEqual(normalized.diagnostic_entities, input.diagnostic_entities);
  assert.deepEqual(normalized.entities, input.entities);
  assert.deepEqual(normalized.device_status?.[0]?.extra_entities, [
    "sensor.fixture_temperature",
    "sensor.fixture_missing",
  ]);
  assert.equal(
    normalized.device_status?.[0]?.battery,
    "sensor.fixture_battery",
  );
  assert.equal(normalized.device_status?.[0]?.device_id, "fixture-device");
  assert.deepEqual(input, before);
  assert.deepEqual(normalizeConfig(normalized), normalized);
});

test("malformed per-device supplemental fields cannot crash the editor or erase legacy sources", () => {
  const config = normalizeConfig({
    extra_entities: ["sensor.fixture_kept"],
    diagnostic_entities: ["sensor.fixture_battery"],
    device_status: [
      {
        device_id: "fixture",
        role: "WN31",
        extra_entities: { entity_id: "sensor.fixture_untyped" },
      },
    ],
  });
  assert.equal(config.device_status?.[0]?.extra_entities, undefined);
  assert.deepEqual(config.extra_entities, ["sensor.fixture_kept"]);
  assert.deepEqual(config.diagnostic_entities, ["sensor.fixture_battery"]);
});

test("untyped theme values are rejected without coercing YAML objects", () => {
  for (const theme_mode of [{ toString: null }, [], true, 42])
    assert.equal(normalizeConfig({ theme_mode }).theme_mode, "auto");
  assert.equal(normalizeConfig({ theme_mode: "light" }).theme_mode, "light");
});

test("saved device-role choices survive normalization without requiring a live registry", () => {
  const input = {
    device_roles: {
      GW3000: " fixture-manual-gateway ",
      WS90: "fixture-wind",
      WN32: "",
      UNKNOWN: "fixture-unknown",
      WH40: 42,
    },
    entities: {
      pressure: "sensor.fixture_pressure",
      temperature: "sensor.fixture_temperature",
    },
    extra_entities: ["sensor.fixture_legacy"],
  };
  const before = structuredClone(input);
  const normalized = normalizeConfig(input);
  assert.deepEqual(normalized.device_roles, {
    GW3000: "fixture-manual-gateway",
    WS90: "fixture-wind",
    WN32: "",
  });
  assert.deepEqual(normalized.entities, input.entities);
  assert.deepEqual(normalized.extra_entities, input.extra_entities);
  assert.deepEqual(
    normalizeConfig(normalized).device_roles,
    normalized.device_roles,
  );
  assert.deepEqual(input, before);
  normalized.device_roles!.GW3000 = "fixture-other";
  assert.equal(input.device_roles.GW3000, " fixture-manual-gateway ");
});

test("legacy cards and malformed device-role maps retain their existing sensor assignments", () => {
  const entities = { pressure: "sensor.fixture_selected_pressure" };
  for (const device_roles of [undefined, null, [], 42, "GW3000"]) {
    const normalized = normalizeConfig({ device_roles, entities });
    assert.equal(normalized.device_roles, undefined);
    assert.deepEqual(normalized.entities, entities);
  }
  assert.deepEqual(
    normalizeConfig({
      device_roles: { GW3000: { id: "fixture" }, WN32: "   " },
      entities,
    }).device_roles,
    { WN32: "" },
  );
});

test("optional weather, secondary rain and native windrose config survive editor normalization", () => {
  const native = {
    data_period: { period_back: "-48h" },
    rose_config: { wind_direction_count: 16 },
    windspeed_entities: [{ entity: "sensor.demo_speed", speed_unit: "kph" }],
  };
  const config = normalizeConfig({
    type: "custom:ecowitt-weather-card",
    weather_entity: "weather.demo_local",
    entities: { rain_rate_secondary: "sensor.demo_piezo_rate" },
    windrose: { enabled: false, config: native },
  });
  assert.equal(config.weather_entity, "weather.demo_local");
  assert.equal(config.entities?.rain_rate_secondary, "sensor.demo_piezo_rate");
  assert.equal(config.windrose?.enabled, false);
  assert.deepEqual(config.windrose?.config, native);
  assert.notEqual(config.windrose?.config, native);
  assert.equal(
    normalizeConfig({ weather_entity: "sensor.demo" }).weather_entity,
    undefined,
  );
  assert.equal(normalizeConfig({}).windrose?.enabled, true);
  assert.equal(
    normalizeConfig({ windrose: { config: [] } }).windrose?.config,
    undefined,
  );
});

test("card width and source average period normalize independently of native windrose variants", () => {
  const input = {
    max_width: 2200,
    wind_average_period_minutes: 10,
    entities: { pressure_absolute: "sensor.demo_absolute" },
    windrose: {
      card_type: "custom:windrose-card",
      config: { hide_windspeed_bar: false },
      variants: [
        { title: "Woche", config: { data_period: { period_back: "-7d" } } },
        {
          title: "Fork",
          card_type: "custom:my-windrose",
          config: { title: "Eigene Ansicht" },
        },
      ],
    },
  };
  const result = normalizeConfig(input);
  assert.equal(result.max_width, 2200);
  assert.equal(result.wind_average_period_minutes, 10);
  assert.equal(result.entities?.pressure_absolute, "sensor.demo_absolute");
  assert.deepEqual(result.windrose?.variants, input.windrose.variants);
  assert.notEqual(
    result.windrose?.variants?.[0].config,
    input.windrose.variants[0].config,
  );
  assert.equal(normalizeConfig({ max_width: 99999 }).max_width, 3200);
  assert.equal(normalizeConfig({}).max_width, 1380);
  assert.equal(normalizeConfig({}).wind_average_period_minutes, undefined);
});
