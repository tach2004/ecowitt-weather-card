import test from "node:test";
import assert from "node:assert/strict";
import {
  haLocalDate, haMidnight, loadWeatherRecords, selectedRecordSources,
} from "../src/records";
import type { HassEntity, HomeAssistant } from "../src/types";

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
    sample("rain_today", 12, "mm", "2026-11-17T08:20:00Z"),
    sample("uv", 4.1, "UV Index", "2026-11-17T10:30:00Z"),
  ];
  const hass = fixture(rows, calls);
  const result = await loadWeatherRecords(
    hass, { wind_speed: "sensor.demo_wind_speed", rain_today: "sensor.demo_rain_today", uv: "sensor.demo_uv" },
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
  assert.equal(result.records.find(r => r.key === "wind_speed")?.value, 23);
  assert.equal(result.records.find(r => r.key === "wind_speed")?.samples, 2);
  assert.equal(result.records.find(r => r.key === "rain_today")?.value, 12);
  assert.equal(result.records.find(r => r.key === "uv")?.value, 4.1);
  assert.equal(result.records.find(r => r.key === "solar")?.state, "missing");
});

test("prefer explicitly configured daily gust peak and fall back to measured gusts", async () => {
  const sources = {
    "sensor.demo_wind_gust_max": sample("wind_gust_max", 32, "km/h", current),
    "sensor.demo_wind_gust": sample("wind_gust", 25, "km/h", current),
  };
  const configs = { wind_gust_max: "sensor.demo_wind_gust_max", wind_gust: "sensor.demo_wind_gust" };
  assert.equal(selectedRecordSources(configs, sources).find(r => r.key === "wind_gust_max")?.entityId,
    "sensor.demo_wind_gust_max");
  delete (sources as Record<string,HassEntity>)["sensor.demo_wind_gust_max"];
  assert.equal(selectedRecordSources(configs, sources).find(r => r.key === "wind_gust_max")?.entityId,
    "sensor.demo_wind_gust");
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
    { wind_speed: "sensor.demo_wind_speed", rain_rate: "sensor.demo_rain_rate" },
    "2026-11-16", "2026-11-17", now,
  );
  assert.equal(result.status, "empty");
  assert.equal(result.records.find(r => r.key === "wind_speed")?.state, "unit-conflict");
  assert.equal(result.records.find(r => r.key === "wind_speed")?.value, null);
  assert.equal(result.records.find(r => r.key === "rain_rate")?.state, "empty");
});

test("missing timezone, invalid calendar range, absent Recorder and failed responses are explicit", async () => {
  const noZone: HomeAssistant = { states: {} };
  assert.equal((await loadWeatherRecords(noZone, {}, "2026-11-01", "2026-11-17", now)).status, "unavailable");
  const hass = fixture([sample("uv", 2, "UV Index", current)], []);
  assert.equal((await loadWeatherRecords(hass, {}, "2026-11-18", "2026-11-17", now)).status, "unavailable");
  assert.equal((await loadWeatherRecords(hass, {}, "2026-02-30", "2026-11-17", now)).status, "unavailable");
  assert.equal((await loadWeatherRecords(hass, {}, "2026-11-16", "2026-11-17", now)).status, "empty");
  const missingApi = { ...hass, callApi: undefined };
  assert.equal((await loadWeatherRecords(missingApi, { uv:"sensor.demo_uv" }, "2026-11-16", "2026-11-17", now)).status, "unavailable");
  const broken: HomeAssistant = { ...hass, callApi: async () => { throw Error("secret backend error"); } };
  const result = await loadWeatherRecords(broken, { uv:"sensor.demo_uv" }, "2026-11-16", "2026-11-17", now);
  assert.equal(result.status, "error");
  assert.equal(result.message.includes("secret backend error"), false);
});
