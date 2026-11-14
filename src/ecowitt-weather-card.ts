import { LitElement, html, svg, nothing, type PropertyValues } from "lit";
import { cardStyles } from "./styles";
import { sitePlan } from "./site-plan";
import {
  getReading,
  normalizeDegrees,
  unwrapDegrees,
  directionLabel,
  flowBearing,
  entityFreshness,
  type Reading,
} from "./data";
import { loadHistory, type HistoryResult, type HistorySeries } from "./history";
import { resolveImage } from "./image";
import { observeWeather, type WeatherObservation } from "./weather";
import { deviceIndicators } from "./device-status";
import {
  METRICS,
  type CardConfig,
  type DeviceStatusConfig,
  type HomeAssistant,
  type MetricKey,
} from "./types";
import { normalizeConfig } from "./config";
import { buildHistoryCharts } from "./chart";
import "./editor";

type Detail = "wind" | "rain" | "temperature" | "pressure" | "sun" | "sensors";
const detailNames: Record<Detail, string> = {
  wind: "Wind",
  rain: "Regen",
  temperature: "Außenklima",
  pressure: "Luftdruck",
  sun: "Sonne & UV",
  sensors: "Sensoren & Diagnosen",
};
const detailKeys: Record<Detail, MetricKey[]> = {
  wind: [
    "wind_speed",
    "wind_gust",
    "wind_direction",
    "wind_direction_avg",
    "wind_gust_max",
  ],
  rain: [
    "rain_today",
    "rain_rate",
    "rain_wet",
    "rain_24h",
    "rain_week",
    "rain_month",
    "rain_year",
    "rain_event",
  ],
  temperature: [
    "temperature",
    "humidity",
    "feels_like",
    "dew_point",
    "temperature_min",
    "temperature_max",
    "vpd",
  ],
  pressure: ["pressure"],
  sun: ["uv", "solar", "solar_lux"],
  sensors: [],
};
const graphKeys: Record<Detail, MetricKey[]> = {
  wind: ["wind_speed", "wind_gust"],
  rain: ["rain_rate", "rain_today"],
  temperature: ["temperature", "humidity"],
  pressure: ["pressure"],
  sun: ["uv", "solar"],
  sensors: [],
};
const required: MetricKey[] = [
  "temperature",
  "humidity",
  "wind_speed",
  "wind_gust",
  "wind_direction",
  "rain_today",
  "rain_rate",
  "rain_wet",
  "pressure",
  "uv",
  "solar",
];
const paths: Record<string, string> = {
  wind: "M3 8h12a3 3 0 1 0-3-3 M2 12h17a3 3 0 1 1-3 3 M4 16h5a3 3 0 1 1-3 3",
  rain: "M7 16H6a4 4 0 1 1 1-7 5 5 0 0 1 10-1 4 4 0 1 1 1 8h-1 M8 19l-1 2 M13 19l-1 2 M18 19l-1 2",
  temperature: "M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0 M12 8v10",
  humidity: "M12 2S4 11 4 16a8 8 0 0 0 16 0c0-5-8-14-8-14 M8 16a4 4 0 0 0 4 4",
  pressure:
    "M3 19a10 10 0 1 1 18 0 M12 13l4-5 M6 13h1 M12 5v1 M18 13h-1 M8 8l1 1",
  sun: "M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  signal: "M4 20v-3 M9 20v-7 M14 20V9 M19 20V4",
  unknown: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01",
  station:
    "M12 12v9 M7 21h10 M8 8a6 6 0 0 0 0 8 M16 8a6 6 0 0 1 0 8 M5 5a10 10 0 0 0 0 14 M19 5a10 10 0 0 1 0 14 M11 10h2v2h-2z",
  sensors: "M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M10 16v4",
};
const icon = (name: string) =>
  svg`<svg class="icon" data-icon=${name} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${paths[name] ?? paths.unknown}/></svg>`;

export class EcowittWeatherCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _detail: { state: true },
    _history: { state: true },
    _loading: { state: true },
    _imageUrl: { state: true },
    _imageError: { state: true },
  };
  static styles = cardStyles;
  hass?: HomeAssistant;
  private _config: CardConfig = { type: "custom:ecowitt-weather-card" };
  private _detail?: Detail;
  private _history?: HistoryResult;
  private _loading = false;
  private _imageUrl = "";
  private _imageError = "";
  private _imageSource = "";
  private _imageRequest = 0;
  private _imageNeedsHass = false;
  private _historyRequest = 0;
  private _rotation?: number;
  private _averageRotation?: number;
  private _ageTimer?: ReturnType<typeof setInterval>;

  static getConfigElement() {
    return document.createElement("ecowitt-weather-card-editor");
  }
  static getStubConfig() {
    return { type: "custom:ecowitt-weather-card", entities: {} };
  }
  setConfig(config: CardConfig) {
    this._config = normalizeConfig(config);
    this._rotation = undefined;
    this._averageRotation = undefined;
    const source =
      this._config.site_image ?? this._config.background_image ?? "";
    if (source !== this._imageSource) {
      // A cleared/replaced source must also invalidate an in-flight media response.
      this._imageRequest++;
      this._imageUrl = "";
      this._imageError = "";
      this._imageNeedsHass = false;
    }
    this._historyRequest++;
    this._detail = undefined;
    this._dialog()?.close();
  }
  getCardSize() {
    return 12;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
  connectedCallback() {
    super.connectedCallback();
    this._ageTimer = setInterval(() => this.requestUpdate(), 60_000);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._ageTimer);
    this._closeDetail();
    this._imageRequest++;
    this._imageSource = "";
  }
  protected willUpdate(_changes: PropertyValues) {
    const current = this._reading("wind_direction").value;
    const average = this._reading("wind_direction_avg").value;
    if (current !== null)
      this._rotation =
        this._rotation === undefined
          ? current
          : unwrapDegrees(this._rotation, current);
    if (average !== null)
      this._averageRotation =
        this._averageRotation === undefined
          ? average
          : unwrapDegrees(this._averageRotation, average);
    const source =
      this._config.site_image ?? this._config.background_image ?? "";
    if (
      source !== this._imageSource ||
      (_changes.has("hass") && this._imageNeedsHass && this.hass?.callWS)
    ) {
      this._imageSource = source;
      void this._resolveImage(source);
    }
  }
  private async _resolveImage(source: string) {
    const request = ++this._imageRequest;
    this._imageUrl = "";
    this._imageError = "";
    this._imageNeedsHass =
      source.startsWith("media-source://") && !this.hass?.callWS;
    if (!source) return;
    try {
      const url = await resolveImage(this.hass, source);
      if (request === this._imageRequest) this._imageUrl = url;
    } catch (error) {
      if (request === this._imageRequest)
        this._imageError =
          error instanceof Error
            ? error.message
            : "Bildquelle nicht verfügbar.";
    }
  }
  private _reading(key: MetricKey): Reading {
    return getReading(this.hass, this._config, key);
  }
  private _value(key: MetricKey, small = false) {
    const reading = this._reading(key);
    return html`<span class=${small ? "small-value" : "value"}
        >${reading.text}${reading.value !== null && reading.unit
          ? html`<span class="unit">${reading.unit}</span>`
          : nothing}</span
      >${this._status(reading)}`;
  }
  private _status(reading: Reading) {
    return reading.status === "ok"
      ? nothing
      : html`<span
          class="status-note ${reading.status === "stale" ? "stale" : ""}"
          >${reading.status === "stale"
            ? "Veraltet"
            : reading.status === "missing"
              ? "Quelle auswählen"
              : reading.status === "invalid"
                ? "Quelle prüfen"
                : "Nicht verfügbar"}</span
        >`;
  }
  private _wetBadge() {
    const r = this._reading("rain_wet");
    const status =
      r.status === "ok" ? (r.value === 1 ? "wet" : "dry") : "unavailable";
    return html`<span class="wet-badge ${status}"
      >${icon("humidity")}${status === "wet"
        ? "NASS"
        : status === "dry"
          ? "TROCKEN"
          : "UNAVAILABLE"}</span
    >`;
  }
  protected render() {
    const hasEntities = Object.values(this._config.entities ?? {}).some(
      (id) => id && this.hass?.states[id],
    );
    const missing = required.filter(
      (key) =>
        !this._config.entities?.[key] ||
        !this.hass?.states[this._config.entities[key]!],
    );
    return html`<ha-card data-theme=${this._config.theme_mode || "auto"}>
      <header>
        <div class="station-icon">${icon("station")}</div>
        <div>
          <h1>${this._config.title || "Wetterstation"}</h1>
          <p class="subtitle">
            ${this._config.subtitle || "Ecowitt · Wetter vor Ort"}
          </p>
        </div>
        ${this._headerDevices()}
        <button
          class="diagnostics"
          data-detail="sensors"
          aria-label="Sensoren und Diagnosen öffnen"
          @click=${() => this._openDetail("sensors")}
        >
          ${icon("sensors")}
        </button>
      </header>
      ${hasEntities ? this._sky() : nothing}
      ${!hasEntities
        ? this._setup()
        : html`
            <div class="mobile-summary">
              <button
                class="summary-item"
                data-key="temperature"
                data-detail="temperature"
                @click=${() => this._openDetail("temperature")}
              >
                <span class="label">Außentemperatur</span>${this._value(
                  "temperature",
                  true,
                )}
              </button>
              <button
                class="summary-item"
                data-key="rain_wet"
                data-detail="rain"
                @click=${() => this._openDetail("rain")}
              >
                <span class="label">WS90 · Feuchtigkeitsstatus</span
                >${this._wetBadge()}
              </button>
            </div>
            <div class="main-layout">
              ${this._site()}
              <div class="weather">${this._wind()}${this._rain()}</div>
            </div>
            <div class="metrics">
              ${this._metric(
                "temperature",
                "Temperatur",
                "temperature",
                "#ff9f95",
                "temperature",
              )}
              ${this._metric(
                "humidity",
                "Luftfeuchte",
                "humidity",
                "#1dcce4",
                "temperature",
              )}
              ${this._metric(
                "pressure",
                "Luftdruck",
                "pressure",
                "#b7a4ef",
                "pressure",
              )}
              ${this._metric("uv", "UV-Index", "sun", "#bca2f5", "sun")}
              ${this._metric(
                "solar",
                "Solarstrahlung",
                "sun",
                "#f2d669",
                "sun",
              )}
              ${this._metric(
                "solar_lux",
                "Beleuchtungsstärke",
                "sun",
                "#f2d669",
                "sun",
              )}
            </div>
            ${missing.length
              ? html`<div class="setup-missing">
                  <strong>Einrichtung vervollständigen</strong> ·
                  ${missing.length} Hauptquellen fehlen. Im Karteneditor
                  zuordnen:
                  ${missing
                    .map((key) => METRICS.find((m) => m.key === key)!.label)
                    .join(", ")}.
                </div>`
              : nothing}
            <div class="footer">
              <span>Wetterdaten aus Home Assistant</span
              ><span>Nordorientierte Ansicht</span>
            </div>
          `}
      ${this._renderDialog()}
    </ha-card>`;
  }

  private _observation(): WeatherObservation {
    return observeWeather(
      this.hass?.states["sun.sun"],
      this._reading("solar"),
      this._reading("rain_rate"),
      this._reading("rain_wet"),
      { staleAfterMinutes: this._config.stale_after_minutes },
    );
  }
  private _batteryGlyph(percent?: number) {
    const width =
      percent === undefined
        ? 0
        : Math.min(14, Math.max(0, (14 * percent) / 100));
    return svg`<svg viewBox="0 0 24 16" class="battery-glyph" aria-hidden="true">
      <rect x="1" y="2" width="19" height="12" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.5" />
      <rect x="21" y="5" width="2" height="6" rx="1" fill="currentColor" />
      <rect x="3.5" y="4.5" width=${width} height="7" rx="1" fill="currentColor" />
    </svg>`;
  }
  private _deviceChip(device: DeviceStatusConfig, compact = true) {
    const indicator = deviceIndicators(this.hass, device, {
      staleAfterMinutes: this._config.stale_after_minutes,
    });
    return html`<button
      type="button"
      class="device-chip ${compact ? "compact" : "full"}"
      title=${"Batterie: " +
      indicator.battery.label +
      ", Signal: " +
      indicator.signal.label +
      ", Verbindung: " +
      indicator.connection.label}
      @click=${() => this._openDetail("sensors")}
    >
      <strong title=${device.name || device.role}
        >${device.name || device.role}</strong
      >
      <span
        title=${indicator.battery.detail}
        class="status-battery ${indicator.battery.percent !== undefined &&
        indicator.battery.percent < 20
          ? "low"
          : ""}"
      >
        ${this._batteryGlyph(indicator.battery.percent)}
        ${indicator.battery.label}
      </span>
      <span title=${indicator.signal.detail} class="status-signal"
        >${icon("signal")}${indicator.signal.label}</span
      >
      <span
        title=${indicator.connection.detail}
        class="status-connection ${indicator.connection.state}"
      >
        <i aria-hidden="true"></i>${indicator.connection.label}
      </span>
    </button>`;
  }
  private _headerDevices() {
    const selected = (this._config.device_status || []).filter(
      (device) => device.show_on_main,
    );
    return html`<div class="header-devices" aria-label="Gerätestatus">
      ${selected.length
        ? selected.map((device) => this._deviceChip(device))
        : html`<button
            type="button"
            class="device-placeholder"
            @click=${() => this._openDetail("sensors")}
            title="WS90-Gerätestatus im Karteneditor zuordnen"
          >
            WS90 · Status zuordnen
          </button>`}
    </div>`;
  }
  private _sky() {
    const sky = this._observation();
    const animated = this._config.weather_animation !== false;
    return html`<div
      class="sky-banner"
      data-weather=${sky.kind}
      role="status"
      title=${sky.note}
    >
      <div
        class="sky-art ${sky.kind} ${animated ? "animated" : ""}"
        aria-hidden="true"
      >
        ${sky.kind === "sunny" || sky.kind === "partlycloudy"
          ? html`<i class="sun-disc"></i>`
          : nothing}
        ${sky.kind === "night" ? html`<i class="moon-disc"></i>` : nothing}
        ${["cloudy", "partlycloudy", "rain"].includes(sky.kind)
          ? html`<i class="cloud-one"></i><i class="cloud-two"></i>`
          : nothing}
        ${sky.kind === "rain" ? html`<i class="sky-drop"></i>` : nothing}
        ${sky.kind === "unknown" ? icon("unknown") : nothing}
      </div>
      <span>${sky.label}</span>
      <small
        >${sky.estimated
          ? "Lokale Schätzung · WS90 + Sonnenstand"
          : sky.note}</small
      >
    </div>`;
  }
  private _setup() {
    return html`<section class="setup">
      <div class="setup-icon">${icon("station")}</div>
      <span class="eyebrow">Einrichtung · Willkommen bei Ecowitt</span>
      <h2>Dein Wetter. Direkt vor Ort.</h2>
      <p>
        Öffne den <strong>visuellen Karteneditor</strong> und wähle deine
        vorhandenen Home-Assistant-Entitäten aus.
      </p>
      <p>
        WS90 für Wind und Feuchtigkeitsstatus, WH40 für Regenmenge und
        Regenrate, WN32 für Außenklima und GW3000 für Luftdruck.
      </p>
      <p>
        Ohne zugeordnete Quellen werden keine Messwerte angezeigt. Dein eigenes
        Bild kannst du später als private HA-Bildquelle auswählen.
      </p>
    </section>`;
  }
  private _site() {
    const current = this._reading("wind_direction");
    const avg = this._reading("wind_direction_avg");
    const speed = this._reading("wind_speed");
    const calm = speed.status === "ok" && speed.value === 0;
    const currentVisible =
      current.status === "ok" &&
      speed.status === "ok" &&
      speed.value !== null &&
      speed.value > 0;
    const averageVisible = avg.status === "ok" && !calm;
    const offsetX = this._clamp(this._config.image_target_x, 50, 10, 90) - 50;
    const offsetY = this._clamp(this._config.image_target_y, 50, 10, 90) - 50;
    const radius = Math.hypot(offsetX, offsetY);
    const scale = radius > 40 ? 40 / radius : 1;
    const targetX = 50 + offsetX * scale,
      targetY = 50 + offsetY * scale;
    const arrow = (width: number, bearing: number) => {
      const theta = (bearing * Math.PI) / 180;
      const dot =
        (targetX - 50) * Math.sin(theta) - (targetY - 50) * Math.cos(theta);
      const length =
        -dot +
        Math.sqrt(
          dot * dot + 48 * 48 - (targetX - 50) ** 2 - (targetY - 50) ** 2,
        );
      const head = Math.min(11, length * 0.5),
        wing = Math.min(width + 5, length * 0.3);
      return `${targetX - width},${targetY - length} ${targetX + width},${targetY - length} ${targetX + width},${targetY - head} ${targetX + wing},${targetY - head} ${targetX},${targetY} ${targetX - wing},${targetY - head} ${targetX - width},${targetY - head}`;
    };
    const description = currentVisible
      ? `Wind aus ${current.text} Grad, ${directionLabel(current.value!)}. Strömung zum Ziel in ${flowBearing(current.value!)} Grad.`
      : calm
        ? "Flaute. Kein aktueller Strömungspfeil."
        : "Keine aktuelle Windströmung verfügbar.";
    return html`<section
      class="site-wrap"
      aria-label="Wind über nordorientierter Draufsicht"
    >
      <figure class="site" role="img" aria-label=${description}>
        <div class="site-content">
          ${this._imageUrl && !this._imageError
            ? html`<img
                class="site-image"
                src=${this._imageUrl}
                alt="Eigene HA-Bildquelle"
                style="transform:rotate(${this._clamp(
                  this._config.image_rotation,
                  0,
                  -180,
                  180,
                )}deg)"
                @error=${() => {
                  this._imageError =
                    "Bild konnte nicht geladen werden. Pfad und Zugriffsrechte in Home Assistant prüfen.";
                }}
              />`
            : sitePlan()}
        </div>
        <svg class="wind-layer" viewBox="0 0 100 100" aria-hidden="true">
          ${averageVisible
            ? svg`<g class="flow-average" data-bearing=${normalizeDegrees(avg.value!)} style="transform:rotate(${this._averageRotation}deg);transform-origin:${targetX}% ${targetY}%"><polygon points=${arrow(0.7, avg.value!)}/></g>`
            : nothing}
          ${currentVisible
            ? svg`<g class="flow-current" data-bearing=${normalizeDegrees(current.value!)} data-flow-bearing=${flowBearing(current.value!)} style="transform:rotate(${this._rotation}deg);transform-origin:${targetX}% ${targetY}%"><polygon points=${arrow(1.7, current.value!)}/></g>`
            : nothing}
          <circle class="target" cx=${targetX} cy=${targetY} r="1" />
        </svg>
        <svg class="degree-ring" viewBox="-12 -12 124 124" aria-hidden="true">
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((bearing) => {
            const theta = (bearing * Math.PI) / 180;
            const cardinalPositions: Record<number, [number, number]> = {
              0: [62, -5],
              90: [105, 62],
              180: [38, 105],
              270: [-5, 38],
            };
            const [x, y] = cardinalPositions[bearing] ?? [
              50 + Math.sin(theta) * 58,
              50 - Math.cos(theta) * 58,
            ];
            return svg`<text data-degrees=${bearing} x=${x} y=${y} text-anchor="middle" dominant-baseline="middle">${bearing}°</text>`;
          })}
        </svg>
        <span class="cardinal north">N</span><span class="cardinal east">O</span
        ><span class="cardinal south">S</span
        ><span class="cardinal west">W</span>
      </figure>
      <div class="legend">
        <span><i></i>Aktuelle Strömung zum Ziel</span
        ><span><i class="average"></i>Ø 10 Min. Strömung</span>
      </div>
      <p class="image-note">
        ${this._imageError ||
        (calm
          ? "Flaute · aktueller Pfeil ausgeblendet"
          : this._imageUrl
            ? "Eigene HA-Bildquelle · Norden oben prüfen"
            : "Generische Beispielgrafik · Norden oben")}
      </p>
    </section>`;
  }
  private _wind() {
    const direction = this._reading("wind_direction");
    return html`<button
      class="panel wind"
      data-detail="wind"
      aria-label="Winddetails öffnen"
      @click=${() => this._openDetail("wind")}
    >
      <div class="panel-heading">
        ${icon("wind")}
        <h2>Wind</h2>
        <span class="source-label">WS90</span><span class="more">›</span>
      </div>
      <div class="duo">
        <div data-key="wind_speed">
          <span class="label">Aktuell</span>${this._value("wind_speed")}
        </div>
        <div data-key="wind_gust">
          <span class="label">Böen</span>${this._value("wind_gust")}
        </div>
      </div>
      <div class="wind-direction">
        <div data-key="wind_direction">
          <span class="label">Herkunftsrichtung</span
          ><span class="bearing"
            >${direction.text}${direction.value !== null ? "°" : ""}</span
          >${this._status(direction)}
        </div>
        <div class="from">
          Wind aus<br /><b
            >${direction.value === null
              ? "—"
              : directionLabel(direction.value)}</b
          >
        </div>
      </div>
      <div class="wind-minor">
        <div data-key="wind_direction_avg">
          <span class="label">Ø 10 Min. Richtung</span>${this._value(
            "wind_direction_avg",
            true,
          )}
        </div>
        <div data-key="wind_gust_max">
          <span class="label">Max. Böe heute</span>${this._value(
            "wind_gust_max",
            true,
          )}
        </div>
      </div>
    </button>`;
  }

  private _rain() {
    const sky = this._observation();
    const raining = sky.kind === "rain";
    const animated = this._config.weather_animation !== false;
    return html`<button
      class="panel rain ${raining ? "raining" : ""}"
      data-detail="rain"
      aria-label="Regendetails öffnen"
      @click=${() => this._openDetail("rain")}
    >
      ${["sunny", "partlycloudy"].includes(sky.kind)
        ? html`<span
            class="rain-sun-decoration ${animated ? "animated" : ""}"
            aria-hidden="true"
          ></span>`
        : nothing}
      ${raining
        ? html`<span
            class="rain-atmosphere ${animated ? "animated" : ""}"
            aria-hidden="true"
          >
            ${Array.from(
              { length: 14 },
              (_, i) =>
                html`<i
                  style=${"left:" + (7 + i * 6.3) + "%;--drop:" + i}
                ></i>`,
            )}
          </span>`
        : nothing}
      <div class="panel-heading">
        ${icon("rain")}
        <h2>Regen</h2>
        <span class="source-label">WH40</span><span class="more">›</span>
      </div>
      <div class="duo">
        <div data-key="rain_today">
          <span class="label">Heute · Kalendertag</span>${this._value(
            "rain_today",
          )}
        </div>
        <div data-key="rain_rate">
          <span class="label">Regenrate</span>${this._value("rain_rate")}
        </div>
      </div>
      <div class="wet-line" data-key="rain_wet">
        ${this._wetBadge()}<span class="wet-description"
          >WS90 Piezo · Feuchtigkeit,<br />kein Nachweis für Regenfall</span
        >
      </div>
      ${this._reading("rain_wet").status === "stale"
        ? html`<span class="status-note stale"
            >Feuchtigkeitsstatus veraltet</span
          >`
        : nothing}
    </button>`;
  }
  private _metric(
    key: MetricKey,
    label: string,
    iconName: string,
    color: string,
    detail: Detail,
  ) {
    return html`<button
      class="metric"
      data-key=${key}
      data-detail=${detail}
      style="--accent:${color}"
      @click=${() => this._openDetail(detail)}
    >
      ${icon(iconName)}
      <div><span class="label">${label}</span>${this._value(key)}</div>
    </button>`;
  }
  private _clamp(value: unknown, fallback: number, min: number, max: number) {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  }
  private _dialog() {
    return this.renderRoot?.querySelector<HTMLDialogElement>("dialog");
  }
  private async _openDetail(detail: Detail) {
    this._detail = detail;
    this._history = undefined;
    this._loading = detail !== "sensors";
    const request = ++this._historyRequest;
    await this.updateComplete;
    if (
      request !== this._historyRequest ||
      this._detail !== detail ||
      !this.isConnected
    )
      return;
    const dialog = this._dialog();
    if (!dialog?.isConnected) return;
    if (!dialog.open) dialog.showModal();
    if (detail === "sensors") return;
    const keys = graphKeys[detail];
    const ids = keys.flatMap((key) =>
      this._config.entities?.[key] ? [this._config.entities[key]!] : [],
    );
    const result = this.hass
      ? await loadHistory(this.hass, ids, this._config.history_hours ?? 24)
      : undefined;
    if (request === this._historyRequest) {
      this._history = result;
      this._loading = false;
    }
  }
  private _closeDetail() {
    this._dialog()?.close();
    this._detail = undefined;
    this._historyRequest++;
  }
  private _moreInfo(entityId: string) {
    this._closeDetail();
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private _renderDialog() {
    const detail = this._detail;
    return html`<dialog
      aria-labelledby="detail-title"
      @cancel=${() => this._closeDetail()}
      @click=${(event: MouseEvent) => {
        if (event.target === this._dialog()) {
          const r = this._dialog()!.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            this._closeDetail();
        }
      }}
    >
      ${detail
        ? html`<div class="dialog-head">
              <div>
                <span class="eyebrow">Wetterstation · Details</span>
                <h2 id="detail-title">${detailNames[detail]}</h2>
              </div>
              <button
                class="close"
                aria-label="Schließen"
                @click=${this._closeDetail}
              >
                ×
              </button>
            </div>
            <div class="detail-content">
              ${detail === "sensors"
                ? this._sensorDetails()
                : html`
                    <p class="detail-caption">
                      ${detail === "rain"
                        ? "WH40-Mengen und WS90-Feuchtigkeit sind getrennte Messungen. Heute ist der Kalendertag; „letzte 24 Stunden“ benötigt eine eigene gleitende Quellentität."
                        : detail === "wind"
                          ? "Alle Richtungsangaben bezeichnen die meteorologische Herkunft. Die Strömungspfeile zeigen von dort zum Ziel. 10-Minuten-Mittelwerte stammen ausschließlich aus den zugeordneten Quellentitäten."
                          : "Aktuelle Werte der zugeordneten Home-Assistant-Entitäten. Verlauf nur aus dem lokalen Recorder."}
                    </p>
                    <div class="detail-grid">
                      ${detailKeys[detail].map((key) =>
                        this._detailReading(key),
                      )}
                    </div>
                    <h3 class="history-heading">
                      Verlauf · letzte
                      ${this._clamp(this._config.history_hours, 24, 1, 168)}
                      Stunden
                    </h3>
                    ${this._loading
                      ? html`<p class="notice" role="status">
                          Recorder-Verlauf wird geladen …
                        </p>`
                      : this._history?.status === "ok"
                        ? this._history.series.map((series) =>
                            this._chart(series),
                          )
                        : html`<p class="notice">
                            ${this._history?.message ??
                            "Keine Historienquelle verfügbar."}
                          </p>`}
                    ${detail === "rain"
                      ? html`<p class="detail-caption">
                          Der Tagesmengen-Verlauf setzt sich am Tageswechsel
                          zurück. Daraus wird kein rollierender 24h-Wert
                          berechnet.
                        </p>`
                      : nothing}
                    ${detail === "wind"
                      ? html`<p class="notice">
                          Eine 24h-Windrose ist in diesem Meilenstein noch nicht
                          enthalten. Sie benötigt eine belastbare Verteilung aus
                          zeitlich gepaarten Richtungs- und
                          Geschwindigkeitsdaten.
                        </p>`
                      : nothing}
                    <button
                      class="text-button"
                      @click=${() => this._openDetail(detail)}
                    >
                      Verlauf neu laden
                    </button>
                  `}
            </div>`
        : nothing}
    </dialog>`;
  }
  private _detailReading(key: MetricKey) {
    const r = this._reading(key);
    const id = this._config.entities?.[key];
    return html`<div class="detail-reading" data-key=${key}>
      <span class="label"
        >${METRICS.find((m) => m.key === key)?.label ?? key}</span
      >${this._value(key)}${r.note
        ? html`<span class="status-note">${r.note}</span>`
        : nothing}${id
        ? html`<button class="text-button" @click=${() => this._moreInfo(id)}>
              In Home Assistant öffnen ↗</button
            ><span class="entity-id">${id}</span>`
        : nothing}
    </div>`;
  }
  private _sensorDetails() {
    // One raw source row per entity, even when an older config lists it again.
    const seen = new Set<string>();
    const take = (ids: string[]) =>
      ids.filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    const devices = this._config.device_status ?? [];
    const deviceDetails = devices.map((device) =>
      this._deviceDetail(device, take),
    );
    const extras = take(this._config.extra_entities ?? []);
    const diagnostic = take(this._config.diagnostic_entities ?? []);
    const weatherSources = Object.entries(this._config.entities ?? {}).filter(
      ([, id]) => id && take([id]).length,
    );
    return html`<p class="detail-caption">
        Jeder Gerätestatus basiert ausschließlich auf explizit ausgewählten
        Home-Assistant-Entitäten. Batterien in Volt sind keine Prozentanzeige;
        ohne echten Verbindungsstatus wird kein „Online“ behauptet.
      </p>
      <h3>Geräte · Batterien, Empfang und Verbindung</h3>
      ${devices.length
        ? deviceDetails
        : html`<p class="empty">
            Geräte und Statussensoren im grafischen Editor auswählen.
          </p>`}
      <h3>Weitere gespeicherte Zusatzsensoren</h3>
      ${extras.length
        ? extras.map((id) => this._sensorRow(id))
        : html`<p class="empty">
            Zusatzsensoren im visuellen Karteneditor auswählen.
          </p>`}
      <h3>Weitere gespeicherte Diagnosen</h3>
      ${diagnostic.length
        ? diagnostic.map((id) => this._sensorRow(id))
        : html`<p class="empty">
            Batterie-/Signalentitäten im Karteneditor auswählen.
          </p>`}
      <h3>Zugeordnete Wetterquellen</h3>
      ${weatherSources.map(([key, id]) =>
        id
          ? this._sensorRow(id, METRICS.find((m) => m.key === key)?.label)
          : nothing,
      )} `;
  }

  private _deviceDetail(
    device: DeviceStatusConfig,
    take: (ids: string[]) => string[],
  ) {
    const indicators = deviceIndicators(this.hass, device, {
      staleAfterMinutes: this._config.stale_after_minutes,
    });
    const sourceIds = take(
      [
        device.battery,
        device.signal,
        device.connection,
        ...(device.extra_entities ?? []),
      ].filter((id): id is string => Boolean(id)),
    );
    return html`<section class="device-detail">
      <h4>${device.role} · ${device.name || "Ecowitt-Sensor"}</h4>
      <div class="device-detail-summary">
        <span title=${indicators.battery.detail}
          >${this._batteryGlyph(indicators.battery.percent)} Batterie:
          ${indicators.battery.label}</span
        >
        <span title=${indicators.signal.detail}
          >${icon("signal")} Signal: ${indicators.signal.label}</span
        >
        <span
          title=${indicators.connection.detail}
          class="status-connection ${indicators.connection.state}"
        >
          <i aria-hidden="true"></i>Verbindung:
          ${indicators.connection.label}</span
        >
      </div>
      ${sourceIds.map((id) => this._sensorRow(id))}
    </section>`;
  }
  private _sensorRow(id: string, label?: string) {
    const entity = this.hass?.states[id];
    const timestamp = entityFreshness(entity).timestamp;
    const updated = timestamp !== undefined ? new Date(timestamp) : null;
    const time =
      updated && Number.isFinite(updated.getTime())
        ? updated.toLocaleString("de-DE")
        : "Kein Aktualisierungszeitpunkt verfügbar";
    return html`<div class="sensor-row" data-entity-id=${id}>
      <span class="label"
        >${label || entity?.attributes.friendly_name || id}</span
      ><strong
        >${entity
          ? `${Number.isFinite(Number(entity.state)) && entity.state.trim() !== "" ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(entity.state)) : entity.state} ${entity.attributes.unit_of_measurement ?? ""}`
          : "Nicht verfügbar"}</strong
      ><span class="status-note">${time}</span
      ><button class="text-button" @click=${() => this._moreInfo(id)}>
        ${id} ↗
      </button>
    </div>`;
  }
  private _chart(series: HistorySeries) {
    const key = graphKeys[this._detail!].find(
      (key) => this._config.entities?.[key] === series.entityId,
    );
    const start = this._history!.start,
      end = this._history!.end;
    const charts = buildHistoryCharts(series, start, end, key);
    if (!charts.length)
      return html`<p class="notice">
        Keine passenden numerischen Recorder-Daten: ${series.entityId}
      </p>`;
    const format = (value: number) =>
      new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(
        value,
      );
    return charts.map(
      (chart) =>
        html`<figure
          class="chart"
          aria-label=${`${key ? METRICS.find((m) => m.key === key)?.label : series.entityId}: ${format(chart.min)} bis ${format(chart.max)} ${chart.unit}, ${chart.sampleCount} Recorder-Aktualisierungen im Zeitraum`}
        >
          <h4>
            ${key ? METRICS.find((m) => m.key === key)?.label : series.entityId}
            · ${chart.unit}
          </h4>
          <div class="chart-meta">
            <span>Min. ${format(chart.min)}</span
            ><span>Max. ${format(chart.max)}</span>
          </div>
          <svg
            viewBox="0 0 500 100"
            role="img"
            aria-label="Recorder-Zustände bis zur nächsten Änderung gehalten; Lücken bleiben frei"
          >
            <path class="axis" d="M10 90H490" />
            ${chart.paths.map((path) => svg`<path d=${path}/>`)}
          </svg>
          <div class="chart-meta">
            <span
              >${new Date(start).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}</span
            ><span>${chart.sampleCount} Aktualisierungen</span
            ><span
              >${new Date(end).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
              })}</span
            >
          </div>
          ${chart.initial
            ? html`<p class="status-note">
                Recorder-Ausgangszustand vom
                ${new Date(chart.initial.timestamp).toLocaleString("de-DE")};
                bis zur nächsten aufgezeichneten Änderung gehalten.
              </p>`
            : nothing}
        </figure>`,
    );
  }
}
if (!customElements.get("ecowitt-weather-card"))
  customElements.define("ecowitt-weather-card", EcowittWeatherCard);
declare global {
  interface Window {
    customCards?: {
      type: string;
      name: string;
      description: string;
      preview: boolean;
    }[];
  }
}
window.customCards ??= [];
if (!window.customCards.some((card) => card.type === "ecowitt-weather-card"))
  window.customCards.push({
    type: "ecowitt-weather-card",
    name: "Ecowitt Weather Card",
    description:
      "Lokale Wetterstation mit Wind, Regen und visuellem Sensor-Editor.",
    preview: true,
  });
