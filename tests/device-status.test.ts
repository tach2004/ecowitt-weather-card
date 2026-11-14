import test from "node:test";
import assert from "node:assert/strict";
import { deviceIndicators } from "../src/device-status";
import type { DeviceStatusConfig, HassEntity, HomeAssistant } from "../src/types";
const device: DeviceStatusConfig = {
  device_id: "ws90", role: "WS90",
  battery: "sensor.battery", signal: "sensor.signal",
  connection: "binary_sensor.link", show_on_main: true,
};
const entity = (id: string, state: string, unit = "", deviceClass?: string): HassEntity =>
  ({entity_id: id, state, attributes: {unit_of_measurement: unit, device_class: deviceClass}});
test("battery fill reflects only a true percent sensor, not a voltage reading", () => {
  const hass: HomeAssistant = {states: {
    "sensor.battery": entity("sensor.battery", "78", "%"),
    "sensor.signal": entity("sensor.signal", "-67", "dBm"),
    "binary_sensor.link": entity("binary_sensor.link", "on", "", "connectivity"),
  }};
  const indicators = deviceIndicators(hass, device);
  assert.equal(indicators.battery.percent, 78);
  assert.equal(indicators.signal.percent, undefined);
  assert.equal(indicators.connection.label, "Verbunden");
  hass.states["sensor.battery"] = entity("sensor.battery", "3.2", "V");
  assert.equal(deviceIndicators(hass, device).battery.percent, undefined);
  assert.match(deviceIndicators(hass, device).battery.label, /V/);
});
test("unconfigured and unrelated binary states do not imply online", () => {
  const indicators = deviceIndicators(undefined, device);
  assert.equal(indicators.connection.state, "unknown");
  const hass: HomeAssistant = {states: {"binary_sensor.link": entity("binary_sensor.link","on","","problem")}};
  assert.equal(deviceIndicators(hass, device).connection.state, "unknown");
  hass.states["binary_sensor.link"] = entity("binary_sensor.link", "off", "", "connectivity");
  assert.equal(deviceIndicators(hass, device).connection.state, "bad");
});
