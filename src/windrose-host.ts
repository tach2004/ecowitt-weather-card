import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import type { HomeAssistant } from "./types";
import {
  buildWindroseConfig,
  windroseConfigKey,
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
  };
  hass?: HomeAssistant;
  entities?: WindroseEntities;
  options?: WindroseOptions;
  active = true;
  reducedMotion = false;
  animation = true;
  private _message = "";
  private _card?: InstalledWindrose;
  private _configKey = "";

  protected render() {
    return html`<div class="installed-card"></div>
      ${this._message
        ? html` <div class="setup" role="status">
            <p>${this._message}</p>
            <button type="button" @click=${() => this._sync()}>
              Erneut prüfen
            </button>
          </div>`
        : nothing}`;
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
  private _removeCard() {
    this._card?.remove();
    this._card = undefined;
    this._configKey = "";
  }
  private _sync() {
    if (!this.isConnected) return;
    if (!this.active || this.options?.enabled === false) {
      this._removeCard();
      this._message = "";
      return;
    }
    if (!this.hass) {
      this._removeCard();
      this._message = "Home Assistant wird verbunden …";
      return;
    }
    if (!customElements.get("windrose-card")) {
      this._removeCard();
      this._message =
        "Die installierte Windrose-Karte ist noch nicht geladen. Die HACS-Ressource windrose-card.js prüfen und anschließend erneut versuchen.";
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
      const key = windroseConfigKey(config);
      const container = this.renderRoot.querySelector(".installed-card");
      if (!container) return;
      if (!this._card || key !== this._configKey) {
        // Upstream setConfig does not restart a changed polling interval itself.
        // A real config change gets a new element; state-only updates keep the old one.
        this._removeCard();
        const card = document.createElement(
          "windrose-card",
        ) as InstalledWindrose;
        if (typeof card.setConfig !== "function")
          throw new Error(
            "Die geladene Windrose-Karte unterstützt den Lovelace-Konfigurationsvertrag nicht.",
          );
        card.setConfig(config);
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
    .installed-card {
      min-width: 0;
      width: 100%;
    }
    windrose-card {
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
