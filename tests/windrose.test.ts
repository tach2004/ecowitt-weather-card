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


test("automatically configured gust adds native speed/gust selectors without changing sources or colors", () => {
  const copy = structuredClone(hass);
  copy.states["sensor.demo_gust"] = {
    entity_id: "sensor.demo_gust",
    state: "15",
    attributes: { unit_of_measurement: "km/h" },
  };
  const selected = { ...entities, wind_gust: "sensor.demo_gust" };
  const config = buildWindroseConfig(
    { config: { hide_windspeed_bar: false } },
    selected,
    copy,
  );
  assert.equal(config.hide_windspeed_bar, false);
  const speeds = config.windspeed_entities as Record<string, unknown>[];
  assert.deepEqual(
    speeds.map((speed) => speed.entity),
    [entities.wind_speed, "sensor.demo_gust"],
  );
  assert.deepEqual(
    speeds.map((speed) => speed.output_speed_unit),
    ["kph", "kph"],
  );
  assert.equal(speeds[1].name, "Böen");
  assert.equal(speeds[0].speed_ranges, undefined);
  assert.equal(speeds[1].speed_ranges, undefined);
  assert.deepEqual((config.buttons_config as { buttons: unknown[] }).buttons, [
    {
      type: "windrose_speed_selector",
      button_text: "Windgeschwindigkeit",
      windspeed_entity_index: 0,
      active: true,
    },
    {
      type: "windrose_speed_selector",
      button_text: "Böen",
      windspeed_entity_index: 1,
    },
  ]);
  // An ordinary wind-only configuration remains unchanged.
  assert.equal(buildWindroseConfig({}, entities, hass).buttons_config, undefined);
});

test("gusts use their own real input units but the main speed output unit", () => {
  const copy = structuredClone(hass);
  copy.states["sensor.demo_gust"] = {
    entity_id: "sensor.demo_gust",
    state: "6",
    attributes: { unit_of_measurement: "m/s" },
  };
  const result = buildWindroseConfig(
    {},
    { ...entities, wind_gust: "sensor.demo_gust" },
    copy,
  );
  const gust = (result.windspeed_entities as Record<string, unknown>[])[1];
  assert.equal(gust.speed_unit, "mps");
  assert.equal(gust.output_speed_unit, "kph");
  assert.equal(gust.output_speed_unit_label, "km/h");
});

test("missing, duplicate and unsupported gusts do not disrupt the original windrose", () => {
  const selected = { ...entities, wind_gust: "sensor.not_available" };
  const missing = buildWindroseConfig({}, selected, hass);
  assert.equal((missing.windspeed_entities as unknown[]).length, 1);
  assert.equal(missing.buttons_config, undefined);
  const same = buildWindroseConfig(
    {},
    { ...entities, wind_gust: entities.wind_speed },
    hass,
  );
  assert.equal((same.windspeed_entities as unknown[]).length, 1);
  const invalidHass = structuredClone(hass);
  invalidHass.states["sensor.demo_gust"] = {
    entity_id: "sensor.demo_gust",
    state: "8",
    attributes: { unit_of_measurement: "°C" },
  };
  const invalid = buildWindroseConfig(
    {},
    { ...entities, wind_gust: "sensor.demo_gust" },
    invalidHass,
  );
  assert.equal((invalid.windspeed_entities as unknown[]).length, 1);
  assert.equal(invalid.buttons_config, undefined);
});

test("auto speed selectors preserve native period buttons and all host timeframe variants", async () => {
  const { selectedWindrose } = await import("../src/windrose");
  const copy = structuredClone(hass);
  copy.states["sensor.demo_gust"] = {
    entity_id: "sensor.demo_gust",
    state: "17",
    attributes: { unit_of_measurement: "km/h" },
  };
  const options = {
    config: {
      buttons_config: {
        location: "bottom",
        buttons: [{ type: "period_selector", button_text: "Heute", preset_period: "today" }],
      },
    },
    variants: [
      { title: "24 Stunden", config: { data_period: { period_back: "-24h" } } },
      { title: "7 Tage", config: { data_period: { period_back: "-7d" } } },
      { title: "360 Tage", config: { data_period: { period_back: "-360d" } } },
    ],
  };
  for (const [index, period] of ["-24h", "-7d", "-360d"].entries()) {
    const result = buildWindroseConfig(
      selectedWindrose(options, index),
      { ...entities, wind_gust: "sensor.demo_gust" },
      copy,
    );
    assert.deepEqual(result.data_period, { period_back: period });
    const buttons = (result.buttons_config as { buttons: Record<string, unknown>[] }).buttons;
    assert.equal(buttons[0].type, "windrose_speed_selector");
    assert.equal(buttons[1].type, "windrose_speed_selector");
    assert.equal(buttons[2].type, "period_selector");
    assert.equal((result.buttons_config as { location: string }).location, "bottom");
  }
  assert.equal(options.config.buttons_config.buttons.length, 1);
});

test("explicit native speed sources and speed-selector buttons take precedence", () => {
  const copy = structuredClone(hass);
  copy.states["sensor.demo_gust"] = {
    entity_id: "sensor.demo_gust",
    state: "17",
    attributes: { unit_of_measurement: "km/h" },
  };
  const mapped = { ...entities, wind_gust: "sensor.demo_gust" };
  const explicit = {
    windspeed_entities: [
      { entity: entities.wind_speed, name: "Eigene Quelle", speed_unit: "kph" },
    ],
    buttons_config: { buttons: [{ type: "period_selector", button_text: "Heute" }] },
  };
  const first = buildWindroseConfig({ config: explicit }, mapped, copy);
  assert.deepEqual(first.windspeed_entities, explicit.windspeed_entities);
  assert.deepEqual(first.buttons_config, explicit.buttons_config);
  const manualButtons = {
    buttons: [
      { type: "windrose_speed_selector", windspeed_entity_index: 0, button_text: "Eigene Wahl" },
    ],
  };
  const second = buildWindroseConfig(
    { config: { buttons_config: manualButtons } },
    mapped,
    copy,
  );
  assert.deepEqual(second.buttons_config, manualButtons);
  assert.equal((second.windspeed_entities as unknown[]).length, 2);
  const disabledAnimations = buildWindroseConfig(
    { config: {} },
    mapped,
    copy,
    { reducedMotion: true },
  );
  assert.equal(
    (disabledAnimations.windspeed_entities as unknown[]).length,
    2,
  );
  assert.deepEqual(disabledAnimations.buttons_config, {
    buttons: [
      {
        type: "windrose_speed_selector",
        button_text: "Windgeschwindigkeit",
        windspeed_entity_index: 0,
        active: true,
      },
      {
        type: "windrose_speed_selector",
        button_text: "Böen",
        windspeed_entity_index: 1,
      },
    ],
  });
});


test("embedded native speed view follows live wind and day-max gust without changing historical gust samples", () => {
  const state = structuredClone(hass);
  state.states["sensor.demo_gust"] = {
    entity_id:"sensor.demo_gust",state:"14",attributes:{unit_of_measurement:"km/h"},
  };
  state.states["sensor.demo_daily_gust"] = {
    entity_id:"sensor.demo_daily_gust",state:"44.6",attributes:{unit_of_measurement:"km/h"},
  };
  const mapping={...entities,wind_gust:"sensor.demo_gust",wind_gust_max:"sensor.demo_daily_gust"};
  const options={config:{hide_windspeed_bar:false,buttons_config:{location:"bottom"}}};
  const original=buildWindroseConfig(options,mapping,state);
  const normal=prepareEmbeddedSpeedSwitch(options,original,mapping,state,"wind");
  assert.equal(normal.managed,true);
  assert.equal(normal.config.buttons_config,undefined);
  assert.equal((normal.config.corner_info as any).top_left.entity,entities.wind_direction);
  assert.deepEqual((normal.config.corner_info as any).top_right,{
    label:"Windgeschwindigkeit",entity:entities.wind_speed,unit:" km/h",precision:1,
  });
  const gust=prepareEmbeddedSpeedSwitch(options,original,mapping,state,"gust");
  assert.equal((gust.config.corner_info as any).top_right.label,"Max. Böe heute");
  assert.equal((gust.config.corner_info as any).top_right.entity,"sensor.demo_daily_gust");
  const sources=gust.config.windspeed_entities as any[];
  assert.equal(sources[0].use_for_windrose,false);
  assert.equal(sources[1].use_for_windrose,true);
  assert.equal(sources[1].entity,"sensor.demo_gust");
  assert.equal(original.windspeed_entities && (original.windspeed_entities as any[])[0].use_for_windrose,undefined);
  assert.equal((original.buttons_config as any).buttons.length,2);
});

test("missing daily-max gust is never presented as a fabricated maximum",()=>{
  const state=structuredClone(hass);
  state.states["sensor.demo_gust"]={
    entity_id:"sensor.demo_gust",state:"12",attributes:{unit_of_measurement:"km/h"},
  };
  const mapping={...entities,wind_gust:"sensor.demo_gust",wind_gust_max:"sensor.unknown"};
  const options={config:{}};
  const config=buildWindroseConfig(options,mapping,state);
  const selected=prepareEmbeddedSpeedSwitch(options,config,mapping,state,"gust");
  assert.equal((selected.config.corner_info as any).top_right.label,"Böen aktuell");
  assert.equal((selected.config.corner_info as any).top_right.entity,"sensor.demo_gust");
  assert.equal(selected.managed,true);
});

test("user-managed windrose sources and speed selectors remain untouched",()=>{
  const state=structuredClone(hass);
  state.states["sensor.demo_gust"]={
    entity_id:"sensor.demo_gust",state:"12",attributes:{unit_of_measurement:"km/h"},
  };
  const mapping={...entities,wind_gust:"sensor.demo_gust"};
  const custom={
    config:{
      buttons_config:{location:"bottom",buttons:[
        {type:"windrose_speed_selector",button_text:"My own button",windspeed_entity_index:0}
      ]},
    },
  };
  const original=buildWindroseConfig(custom,mapping,state);
  const prepared=prepareEmbeddedSpeedSwitch(custom,original,mapping,state,"gust");
  assert.equal(prepared.managed,false);
  assert.strictEqual(prepared.config,original);
  const explicit={
    config:{windspeed_entities:[{entity:entities.wind_speed,name:"Custom"}]},
  };
  const customSources=buildWindroseConfig(explicit,mapping,state);
  assert.equal(prepareEmbeddedSpeedSwitch(explicit,customSources,mapping,state,"gust").managed,false);
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

test("native custom type and complete variant options select exactly the requested installed element", async () => {
  const { selectedWindrose, windroseElementName } =
    await import("../src/windrose");
  const options = {
    config: { hide_windspeed_bar: false },
    variants: [
      {
        title: "Tag",
        config: {
          type: "custom:forked-windrose",
          data_period: { period_back: "-24h" },
          buttons_config: {
            buttons: [{ type: "period_selector", preset_period: "today" }],
          },
        },
      },
      { title: "Woche", config: { data_period: { period_back: "-7d" } } },
    ],
  };
  const first = buildWindroseConfig(
    selectedWindrose(options, 0),
    entities,
    hass,
  );
  assert.equal(first.type, "custom:forked-windrose");
  assert.equal(first.hide_windspeed_bar, false);
  assert.deepEqual(
    first.buttons_config,
    options.variants[0].config.buttons_config,
  );
  assert.equal(windroseElementName(first.type), "forked-windrose");
  const second = buildWindroseConfig(
    selectedWindrose(options, 1),
    entities,
    hass,
  );
  assert.equal(second.type, "custom:windrose-card");
  assert.deepEqual(second.data_period, { period_back: "-7d" });
  assert.throws(
    () => windroseElementName("https://example.test/code.js"),
    /Kartentyp/,
  );
});
