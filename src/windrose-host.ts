import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import type { HomeAssistant } from "./types";
import {
  buildWindroseConfig,
  prepareEmbeddedSpeedSwitch,
  windroseConfigKey,
  windroseElementName,
  type WindroseEntities,
  type WindroseOptions,
} from "./windrose";

interface InstalledWindrose extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
}

/** Hosts only the user's already-installed card. Removing it stops upstream polling. */
export class EcowittWindroseHost extends LitElement {
  static properties = {
    hass: { attribute: false },
    entities: { attribute: false },
    options: { attribute: false },
    active: { type: Boolean },
    reducedMotion: { type: Boolean },
    animation: { type: Boolean },
    _message: { state: true },
    _managedSpeedSwitch: { state: true },
    _speedMode: { state: true },
  };
  hass?: HomeAssistant;
  entities?: WindroseEntities;
  options?: WindroseOptions;
  active = true;
  reducedMotion = false;
  animation = true;
  private _message = "";
  private _managedSpeedSwitch = false;
  private _speedMode: "wind" | "gust" = "wind";
  private _card?: InstalledWindrose;
  private _configKey = "";

  protected render() {
    return html`<div class="installed-card"></div>
      ${this._managedSpeedSwitch ? html`<div class="speed-mode" role="group" aria-label="Windrose: Datenquelle">
        <button type="button" aria-pressed=${this._speedMode === "wind"} @click=${() => this._selectSpeed("wind")}>Windgeschwindigkeit</button>
        <button type="button" aria-pressed=${this._speedMode === "gust"} @click=${() => this._selectSpeed("gust")}>Böen</button>
      </div>` : nothing}
      ${
        this._message
          ? html` <div class="setup" role="status">
              <p>${this._message}</p>
              <button type="button" @click=${() => this._sync()}>
                Erneut prüfen
              </button>
            </div>`
          : nothing
      }`;
  }
  protected updated(_changes: PropertyValues) {
    this._sync();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._removeCard();
  }
  connectedCallback() {
    super.connectedCallback();
    this.requestUpdate();
  }
  private _selectSpeed(mode: "wind" | "gust") {
    if (!this._managedSpeedSwitch || mode === this._speedMode) return;
    this._speedMode = mode;
    // The upstream card restarts history queries after switching a source.
  }
  private _removeCard() {
    this._card?.remove();
    this._card = undefined;
    this._configKey = "";
  }
  private _sync() {
    if (!this.isConnected) return;
    if (!this.active || this.options?.enabled === false) {
      this._removeCard();
      this._managedSpeedSwitch = false;
      this._message = "";
      return;
    }
    if (!this.hass) {
      this._removeCard();
      this._message = "Home Assistant wird verbunden …";
      return;
    }
    try {
      const config = buildWindroseConfig(
        this.options,
        this.entities,
        this.hass,
        {
          reducedMotion: this.reducedMotion,
          animation: this.animation,
        },
      );
      const prepared = prepareEmbeddedSpeedSwitch(
        this.options, config, this.entities, this.hass, this._speedMode,
      );
      this._managedSpeedSwitch = prepared.managed;
      const nativeConfig = prepared.config;
      const tag = windroseElementName(nativeConfig.type);
      if (!customElements.get(tag)) {
        this._removeCard();
        this._message = `Die installierte Windrose-Karte (${tag}) ist noch nicht geladen. Die HACS-Ressource für diesen Kartentyp prüfen und erneut versuchen.`;
        return;
      }
      const key = windroseConfigKey(nativeConfig);
      const container = this.renderRoot.querySelector(".installed-card");
      if (!container) return;
      if (!this._card || key !== this._configKey) {
        // Upstream setConfig does not restart a changed polling interval itself.
        // A real config change gets a new element; state-only updates keep the old one.
        this._removeCard();
        const card = document.createElement(tag) as InstalledWindrose;
        if (typeof card.setConfig !== "function")
          throw new Error(
            "Die geladene Windrose-Karte unterstützt den Lovelace-Konfigurationsvertrag nicht.",
          );
        card.setConfig(nativeConfig);
        card.hass = this.hass;
        container.append(card);
        this._card = card;
        this._configKey = key;
      } else this._card.hass = this.hass;
      this._message = "";
    } catch (error) {
      this._removeCard();
      this._message =
        error instanceof Error
          ? error.message
          : "Die Windrose konnte nicht initialisiert werden.";
    }
  }
  static styles = css`
    :host {
      display: block;
      min-width: 0;
      width: 100%;
      color: var(--primary-text-color, inherit);
    }
    .speed-mode {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 6px 0;
    }
    .speed-mode button {
      min-height: 40px;
      font-size: 0.78rem;
      padding: 6px 12px;
      border-color: var(--divider-color, #7b9caa);
    }
    .speed-mode button[aria-pressed="true"] {
      color: var(--primary-color, #00a8c0);
      background: color-mix(in srgb, var(--primary-color, #00a8c0) 13%, transparent);
      border-color: var(--primary-color, #00a8c0);
    }
    .installed-card {
      min-width: 0;
      width: 100%;
    }
    .installed-card > * {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .setup {
      padding: 20px;
      border: 1px solid var(--divider-color, #7893a3);
      border-radius: 16px;
      line-height: 1.5;
    }
    button {
      min-height: 44px;
      padding: 8px 14px;
      font: inherit;
      color: inherit;
      background: transparent;
      border: 1px solid currentColor;
      border-radius: 10px;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid var(--primary-color, #00a8c0);
      outline-offset: 3px;
    }
  `;
}
if (!customElements.get("ecowitt-windrose-host"))
  customElements.define("ecowitt-windrose-host", EcowittWindroseHost);
