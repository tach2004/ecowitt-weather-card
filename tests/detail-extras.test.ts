import test from "node:test";
import assert from "node:assert/strict";
import {
  selectWeatherDetailExtras, weatherExtraDetail,
} from "../src/detail-extras";
import type { CardConfig, HassEntity } from "../src/types";

const entity = (
  id: string, name: string, value: string, unit: string,
  deviceClass?: string,
): HassEntity => ({
  entity_id: id, state: value,
  attributes: {
    friendly_name: name, unit_of_measurement: unit,
    ...(deviceClass ? { device_class: deviceClass } : {}),
  },
});

test("configured hourly and total rain sensors appear only in rain details", () => {
  const states = {
    "sensor.demo_hourly_rain": entity("sensor.demo_hourly_rain", "Beispiel Stündliche Regenmenge", "2.3", "mm", "precipitation"),
    "sensor.demo_total_rain": entity("sensor.demo_total_rain", "Beispiel Gesamte Regenmenge", "84.6", "mm", "precipitation"),
    "sensor.demo_outdoor_temp": entity("sensor.demo_outdoor_temp", "Beispiel Außentemperatur", "11.2", "°C", "temperature"),
    "sensor.demo_battery": entity("sensor.demo_battery", "Beispiel Batterie", "95", "%", "battery"),
  };
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: { rain_today: "sensor.demo_total_rain" },
    device_status: [{
      device_id: "demo-rain-device", role: "WH40",
      battery: "sensor.demo_battery",
      extra_entities: [
        "sensor.demo_hourly_rain", "sensor.demo_total_rain",
        "sensor.demo_outdoor_temp", "sensor.demo_battery",
      ],
    }],
  };
  assert.deepEqual(selectWeatherDetailExtras(config, states, "rain"), [
    "sensor.demo_hourly_rain",
  ]);
  assert.deepEqual(selectWeatherDetailExtras(config, states, "temperature"), [
    "sensor.demo_outdoor_temp",
  ]);
  for (const detail of ["wind", "pressure", "sun"] as const)
    assert.deepEqual(selectWeatherDetailExtras(config, states, detail), []);
});

test("selected device extras and legacy extras deduplicate and keep category", () => {
  const states = {
    "sensor.demo_hourly_rain": entity("sensor.demo_hourly_rain", "Hourly Rainfall", "1", "mm"),
    "sensor.demo_pressure": entity("sensor.demo_pressure", "Pressure", "1012", "hPa", "atmospheric_pressure"),
    "sensor.demo_solar": entity("sensor.demo_solar", "Solar irradiance", "100", "W/m²", "irradiance"),
    "sensor.demo_wind": entity("sensor.demo_wind", "Max Gust", "31", "km/h", "wind_speed"),
    "sensor.demo_humidity": entity("sensor.demo_humidity", "Relative Humidity", "74", "%", "humidity"),
  };
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    device_status: [
      { device_id: "example-one", role: "WH40", extra_entities: ["sensor.demo_hourly_rain", "sensor.demo_solar"] },
      { device_id: "example-two", role: "GW3000", extra_entities: ["sensor.demo_hourly_rain", "sensor.demo_pressure"] },
    ],
    extra_entities: ["sensor.demo_wind", "sensor.demo_humidity", "sensor.demo_solar"],
  };
  assert.deepEqual(selectWeatherDetailExtras(config, states, "rain"), ["sensor.demo_hourly_rain"]);
  assert.deepEqual(selectWeatherDetailExtras(config, states, "pressure"), ["sensor.demo_pressure"]);
  assert.deepEqual(selectWeatherDetailExtras(config, states, "sun"), ["sensor.demo_solar"]);
  assert.deepEqual(selectWeatherDetailExtras(config, states, "wind"), ["sensor.demo_wind"]);
  assert.deepEqual(selectWeatherDetailExtras(config, states, "temperature"), ["sensor.demo_humidity"]);
});

test("diagnostics and ambiguous measurements stay out of weather detail tiles", () => {
  const states = {
    "sensor.demo_signal": entity("sensor.demo_signal", "Beispiel Signalqualität", "82", "%", "signal_strength"),
    "sensor.demo_voltage": entity("sensor.demo_voltage", "Solar Batterie Spannung", "3.0", "V", "voltage"),
    "sensor.demo_unknown": entity("sensor.demo_unknown", "Messkanal 1", "88", "%"),
    "sensor.demo_device_id": entity("sensor.demo_device_id", "Beispiel Hardware-ID", "999", ""),
    "sensor.demo_daily_rain": entity("sensor.demo_daily_rain", "Daily Rain", "11", "mm", "precipitation"),
    "binary_sensor.demo_connected": {
      entity_id: "binary_sensor.demo_connected", state: "on", attributes: {},
    },
  };
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    diagnostic_entities: ["sensor.demo_daily_rain"],
    device_status: [{
      device_id: "example-three", role: "WH40",
      signal: "sensor.demo_signal", connection: "binary_sensor.demo_connected",
      extra_entities: [
        "sensor.demo_signal", "sensor.demo_voltage",
        "sensor.demo_unknown", "sensor.demo_device_id",
        "binary_sensor.demo_connected",
      ],
    }],
  };
  for (const detail of ["rain", "temperature", "sun", "pressure", "wind"] as const)
    assert.deepEqual(selectWeatherDetailExtras(config, states, detail), []);
  assert.equal(weatherExtraDetail("sensor.demo_unknown", states["sensor.demo_unknown"]), null);
  assert.equal(weatherExtraDetail("binary_sensor.demo_connected", states["binary_sensor.demo_connected"]), null);
});

test("categorizes named rain and temperature extras if device class is absent", () => {
  const noClassRain = entity("sensor.demo_total", "Stündliche Regenmenge", "2", "mm");
  const noClassTemp = entity("sensor.demo_interior", "Innen-Temperatur", "22.4", "°C");
  const dewPoint = entity("sensor.demo_dew", "Taupunkt", "12.1", "°C");
  assert.equal(weatherExtraDetail(noClassRain.entity_id, noClassRain), "rain");
  assert.equal(weatherExtraDetail(noClassTemp.entity_id, noClassTemp), "temperature");
  assert.equal(weatherExtraDetail(dewPoint.entity_id, dewPoint), "temperature");
});
