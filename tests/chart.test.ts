import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryCharts } from "../src/chart";
import type { HistoryPoint, HistorySeries } from "../src/history";
const series = (points: HistoryPoint[]): HistorySeries => ({
  entityId: "sensor.fixture",
  unit: "km/h",
  points,
});
const point = (
  timestamp: number,
  value: number | null,
  unit = "km/h",
): HistoryPoint => ({ timestamp, value, unit });

test("an actual Recorder state before the window provides labeled context without a fabricated sample", () => {
  const initial = point(0, 8);
  const charts = buildHistoryCharts(series([initial]), 100, 200, "wind_speed");
  assert.equal(charts.length, 1);
  assert.equal(charts[0].initial, initial);
  assert.equal(charts[0].sampleCount, 0);
  assert.deepEqual(charts[0].paths, ["M10.00,50.00 H490.00"]);
  assert.equal(charts[0].min, 8);
  assert.equal(charts[0].max, 8);
});
test("only the most recent pre-window state establishes Recorder context, including unavailable", () => {
  assert.deepEqual(
    buildHistoryCharts(
      series([point(0, 8), point(50, null)]),
      100,
      200,
      "wind_speed",
    ),
    [],
  );
  const charts = buildHistoryCharts(
    series([point(0, 99), point(50, 8), point(150, 12)]),
    100,
    200,
    "wind_speed",
  );
  assert.equal(charts[0].initial?.value, 8);
  assert.equal(charts[0].sampleCount, 1);
  assert.equal(charts[0].max, 12);
  assert.deepEqual(charts[0].paths, ["M10.00,90.00 H250.00 V10.00 H490.00"]);
});
test("state charts use held steps and preserve unavailable gaps instead of interpolating measurements", () => {
  const charts = buildHistoryCharts(
    series([point(100, 8), point(125, null), point(175, 12)]),
    100,
    200,
    "wind_speed",
  );
  assert.deepEqual(charts[0].paths, [
    "M10.00,90.00 H130.00",
    "M370.00,10.00 H490.00",
  ]);
  assert.equal(charts[0].sampleCount, 2);
});
test("source unit changes split charts and never connect incompatible values", () => {
  const charts = buildHistoryCharts(
    series([point(100, 8), point(150, 2, "m/s"), point(175, 12)]),
    100,
    200,
    "wind_speed",
  );
  assert.equal(charts.length, 2);
  assert.deepEqual(charts[0].paths, [
    "M10.00,90.00 H250.00",
    "M370.00,10.00 H490.00",
  ]);
  assert.deepEqual(charts[1].paths, ["M250.00,50.00 H370.00"]);
  assert.equal(charts[1].unit, "m/s");
});
test("bad units, future data, non-finite values and invalid windows cannot become chart measurements", () => {
  const charts = buildHistoryCharts(
    series([
      point(100, 8),
      point(120, 15, "°C"),
      point(140, NaN),
      point(150, 10),
      point(250, 1000),
    ]),
    100,
    200,
    "wind_speed",
  );
  assert.equal(charts[0].max, 10);
  assert.equal(charts[0].sampleCount, 2);
  assert.equal(charts[0].paths.length, 2);
  assert.deepEqual(buildHistoryCharts(series([]), 200, 100), []);
});
