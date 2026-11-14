import { isUnitValid } from "./data";
import type { HistoryPoint, HistorySeries } from "./history";
import type { MetricKey } from "./types";

export interface HistoryChart {
  unit: string;
  min: number;
  max: number;
  paths: string[];
  /** Real Recorder updates inside the window; excludes the initial held state. */
  sampleCount: number;
  /** Actual Recorder state preceding the window, not a newly created sample. */
  initial?: HistoryPoint;
}

/** A HA state holds until the next recorded change. Nulls and unit changes break it. */
export function buildHistoryCharts(
  series: HistorySeries,
  start: number,
  end: number,
  key?: MetricKey,
): HistoryChart[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [];
  const ordered = series.points
    .filter(
      (point) => Number.isFinite(point.timestamp) && point.timestamp <= end,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const preceding = ordered.filter((point) => point.timestamp < start).at(-1);
  const points = [
    ...(preceding ? [preceding] : []),
    ...ordered.filter((point) => point.timestamp >= start),
  ];
  const usable = (point: HistoryPoint) =>
    point.value !== null &&
    Number.isFinite(point.value) &&
    (!key || isUnitValid(key, point.unit));
  const units = [...new Set(points.filter(usable).map((point) => point.unit))];
  return units.map((unit) => {
    const valid = points.filter(
      (point) => usable(point) && point.unit === unit,
    );
    let min = Infinity,
      max = -Infinity;
    for (const point of valid) {
      min = Math.min(min, point.value!);
      max = Math.max(max, point.value!);
    }
    const x = (timestamp: number) =>
      (
        10 +
        ((Math.max(start, timestamp) - start) / (end - start)) * 480
      ).toFixed(2);
    const y = (value: number) =>
      (max === min ? 50 : 90 - ((value - min) / (max - min)) * 80).toFixed(2);
    const paths: string[] = [];
    let path = "";
    for (const point of points) {
      if (!usable(point) || point.unit !== unit) {
        if (path) {
          paths.push(`${path} H${x(point.timestamp)}`);
          path = "";
        }
        continue;
      }
      path += path
        ? ` H${x(point.timestamp)} V${y(point.value!)}`
        : `M${x(point.timestamp)},${y(point.value!)}`;
    }
    if (path) paths.push(`${path} H490.00`);
    return {
      unit,
      min,
      max,
      paths,
      sampleCount: valid.filter((point) => point.timestamp >= start).length,
      initial:
        preceding && usable(preceding) && preceding.unit === unit
          ? preceding
          : undefined,
    };
  });
}
