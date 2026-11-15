import test from "node:test";
import assert from "node:assert/strict";
import { buildWindroseConfig, windroseConfigKey } from "../src/windrose";
import type { HomeAssistant } from "../src/types";
const entities = {
  wind_speed: "sensor.demo_speed",
  wind_direction: "sensor.demo_direction",
};
const hass: HomeAssistant = {
  states: {
    "sensor.demo_speed": {
      entity_id: "sensor.demo_speed",
      state: "8",
      attributes: { unit_of_measurement: "km/h" },
    },
    "sensor.demo_direction": {
      entity_id: "sensor.demo_direction",
      state: "292",
      attributes: { unit_of_measurement: "°" },
    },
  },
};

test("default windrose config uses actual selected sources and local Recorder history", () => {
  const config = buildWindroseConfig({ enabled: true }, entities, hass);
  assert.equal(config.type, "custom:windrose-card");
  assert.deepEqual(config.wind_direction_entity, {
    entity: entities.wind_direction,
  });
  assert.deepEqual(config.data_period, { period_back: "-24h" });
  assert.deepEqual(config.matching_strategy, { name: "full-time" });
  const speed = (config.windspeed_entities as Record<string, unknown>[])[0];
  assert.equal(speed.entity, entities.wind_speed);
  assert.equal(speed.speed_unit, "kph");
  assert.equal(speed.output_speed_unit, "kph");
  assert.equal(speed.output_speed_unit_label, "km/h");
});

test("supported source units map explicitly to upstream units without guessing or converting values", () => {
  for (const [source, unit] of [
    ["m/s", "mps"],
    ["km/h", "kph"],
    ["mph", "mph"],
    ["ft/s", "fps"],
    ["kn", "knots"],
  ]) {
    const copy = structuredClone(hass);
    copy.states[entities.wind_speed].attributes.unit_of_measurement = source;
    const speed = (
      buildWindroseConfig({}, entities, copy).windspeed_entities as Record<
        string,
        unknown
      >[]
    )[0];
    assert.equal(speed.speed_unit, unit);
    assert.equal(speed.output_speed_unit, unit);
  }
  const wrong = structuredClone(hass);
  wrong.states[entities.wind_speed].attributes.unit_of_measurement = "°C";
  assert.throws(
    () => buildWindroseConfig({}, entities, wrong),
    /Quelleneinheit/,
  );
});

test("existing complete upstream configuration is preserved, cloned and can use explicitly selected alternate sources", () => {
  const config = {
    title: "24h Wind",
    wind_direction_entity: {
      entity: entities.wind_direction,
      direction_compensation: 5,
    },
    windspeed_entities: [
      {
        entity: entities.wind_speed,
        speed_unit: "kph",
        output_speed_unit: "mph",
      },
    ],
    data_period: { period_back: "-7d" },
    buttons_config: {
      buttons: [
        {
          type: "period_selector",
          button_text: "Heute",
          preset_period: "today",
        },
      ],
    },
    actions: {
      windrose: {
        tap_action: { action: "more-info", entity: entities.wind_direction },
      },
    },
  };
  const expected = structuredClone(config);
  const result = buildWindroseConfig({ config }, undefined, hass);
  assert.equal(result.title, "24h Wind");
  assert.deepEqual(result.data_period, { period_back: "-7d" });
  assert.deepEqual(result.buttons_config, config.buttons_config);
  assert.deepEqual(result.actions, config.actions);
  (result.wind_direction_entity as Record<string, unknown>).entity =
    "sensor.changed";
  assert.deepEqual(config, expected);
});

test("reduced motion or disabled weather animation always disables embedded card animation", () => {
  for (const preferences of [{ reducedMotion: true }, { animation: false }])
    assert.equal(
      buildWindroseConfig(
        { config: { disable_animations: false } },
        entities,
        hass,
        preferences,
      ).disable_animations,
      true,
    );
  assert.equal(
    buildWindroseConfig(
      { config: { disable_animations: true } },
      entities,
      hass,
    ).disable_animations,
    true,
  );
  const reduced = buildWindroseConfig(
    {
      config: {
        current_direction: { show_arrow: true, arrow_size: 60 },
        compass_direction: {
          auto_rotate: true,
          entity: entities.wind_direction,
        },
        windspeed_entities: [
          {
            entity: entities.wind_speed,
            speed_unit: "kph",
            current_speed_arrow: true,
          },
        ],
      },
    },
    entities,
    hass,
    { reducedMotion: true },
  );
  assert.deepEqual(reduced.current_direction, {
    show_arrow: false,
    arrow_size: 60,
  });
  assert.equal(
    (reduced.windspeed_entities as Record<string, unknown>[])[0]
      .current_speed_arrow,
    false,
  );
  assert.equal(
    (reduced.compass_direction as Record<string, unknown>).auto_rotate,
    false,
  );
});

test("missing sources and malformed upstream configurations produce actionable setup errors", () => {
  assert.throws(
    () => buildWindroseConfig({}, undefined, hass),
    /Windrichtungsquelle/,
  );
  assert.throws(
    () =>
      buildWindroseConfig(
        { config: { windspeed_entities: [] } },
        entities,
        hass,
      ),
    /mindestens/,
  );
  assert.throws(
    () =>
      buildWindroseConfig(
        { config: { wind_direction_entity: { entity: "sensor.missing" } } },
        entities,
        hass,
      ),
    /nicht vorhanden/,
  );
  assert.throws(
    () =>
      buildWindroseConfig(
        { config: { wind_direction_entity: { entity: "" } } },
        entities,
        hass,
      ),
    /vorhandene/,
  );
  assert.throws(
    () =>
      buildWindroseConfig(
        { config: { wind_direction_entity: "sensor.demo_direction" } },
        entities,
        hass,
      ),
    /Konfigurationsobjekt/,
  );
});

test("config key ignores object key order but tracks changed nested settings", () => {
  assert.equal(
    windroseConfigKey({ b: { y: 2, x: 1 }, a: 0 }),
    windroseConfigKey({ a: 0, b: { x: 1, y: 2 } }),
  );
  assert.notEqual(
    windroseConfigKey({ b: { x: 1 } }),
    windroseConfigKey({ b: { x: 2 } }),
  );
});

test("automatic direction config rejects a source with incompatible units", () => {
  const wrong = structuredClone(hass);
  wrong.states[entities.wind_direction].attributes.unit_of_measurement = "°C";
  assert.throws(
    () => buildWindroseConfig({}, entities, wrong),
    /Windrichtungsquelle in Grad/,
  );
});
