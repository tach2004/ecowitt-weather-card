import test from "node:test";
import assert from "node:assert/strict";
import {
  directionLabel,
  entityFreshness,
  isUnitValid,
  numericState,
  flowBearing,
  getReading,
  getWetStatus,
  normalizeDegrees,
  unwrapDegrees,
} from "../src/data";
import type {
  CardConfig,
  HassEntity,
  HomeAssistant,
  MetricKey,
} from "../src/types";
const now = Date.parse("2026-11-13T20:00:00Z");
function entity(
  state: string,
  unit = "",
  extra: Partial<HassEntity> = {},
): HassEntity {
  return {
    entity_id: "sensor.fixture",
    state,
    attributes: { unit_of_measurement: unit },
    last_updated: new Date(now).toISOString(),
    ...extra,
  };
}
function reading(
  key: MetricKey,
  state: string,
  unit: string,
  config: Partial<CardConfig> = {},
) {
  const id = key === "rain_wet" ? "binary_sensor.fixture" : "sensor.fixture";
  const hass: HomeAssistant = {
    states: {
      [id]: entity(state, unit, {
        entity_id: id,
        attributes: {
          unit_of_measurement: unit,
          ...(key === "rain_wet" ? { device_class: "moisture" } : {}),
        },
      }),
    },
  };
  return getReading(
    hass,
    {
      type: "custom:ecowitt-weather-card",
      entities: { [key]: id },
      ...config,
    },
    key,
    now,
  );
}
test("meteorological N/O/S/W produces flow toward the house from its source side", () => {
  for (const [from, to, label] of [
    [0, 180, "N"],
    [90, 270, "O"],
    [180, 0, "S"],
    [270, 90, "W"],
    [292, 112, "WNW"],
  ] as const) {
    assert.equal(flowBearing(from), to);
    assert.equal(directionLabel(from), label);
    // Direction vector of source-to-center flow is opposite to the source vector.
    assert.ok(
      Math.abs(
        Math.sin((to * Math.PI) / 180) + Math.sin((from * Math.PI) / 180),
      ) < 1e-10,
    );
    assert.ok(
      Math.abs(
        Math.cos((to * Math.PI) / 180) + Math.cos((from * Math.PI) / 180),
      ) < 1e-10,
    );
  }
});
test("north crossings animate along a short accumulated rotation in either direction", () => {
  assert.equal(unwrapDegrees(359, 0), 360);
  assert.equal(unwrapDegrees(0, 359), -1);
  assert.equal(unwrapDegrees(719, 0), 720);
  assert.equal(unwrapDegrees(-1, 1), 1);
  assert.equal(unwrapDegrees(350, 10), 370);
  assert.equal(normalizeDegrees(-1), 359);
  assert.equal(normalizeDegrees(720), 0);
  assert.equal(directionLabel(NaN), "—");
});
const wetEntity = (state: string): HassEntity =>
  entity(state, "", {
    entity_id: "binary_sensor.fixture",
    attributes: { device_class: "moisture" },
  });
test("only binary WS90 on/off establishes NASS/TROCKEN; unavailable remains neutral", () => {
  assert.equal(getWetStatus(wetEntity("on")), "wet");
  assert.equal(getWetStatus(wetEntity("off")), "dry");
  for (const state of ["unknown", "unavailable", "", "0", "false", "wet"])
    assert.equal(getWetStatus(wetEntity(state)), "unavailable");
  assert.equal(getWetStatus(), "unavailable");
  assert.equal(reading("rain_wet", "on", "").text, "NASS");
  assert.equal(reading("rain_wet", "off", "").text, "TROCKEN");
  assert.equal(reading("rain_wet", "unavailable", "").status, "unavailable");
});
test("WH40 accumulated rain does not affect independent dry piezo state", () => {
  const hass: HomeAssistant = {
    states: {
      "sensor.fixture": entity("3.2", "mm"),
      "binary_sensor.fixture": wetEntity("off"),
    },
  };
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: {
      rain_today: "sensor.fixture",
      rain_wet: "binary_sensor.fixture",
    },
  };
  assert.equal(getReading(hass, config, "rain_today", now).value, 3.2);
  assert.equal(getReading(hass, config, "rain_wet", now).text, "TROCKEN");
});
test("source units are preserved across metric and imperial HA installations", () => {
  for (const [key, value, unit] of [
    ["wind_speed", "8", "km/h"],
    ["wind_gust", "5", "m/s"],
    ["wind_speed_avg", "12", "mph"],
    ["wind_gust_max", "8", "kn"],
    ["temperature", "66", "°F"],
    ["temperature", "19", "°C"],
    ["pressure", "29.92", "inHg"],
    ["pressure", "1012", "hPa"],
    ["rain_today", "0.4", "in"],
    ["rain_rate", "0.2", "in/h"],
    ["solar", "287", "W/m²"],
    ["humidity", "76", "%"],
    ["uv", "2.1", ""],
  ] as const) {
    const result = reading(key, value, unit);
    assert.equal(result.status, "ok", `${key}: ${unit}`);
    assert.equal(result.unit, unit);
    assert.equal(result.value, Number(value));
  }
  assert.equal(reading("wind_speed", "8", "km/h").text, "8,0");
  assert.equal(reading("wind_direction", "360", "°").value, 0);
});
test("unrelated or absent units cannot silently become plausible weather values", () => {
  for (const [key, unit] of [
    ["wind_speed", "°C"],
    ["temperature", ""],
    ["humidity", "km/h"],
    ["rain_today", "mm/h"],
    ["rain_rate", "mm"],
    ["pressure", "%"],
    ["wind_direction", "rad"],
    ["solar", "lx"],
  ] as const) {
    const result = reading(key, "15", unit);
    assert.equal(result.status, "invalid", `${key}: ${unit}`);
    assert.equal(result.value, null);
    assert.equal(result.text, "—");
  }
});
test("missing, unknown, invalid and stale sources are distinct, with zero still valid", () => {
  assert.equal(
    getReading(
      undefined,
      { type: "custom:ecowitt-weather-card" },
      "temperature",
      now,
    ).status,
    "missing",
  );
  assert.equal(reading("temperature", "unknown", "°C").status, "unavailable");
  for (const value of ["abc", "NaN", "Infinity", ""])
    assert.equal(reading("wind_speed", value, "km/h").status, "invalid");
  assert.equal(reading("wind_speed", "0", "km/h").value, 0);
  assert.equal(reading("humidity", "101", "%").status, "invalid");
  assert.equal(reading("wind_direction", "-1", "°").status, "invalid");
  const hass: HomeAssistant = {
    states: {
      "sensor.fixture": entity("8", "km/h", {
        last_updated: "2026-11-13T18:00:00Z",
      }),
    },
  };
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: { wind_speed: "sensor.fixture" },
    stale_after_minutes: 60,
  };
  assert.equal(getReading(hass, config, "wind_speed", now).status, "stale");
  assert.equal(getReading(hass, config, "wind_speed", now).value, 8);
  assert.equal(
    getReading(hass, { ...config, stale_after_minutes: 0 }, "wind_speed", now)
      .status,
    "ok",
  );
  assert.equal(
    getReading(
      hass,
      { ...config, stale_after_minutes: undefined },
      "wind_speed",
      now,
    ).status,
    "ok",
  );
});
test("direction availability is independent from calm wind speed; missing timestamps do not imply fresh telemetry", () => {
  assert.equal(reading("wind_speed", "0", "km/h").status, "ok");
  assert.equal(reading("wind_direction", "unknown", "°").value, null);
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: { wind_speed: "sensor.fixture" },
  };
  const withoutTimestamp: HomeAssistant = {
    states: {
      "sensor.fixture": entity("8", "km/h", { last_updated: undefined }),
    },
  };
  assert.equal(
    getReading(withoutTimestamp, config, "wind_speed", now).status,
    "ok",
  );
  assert.equal(
    getReading(withoutTimestamp, config, "wind_speed", now).entity
      ?.last_updated,
    undefined,
  );
  const invalidTimestamp: HomeAssistant = {
    states: {
      "sensor.fixture": entity("8", "km/h", { last_updated: "invalid" }),
    },
  };
  assert.equal(
    getReading(invalidTimestamp, config, "wind_speed", now).status,
    "ok",
  );
  const stalePiezo: HomeAssistant = {
    states: {
      "binary_sensor.fixture": {
        ...wetEntity("on"),
        last_updated: "2026-11-13T18:00:00Z",
      },
    },
  };
  const piezoConfig: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: { rain_wet: "binary_sensor.fixture" },
    stale_after_minutes: 60,
  };
  assert.equal(
    getReading(stalePiezo, piezoConfig, "rain_wet", now).status,
    "stale",
  );
});

test("Ecowitt UV Index aliases remain dimensionless and preserve the actual source unit", () => {
  for (const unit of [
    "UV Index",
    "UV index",
    "uv INDEX",
    "UVI",
    "UV",
    "index",
    "",
  ]) {
    assert.equal(isUnitValid("uv", unit), true, unit);
    const result = reading("uv", "2.1", unit);
    assert.equal(result.status, "ok", unit);
    assert.equal(result.value, 2.1);
    assert.equal(result.unit, unit);
  }
  for (const unit of [
    "W/m²",
    "kW/m²",
    "lx",
    "%",
    "mW/cm²",
    "UV radiation",
    "°C",
  ])
    assert.equal(reading("uv", "2.1", unit).status, "invalid", unit);
  for (const value of ["unknown", "unavailable"])
    assert.equal(reading("uv", value, "UV Index").status, "unavailable");
  for (const value of ["-0.1", "NaN", "Infinity", "0x10", "0b10"])
    assert.equal(reading("uv", value, "UV Index").status, "invalid", value);
  assert.equal(reading("uv", "0", "UV Index").value, 0);
});
test("numeric HA states allow decimal scientific notation but not JavaScript literals", () => {
  for (const [state, value] of [
    ["1.2e3", 1200],
    ["-.2", -0.2],
    [" +8. ", 8],
  ] as const)
    assert.equal(numericState(state), value);
  for (const state of [
    "0x10",
    "0o10",
    "0b10",
    "1_000",
    "Infinity",
    " ",
    "true",
  ])
    assert.equal(numericState(state), null, state);
});
test("Piezo wetness rejects unrelated domains and incompatible binary classes", () => {
  assert.equal(getWetStatus(entity("on")), "unavailable");
  for (const dc of ["connectivity", "battery", "problem"])
    assert.equal(
      getWetStatus({ ...wetEntity("on"), attributes: { device_class: dc } }),
      "unavailable",
      dc,
    );
  assert.equal(getWetStatus({ ...wetEntity("on"), attributes: {} }), "wet");
});
test("last_reported keeps unchanged HA states current; old, missing and future telemetry stays explicit", () => {
  const current = entity("8", "km/h", {
    last_updated: "2026-11-13T18:00:00Z",
    last_reported: "2026-11-13T19:59:00Z",
  });
  assert.equal(
    entityFreshness(current, { now, staleAfterMinutes: 5 }).status,
    "current",
  );
  assert.equal(
    entityFreshness(
      { ...current, last_reported: undefined },
      { now, staleAfterMinutes: 5 },
    ).status,
    "stale",
  );
  assert.equal(
    entityFreshness(
      { ...current, last_reported: "invalid" },
      { now, staleAfterMinutes: 5 },
    ).status,
    "stale",
  );
  assert.equal(
    entityFreshness(
      { ...current, last_updated: undefined, last_reported: undefined },
      { now },
    ).status,
    "unknown",
  );
  const future = { ...current, last_reported: "2026-11-14T20:00:00Z" };
  assert.equal(entityFreshness(future, { now }).status, "invalid");
  const config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: { wind_speed: "sensor.fixture" },
    stale_after_minutes: 5,
  };
  assert.equal(
    getReading(
      { states: { "sensor.fixture": current } },
      config,
      "wind_speed",
      now,
    ).status,
    "ok",
  );
  assert.equal(
    getReading(
      { states: { "sensor.fixture": future } },
      config,
      "wind_speed",
      now,
    ).value,
    null,
  );
  const missingTime = {
    ...current,
    last_updated: undefined,
    last_reported: undefined,
  };
  assert.equal(
    getReading(
      { states: { "sensor.fixture": missingTime } },
      config,
      "wind_speed",
      now,
    ).status,
    "stale",
  );
});
test("new PR4 illuminance and VPD values keep units and reject negative or incompatible data", () => {
  for (const [key, unit] of [
    ["solar_lux", "lx"],
    ["solar_lux", "lux"],
    ["solar_lux", "klx"],
    ["vpd", "kPa"],
    ["vpd", "hPa"],
    ["vpd", "Pa"],
  ] as const) {
    assert.equal(reading(key, "1.2", unit).status, "ok");
    assert.equal(reading(key, "-1", unit).status, "invalid");
  }
  assert.equal(reading("solar_lux", "500", "W/m²").status, "invalid");
  assert.equal(reading("vpd", "2", "%").status, "invalid");
});
