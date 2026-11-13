import { css } from "lit";
export const cardStyles = css`
  :host {
    display: block;
    container: weather / inline-size;
    color: var(--primary-text-color, #edf5fc);
    --cyan: color-mix(
      in srgb,
      var(--primary-color, #12d5eb) 80%,
      var(--primary-text-color, #edf5fc) 20%
    );
    --muted: var(--secondary-text-color, #9ebbd0);
    --line: color-mix(
      in srgb,
      var(--primary-text-color, #aac7df) 18%,
      transparent
    );
    --surface: var(--ha-card-background, var(--card-background-color, #101f2d));
    --soft: color-mix(in srgb, var(--surface) 88%, #8eb4dc 12%);
    font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
  }
  * {
    box-sizing: border-box;
  }
  button,
  a,
  input {
    font: inherit;
  }
  button {
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--cyan);
    outline-offset: 3px;
  }
  ha-card {
    display: block;
    max-width: 1380px;
    margin: auto;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 26px;
    background:
      radial-gradient(
        ellipse at 20% 30%,
        color-mix(in srgb, var(--surface) 86%, #0d758c 14%),
        transparent 65%
      ),
      var(--surface);
    padding: 20px;
    box-shadow: var(--ha-card-box-shadow, 0 14px 50px #0002);
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 0 18px;
  }
  .station-icon {
    width: 42px;
    height: 42px;
    color: var(--cyan);
    background: color-mix(in srgb, var(--cyan) 10%, transparent);
    border-radius: 14px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  h1 {
    font-size: clamp(1.1rem, 2.7cqi, 1.9rem);
    line-height: 1.18;
    margin: 0 0 4px;
    letter-spacing: -0.025em;
  }
  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .diagnostics {
    margin-left: auto;
    min-width: 44px;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--soft);
    display: grid;
    place-items: center;
  }
  .eyebrow {
    font-size: 0.68rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 700;
  }
  .main-layout {
    display: grid;
    gap: 18px;
    align-items: center;
  }
  .site-wrap {
    min-width: 0;
    padding: 14px;
  }
  .site {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    margin: 0;
    border: 1px solid color-mix(in srgb, var(--cyan) 25%, var(--line));
    border-radius: 50%;
    background: #102c30;
    box-shadow:
      0 0 50px #0fc9e108,
      inset 0 0 40px #0005;
  }
  .site-content {
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    overflow: hidden;
  }
  .demo-plan,
  .site-image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
  .site-image {
    transform-origin: center;
  }
  .wind-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    clip-path: circle(50% at 50% 50%);
  }
  .flow-current,
  .flow-average {
    transition: transform 1.1s cubic-bezier(0.2, 0.65, 0.3, 1);
    transform-box: view-box;
  }
  .flow-current polygon {
    fill: var(--cyan);
    stroke: #c4fbff;
    stroke-width: 0.25;
    filter: drop-shadow(0 0 2px #05d4e9b3);
  }
  .flow-average polygon {
    fill: #c2dcf0;
    opacity: 0.65;
  }
  .target {
    fill: #d6fbff;
    stroke: #0d5262;
    stroke-width: 0.7;
  }
  .cardinal {
    position: absolute;
    min-width: 33px;
    height: 33px;
    border: 1px solid #87b7d0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #e6f4ff;
    background: #152938;
    font-weight: 600;
    font-size: 0.85rem;
    z-index: 1;
  }
  .north {
    top: -17px;
    left: calc(50% - 16.5px);
  }
  .east {
    right: -17px;
    top: calc(50% - 16.5px);
  }
  .south {
    bottom: -17px;
    left: calc(50% - 16.5px);
  }
  .west {
    left: -17px;
    top: calc(50% - 16.5px);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 16px;
    color: var(--muted);
    font-size: 0.72rem;
    margin: 24px 0 0;
  }
  .legend span {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .legend i {
    width: 18px;
    height: 3px;
    background: var(--cyan);
    border-radius: 2px;
  }
  .legend .average {
    background: #aac7df;
  }
  .image-note {
    font-size: 0.72rem;
    color: var(--muted);
    text-align: center;
    line-height: 1.5;
    margin: 12px 0 0;
    overflow-wrap: anywhere;
  }
  .source-label {
    color: var(--muted);
    font-size: 0.68rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .weather {
    display: grid;
    gap: 18px;
    min-width: 0;
  }
  .panel {
    border: 1px solid var(--line);
    background: linear-gradient(
      135deg,
      var(--soft),
      color-mix(in srgb, var(--surface) 96%, #068aa6 4%)
    );
    border-radius: 20px;
    padding: 18px;
    text-align: left;
    min-width: 0;
    width: 100%;
  }
  button.panel:hover,
  .metric:hover {
    border-color: color-mix(in srgb, var(--cyan) 55%, var(--line));
  }
  .panel-heading {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 14px;
  }
  h2 {
    font-size: 1.3rem;
    margin: 0;
    letter-spacing: -0.025em;
  }
  .panel-heading .icon {
    color: var(--cyan);
  }
  .panel-heading .more {
    margin-left: auto;
    color: var(--muted);
    font-size: 1.3rem;
  }
  .duo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .duo > * + * {
    border-left: 1px solid var(--line);
    padding-left: 14px;
  }
  .label {
    display: block;
    color: var(--muted);
    font-size: 0.8rem;
    margin-bottom: 5px;
    line-height: 1.35;
  }
  .value {
    font-size: clamp(1.8rem, 4cqi, 3rem);
    font-weight: 650;
    line-height: 1.15;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 0.48em;
    font-weight: 450;
    letter-spacing: 0;
    white-space: nowrap;
    margin-left: 4px;
  }
  .wind-direction {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    align-items: center;
    margin: 18px 0 12px;
    padding: 14px 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .bearing {
    font-size: 1.7rem;
    font-weight: 650;
    letter-spacing: -0.03em;
  }
  .from {
    font-size: 0.9rem;
    text-align: right;
    line-height: 1.4;
  }
  .from b {
    color: var(--cyan);
    font-size: 1.15rem;
  }
  .wind-minor {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .small-value {
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .small-value .unit {
    font-size: 0.8em;
  }
  .wind-minor > div:last-child {
    grid-column: 1/-1;
    border-top: 1px solid var(--line);
    padding-top: 10px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .wind-minor > div:last-child .label {
    margin: 0;
  }
  .wind-minor .label {
    font-size: 0.73rem;
  }
  .rain {
    background:
      radial-gradient(ellipse at 100% 100%, #0f8fba22, transparent 70%),
      linear-gradient(135deg, var(--soft), var(--surface));
  }
  .wet-line {
    margin-top: 16px;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .wet-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.95rem;
    font-weight: 750;
    letter-spacing: 0.055em;
    border-radius: 30px;
    border: 1px solid var(--line);
    padding: 8px 16px;
    background: var(--soft);
    min-height: 40px;
  }
  .wet {
    color: var(--cyan);
    border-color: color-mix(in srgb, var(--cyan) 60%, transparent);
    background: color-mix(in srgb, var(--cyan) 13%, var(--surface));
  }
  .dry {
    color: var(--primary-text-color, #e0eff5);
  }
  .unavailable {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .wet-description {
    font-size: 0.7rem;
    color: var(--muted);
    max-width: 150px;
    line-height: 1.45;
  }
  .mobile-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }
  .summary-item {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--soft);
    min-height: 70px;
    text-align: left;
  }
  .summary-item .small-value {
    font-size: 1.5rem;
  }
  .summary-item .wet-badge {
    padding: 0;
    border: 0;
    background: none;
    min-height: 0;
    font-size: 0.95rem;
  }
  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 20px;
  }
  .metric {
    background: var(--soft);
    border: 1px solid var(--line);
    border-radius: 16px;
    min-width: 0;
    padding: 14px;
    text-align: left;
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: 90px;
  }
  .metric .icon {
    flex-shrink: 0;
    color: var(--accent, #ffb4a5);
    width: 28px;
    height: 28px;
  }
  .metric .label {
    font-size: 0.74rem;
  }
  .metric .value {
    font-size: clamp(1.25rem, 3cqi, 2rem);
  }
  .metric .unit {
    font-size: 0.6em;
  }
  .metric:last-child {
    grid-column: 1/-1;
  }
  .status-note {
    display: block;
    color: var(--muted);
    font-size: 0.65rem;
    font-weight: 400;
    line-height: 1.4;
    margin-top: 5px;
    letter-spacing: 0;
  }
  .stale {
    color: var(--warning-color, #e2aa51);
  }
  .footer {
    font-size: 0.68rem;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 16px 2px 0;
  }
  .text-button {
    border: 0;
    background: transparent;
    color: var(--muted);
    min-height: 44px;
    padding: 4px 8px;
    text-decoration: underline;
    text-underline-offset: 4px;
    font-size: 0.78rem;
  }
  .setup {
    border: 1px dashed color-mix(in srgb, var(--cyan) 45%, var(--line));
    border-radius: 18px;
    padding: 24px;
    background: var(--soft);
    line-height: 1.6;
  }
  .setup h2 {
    margin-bottom: 10px;
  }
  .setup p {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 8px 0;
  }
  .setup strong {
    color: var(--primary-text-color, #f2f8fc);
  }
  .setup-icon {
    color: var(--cyan);
    margin-bottom: 10px;
  }
  .setup-missing {
    margin: 16px 0;
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--soft);
    font-size: 0.78rem;
    color: var(--muted);
    line-height: 1.6;
  }
  .setup-missing strong {
    color: var(--primary-text-color, #f2f8fc);
  }
  dialog {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 24px;
    background: var(--surface);
    color: var(--primary-text-color, #edf5fc);
    width: min(760px, calc(100vw - 24px));
    max-height: calc(100dvh - 32px);
    box-shadow: 0 24px 100px #0007;
    overflow: auto;
  }
  dialog::backdrop {
    background: #02101bb8;
    backdrop-filter: blur(5px);
  }
  .dialog-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 22px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    gap: 12px;
  }
  .close {
    width: 44px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--soft);
    flex-shrink: 0;
    font-size: 1.5rem;
  }
  .detail-content {
    padding: 20px;
  }
  .detail-caption {
    font-size: 0.8rem;
    color: var(--muted);
    line-height: 1.6;
    margin-top: 0;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .detail-reading {
    padding: 13px;
    border: 1px solid var(--line);
    border-radius: 12px;
    min-width: 0;
  }
  .detail-reading .text-button {
    padding: 8px 0;
    font-size: 0.7rem;
    text-align: left;
    display: block;
    overflow-wrap: anywhere;
    width: 100%;
  }
  .detail-reading .value {
    font-size: 1.55rem;
  }
  .detail-reading .label {
    font-size: 0.76rem;
  }
  .detail-reading .entity-id {
    color: var(--muted);
    font-size: 0.65rem;
    overflow-wrap: anywhere;
  }
  .notice {
    padding: 14px;
    background: var(--soft);
    border-radius: 12px;
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.6;
  }
  .history-heading {
    font-size: 1rem;
    margin: 24px 0 10px;
  }
  .chart {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    margin: 10px 0;
  }
  .chart h4 {
    font-size: 0.8rem;
    margin: 0 0 6px;
    overflow-wrap: anywhere;
  }
  .chart svg {
    display: block;
    width: 100%;
    height: 110px;
    overflow: visible;
  }
  .chart-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.65rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .chart path {
    fill: none;
    stroke: var(--cyan);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .chart .axis {
    stroke: var(--line);
    stroke-width: 1;
  }
  .chart circle {
    fill: var(--cyan);
  }
  .sensor-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    gap: 6px 12px;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .sensor-row .label,
  .sensor-row strong {
    overflow-wrap: anywhere;
  }
  .sensor-row .text-button {
    grid-column: 1/-1;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .empty {
    font-size: 0.8rem;
    color: var(--muted);
  }
  @container weather (min-width:520px) {
    ha-card {
      padding: 24px;
    }
    .site-wrap {
      max-width: 600px;
      width: 100%;
      justify-self: center;
    }
    .metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .metric:last-child {
      grid-column: auto;
    }
    .metric {
      padding: 16px;
    }
    .metric .value {
      font-size: 1.6rem;
    }
    .wind-minor {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .wind-minor > div:last-child {
      grid-column: auto;
      border: 0;
      padding: 0;
      display: block;
    }
    .wind-minor > div:last-child .label {
      margin-bottom: 5px;
    }
    .wind-minor > div:last-child .small-value {
      font-size: 1rem;
    }
    .panel {
      padding: 22px;
    }
    .mobile-summary .small-value {
      font-size: 1.8rem;
    }
    .metric .label {
      font-size: 0.8rem;
    }
  }
  @container weather (min-width:760px) {
    .main-layout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 28px;
    }
    .mobile-summary {
      display: none;
    }
    .site-wrap {
      padding: 18px;
    }
    .panel {
      padding: 20px;
    }
    .wind-minor {
      grid-template-columns: 1fr 1fr;
    }
    .wind-minor > div:last-child {
      grid-column: 1/-1;
      border-top: 1px solid var(--line);
      padding-top: 10px;
      display: flex;
    }
    .metrics {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0;
      background: var(--soft);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px 6px;
    }
    .metric {
      border: 0;
      border-radius: 0;
      background: transparent;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      padding: 0 14px;
      min-height: 90px;
    }
    .metric + .metric {
      border-left: 1px solid var(--line);
    }
    .metric .value {
      font-size: 1.55rem;
    }
    .metric .label {
      font-size: 0.72rem;
    }
    .source-label {
      font-size: 0.65rem;
    }
  }
  @container weather (min-width:1100px) {
    ha-card {
      padding: 30px;
    }
    .main-layout {
      grid-template-columns: 1.05fr 1fr;
      gap: 38px;
    }
    .panel {
      padding: 24px;
    }
    .panel-heading {
      margin-bottom: 18px;
    }
    .wind-minor {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .wind-minor > div:last-child {
      grid-column: auto;
      border: 0;
      padding: 0;
      display: block;
    }
    .wind-minor > div:last-child .label {
      margin-bottom: 5px;
    }
    .metric {
      flex-direction: row;
      align-items: center;
      gap: 14px;
      padding: 4px 20px;
    }
    .metric .value {
      font-size: 1.85rem;
    }
    .metric .label {
      font-size: 0.8rem;
    }
    .metrics {
      padding: 22px 4px;
    }
    header {
      padding-bottom: 24px;
    }
  }
  @container weather (max-width:359px) {
    ha-card {
      padding: 14px;
      border-radius: 20px;
    }
    .panel {
      padding: 14px;
    }
    .metric {
      padding: 11px;
      gap: 6px;
    }
    .metric .icon {
      width: 22px;
      height: 22px;
    }
    .metric .value {
      font-size: 1.2rem;
    }
    .subtitle {
      font-size: 0.73rem;
    }
    .station-icon {
      width: 34px;
      height: 38px;
    }
    .value {
      font-size: 1.7rem;
    }
    .wet-description {
      max-width: 120px;
    }
    .bearing {
      font-size: 1.5rem;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
      animation: none !important;
      scroll-behavior: auto !important;
    }
  }
  @media (max-width: 480px) {
    dialog {
      width: calc(100vw - 12px);
      max-height: calc(100dvh - 12px);
      border-radius: 18px;
    }
    .dialog-head {
      padding: 12px 16px;
    }
    .detail-content {
      padding: 14px;
    }
    .detail-reading {
      padding: 10px;
    }
    .detail-reading .value {
      font-size: 1.35rem;
    }
  }
`;
