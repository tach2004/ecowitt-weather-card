import test from "node:test";
import assert from "node:assert/strict";
import {
  configuredRecordSources, haLocalDate, haMidnight, loadWeatherRecords, selectedRecordSources,
} from "../src/records";
import type { CardConfig, HassEntity, HomeAssistant } from "../src/types";

const config = (entities: CardConfig["entities"] = {}): CardConfig => ({
  type: "custom:ecowitt-weather-card",
  entities,
});

const state = (id: string, value: number | string, unit: string, when: string): HassEntity => ({
  entity_id: id, state: String(value),
  attributes: { unit_of_measurement: unit }, last_updated: when, last_changed: when,
});
const current = "2026-11-17T12:00:00.000Z";
const sample = (key: string, value: number | string, unit: string, at: string) =>
  state(`sensor.demo_${key}`, value, unit, at);
const now = Date.parse(current);
function fixture(rows: HassEntity[], calls: string[]): HomeAssistant {
  const states = Object.fromEntries(rows.map(row => [row.entity_id, row]));
  return {
    states, config: { time_zone: "Europe/Berlin" },
    callApi: async <T>(method: string, path: string) => {
      assert.equal(method, "GET");
      calls.push(path);
      return [rows] as T;
    },
  };
}

test("selected local HA dates include both days, including DST's unequal durations", () => {
  const spring = haMidnight("2026-03-29", "Europe/Berlin");
  const afterSpring = haMidnight("2026-03-30", "Europe/Berlin");
  assert.equal(afterSpring - spring, 23 * 3_600_000);
  const fall = haMidnight("2026-10-25", "Europe/Berlin");
  const afterFall = haMidnight("2026-10-26", "Europe/Berlin");
  assert.equal(afterFall - fall, 25 * 3_600_000);
  assert.equal(haLocalDate(spring + 30_000, "Europe/Berlin"), "2026-03-29");
});

test("queries only actually configured sources and ignores the prior boundary state", async () => {
  const calls: string[] = [];
  const rows = [
    sample("wind_speed", 999, "km/h", "2026-11-15T22:00:00Z"),
    sample("wind_speed", 17, "km/h", "2026-11-16T06:00:00Z"),
    sample("wind_speed", 23, "km/h", "2026-11-17T09:30:00Z"),
    sample("wind_speed", "unavailable", "km/h", "2026-11-17T10:00:00Z"),
    sample("rain_today", 8, "mm", "2026-11-16T22:00:00Z"),
    sample("rain_today", 0, "mm", "2026-11-16T23:00:10Z"),
    sample("rain_today", 12, "mm", "2026-11-17T08:20:00Z"),
    sample("uv", 4.1, "UV Index", "2026-11-17T10:30:00Z"),
  ];
  const hass = fixture(rows, calls);
  const result = await loadWeatherRecords(
    hass, config({ wind_speed: "sensor.demo_wind_speed", rain_today: "sensor.demo_rain_today", uv: "sensor.demo_uv" }),
    "2026-11-16", "2026-11-17", now,
  );
  assert.equal(result.status, "ok");
  assert.equal(calls.length, 1);
  const req = new URL(calls[0], "http://fixture.invalid/");
  assert.equal(req.pathname, "/history/period/2026-11-15T23:00:00.000Z");
  assert.equal(req.searchParams.get("end_time"), current);
  assert.equal(req.searchParams.get("filter_entity_id"),
    "sensor.demo_wind_speed,sensor.demo_rain_today,sensor.demo_uv");
  assert.equal(req.searchParams.has("minimal_response"), false);
  assert.equal(req.searchParams.get("significant_changes_only"), "0");
  assert.equal(result.records.find(r => r.key === "wind_speed")?.value, 23);
  assert.equal(result.records.find(r => r.key === "wind_speed")?.samples, 2);
  assert.equal(result.records.find(r => r.key === "rain_today")?.value, 12);
  assert.equal(result.records.find(r => r.key === "uv")?.value, 4.1);
  assert(!result.records.some(r => r.key === "solar"));
});

test("daily gust records require the configured gateway maximum, never a sampled gust fallback", async () => {
  const sources = {
    "sensor.demo_wind_gust_max": sample("wind_gust_max", 32, "km/h", current),
    "sensor.demo_wind_gust": sample("wind_gust", 25, "km/h", current),
  };
  const configs = config({ wind_gust_max: "sensor.demo_wind_gust_max", wind_gust: "sensor.demo_wind_gust" });
  assert.equal(selectedRecordSources(configs, sources).find(r => r.key === "wind_gust_max")?.entityId,
    "sensor.demo_wind_gust_max");
  delete (sources as Record<string,HassEntity>)["sensor.demo_wind_gust_max"];
  assert.equal(selectedRecordSources(configs, sources).find(r => r.key === "wind_gust_max")?.state,
    "missing");
  assert(!selectedRecordSources(configs, sources).some(r => r.key === "wind_gust"));
});

test("midnight carryover from previous daily gust and rain is never a new-day record", async () => {
  const calls: string[] = [];
  const rows = [
    sample("wind_gust_max", 42.8, "km/h", "2026-11-18T22:58:00Z"),
    sample("wind_gust_max", 42.8, "km/h", "2026-11-18T23:00:00Z"),
    sample("wind_gust_max", 0, "km/h", "2026-11-18T23:00:14Z"),
    sample("wind_gust_max", 37.1, "km/h", "2026-11-19T04:50:00Z"),
    sample("rain_today", 8.1, "mm", "2026-11-18T22:58:00Z"),
    sample("rain_today", 8.1, "mm", "2026-11-18T23:00:00Z"),
    sample("rain_today", 0, "mm", "2026-11-18T23:00:21Z"),
    sample("rain_today", 0.6, "mm", "2026-11-19T03:00:00Z"),
  ];
  const result = await loadWeatherRecords(
    fixture(rows, calls),
    config({ wind_gust_max: "sensor.demo_wind_gust_max", rain_today: "sensor.demo_rain_today" }),
    "2026-11-19", "2026-11-19", Date.parse("2026-11-19T06:00:00Z"),
  );
  const gust = result.records.find(r => r.key === "wind_gust_max")!;
  const rain = result.records.find(r => r.key === "rain_today")!;
  assert.equal(gust.value, 37.1);
  assert.equal(gust.timestamp, Date.parse("2026-11-19T04:50:00Z"));
  assert.equal(gust.state, "ok");
  assert.equal(rain.value, 0.6);
  assert.equal(rain.state, "ok");
  assert.equal(gust.unverifiedDays, 0);
  assert.equal(calls.length, 1);
});

test("when reset was missed but first day's value is below yesterday, daily max remains usable", async () => {
  const rows = [
    sample("wind_gust_max", 42.8, "km/h", "2026-11-18T22:58:00Z"),
    sample("wind_gust_max", 13.5, "km/h", "2026-11-19T00:14:00Z"),
    sample("wind_gust_max", 37.1, "km/h", "2026-11-19T05:00:00Z"),
  ];
  const result = await loadWeatherRecords(
    fixture(rows, []), config({ wind_gust_max: "sensor.demo_wind_gust_max" }),
    "2026-11-19", "2026-11-19", Date.parse("2026-11-19T06:00:00Z"),
  );
  assert.equal(result.records.find(r => r.key === "wind_gust_max")?.value, 37.1);
});

test("unverified retained daily values do not become invented records", async () => {
  const old = sample("rain_today", 8.1, "mm", "2026-11-18T22:58:00Z");
  const unchanged = sample("rain_today", 8.1, "mm", "2026-11-18T23:00:00Z");
  const result = await loadWeatherRecords(
    fixture([old, unchanged], []), config({ rain_today: "sensor.demo_rain_today" }),
    "2026-11-19", "2026-11-19", Date.parse("2026-11-19T06:00:00Z"),
  );
  const rain = result.records.find(r => r.key === "rain_today")!;
  assert.equal(rain.value, null);
  assert.equal(rain.state, "uncertain");
  assert.equal(rain.unverifiedDays, 1);
  assert.equal(result.status, "empty");
});

test("multi-day counter evaluation excludes unverified days and explicitly marks partial coverage", async () => {
  const rows = [
    sample("rain_today", 5, "mm", "2026-11-16T22:58:00Z"),
    sample("rain_today", 0, "mm", "2026-11-16T23:01:00Z"),
    sample("rain_today", 3.2, "mm", "2026-11-17T19:00:00Z"),
    sample("rain_today", 3.2, "mm", "2026-11-17T23:00:00Z"),
    sample("rain_today", 0, "mm", "2026-11-18T23:01:00Z"),
    sample("rain_today", 0.6, "mm", "2026-11-19T04:00:00Z"),
  ];
  const result = await loadWeatherRecords(
    fixture(rows, []), config({ rain_today: "sensor.demo_rain_today" }),
    "2026-11-17", "2026-11-19", Date.parse("2026-11-19T05:00:00Z"),
  );
  const rain = result.records.find(r => r.key === "rain_today")!;
  assert.equal(rain.value, 3.2);
  assert.equal(rain.state, "partial");
  assert.equal(rain.unverifiedDays, 1);
  assert.equal(result.status, "ok");
});

test("never compare incompatible units, negative readings, future or invalid values", async () => {
  const calls: string[] = [];
  const rows = [
    sample("wind_speed", 10, "m/s", "2026-11-16T08:00:00Z"),
    sample("wind_speed", 30, "km/h", "2026-11-16T08:01:00Z"),
    sample("rain_rate", -4, "mm/h", "2026-11-17T09:00:00Z"),
    sample("rain_rate", 35, "°C", "2026-11-17T09:30:00Z"),
    sample("rain_rate", "0x20", "mm/h", "2026-11-17T09:31:00Z"),
    sample("rain_rate", 250, "mm/h", "2026-11-17T13:00:00Z"),
  ];
  const result = await loadWeatherRecords(
    fixture(rows, calls),
    config({ wind_speed: "sensor.demo_wind_speed", rain_rate: "sensor.demo_rain_rate" }),
    "2026-11-16", "2026-11-17", now,
  );
  assert.equal(result.status, "empty");
  assert.equal(result.records.find(r => r.key === "wind_speed")?.state, "unit-conflict");
  assert.equal(result.records.find(r => r.key === "wind_speed")?.value, null);
  assert.equal(result.records.find(r => r.key === "rain_rate")?.state, "empty");
});

test("missing timezone, invalid calendar range, absent Recorder and failed responses are explicit", async () => {
  const noZone: HomeAssistant = { states: {} };
  assert.equal((await loadWeatherRecords(noZone, config(), "2026-11-01", "2026-11-17", now)).status, "unavailable");
  const hass = fixture([sample("uv", 2, "UV Index", current)], []);
  assert.equal((await loadWeatherRecords(hass, config(), "2026-11-18", "2026-11-17", now)).status, "unavailable");
  assert.equal((await loadWeatherRecords(hass, config(), "2026-02-30", "2026-11-17", now)).status, "unavailable");
  assert.equal((await loadWeatherRecords(hass, config(), "2026-11-16", "2026-11-17", now)).status, "empty");
  const missingApi = { ...hass, callApi: undefined };
  assert.equal((await loadWeatherRecords(missingApi, config({ uv:"sensor.demo_uv" }), "2026-11-16", "2026-11-17", now)).status, "unavailable");
  const broken: HomeAssistant = { ...hass, callApi: async () => { throw Error("secret backend error"); } };
  const result = await loadWeatherRecords(broken, config({ uv:"sensor.demo_uv" }), "2026-11-16", "2026-11-17", now);
  assert.equal(result.status, "error");
  assert.equal(result.message.includes("secret backend error"), false);
});

test("checked climate sensors are distinct even below freezing, and unchecked sources are not queried", async () => {
  const calls: string[] = [];
  const earlier = "2026-11-17T07:00:00Z";
  const later = "2026-11-17T08:00:00Z";
  const rows = [
    sample("temperature", -12.4, "°C", earlier),
    sample("temperature", -4.1, "°C", later),
    sample("room_temperature", -2.3, "°C", earlier),
    sample("room_temperature", -8.4, "°C", later),
    sample("humidity", 94, "%", earlier),
    sample("humidity", 110, "%", later),
    sample("absolute_humidity", 3.4, "g/m³", earlier),
    sample("absolute_humidity", 97, "%", later),
    sample("feels_like", -7.1, "°C", later),
    sample("wind_speed", 42, "km/h", later),
    sample("unassigned_temperature", 27, "°C", later),
  ];
  const hass = fixture(rows, calls);
  const selection: CardConfig = {
    ...config({
      temperature: "sensor.demo_temperature",
      humidity: "sensor.demo_humidity",
      absolute_humidity: "sensor.demo_absolute_humidity",
      feels_like: "sensor.demo_feels_like",
      wind_speed: "sensor.demo_wind_speed",
    }),
    device_status: [
      { device_id: "demo-room", role: "WN31", extra_entities: ["sensor.demo_room_temperature"] },
    ],
    extra_entities: ["sensor.demo_room_temperature"],
    record_entities: [
      "sensor.demo_absolute_humidity", "sensor.demo_feels_like",
      "sensor.demo_temperature", "sensor.demo_room_temperature", "sensor.demo_humidity",
      "sensor.demo_unassigned_temperature",
    ],
  };
  const result = await loadWeatherRecords(hass, selection, "2026-11-17", "2026-11-17", now);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.records.map(({ key, entityId, value, unit }) => [key, entityId, value, unit]), [
    ["temperature", "sensor.demo_temperature", -4.1, "°C"],
    ["temperature", "sensor.demo_room_temperature", -2.3, "°C"],
    ["humidity", "sensor.demo_humidity", 94, "%"],
    ["absolute_humidity", "sensor.demo_absolute_humidity", 3.4, "g/m³"],
    ["feels_like", "sensor.demo_feels_like", -7.1, "°C"],
  ]);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0], "http://fixture.invalid").searchParams.get("filter_entity_id"),
    "sensor.demo_temperature,sensor.demo_room_temperature,sensor.demo_humidity,sensor.demo_absolute_humidity,sensor.demo_feels_like");
  const empty = await loadWeatherRecords(hass, { ...selection, record_entities: [] }, "2026-11-17", "2026-11-17", now);
  assert.deepEqual(empty.records, []);
  assert.equal(calls.length, 1);
});

test("numeric diagnostic and legacy sensors can be selected, binary and weather statuses cannot", async () => {
  const calls: string[] = [];
  const time = "2026-11-17T05:00:00Z";
  const hass = fixture([
    sample("signal", -65, "dBm", time),
    sample("battery", 84, "%", time),
    sample("connection", "connected", "", time),
  ], calls);
  const sources: CardConfig = {
    ...config({ rain_wet: "binary_sensor.demo_surface" }),
    weather_entity: "weather.demo_station",
    device_status: [
      { device_id: "demo-station", role: "WS90", signal: "sensor.demo_signal", connection: "sensor.demo_connection" },
    ],
    diagnostic_entities: ["sensor.demo_battery"],
    record_entities: [
      "sensor.demo_signal", "sensor.demo_battery", "sensor.demo_connection",
      "binary_sensor.demo_surface", "weather.demo_station",
    ],
  };
  assert.deepEqual(configuredRecordSources(sources, hass.states).map(source => source.entityId),
    ["sensor.demo_signal", "sensor.demo_battery"]);
  const result = await loadWeatherRecords(hass, sources, "2026-11-17", "2026-11-17", now);
  assert.deepEqual(result.records.map(({ value, unit }) => [value, unit]), [[-65, "dBm"], [84, "%"]]);
});
