import test from "node:test";
import assert from "node:assert/strict";
import {
  dateMs, monthCells, monthStart, prettyRange,
  rangeForPreset, shiftDateRange, shiftDay, shiftMonth,
} from "../src/record-date-range";

test("record period presets use inclusive local calendar days", () => {
  const today = "2026-11-17";
  assert.deepEqual(rangeForPreset("today", today), { from: today, to: today });
  assert.deepEqual(rangeForPreset("yesterday", today), { from: "2026-11-16", to: "2026-11-16" });
  assert.deepEqual(rangeForPreset("week", today), { from: "2026-11-16", to: today });
  assert.deepEqual(rangeForPreset("month", today), { from: "2026-11-01", to: today });
  assert.deepEqual(rangeForPreset("quarter", today), { from: "2026-10-01", to: today });
  assert.deepEqual(rangeForPreset("year", today), { from: "2026-01-01", to: today });
  assert.deepEqual(rangeForPreset("last7", today), { from: "2026-11-11", to: today });
  assert.deepEqual(rangeForPreset("last30", today), { from: "2026-10-19", to: today });
  assert.deepEqual(rangeForPreset("last365", today), { from: "2025-11-18", to: today });
  assert.deepEqual(rangeForPreset("last12months", today), { from: "2025-11-18", to: today });
});

test("calendar math preserves dates through leap days, DST and year boundaries", () => {
  assert.equal(shiftDay("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDay("2026-03-29", 1), "2026-03-30");
  assert.equal(shiftMonth("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(monthStart("2026-11-17"), "2026-11-01");
  assert.equal(shiftDateRange({ from:"2026-11-11",to:"2026-11-17" }, -1).to, "2026-11-10");
  assert.equal(monthCells("2026-11-01")[6].date, "2026-11-01");
  assert.equal(monthCells("2026-11-01").length, 42);
  assert.match(prettyRange({ from: "2026-11-16", to: "2026-11-17" }), /16.*17/);
  assert.throws(() => dateMs("2026-02-30"));
});
