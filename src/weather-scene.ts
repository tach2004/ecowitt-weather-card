import { css, html, nothing } from "lit";
import type { WeatherObservation } from "./weather";

export type WeatherSceneSurface = "site" | "tile";
/** Decorative overlays only: the original image and the wind coordinate system are untouched. */
export function weatherScene(
  observation: WeatherObservation,
  animated = true,
  surface: WeatherSceneSurface = "site",
) {
  if (observation.kind === "unknown") return nothing;
  const rain = observation.kind === "rain";
  const night = observation.kind === "night" || observation.night === true;
  const sun = !night &&
    (observation.kind === "sunny" || observation.kind === "partlycloudy");
  const moon = night &&
    (observation.kind === "night" || observation.kind === "partlycloudy");
  const clouds =
    observation.kind === "partlycloudy" ||
    observation.kind === "cloudy" ||
    rain;
  const density =
    observation.rainIntensity === "heavy"
      ? 44
      : observation.rainIntensity === "moderate"
        ? 34
        : 24;
  const dropCount = surface === "tile" ? Math.ceil(density * 0.65) : density;
  const splashCount =
    observation.rainIntensity === "heavy"
      ? 14
      : observation.rainIntensity === "moderate"
        ? 10
        : 7;
  return html`<div
    class="weather-scene weather-scene--${surface} weather-scene--${observation.kind} ${night ? "weather-scene--nighttime" : ""} ${
      animated ? "weather-scene--animated" : "weather-scene--still"
    }"
    data-scene-weather=${observation.kind}
    data-scene-time=${night ? "night" : observation.lighting || "day"}
    aria-hidden="true"
  >
    <span class="scene-atmosphere"></span>
    ${night ? html`<span class="scene-night-haze"></span>` : nothing}
    ${moon ? html`<span class="scene-stars"></span><span class="scene-moon"></span>` : nothing}
    ${
      sun
        ? html`<span class="scene-corona"></span><span class="scene-sun"></span
            ><span class="scene-sun-glint"></span>`
        : nothing
    }
    ${
      observation.kind === "daylight"
        ? html`<span class="scene-daylight"></span>`
        : nothing
    }
    ${
      clouds
        ? html`<span class="scene-cloud scene-cloud--far"></span
            ><span class="scene-cloud scene-cloud--near"></span>`
        : nothing
    }
    ${
      rain
        ? html`<span class="scene-rain-sheen"></span>
            ${Array.from(
              { length: dropCount },
              (_, index) =>
                html`<span
                  class="scene-drop-track"
                  style=${`--x:${5 + ((index * 29) % 91)}%;--duration:${0.72 + (index % 7) * 0.11}s;--delay:${-((index * 0.173) % 2)}s;--rest-y:${12 + ((index * 17) % 70)}%;--drop-size:${12 + (index % 4) * 4}px`}
                  ><span class="scene-rain-drop"></span
                ></span>`,
            )}
            ${Array.from(
              { length: splashCount },
              (_, index) =>
                html`<span
                  class="scene-splash"
                  style=${`--x:${22 + ((index * 13) % 57)}%;--y:${72 + ((index * 7) % 14)}%;--duration:${1.12 + (index % 4) * 0.19}s;--delay:${-((index * 0.317) % 2)}s`}
                  ><span class="scene-splash-crown"></span
                ></span>`,
            )} `
        : nothing
    }
  </div>`;
}

export const weatherSceneStyles = css`
  .weather-scene {
    position: absolute;
    inset: 0;
    overflow: hidden;
    isolation: isolate;
    pointer-events: none;
    z-index: 1;
    contain: layout paint;
  }
  .weather-scene--site {
    border-radius: 50%;
  }
  .weather-scene--tile {
    border-radius: inherit;
    opacity: 0.58;
  }
  .weather-scene > span {
    position: absolute;
    display: block;
    pointer-events: none;
  }
  .scene-atmosphere {
    inset: 0;
  }
  .weather-scene--sunny .scene-atmosphere,
  .weather-scene--partlycloudy .scene-atmosphere {
    background: radial-gradient(ellipse at 72% 24%, #ffe6a517, transparent 58%);
  }
  .scene-corona {
    left: 28%;
    top: -18%;
    width: 84%;
    aspect-ratio: 1;
    background: repeating-conic-gradient(
      from 5deg,
      #ffefb000 0deg 13deg,
      #ffebae2b 16deg 19deg,
      #fff0b000 23deg 36deg
    );
    mask-image: radial-gradient(circle, #000 0 9%, #0007 23%, transparent 58%);
    filter: blur(1.5px);
    opacity: 0.72;
    transform-origin: center;
  }
  .scene-sun {
    left: 60%;
    top: 15%;
    width: 20%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
      circle at 38% 32%,
      #fffbe4 0 12%,
      #ffe8a1 43%,
      #ffcd54 76%,
      #f4ad25 100%
    );
    box-shadow:
      0 0 12px #ffefa2aa,
      0 0 38px #ffd86a7a,
      0 0 80px #f8c84b33;
    opacity: 0.92;
  }
  .scene-sun-glint {
    left: 64%;
    top: 20%;
    width: 11%;
    aspect-ratio: 1;
    background: radial-gradient(circle, #fffbe65c, transparent 68%);
    border-radius: 50%;
    filter: blur(6px);
  }
  .weather-scene--partlycloudy .scene-sun {
    opacity: 0.75;
  }
  .scene-cloud {
    top: 30%;
    left: 40%;
    width: 41%;
    height: 9%;
    border-radius: 90px;
    background: linear-gradient(#e8f0f4ca, #b2c2cc8c);
    box-shadow:
      0 10px 20px #071c2733,
      inset 0 3px 7px #ffffff40;
    opacity: 0.8;
  }
  .scene-cloud::before,
  .scene-cloud::after {
    content: "";
    position: absolute;
    display: block;
    border-radius: 50%;
    background: inherit;
  }
  .scene-cloud::before {
    width: 47%;
    height: 210%;
    left: 18%;
    bottom: 16%;
  }
  .scene-cloud::after {
    width: 35%;
    height: 150%;
    right: 8%;
    bottom: 17%;
  }
  .scene-cloud--far {
    top: 18%;
    left: 13%;
    width: 31%;
    height: 6%;
    opacity: 0.48;
    filter: blur(1.2px);
  }
  .scene-cloud--near {
    filter: blur(0.4px);
  }
  .weather-scene--cloudy .scene-atmosphere {
    background: linear-gradient(#51687526, transparent 58%, #728d9f15);
  }
  .weather-scene--cloudy .scene-cloud--near {
    top: 24%;
    left: 43%;
    opacity: 0.72;
  }
  /* Fourth comparison panel: lift the sun and clouds within the circular wind
     graphic only. The rain tile and weather calculations keep their positions. */
  .weather-scene--site .scene-corona {
    left: 33%;
    top: -24%;
  }
  .weather-scene--site .scene-sun {
    left: 65%;
    top: 9%;
  }
  .weather-scene--site .scene-sun-glint {
    left: 69%;
    top: 14%;
  }
  .weather-scene--site .scene-cloud--far {
    top: 12%;
  }
  /* Move only the large/near cloud slightly to the north-east; far cloud stays put. */
  .weather-scene--site .scene-cloud--near {
    left: 44%;
    top: 18%;
  }
  .weather-scene--site.weather-scene--cloudy .scene-cloud--near {
    left: 47%;
    top: 12%;
  }
  .scene-night-haze {
    inset: 0;
    background:
      radial-gradient(ellipse at 71% 26%, #b8d9ee1f, transparent 46%),
      linear-gradient(#14233f26, transparent 60%);
  }
  .weather-scene--nighttime .scene-cloud {
    background: linear-gradient(#536877c8, #33475eaf);
    opacity: 0.83;
  }
  .weather-scene--nighttime.weather-scene--rain .scene-cloud {
    background: linear-gradient(#536877c8, #293e55c0);
    opacity: 0.65;
  }
  .weather-scene--nighttime .scene-atmosphere {
    background: linear-gradient(#0d193943, transparent 70%);
  }
  .scene-stars {
    inset: 7% 9% 37%;
    opacity: 0.76;
    background-image:
      radial-gradient(circle at 12% 25%, #fffce2e6 0 1px, transparent 2px),
      radial-gradient(circle at 37% 11%, #dbe8ffff 0 1.4px, transparent 2.5px),
      radial-gradient(circle at 84% 37%, #fffce6db 0 1px, transparent 2px),
      radial-gradient(circle at 65% 21%, #e3f0ffe6 0 1px, transparent 2px),
      radial-gradient(circle at 25% 81%, #eaf6ffdb 0 1.2px, transparent 2px),
      radial-gradient(circle at 54% 75%, #ffffffc7 0 1px, transparent 2px),
      radial-gradient(circle at 92% 78%, #fff5cee0 0 1px, transparent 2px);
  }
  .scene-moon {
    left: 62%;
    top: 16%;
    width: 14%;
    aspect-ratio: 1;
    border-radius: 50%;
    box-shadow: inset -12px 5px 0 #e3edf7c9;
    filter: drop-shadow(0 0 10px #c7e5ff4d);
  }
  /* Align the moon with the sun's raised north-east position in the wind view. */
  .weather-scene--site .scene-moon {
    left: 67%;
    top: 10%;
  }
  .scene-daylight {
    inset: 0;
    background:
      radial-gradient(ellipse at 50% 105%, #f5cf882e, transparent 59%),
      linear-gradient(#a9d6ed10, transparent 50%);
  }
  .weather-scene--rain .scene-atmosphere {
    background: linear-gradient(145deg, #16445c1f, transparent 48%, #4c95b623);
  }
  .weather-scene--rain .scene-cloud {
    opacity: 0.32;
    background: linear-gradient(#a9c1ce99, #688ca75c);
  }
  .scene-rain-sheen {
    inset: 56% 8% 0;
    background: radial-gradient(ellipse at 50% 85%, #64d8ff15, transparent 66%);
  }
  .scene-drop-track {
    top: 0;
    bottom: 0;
    left: var(--x);
    width: 3px;
    transform: translateY(var(--rest-y));
  }
  .scene-rain-drop {
    position: absolute;
    display: block;
    left: 0;
    top: 0;
    width: 1.6px;
    height: var(--drop-size);
    border-radius: 2px;
    background: linear-gradient(180deg, #d2f5ff00, #c4f1ffb3 75%, #e9fbffd9);
    box-shadow: 0 0 3px #6dcbe54d;
    transform: rotate(8deg);
  }
  .scene-splash {
    left: var(--x);
    top: var(--y);
    width: 20px;
    height: 6px;
    margin-left: -10px;
    border-radius: 50%;
    border: 1px solid #d1f7ffb3;
    box-shadow: 0 0 6px #5edaff24;
    opacity: 0.34;
    transform: scale(0.7);
  }
  .scene-splash::before,
  .scene-splash::after {
    content: "";
    position: absolute;
    border: 1px solid #c8f4ff80;
    border-radius: 50%;
  }
  .scene-splash::before {
    inset: -4px -6px;
    opacity: 0.6;
  }
  .scene-splash::after {
    inset: -1px 4px;
    opacity: 0.5;
  }
  .scene-splash-crown {
    position: absolute;
    width: 2px;
    height: 4px;
    top: -5px;
    left: 4px;
    border-radius: 2px;
    background: #defaffc2;
    box-shadow:
      5px -2px 0 #defaff99,
      10px 1px 0 #defaff9c;
  }
  .weather-scene--animated .scene-stars {
    animation: weather-star-twinkle 6.5s ease-in-out infinite alternate;
  }
  .weather-scene--animated .scene-corona {
    animation: weather-rays 28s linear infinite;
  }
  .weather-scene--animated .scene-sun-glint {
    animation: weather-sun-breath 5.4s ease-in-out infinite alternate;
  }
  .weather-scene--animated .scene-cloud--near {
    animation: weather-cloud-drift 13s ease-in-out infinite alternate;
  }
  .weather-scene--animated .scene-cloud--far {
    animation: weather-cloud-drift 19s ease-in-out -5s infinite
      alternate-reverse;
  }
  .weather-scene--animated .scene-drop-track {
    animation: weather-rain-fall var(--duration) linear var(--delay) infinite;
  }
  .weather-scene--animated .scene-splash {
    animation: weather-ground-splash var(--duration) ease-out var(--delay)
      infinite;
  }
  .weather-scene--tile.weather-scene--rain {
    opacity: 0.95;
  }
  .weather-scene--tile .scene-rain-drop {
    width: 2px;
    background: linear-gradient(180deg, transparent, var(--cyan, #0086a5) 70%);
    box-shadow: 0 0 2px #0086a530;
  }
  .weather-scene--tile .scene-splash {
    border-color: var(--cyan, #0086a5);
  }
  .weather-scene--tile .scene-sun {
    left: auto;
    right: 9%;
    top: 12%;
    width: 66px;
  }
  .weather-scene--tile .scene-corona {
    left: auto;
    right: -12%;
    top: -40%;
    width: 63%;
  }
  .weather-scene--tile .scene-sun-glint {
    left: auto;
    right: 12%;
    width: 42px;
    top: 15%;
  }
  .weather-scene--tile .scene-cloud {
    top: 17%;
    left: 53%;
    width: 31%;
    height: 10%;
  }
  .weather-scene--tile .scene-cloud--far {
    left: 15%;
    top: 13%;
    width: 23%;
  }
  .weather-scene--tile .scene-moon {
    width: 45px;
    left: auto;
    right: 13%;
    top: 10%;
  }
  .weather-scene--tile .scene-splash {
    width: 15px;
    height: 5px;
  }
  @keyframes weather-star-twinkle {
    from { opacity: 0.47; }
    to { opacity: 0.9; }
  }
  @keyframes weather-rays {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes weather-sun-breath {
    from {
      opacity: 0.35;
      transform: scale(0.9);
    }
    to {
      opacity: 0.9;
      transform: scale(1.08);
    }
  }
  @keyframes weather-cloud-drift {
    from {
      transform: translateX(-8px);
    }
    to {
      transform: translateX(13px);
    }
  }
  @keyframes weather-rain-fall {
    from {
      transform: translateY(-10%);
    }
    to {
      transform: translateY(112%);
    }
  }
  @keyframes weather-ground-splash {
    0%,
    55% {
      opacity: 0;
      transform: scale(0.2);
    }
    60% {
      opacity: 0.75;
      transform: scale(0.45);
    }
    100% {
      opacity: 0;
      transform: scale(1.4);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .weather-scene *,
    .weather-scene *::before,
    .weather-scene *::after {
      animation: none !important;
      transition: none !important;
    }
    .weather-scene .scene-drop-track {
      transform: translateY(var(--rest-y));
    }
    .weather-scene .scene-splash {
      opacity: 0.34;
      transform: scale(0.7);
    }
  }
`;
