import { css } from "lit";

export const experienceStyles = css`
  .trio {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .trio > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .trio > div + div {
    border-left: 1px solid var(--line);
    padding-left: 14px;
  }
  .climate-temperature-row {
    display: flex;
    align-items: center;
    gap: clamp(4px, 0.9cqi, 10px);
    min-width: 0;
    white-space: nowrap;
  }
  .climate-current-value { flex: 0 1 auto; min-width: 0; }
  .climate-extremes {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .climate-extreme {
    display: flex;
    align-items: baseline;
    gap: 3px;
    font-size: clamp(0.65rem, 1.15cqi, 0.82rem);
    line-height: 1.2;
    font-weight: 500;
    letter-spacing: 0;
    white-space: nowrap;
  }
  .climate-extreme.maximum {
    color: color-mix(in srgb, #d94f51 84%, var(--primary-text-color) 16%);
  }
  .climate-extreme.minimum {
    color: color-mix(in srgb, #367fce 84%, var(--primary-text-color) 16%);
  }
  .climate-extreme .extreme-label { font-weight: 600; }
  .climate-extreme .extreme-unit { font-size: 0.88em; margin-left: 2px; }
  .direction-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: 0;
  }
  .direction-pair > div {
    min-width: 0;
  }
  .direction-pair > div + div {
    border-left: 1px solid var(--line);
    padding-left: 14px;
  }
  .direction-compass {
    color: var(--cyan);
    white-space: nowrap;
  }
  .rose-variant {
    min-width: 0;
    max-width: 65%;
    min-height: 44px;
    font: inherit;
    font-size: 0.85rem;
    background: var(--soft);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px;
  }
  @container weather (max-width:519px) {
    .trio {
      gap: 7px;
    }
    .trio > div + div {
      padding-left: 7px;
    }
    .trio .unit {
      display: block;
      margin-left: 0;
    }
    .trio .label {
      font-size: 0.72rem;
      min-height: 2.7em;
    }
    .climate-temperature-row { gap: 4px; }
    .climate-temperature-row .climate-current-value .unit { margin-left: 1px; }
    .climate-extremes { gap: 2px; }
    .climate-extreme { font-size: 0.63rem; gap: 2px; }
    .direction-pair .label {
      min-height: 2.7em;
    }
  }
  .wind-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    perspective: 1400px;
    transition: min-height 650ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .wind-flipper {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 650ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .wind-stage.is-flipped .wind-flipper {
    transform: rotateY(180deg);
  }
  .wind-front,
  .wind-back {
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .wind-front {
    width: 100%;
    height: auto;
  }
  .wind-front[role="button"] {
    cursor: pointer;
  }
  .wind-front[role="button"]:focus-visible {
    outline: 3px solid var(--cyan);
    outline-offset: 7px;
  }
  .wind-back {
    position: absolute;
    inset: 0 0 auto;
    transform: rotateY(180deg);
    visibility: hidden;
    transition: visibility 0s 325ms;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    padding: 12px;
  }
  .wind-stage.is-flipped .wind-back {
    visibility: visible;
    transition-delay: 0s;
  }
  .wind-stage.is-flipped .wind-front {
    visibility: hidden;
    transition: visibility 0s 325ms;
  }
  .wind-back-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    margin-bottom: 8px;
  }
  .wind-back-head h3 {
    font-size: 1rem;
    margin: 0;
  }
  .wind-back-head button {
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--soft);
    font-size: 0.75rem;
  }
  ecowitt-windrose-host {
    flex: 0 0 auto;
    min-height: 0;
    min-width: 0;
    overflow: visible;
    overscroll-behavior: contain;
  }
  .site-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 4px;
  }
  .weather-info {
    min-width: 0;
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .weather-info[open] {
    flex-basis: 100%;
  }
  .weather-info summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 4px 8px;
  }
  .weather-info summary::after {
    content: " ⓘ";
  }
  .weather-info p {
    margin: 0 0 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .wind-stage.no-animation,
  .wind-stage.no-animation .wind-flipper {
    transition: none;
  }
  .wind-stage.no-animation .wind-front,
  .wind-stage.no-animation .wind-back {
    transition: none;
  }
  .detail-section-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
    margin: 0 0 12px;
    letter-spacing: 0.02em;
  }
  .detail-reading {
    background: color-mix(in srgb, var(--soft) 55%, var(--surface));
  }
  .detail-reading .label {
    min-height: 2.7em;
  }
  .detail-reading .text-button {
    margin-top: 3px;
  }
  .detail-explanation {
    margin: 16px 0 0;
    color: var(--muted);
    font-size: 0.76rem;
    line-height: 1.6;
  }
  .detail-explanation summary {
    min-height: 44px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }
  .detail-explanation summary::after {
    content: " ＋";
  }
  .detail-explanation p {
    margin: 0 0 10px;
  }
  .daily-coverage {
    border-left: 3px solid var(--cyan);
    padding: 10px 12px;
    margin: 12px 0 0;
    font-size: 0.74rem;
    line-height: 1.6;
    color: var(--muted);
    background: var(--soft);
    border-radius: 0 8px 8px 0;
  }
  .chart h4 {
    line-height: 1.5;
    margin: 0 0 8px;
  }
  .chart figcaption {
    font-size: 0.7rem;
    color: var(--muted);
    line-height: 1.5;
    margin-top: 8px;
  }
  .sensor-group {
    margin: 14px 0 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0 12px;
  }
  .sensor-group > summary {
    font-size: 0.85rem;
    font-weight: 600;
    min-height: 44px;
    padding: 12px 0;
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) {
    .wind-stage,
    .wind-flipper,
    .wind-stage.is-flipped .wind-front,
    .wind-back {
      transition: none;
    }
  }
`;
