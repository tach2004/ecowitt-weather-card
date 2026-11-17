import { LitElement, html, svg, nothing, type PropertyValues } from "lit";
import { cardStyles } from "./styles";
import { experienceStyles } from "./experience-styles";
import { weatherScene, weatherSceneStyles } from "./weather-scene";
import { historyPlot, historyPlotStyles } from "./history-plot";
import { sourceLabel, type SourceRegistry } from "./source-label";
import {
  loadDailyTemperature,
  type DailyTemperatureResult,
} from "./daily-temperature";
import type { RegistryDevice, RegistryEntity } from "./suggestions";
import "./windrose-host";
import { selectedWindrose } from "./windrose";
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
import { normalizeConfig, sameConfig } from "./config";
import { buildHistoryCharts } from "./chart";
import "./editor";

type Detail = "wind" | "rain" | "temperature" | "pressure" | "sun" | "sensors";

function isIOSCompanionApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) &&
    /Home Assistant\/|Mobile\/HomeAssistant/i.test(ua);
}
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
    "rain_rate_secondary",
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
  pressure: ["pressure_absolute", "pressure"],
  sun: ["uv", "solar", "solar_lux"],
  sensors: [],
};
const graphKeys: Record<Detail, MetricKey[]> = {
  wind: ["wind_speed", "wind_gust"],
  rain: ["rain_rate", "rain_today"],
  temperature: ["temperature", "humidity"],
  pressure: ["pressure_absolute", "pressure"],
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
  "pressure_absolute",
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
    _flipped: { state: true },
    _roseActive: { state: true },
    _roseVariant: { state: true },
    _roseHeight: { state: true },
    _reducedMotion: { state: true },
    _daily: { state: true },
    _dailyOverview: { state: true },
    _sourceRegistry: { state: true },
  };
  static styles = [
    cardStyles,
    experienceStyles,
    weatherSceneStyles,
    historyPlotStyles,
  ];
  hass?: HomeAssistant;
  private _config: CardConfig = { type: "custom:ecowitt-weather-card" };
  private _detail?: Detail;
  private _detailTrigger?: HTMLElement;
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
  private _flipped = false;
  private _roseActive = false;
  private _roseVariant = 0;
  private _roseHeight = 0;
  private _roseObserver?: ResizeObserver;
  private _observedBack?: Element;
  private _reducedMotion = false;
  private _flipTimer?: ReturnType<typeof setTimeout>;
  private _motionQuery?: MediaQueryList;
  private _daily?: DailyTemperatureResult;
  private _dailyOverview?: DailyTemperatureResult;
  private _dailyOverviewRequest = 0;
  private _dailyOverviewSource = "";
  private _dailyOverviewRefreshAfter = 0;
  private _sourceRegistry?: SourceRegistry;
  private _registryRequest = 0;
  private _registryRequested = false;
  private _motionChange = () => {
    this._reducedMotion = this._motionQuery?.matches ?? false;
    if (this._reducedMotion && !this._flipped) {
      clearTimeout(this._flipTimer);
      this._roseActive = false;
    }
  };

  static getConfigElement() {
    return document.createElement("ecowitt-weather-card-editor");
  }
  static getStubConfig() {
    return { type: "custom:ecowitt-weather-card", entities: {} };
  }
  setConfig(config: CardConfig) {
    const normalized = normalizeConfig(config);
    if (sameConfig(normalized, this._config)) return;
    this._config = normalized;
    this.style.setProperty(
      "--ecowitt-max-width",
      `${normalized.max_width ?? 1380}px`,
    );
    this.style.setProperty(
      "--ecowitt-site-max-width",
      `${(600 * (normalized.max_width ?? 1380)) / 1380}px`,
    );
    this._roseVariant = 0;
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
    clearTimeout(this._flipTimer);
    this._flipped = this._roseActive = false;
    this._daily = undefined;
    this._dailyOverview = undefined;
    this._dailyOverviewSource = "";
    this._dailyOverviewRefreshAfter = 0;
    this._dailyOverviewRequest++;
    this._registryRequest++;
    this._registryRequested = false;
    this._sourceRegistry = undefined;
    this._closeDetail();
  }
  getCardSize() {
    return 12;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
  connectedCallback() {
    super.connectedCallback();
    this._roseObserver = new ResizeObserver((entries) => {
      const height =
        entries[0]?.borderBoxSize?.[0]?.blockSize ??
        entries[0]?.target.getBoundingClientRect().height;
      if (height && Math.abs(height - this._roseHeight) > 1)
        this._roseHeight = Math.ceil(height);
    });
    this._observedBack = undefined;
    this.requestUpdate();
    this._motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this._motionChange();
    this._motionQuery.addEventListener("change", this._motionChange);
    this._ageTimer = setInterval(() => this.requestUpdate(), 60_000);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._ageTimer);
    clearTimeout(this._flipTimer);
    this._roseObserver?.disconnect();
    this._observedBack = undefined;
    this._motionQuery?.removeEventListener("change", this._motionChange);
    this._flipped = this._roseActive = false;
    this._registryRequest++;
    this._registryRequested = false;
    this._closeDetail();
    this._imageRequest++;
    this._imageSource = "";
    this._dailyOverviewRequest++;
    this._dailyOverviewRefreshAfter = 0;
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
  protected updated() {
    const back = this.renderRoot.querySelector(".wind-back") ?? undefined;
    if (back !== this._observedBack) {
      this._roseObserver?.disconnect();
      this._observedBack = back;
      if (back) this._roseObserver?.observe(back);
    }

    void this._refreshDailyOverview();
  }

  /** Reuse HA-local calendar-day Recorder extrema, without repeated HA-state requests. */
  private async _refreshDailyOverview() {
    const hass = this.hass;
    const source = this._config.entities?.temperature ?? "";
    const zone = hass?.config?.time_zone ?? "";
    const key = JSON.stringify([source, zone]);
    if (key !== this._dailyOverviewSource) {
      this._dailyOverviewSource = key;
      this._dailyOverview = undefined;
      this._dailyOverviewRefreshAfter = 0;
      this._dailyOverviewRequest++;
    }
    if (
      (this._config.entities?.temperature_min &&
       this._config.entities?.temperature_max) ||
      !this.isConnected || !source || !zone || !hass?.callApi ||
      !hass.states[source]
    ) return;
    const now = Date.now();
    if (this._dailyOverview?.dayEnd && now >= this._dailyOverview.dayEnd) {
      this._dailyOverview = undefined;
      this._dailyOverviewRefreshAfter = 0;
    }
    if (now < this._dailyOverviewRefreshAfter) return;
    this._dailyOverviewRefreshAfter = now + 300_000;
    const request = ++this._dailyOverviewRequest;
    try {
      const result = await loadDailyTemperature(hass, source, {
        staleAfterMinutes: this._config.stale_after_minutes,
      });
      if (request === this._dailyOverviewRequest &&
          this._dailyOverviewSource === key && this.isConnected)
        this._dailyOverview = result;
    } catch {
      // Recorder failures cannot break the dashboard; retry after throttle.
    }
  }

  private _climateExtreme(key: "temperature_min" | "temperature_max") {
    const isMax = key === "temperature_max";
    const entity = this._config.entities?.[key];
    const reading = entity ? this._reading(key) : undefined;
    const recorded = isMax ? this._dailyOverview?.max : this._dailyOverview?.min;
    const usable = typeof recorded === "number" && Number.isFinite(recorded);
    const text = reading ? reading.text : usable
      ? new Intl.NumberFormat("de-DE", {
          minimumFractionDigits: 1, maximumFractionDigits: 1,
        }).format(recorded) : "—";
    const unit = reading ? reading.unit : usable ? this._dailyOverview?.unit : "";
    const note = reading
      ? reading.note || "Ausgewählte Home-Assistant-Entität"
      : this._dailyOverview?.note || "Recorder-Werte werden geladen oder fehlen.";
    return html`<span class=${isMax ? "climate-extreme maximum" : "climate-extreme minimum"}
      data-source=${entity ? "entity" : "recorder"} title=${note}
      aria-label=${(isMax ? "Tagesmaximum: " : "Tagesminimum: ") + text + " " + (unit || "")}>
      <span class="extreme-label">${isMax ? "Max" : "Min"}</span>
      <span class="extreme-value">${text}${unit ? html`<span class="extreme-unit">${unit}</span>` : nothing}</span>
    </span>`;
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
        >${reading.text}${
          reading.value !== null && reading.unit
            ? html`<span class="unit">${reading.unit}</span>`
            : nothing
        }</span
      >${this._status(reading)}`;
  }
  private _status(reading: Reading) {
    return reading.status === "ok"
      ? nothing
      : html`<span
          class="status-note ${reading.status === "stale" ? "stale" : ""}"
          >${
            reading.status === "stale"
              ? "Veraltet"
              : reading.status === "missing"
                ? "Quelle auswählen"
                : reading.status === "invalid"
                  ? "Quelle prüfen"
                  : "Nicht verfügbar"
          }</span
        >`;
  }
  private _wetBadge() {
    const r = this._reading("rain_wet");
    const status =
      r.status === "ok" ? (r.value === 1 ? "wet" : "dry") : "unavailable";
    return html`<span class="wet-badge ${status}"
      >${icon("humidity")}${
        status === "wet" ? "NASS" : status === "dry" ? "TROCKEN" : "UNAVAILABLE"
      }</span
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
      <div class="station-header">
        <div class="station-icon">${icon("station")}</div>
        <div class="station-heading">
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
      </div>
      ${
        !hasEntities
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
                <div class="weather">
                  ${this._climate()}${this._wind()}${this._rain()}
                </div>
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
                  "pressure_absolute",
                  "Luftdruck absolut",
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
              ${
                missing.length
                  ? html`<div class="setup-missing">
                      <strong>Einrichtung vervollständigen</strong> ·
                      ${missing.length} Hauptquellen fehlen. Im Karteneditor
                      zuordnen:
                      ${missing
                        .map((key) => METRICS.find((m) => m.key === key)!.label)
                        .join(", ")}.
                    </div>`
                  : nothing
              }
              <div class="footer">
                <span>Wetterdaten aus Home Assistant</span
                ><span>Nordorientierte Ansicht</span>
              </div>
            `
      }
      ${this._usesCompanionPopover()
        ? html`<div
            class="companion-overlay"
            popover="manual"
            @click=${(event: MouseEvent) => {
              if (event.target === event.currentTarget) this._closeDetail();
            }}
            @keydown=${this._onCompanionKeydown}
          >
            ${this._renderDialog()}
          </div>`
        : this._renderDialog()}
    </ha-card>`;
  }

  private _observation(): WeatherObservation {
    return observeWeather(
      this.hass?.states["sun.sun"],
      this._reading("solar"),
      this._reading("rain_rate"),
      this._reading("rain_wet"),
      {
        staleAfterMinutes: this._config.stale_after_minutes,
        secondaryRainRate: this._reading("rain_rate_secondary"),
        conditionEntity: this._config.weather_entity
          ? this.hass?.states[this._config.weather_entity]
          : undefined,
      },
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
      title=${
        "Batterie: " +
        indicator.battery.label +
        ", Signal: " +
        indicator.signal.label +
        ", Verbindung: " +
        indicator.connection.label
      }
      @click=${() => this._openDetail("sensors")}
    >
      <strong title=${device.name || device.role}>${device.role}</strong>
      <span
        title=${indicator.battery.detail}
        class="status-battery ${
          indicator.battery.percent !== undefined &&
          indicator.battery.percent < 20
            ? "low"
            : ""
        }"
      >
        ${this._batteryGlyph(indicator.battery.percent)}
        ${indicator.battery.state === "unknown" ? "—" : indicator.battery.label}
      </span>
      <span title=${indicator.signal.detail} class="status-signal"
        >${icon("signal")}${indicator.signal.state === "unknown" ? "—" : indicator.signal.label}</span
      >
      <span
        title=${indicator.connection.detail}
        class="status-connection ${indicator.connection.state}"
      >
        <i aria-hidden="true"></i
        >${indicator.connection.state === "unknown" ? "—" : indicator.connection.label}
      </span>
    </button>`;
  }
  private _headerDevices() {
    const selected = (this._config.device_status || []).filter(
      (device) => device.show_on_main,
    );
    return html`<div class="header-devices" aria-label="Gerätestatus">
      ${
        selected.length
          ? selected.map((device) => this._deviceChip(device))
          : html`<button
              type="button"
              class="device-placeholder"
              @click=${() => this._openDetail("sensors")}
              title="WS90-Gerätestatus im Karteneditor zuordnen"
            >
              WS90 · Status zuordnen
            </button>`
      }
    </div>`;
  }
  private _toggleRose(show = !this._flipped) {
    clearTimeout(this._flipTimer);
    this._flipped = show;
    void this.updateComplete.then(() => {
      if (this._flipped === show)
        this.renderRoot
          .querySelector<HTMLElement>(
            show ? ".wind-back-head button" : ".wind-front[role=button]",
          )
          ?.focus({ preventScroll: true });
    });
    if (show) this._roseActive = true;
    else if (this._reducedMotion || this._config.weather_animation === false)
      this._roseActive = false;
    else
      this._flipTimer = setTimeout(() => {
        if (!this._flipped) this._roseActive = false;
      }, 650);
  }
  private _weatherInfo() {
    const observation = this._observation();
    return html`<details class="weather-info">
      <summary>${observation.label}</summary>
      <p>${observation.note}</p>
    </details>`;
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
      <div
        style=${`min-height:${this._flipped ? this._roseHeight : 0}px`}
        class="wind-stage ${this._flipped ? "is-flipped" : ""} ${this._reducedMotion || this._config.weather_animation === false ? "no-animation" : ""}"
      >
        <div class="wind-flipper">
          <figure
            class="site wind-front"
            role=${this._config.windrose?.enabled === false ? "img" : "button"}
            tabindex=${this._config.windrose?.enabled === false || this._flipped ? -1 : 0}
            ?inert=${this._flipped}
            aria-label=${description + (this._config.windrose?.enabled === false ? "" : " Windrose öffnen.")}
            @click=${() => {
              if (this._config.windrose?.enabled !== false)
                this._toggleRose(true);
            }}
            @keydown=${(event: KeyboardEvent) => {
              if (
                this._config.windrose?.enabled !== false &&
                ["Enter", " "].includes(event.key)
              ) {
                event.preventDefault();
                this._toggleRose(true);
              }
            }}
          >
            <div class="site-content">
              ${
                this._imageUrl && !this._imageError
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
                  : sitePlan()
              }
            </div>
            ${weatherScene(this._observation(), this._config.weather_animation !== false)}
            <svg class="wind-layer" viewBox="0 0 100 100" aria-hidden="true">
              ${
                averageVisible
                  ? svg`<g class="flow-average" data-bearing=${normalizeDegrees(avg.value!)} style="transform:rotate(${this._averageRotation}deg);transform-origin:${targetX}% ${targetY}%"><polygon points=${arrow(0.7, avg.value!)}/></g>`
                  : nothing
              }
              ${
                currentVisible
                  ? svg`<g class="flow-current" data-bearing=${normalizeDegrees(current.value!)} data-flow-bearing=${flowBearing(current.value!)} style="transform:rotate(${this._rotation}deg);transform-origin:${targetX}% ${targetY}%"><polygon points=${arrow(1.7, current.value!)}/></g>`
                  : nothing
              }
              <circle class="target" cx=${targetX} cy=${targetY} r="1" />
            </svg>
            <div class="degree-ring" aria-hidden="true">
              ${[0, 45, 90, 135, 180, 225, 270, 315].map((bearing) => {
                const theta = (bearing * Math.PI) / 180;
                const sin = Math.round(Math.sin(theta) * 1e6) / 1e6;
                const cos = Math.round(Math.cos(theta) * 1e6) / 1e6;
                return html`<span
                  data-degrees=${bearing}
                  style=${`left:calc(${50 + sin * 50}% + ${sin} * var(--degree-offset));top:calc(${50 - cos * 50}% - ${cos} * var(--degree-offset))`}
                  >${bearing}°</span
                >`;
              })}
            </div>
            <span class="cardinal north">N</span
            ><span class="cardinal east">O</span
            ><span class="cardinal south">S</span
            ><span class="cardinal west">W</span>
          </figure>
          <div
            class="wind-back"
            ?inert=${!this._flipped}
            aria-hidden=${String(!this._flipped)}
          >
            <div class="wind-back-head">
              ${
                this._config.windrose?.variants?.length
                  ? html`<select
                      class="rose-variant"
                      aria-label="Windrosenvariante"
                      .value=${String(this._roseVariant)}
                      @change=${(event: Event) => {
                        this._roseVariant = Number(
                          (event.target as HTMLSelectElement).value,
                        );
                      }}
                    >
                      ${this._config.windrose.variants.map((variant, index) => html`<option value=${String(index)}>${variant.title || `Windrose ${index + 1}`}</option>`)}
                    </select>`
                  : html`<h3>Windrose</h3>`
              }
              <button type="button" @click=${() => this._toggleRose(false)}>
                Windgrafik
              </button>
            </div>
            <ecowitt-windrose-host
              .hass=${this.hass}
              .entities=${this._config.entities}
              .options=${selectedWindrose(this._config.windrose, this._roseVariant)}
              .active=${this._roseActive}
              .reducedMotion=${this._reducedMotion}
              .animation=${this._config.weather_animation !== false}
            ></ecowitt-windrose-host>
          </div>
        </div>
      </div>
      <div class="legend">
        ${this._flipped ? html`<span>Richtungs- und Geschwindigkeitsverteilung</span>` : html`<span><i></i>Aktuelle Strömung zum Ziel</span><span><i class="average"></i>Mittlere Strömung</span>`}
      </div>
      <div class="site-actions">
        ${this._config.windrose?.enabled !== false ? html`<button type="button" class="text-button rose-toggle" @click=${() => this._toggleRose()}>${this._flipped ? "Windgrafik anzeigen" : "Windrose öffnen ↻"}</button>` : nothing}
        ${this._weatherInfo()}
      </div>
      <p class="image-note">
        ${
          this._flipped
            ? "Windrose · Home-Assistant-Daten"
            : this._imageError ||
              (calm
                ? "Flaute · aktueller Pfeil ausgeblendet"
                : this._imageUrl
                  ? "Eigene HA-Bildquelle · Norden oben prüfen"
                  : "Generische Beispielgrafik · Norden oben")
        }
      </p>
    </section>`;
  }
  private _climate() {
    return html`<button
      class="panel climate"
      data-detail="temperature"
      aria-label="Außenklimadetails öffnen"
      @click=${() => this._openDetail("temperature")}
    >
      <div class="panel-heading">
        ${icon("temperature")}
        <h2>Außenklima</h2>
        <span class="more">›</span>
      </div>
      <div class="trio">
        ${(
          [
            ["temperature", "Temperatur"],
            ["humidity", "Luftfeuchte"],
            ["feels_like", "Gefühlt"],
          ] as [MetricKey, string][]
        ).map(
          ([key, label]) =>
            html`<div data-key=${key}>
              <span class="label">${label}</span>${key === "temperature"
                ? html`<span class="climate-temperature-row">
                    <span class="climate-current-value">${this._value(key)}</span>
                    <span class="climate-extremes">${this._climateExtreme("temperature_max")}${this._climateExtreme("temperature_min")}</span>
                  </span>`
                : this._value(key)}
            </div>`,
        )}
      </div>
    </button>`;
  }
  private _direction(
    key: "wind_direction" | "wind_direction_avg",
    label: string,
  ) {
    const reading = this._reading(key);
    return html`<div data-key=${key}>
      <span class="label">${label}</span
      ><span class="bearing"
        >${reading.text}${reading.value !== null ? "°" : ""}<span
          class="direction-compass"
          >${reading.value !== null ? ` – ${directionLabel(reading.value)}` : ""}</span
        ></span
      >${this._status(reading)}
    </div>`;
  }
  private _wind() {
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
      <div class="trio">
        <div data-key="wind_speed">
          <span class="label">Aktuell</span>${this._value("wind_speed")}
        </div>
        <div data-key="wind_gust">
          <span class="label">Böen</span>${this._value("wind_gust")}
        </div>
        <div data-key="wind_gust_max">
          <span class="label">Max. Böe heute</span
          >${this._value("wind_gust_max")}
        </div>
      </div>
      <div class="wind-direction direction-pair">
        ${this._direction("wind_direction", "Herkunftsrichtung")}${this._direction("wind_direction_avg", this._config.wind_average_period_minutes ? `Ø ${this._config.wind_average_period_minutes} Min. Richtung` : "Mittlere Herkunftsrichtung")}
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
      ${weatherScene(sky, animated, "tile")}
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
      ${
        this._reading("rain_wet").status === "stale"
          ? html`<span class="status-note stale"
              >Feuchtigkeitsstatus veraltet</span
            >`
          : nothing
      }
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
  private _usesCompanionPopover(): boolean {
    return (
      isIOSCompanionApp() &&
      typeof HTMLElement.prototype.showPopover === "function"
    );
  }
  private _companionPopover() {
    return this.renderRoot?.querySelector<HTMLElement>(".companion-overlay");
  }
  private _onCompanionKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this._closeDetail();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(this._dialog()?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((element) => element.getClientRects().length > 0);
    if (!controls.length) return;
    const active = (this.renderRoot as ShadowRoot).activeElement;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
  private _source(id: string, metricLabel?: string) {
    return sourceLabel(
      this.hass,
      this._config,
      id,
      metricLabel,
      this._sourceRegistry,
    );
  }
  private async _loadSourceRegistry() {
    if (this._registryRequested || !this.hass?.callWS) return;
    this._registryRequested = true;
    const request = ++this._registryRequest;
    try {
      const [devices, entities] = await Promise.all([
        this.hass.callWS<RegistryDevice[]>({
          type: "config/device_registry/list",
        }),
        this.hass.callWS<RegistryEntity[]>({
          type: "config/entity_registry/list",
        }),
      ]);
      if (
        request === this._registryRequest &&
        Array.isArray(devices) &&
        Array.isArray(entities)
      )
        this._sourceRegistry = { devices, entities };
    } catch {
      /* Friendly source names remain available without registry permission. */
    }
  }
  private async _openDetail(detail: Detail) {
    if (!this._detail) {
      const active = (this.renderRoot as ShadowRoot).activeElement;
      this._detailTrigger = active instanceof HTMLElement ? active : undefined;
    }
    this._detail = detail;
    this._history = undefined;
    this._daily = undefined;
    void this._loadSourceRegistry();
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
    if (this._usesCompanionPopover()) {
      const overlay = this._companionPopover();
      if (!overlay?.isConnected) return;
      if (!overlay.matches(":popover-open")) overlay.showPopover();
      dialog.querySelector<HTMLButtonElement>(".close")?.focus({ preventScroll: true });
    } else if (!dialog.open) {
      dialog.showModal();
    }
    if (detail === "sensors") return;
    const keys = graphKeys[detail];
    const ids = keys.flatMap((key) =>
      this._config.entities?.[key] ? [this._config.entities[key]!] : [],
    );
    const hass = this.hass;
    const needsDaily =
      detail === "temperature" &&
      (!this._config.entities?.temperature_min ||
        !this._config.entities?.temperature_max);
    const [result, daily] = await Promise.all([
      hass
        ? loadHistory(hass, ids, this._config.history_hours ?? 24)
        : undefined,
      needsDaily && hass
        ? loadDailyTemperature(hass, this._config.entities?.temperature ?? "", {
            staleAfterMinutes: this._config.stale_after_minutes,
          })
        : undefined,
    ]);
    if (request === this._historyRequest) {
      this._history = result;
      this._daily = daily;
      this._loading = false;
    }
  }
  private _closeDetail() {
    const companion = this._usesCompanionPopover();
    const overlay = this._companionPopover();
    if (overlay?.isConnected && overlay.matches(":popover-open")) {
      overlay.hidePopover();
    }
    if (!companion) this._dialog()?.close();
    this._detail = undefined;
    this._historyRequest++;
    const trigger = this._detailTrigger;
    this._detailTrigger = undefined;
    if (companion && trigger?.isConnected) trigger.focus({ preventScroll: true });
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
      class=${isIOSCompanionApp() ? "ios-companion" : ""}
      ?open=${this._usesCompanionPopover() && Boolean(detail)}
      aria-modal=${this._usesCompanionPopover() ? "true" : nothing}
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
      ${
        detail
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
                ${
                  detail === "sensors"
                    ? this._sensorDetails()
                    : html`
                        <h3 class="detail-section-title">
                          Messwerte & Quellen
                        </h3>
                        <div class="detail-grid">
                          ${detailKeys[detail].filter((key) => this._config.entities?.[key] || ["temperature", "humidity", "temperature_min", "temperature_max", "wind_speed", "wind_gust", "wind_direction", "rain_today", "rain_rate", "rain_wet", "pressure", "uv", "solar"].includes(key)).map((key) => this._detailReading(key))}
                        </div>
                        ${detail === "temperature" && this._daily ? html`<p class="daily-coverage">${this._daily.date ? `${this._daily.date} · ${this._daily.timeZone}. ` : ""}${this._daily.note}</p>` : nothing}
                        <details class="detail-explanation">
                          <summary>Messungen richtig einordnen</summary>
                          <p>
                            ${
                              detail === "rain"
                                ? "WH40-Mengen und WS90-Feuchtigkeit sind getrennte Messungen. Heute ist der Kalendertag; letzte 24 Stunden benötigt eine eigene gleitende Quelle."
                                : detail === "wind"
                                  ? "Richtungsangaben bezeichnen die meteorologische Herkunft. Strömungspfeile zeigen von dort zum Ziel. Mittelrichtung und Mittelungszeitraum stammen aus der ausgewählten Quelle; die Karte berechnet keinen eigenen 10-Minuten-Mittelwert. Die Windrose öffnet sich beim Tippen auf die Windgrafik."
                                  : "Aktuelle Werte der ausgewählten Home-Assistant-Quellen; Verläufe stammen ausschließlich aus dem lokalen Recorder."
                            }
                          </p>
                        </details>
                        <h3 class="history-heading">
                          Verlauf · letzte
                          ${this._clamp(this._config.history_hours, 24, 1, 168)}
                          Stunden
                        </h3>
                        ${
                          this._loading
                            ? html`<p class="notice" role="status">
                                Recorder-Verlauf wird geladen …
                              </p>`
                            : this._history?.status === "ok"
                              ? this._history.series.map((series) =>
                                  this._chart(series),
                                )
                              : html`<p class="notice">
                                  ${
                                    this._history?.message ??
                                    "Keine Historienquelle verfügbar."
                                  }
                                </p>`
                        }
                        ${
                          detail === "rain"
                            ? html`<p class="detail-caption">
                                Der Tagesmengen-Verlauf setzt sich am
                                Tageswechsel zurück. Daraus wird kein
                                rollierender 24h-Wert berechnet.
                              </p>`
                            : nothing
                        }
                        <button
                          class="text-button"
                          @click=${() => this._openDetail(detail)}
                        >
                          Verlauf neu laden
                        </button>
                      `
                }
              </div>
              ${isIOSCompanionApp()
                ? html`<div class="companion-dialog-footer">
                    <button
                      type="button"
                      class="companion-dialog-dismiss"
                      @click=${this._closeDetail}
                    >
                      Schließen
                    </button>
                  </div>`
                : nothing}`
          : nothing
      }
    </dialog>`;
  }
  private _detailReading(key: MetricKey) {
    const r = this._reading(key);
    const id = this._config.entities?.[key];
    const label =
      METRICS.find((m) => m.key === key)?.label.split(" · ")[0] ?? key;
    const autoDaily =
      !id && (key === "temperature_min" || key === "temperature_max");
    const dailyValue =
      key === "temperature_min" ? this._daily?.min : this._daily?.max;
    return html`<div class="detail-reading" data-key=${key}>
      <span class="label"
        >${autoDaily ? `${label} · Recorder` : id ? this._source(id, label) : label}</span
      >
      ${autoDaily ? html`<span class="value">${dailyValue != null ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(dailyValue) : "—"}${dailyValue != null ? html`<span class="unit">${this._daily?.unit}</span>` : nothing}</span><span class="status-note">${this._loading ? "Tageswerte werden geladen …" : dailyValue != null ? "Aufgezeichnet heute · bisher" : "Keine belastbaren Tageswerte"}</span>` : this._value(key)}
      ${autoDaily && this._config.entities?.temperature ? html`<span class="status-note">${this._source(this._config.entities.temperature, "Außentemperatur")}</span>` : nothing}
      ${r.note && !autoDaily ? html`<span class="status-note">${r.note}</span>` : nothing}
      ${id || (autoDaily && this._config.entities?.temperature) ? html`<button class="text-button" @click=${() => this._moreInfo(id || this._config.entities!.temperature!)}>Sensor in HA öffnen</button>` : nothing}
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
      ${
        devices.length
          ? deviceDetails
          : html`<p class="empty">
              Geräte und Statussensoren im grafischen Editor auswählen.
            </p>`
      }
      ${
        extras.length
          ? html`<details class="sensor-group" ?open=${!devices.length}>
              <summary>Zusatzsensoren · ${extras.length}</summary>
              ${extras.map((id) => this._sensorRow(id))}
            </details>`
          : nothing
      }
      ${
        diagnostic.length
          ? html`<details class="sensor-group">
              <summary>Weitere Diagnosen · ${diagnostic.length}</summary>
              ${diagnostic.map((id) => this._sensorRow(id))}
            </details>`
          : nothing
      }
      <details class="sensor-group">
        <summary>Zugeordnete Wetterquellen · ${weatherSources.length}</summary>
        ${weatherSources.map(([key, id]) => (id ? this._sensorRow(id, METRICS.find((m) => m.key === key)?.label) : nothing))}
      </details>`;
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
      <span class="label">${this._source(id, label)}</span
      ><strong
        >${
          entity
            ? `${Number.isFinite(Number(entity.state)) && entity.state.trim() !== "" ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(entity.state)) : entity.state} ${entity.attributes.unit_of_measurement ?? ""}`
            : "Nicht verfügbar"
        }</strong
      ><span class="status-note">${time}</span
      ><button class="text-button" @click=${() => this._moreInfo(id)}>
        Sensor in HA öffnen
      </button>
    </div>`;
  }
  private _chart(series: HistorySeries) {
    const key = graphKeys[this._detail!].find(
      (key) => this._config.entities?.[key] === series.entityId,
    );
    const { start, end } = this._history!;
    const charts = buildHistoryCharts(series, start, end, key);
    const name = this._source(
      series.entityId,
      key ? METRICS.find((m) => m.key === key)?.label : undefined,
    );
    if (!charts.length)
      return html`<p class="notice">
        Keine passenden numerischen Recorder-Daten: ${name}
      </p>`;
    return charts.map(
      (chart) =>
        html`<figure
          class="chart"
          aria-label=${`${name}: ${chart.min} bis ${chart.max} ${chart.unit}`}
        >
          <h4>${name}</h4>
          ${historyPlot(chart, start, end, this.hass?.config?.time_zone)}
          <figcaption>
            ${chart.sampleCount} Recorder-Aktualisierungen · Zustände bis zur
            nächsten Änderung gehalten.
          </figcaption>
          ${chart.initial ? html`<p class="status-note">Echter Recorder-Ausgangszustand vom ${new Date(chart.initial.timestamp).toLocaleString("de-DE", { timeZone: this.hass?.config?.time_zone })}; keine neue Messung am Beginn der Zeitachse.</p>` : nothing}
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
