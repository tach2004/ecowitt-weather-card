import { html, svg, css } from "lit";
import type { HistoryChart } from "./chart";

export function historyPlot(
  chart: HistoryChart,
  start: number,
  end: number,
  timeZone?: string,
) {
  let zone: string | undefined;
  try {
    if (timeZone) {
      new Intl.DateTimeFormat("de-DE", { timeZone });
      zone = timeZone;
    }
  } catch {
    /* browser-time fallback is labelled */
  }
  const time = (timestamp: number) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp);
  const date = (timestamp: number) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      day: "2-digit",
      month: "2-digit",
    }).format(timestamp);
  const value = (v: number) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v);
  const ticks =
    chart.min === chart.max
      ? [{ value: chart.min, y: 50 }]
      : [
          { value: chart.max, y: 10 },
          { value: (chart.min + chart.max) / 2, y: 50 },
          { value: chart.min, y: 90 },
        ];
  return html`<div
    class="history-plot"
    role="group"
    aria-label=${`Verlauf von ${time(start)} bis ${time(end)}, ${value(chart.min)} bis ${value(chart.max)} ${chart.unit}`}
  >
    <span class="plot-unit">${chart.unit}</span>
    <div class="plot-values" aria-label="Werteachse">
      ${ticks.map((t) => html`<span style=${`top:${t.y}%`}>${value(t.value)}</span>`)}
    </div>
    <svg
      viewBox="0 0 500 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Aufgezeichnete Zustände; Lücken bleiben frei"
    >
      ${ticks.map((t) => svg`<path class="plot-grid" d=${`M10 ${t.y}H490`}/>`)}
      <path class="axis" d="M10 10V90H490" />
      ${chart.paths.map((path) => svg`<path class="plot-data" d=${path}/>`)}
    </svg>
    <div class="plot-times" aria-label="Zeitachse">
      ${[start, (start + end) / 2, end].map((t) => html`<span><time>${time(t)}</time><small>${date(t)}</small></span>`)}
    </div>
    <small class="plot-zone"
      >${zone ? `HA-Zeit · ${zone}` : "Browserzeit"}</small
    >
  </div>`;
}
export const historyPlotStyles = css`
  .history-plot {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    grid-template-rows: 18px 130px auto auto;
    gap: 2px 4px;
    margin-top: 12px;
    font-variant-numeric: tabular-nums;
    min-width: 0;
  }
  .plot-unit {
    grid-column: 1;
    grid-row: 1;
    font-size: 10px;
    color: var(--muted);
    text-align: right;
    overflow-wrap: anywhere;
  }
  .plot-values {
    grid-column: 1;
    grid-row: 2;
    position: relative;
    min-width: 0;
    color: var(--muted);
    font-size: 11px;
  }
  .plot-values span {
    position: absolute;
    right: 0;
    transform: translateY(-50%);
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .history-plot svg {
    grid-column: 2;
    grid-row: 2;
    height: 130px;
    width: 100%;
    display: block;
    overflow: visible;
  }
  .history-plot path {
    vector-effect: non-scaling-stroke;
  }
  .history-plot .plot-grid {
    stroke: var(--line);
    stroke-width: 0.7;
    fill: none;
    stroke-dasharray: 3 4;
  }
  .history-plot .plot-data {
    stroke: var(--cyan);
    stroke-width: 2;
    fill: none;
  }
  .plot-times {
    grid-column: 2;
    grid-row: 3;
    margin: 3px 2% 0;
    display: flex;
    justify-content: space-between;
    gap: 4px;
    color: var(--muted);
    font-size: 11px;
    min-width: 0;
  }
  .plot-times span {
    text-align: center;
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .plot-times span:first-child {
    text-align: left;
  }
  .plot-times span:last-child {
    text-align: right;
  }
  .plot-times small {
    font-size: 10px;
  }
  .plot-zone {
    grid-column: 2;
    grid-row: 4;
    text-align: right;
    color: var(--muted);
    font-size: 10px;
    margin-top: 4px;
  }
`;
