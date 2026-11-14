import test from "node:test";
import assert from "node:assert/strict";
import { deviceIndicators } from "../src/device-status";
import type {
  DeviceStatusConfig,
  HassEntity,
  HomeAssistant,
} from "../src/types";
const now = Date.parse("2026-11-14T12:00:00Z");
const options = { now };
const device: DeviceStatusConfig = {
  device_id: "fixture-ws90",
  role: "WS90",
  battery: "sensor.fixture_battery",
  signal: "sensor.fixture_signal",
  connection: "binary_sensor.fixture_link",
  show_on_main: true,
};
const entity = (
  id: string,
  state: string,
  unit = "",
  deviceClass?: string,
  extra: Partial<HassEntity> = {},
): HassEntity => ({
  entity_id: id,
  state,
  attributes: { unit_of_measurement: unit, device_class: deviceClass },
  last_updated: new Date(now).toISOString(),
  ...extra,
});
function sources(): HomeAssistant {
  return {
    states: {
      "sensor.fixture_battery": entity(
        "sensor.fixture_battery",
        "78",
        "%",
        "battery",
      ),
      "sensor.fixture_signal": entity(
        "sensor.fixture_signal",
        "-67",
        "dBm",
        "signal_strength",
      ),
      "binary_sensor.fixture_link": entity(
        "binary_sensor.fixture_link",
        "on",
        "",
        "connectivity",
      ),
    },
  };
}
test("battery fill reflects only a source percent, never voltage or signal", () => {
  const hass = sources();
  const indicators = deviceIndicators(hass, device, options);
  assert.equal(indicators.battery.percent, 78);
  assert.equal(indicators.signal.percent, undefined);
  assert.equal(indicators.signal.label, "-67 dBm");
  assert.equal(indicators.connection.label, "Verbunden");
  for (const [unit, dc, value] of [
    ["V", "voltage", "3.2"],
    ["mV", "voltage", "3200"],
    ["V", "battery", "3.2"],
    ["V", undefined, "3.2"],
  ] as const) {
    hass.states["sensor.fixture_battery"] = entity(
      "sensor.fixture_battery",
      value,
      unit,
      dc,
    );
    const battery = deviceIndicators(hass, device, options).battery;
    assert.equal(battery.percent, undefined);
    assert.equal(battery.state, "ok");
    assert.match(battery.label, new RegExp(unit));
  }
});
test("battery percentage and voltage validate ranges, classes and domains", () => {
  const hass = sources();
  for (const value of ["0", "100"]) {
    hass.states["sensor.fixture_battery"] = entity(
      "sensor.fixture_battery",
      value,
      "%",
      "battery",
    );
    assert.equal(
      deviceIndicators(hass, device, options).battery.percent,
      Number(value),
    );
  }
  for (const [value, unit, dc] of [
    ["101", "%", "battery"],
    ["-1", "%", "battery"],
    ["-0.1", "V", "voltage"],
    ["76", "%", "humidity"],
    ["23", "°C", "temperature"],
    ["3.2", "V", "temperature"],
    ["1", "", "battery"],
  ] as const) {
    hass.states["sensor.fixture_battery"] = entity(
      "sensor.fixture_battery",
      value,
      unit,
      dc,
    );
    assert.equal(
      deviceIndicators(hass, device, options).battery.state,
      "unknown",
      `${value} ${unit} ${dc}`,
    );
    assert.equal(
      deviceIndicators(hass, device, options).battery.percent,
      undefined,
    );
  }
  hass.states["sensor.fixture_battery"] = entity(
    "number.fixture_control",
    "78",
    "%",
    "battery",
  );
  assert.equal(
    deviceIndicators(hass, device, options).battery.state,
    "unknown",
  );
});
test("binary HA battery class means low/normal, never a fabricated percentage", () => {
  const hass = sources();
  const binaryDevice = { ...device, battery: "binary_sensor.fixture_battery" };
  for (const [value, state] of [
    ["on", "bad"],
    ["off", "ok"],
  ] as const) {
    hass.states["binary_sensor.fixture_battery"] = entity(
      "binary_sensor.fixture_battery",
      value,
      "",
      "battery",
    );
    const battery = deviceIndicators(hass, binaryDevice, options).battery;
    assert.equal(battery.state, state);
    assert.equal(battery.percent, undefined);
  }
});
test("Ecowitt source percentages and raw quality stay unchanged; no RSSI conversion is invented", () => {
  const hass = sources();
  for (const [value, unit, label] of [
    ["75", "%", "75 %"],
    ["3", "", "3"],
    ["-67", "dBm", "-67 dBm"],
    ["12", "dB", "12 dB"],
  ] as const) {
    hass.states["sensor.fixture_signal"] = entity(
      "sensor.fixture_signal",
      value,
      unit,
    );
    const signal = deviceIndicators(hass, device, options).signal;
    assert.equal(signal.state, "ok");
    assert.equal(signal.label, label);
    assert.equal(signal.percent, undefined);
  }
  for (const [value, unit, dc] of [
    ["101", "%", undefined],
    ["-1", "%", undefined],
    ["22", "°C", "temperature"],
    ["76", "%", "humidity"],
    ["5", "V", "voltage"],
    ["50", "%", "signal_strength"],
  ] as const) {
    hass.states["sensor.fixture_signal"] = entity(
      "sensor.fixture_signal",
      value,
      unit,
      dc,
    );
    assert.equal(
      deviceIndicators(hass, device, options).signal.state,
      "unknown",
      `${value} ${unit}`,
    );
  }
});
test("connectivity requires appropriate binary class or an explicit status sensor", () => {
  const hass = sources();
  assert.equal(deviceIndicators(hass, device, options).connection.state, "ok");
  hass.states["binary_sensor.fixture_link"] = entity(
    "binary_sensor.fixture_link",
    "off",
    "",
    "connectivity",
  );
  assert.equal(deviceIndicators(hass, device, options).connection.state, "bad");
  for (const dc of [undefined, "problem", "battery", "moisture"]) {
    hass.states["binary_sensor.fixture_link"] = entity(
      "binary_sensor.fixture_link",
      "on",
      "",
      dc,
    );
    assert.equal(
      deviceIndicators(hass, device, options).connection.state,
      "unknown",
      dc,
    );
  }
  const statusDevice = { ...device, connection: "sensor.fixture_link" };
  for (const [value, state] of [
    ["online", "ok"],
    ["connected", "ok"],
    ["offline", "bad"],
    ["disconnected", "bad"],
  ] as const) {
    hass.states["sensor.fixture_link"] = entity(
      "sensor.fixture_link",
      value,
      "",
      "enum",
    );
    assert.equal(
      deviceIndicators(hass, statusDevice, options).connection.state,
      state,
    );
  }
  hass.states["sensor.fixture_link"] = entity(
    "sensor.fixture_link",
    "online",
    "",
    "temperature",
  );
  assert.equal(
    deviceIndicators(hass, statusDevice, options).connection.state,
    "unknown",
  );
  hass.states["sensor.fixture_link"] = entity("switch.fixture_link", "online");
  assert.equal(
    deviceIndicators(hass, statusDevice, options).connection.state,
    "unknown",
  );
});
test("missing, unavailable and nonnumeric source states remain unknown", () => {
  assert.equal(
    deviceIndicators(undefined, device, options).connection.state,
    "unknown",
  );
  assert.equal(
    deviceIndicators(
      { states: {} },
      { device_id: "fixture", role: "WS90" },
      options,
    ).battery.label,
    "Nicht zugeordnet",
  );
  const hass = sources();
  for (const value of [
    "unknown",
    "unavailable",
    "NaN",
    "Infinity",
    "0x10",
    "",
  ]) {
    hass.states["sensor.fixture_battery"] = entity(
      "sensor.fixture_battery",
      value,
      "%",
      "battery",
    );
    hass.states["sensor.fixture_signal"] = entity(
      "sensor.fixture_signal",
      value,
      "dBm",
      "signal_strength",
    );
    const indicators = deviceIndicators(hass, device, options);
    assert.equal(indicators.battery.state, "unknown", value);
    assert.equal(indicators.signal.state, "unknown", value);
    assert.equal(indicators.battery.percent, undefined);
  }
});
test("stale and future status sources cannot imply current connection or battery fill", () => {
  const hass = sources();
  for (const id of Object.keys(hass.states))
    hass.states[id].last_updated = "2026-11-14T10:00:00Z";
  let indicators = deviceIndicators(hass, device, {
    now,
    staleAfterMinutes: 5,
  });
  for (const value of Object.values(indicators)) {
    assert.equal(value.state, "unknown");
    assert.equal(value.label, "Veraltet");
    assert.equal(value.percent, undefined);
  }
  for (const id of Object.keys(hass.states))
    hass.states[id].last_reported = "2026-11-14T11:59:00Z";
  indicators = deviceIndicators(hass, device, { now, staleAfterMinutes: 5 });
  assert.equal(indicators.connection.state, "ok");
  assert.equal(indicators.battery.percent, 78);
  for (const id of Object.keys(hass.states))
    hass.states[id].last_reported = "2026-11-15T12:00:00Z";
  indicators = deviceIndicators(hass, device, options);
  for (const value of Object.values(indicators))
    assert.equal(value.state, "unknown");
});
test("unknown status time does not establish a connection; age checks are opt-in for raw numeric values", () => {
  const hass = sources();
  for (const entity of Object.values(hass.states))
    entity.last_updated = undefined;
  const indicators = deviceIndicators(hass, device, options);
  assert.equal(indicators.connection.state, "unknown");
  assert.equal(indicators.connection.label, "Zeitpunkt unbekannt");
  assert.equal(indicators.battery.percent, 78);
  assert.match(indicators.battery.detail, /zeitpunkt/i);
  assert.equal(
    deviceIndicators(hass, device, { now, staleAfterMinutes: 5 }).battery.state,
    "unknown",
  );
  hass.states["binary_sensor.fixture_link"].last_updated = "invalid";
  assert.equal(
    deviceIndicators(hass, device, options).connection.state,
    "unknown",
  );
});
