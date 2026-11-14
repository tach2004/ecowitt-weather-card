import test from "node:test";
import assert from "node:assert/strict";
import { candidateEntities, uniqueRoleDevices } from "../src/suggestions";
import type { HassEntity, HomeAssistant } from "../src/types";
const state = (id: string, deviceClass?: string): HassEntity => ({
  entity_id: id,
  state: "10",
  attributes: {
    device_class: deviceClass,
    unit_of_measurement:
      deviceClass === "temperature"
        ? "°C"
        : deviceClass === "precipitation"
          ? "mm"
          : id.includes("direction")
            ? "°"
            : "km/h",
  },
});

test("device assistant uses unique actual registry models and leaves ambiguous roles empty", () => {
  assert.deepEqual(
    uniqueRoleDevices([
      { id: "a", model: "WS90" },
      { id: "b", model: "WH31" },
    ]),
    { WS90: "a", WN31: "b" },
  );
  assert.deepEqual(
    uniqueRoleDevices([
      { id: "a", model: "WS90" },
      { id: "b", model: "WS90" },
    ]),
    {},
  );
});

test("suggestions preserve device boundaries, semantic source and enabled actual entities", () => {
  const ids = [
    "sensor.test_wind_speed",
    "sensor.test_wind_speed_avg",
    "sensor.test_wind_gust",
    "sensor.test_wind_gust_max_daily",
    "sensor.test_wind_direction",
    "sensor.test_wind_direction_avg",
    "sensor.foreign_wind_speed",
  ];
  const hass: HomeAssistant = {
    states: Object.fromEntries(ids.map((id) => [id, state(id)])),
  };
  const registry = ids.map((id) => ({
    entity_id: id,
    device_id: id.startsWith("sensor.foreign") ? "other" : "ws",
  }));
  registry.push({
    entity_id: "sensor.not_in_hass_wind_speed",
    device_id: "ws",
  });
  assert.deepEqual(
    candidateEntities("wind_speed", hass, registry, { WS90: "ws" }),
    ["sensor.test_wind_speed"],
  );
  assert.deepEqual(
    candidateEntities("wind_speed_avg", hass, registry, { WS90: "ws" }),
    ["sensor.test_wind_speed_avg"],
  );
  assert.deepEqual(
    candidateEntities("wind_gust_max", hass, registry, { WS90: "ws" }),
    ["sensor.test_wind_gust_max_daily"],
  );
  assert.deepEqual(
    candidateEntities("wind_direction_avg", hass, registry, { WS90: "ws" }),
    ["sensor.test_wind_direction_avg"],
  );
  assert.deepEqual(candidateEntities("wind_speed", hass, registry, {}), []);
});

test("WN32 is preferred only when selected, WH40 daily and rolling 24h remain distinct", () => {
  const hass: HomeAssistant = {
    states: {
      "sensor.outside_temp": state("sensor.outside_temp", "temperature"),
      "sensor.station_temp": state("sensor.station_temp", "temperature"),
      "sensor.wh40_daily_rain": state(
        "sensor.wh40_daily_rain",
        "precipitation",
      ),
      "sensor.wh40_rain_24h": state("sensor.wh40_rain_24h", "precipitation"),
    },
  };
  const registry = [
    { entity_id: "sensor.outside_temp", device_id: "wn" },
    { entity_id: "sensor.station_temp", device_id: "ws" },
    { entity_id: "sensor.wh40_daily_rain", device_id: "wh" },
    { entity_id: "sensor.wh40_rain_24h", device_id: "wh" },
  ];
  assert.deepEqual(
    candidateEntities("temperature", hass, registry, {
      WS90: "ws",
      WN32: "wn",
    }),
    ["sensor.outside_temp"],
  );
  assert.deepEqual(
    candidateEntities("rain_today", hass, registry, { WH40: "wh" }),
    ["sensor.wh40_daily_rain"],
  );
  assert.deepEqual(
    candidateEntities("rain_24h", hass, registry, { WH40: "wh" }),
    ["sensor.wh40_rain_24h"],
  );
});

test("suggestions reject matching names with incompatible units, controls and disabled sources", () => {
  const hass: HomeAssistant = {
    states: {
      "sensor.wind_chill": state("sensor.wind_chill", "temperature"),
      "sensor.wind_speed": state("sensor.wind_speed"),
      "number.wind_speed": state("number.wind_speed"),
      "sensor.wind_speed_disabled": state("sensor.wind_speed_disabled"),
    },
  };
  const registry = Object.keys(hass.states).map((id) => ({
    entity_id: id,
    device_id: "ws",
    disabled_by: id.includes("disabled") ? "user" : null,
  }));
  assert.deepEqual(
    candidateEntities("wind_speed", hass, registry, { WS90: "ws" }),
    ["sensor.wind_speed"],
  );
});

test("daily rainfall suggestion does not claim rolling or seven-day totals are today", () => {
  const hass: HomeAssistant = {
    states: {
      "sensor.rain_daily": state("sensor.rain_daily", "precipitation"),
      "sensor.regen_7_tage": state("sensor.regen_7_tage", "precipitation"),
      "sensor.rain_rolling_day": state(
        "sensor.rain_rolling_day",
        "precipitation",
      ),
    },
  };
  const registry = Object.keys(hass.states).map((id) => ({
    entity_id: id,
    device_id: "wh",
  }));
  assert.deepEqual(
    candidateEntities("rain_today", hass, registry, { WH40: "wh" }),
    ["sensor.rain_daily"],
  );
});

test("derived temperature suggestions may fall back to an actual WS90 source absent on WN32", () => {
  const hass: HomeAssistant = {
    states: {
      "sensor.wn32_temperature": state(
        "sensor.wn32_temperature",
        "temperature",
      ),
      "sensor.ws90_feels_like": state("sensor.ws90_feels_like", "temperature"),
    },
  };
  const registry = [
    { entity_id: "sensor.wn32_temperature", device_id: "wn" },
    { entity_id: "sensor.ws90_feels_like", device_id: "ws" },
  ];
  assert.deepEqual(
    candidateEntities("temperature", hass, registry, {
      WN32: "wn",
      WS90: "ws",
    }),
    ["sensor.wn32_temperature"],
  );
  assert.deepEqual(
    candidateEntities("feels_like", hass, registry, { WN32: "wn", WS90: "ws" }),
    ["sensor.ws90_feels_like"],
  );
});

test("daily extrema and current values never suggest clearly different aggregation periods", () => {
  const hass: HomeAssistant = {
    states: {
      "sensor.wind_gust_max_daily": state("sensor.wind_gust_max_daily"),
      "sensor.wind_gust_max_year": state("sensor.wind_gust_max_year"),
      "sensor.wind_gust_max": state("sensor.wind_gust_max"),
      "sensor.temperature_max_daily": state(
        "sensor.temperature_max_daily",
        "temperature",
      ),
      "sensor.temperature_max_year": state(
        "sensor.temperature_max_year",
        "temperature",
      ),
      "sensor.humidity_max_daily": {
        ...state("sensor.humidity_max_daily", "humidity"),
        attributes: { device_class: "humidity", unit_of_measurement: "%" },
      },
    },
  };
  const registry = Object.keys(hass.states).map((id) => ({
    entity_id: id,
    device_id: "ws",
  }));
  assert.deepEqual(
    candidateEntities("wind_gust_max", hass, registry, { WS90: "ws" }),
    ["sensor.wind_gust_max_daily"],
  );
  assert.deepEqual(
    candidateEntities("temperature_max", hass, registry, { WS90: "ws" }),
    ["sensor.temperature_max_daily"],
  );
  assert.deepEqual(
    candidateEntities("humidity", hass, registry, { WS90: "ws" }),
    [],
  );
});
