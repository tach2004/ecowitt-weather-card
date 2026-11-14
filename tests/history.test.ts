import test from "node:test";
import assert from "node:assert/strict";
import { loadHistory } from "../src/history";
import type { HassEntity, HomeAssistant } from "../src/types";
const state: HassEntity = {
  entity_id: "sensor.fixture",
  state: "8",
  attributes: { unit_of_measurement: "km/h" },
};
function hassWithResponse(
  response: unknown,
  requests: { method: string; path: string }[],
): HomeAssistant {
  return {
    states: { "sensor.fixture": state },
    callApi: async <T>(method: string, path: string): Promise<T> => {
      requests.push({ method, path });
      return response as T;
    },
  };
}
test("requests actual local HA Recorder, only selected existing IDs, bounded time, full states", async () => {
  const requests: { method: string; path: string }[] = [];
  const result = await loadHistory(
    hassWithResponse([], requests),
    ["sensor.fixture", "sensor.fixture", "sensor.missing"],
    1000,
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.ok(requests[0].path.startsWith("history/period/"));
  const url = new URL(requests[0].path, "http://ha.invalid/");
  assert.equal(url.searchParams.get("filter_entity_id"), "sensor.fixture");
  assert.equal(url.searchParams.has("significant_changes_only"), false);
  assert.equal(url.searchParams.has("minimal_response"), false);
  assert.equal(result.end - result.start, 168 * 3_600_000);
  assert.equal(result.status, "empty");
});
test("keeps real samples, unknown gaps, timestamps and source unit changes without creating points", async () => {
  const timestamp = Date.now() - 60_000;
  const rows = [
    { ...state, state: "8", last_updated: new Date(timestamp).toISOString() },
    {
      ...state,
      state: "unavailable",
      last_updated: new Date(timestamp + 10_000).toISOString(),
    },
    {
      ...state,
      state: "4.1",
      attributes: { unit_of_measurement: "m/s" },
      last_updated: new Date(timestamp + 20_000).toISOString(),
    },
  ];
  const result = await loadHistory(
    hassWithResponse([rows], []),
    ["sensor.fixture"],
    24,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.series[0].points.length, 3);
  assert.deepEqual(
    result.series[0].points.map((point) => point.value),
    [8, null, 4.1],
  );
  assert.deepEqual(
    result.series[0].points.map((point) => point.unit),
    ["km/h", "km/h", "m/s"],
  );
  assert.equal(result.series[0].points[0].timestamp, timestamp);
});
test("empty, absent API, bad response and Recorder errors produce honest non-data states", async () => {
  assert.equal(
    (await loadHistory({ states: {} }, ["sensor.missing"])).status,
    "empty",
  );
  assert.equal(
    (
      await loadHistory({ states: { "sensor.fixture": state } }, [
        "sensor.fixture",
      ])
    ).status,
    "unavailable",
  );
  assert.equal(
    (
      await loadHistory(hassWithResponse({ error: "bad" }, []), [
        "sensor.fixture",
      ])
    ).status,
    "error",
  );
  const rejected: HomeAssistant = {
    states: { "sensor.fixture": state },
    callApi: async () => {
      throw new Error("private server response");
    },
  };
  const result = await loadHistory(rejected, ["sensor.fixture"]);
  assert.equal(result.status, "error");
  assert.equal(result.message?.includes("private server response"), false);
  assert.equal(result.series.length, 0);
});
test("malformed entries, missing times and future samples cannot create a chart value", async () => {
  const timestamp = Date.now() - 1000;
  const result = await loadHistory(
    hassWithResponse(
      [
        [
          null,
          42,
          {
            entity_id: "sensor.other",
            state: "99",
            last_updated: new Date(timestamp).toISOString(),
          },
          { ...state, last_updated: "invalid" },
          {
            ...state,
            state: "77",
            last_updated: new Date(Date.now() + 60000).toISOString(),
          },
          {
            ...state,
            state: "8",
            last_updated: new Date(timestamp).toISOString(),
          },
        ],
      ],
      [],
    ),
    ["sensor.fixture"],
  );
  assert.equal(result.status, "ok");
  assert.deepEqual(result.series[0].points, [
    { timestamp, value: 8, unit: "km/h" },
  ]);
});
