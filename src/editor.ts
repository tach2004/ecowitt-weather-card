import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import {
  METRICS,
  type CardConfig,
  type HomeAssistant,
  type MetricKey,
} from "./types";
import { normalizeConfig } from "./config";
import {
  DEVICE_ROLES,
  candidateEntities,
  deviceLabel,
  uniqueRoleDevices,
  type DeviceRole,
  type RegistryDevice,
  type RegistryEntity,
} from "./suggestions";

export class EcowittWeatherCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _devices: { state: true },
    _registry: { state: true },
    _roleDevices: { state: true },
    _registryState: { state: true },
  };
  hass?: HomeAssistant;
  private _config: CardConfig = {
    type: "custom:ecowitt-weather-card",
    entities: {},
  };
  private _devices: RegistryDevice[] = [];
  private _registry: RegistryEntity[] = [];
  private _roleDevices: Partial<Record<DeviceRole, string>> = {};
  private _registryState: "idle" | "loading" | "ready" | "unavailable" = "idle";

  setConfig(config: CardConfig): void {
    this._config = normalizeConfig(config);
  }
  protected updated(changed: PropertyValues): void {
    if (
      changed.has("hass") &&
      this.hass?.callWS &&
      this._registryState === "idle"
    )
      void this._loadRegistry();
  }
  private async _loadRegistry(): Promise<void> {
    this._registryState = "loading";
    try {
      const [devices, entities] = await Promise.all([
        this.hass!.callWS!<RegistryDevice[]>({
          type: "config/device_registry/list",
        }),
        this.hass!.callWS!<RegistryEntity[]>({
          type: "config/entity_registry/list",
        }),
      ]);
      this._devices = devices.sort((a, b) =>
        deviceLabel(a).localeCompare(deviceLabel(b)),
      );
      this._registry = entities;
      this._roleDevices = uniqueRoleDevices(devices);
      this._registryState = "ready";
    } catch {
      this._registryState = "unavailable";
    }
  }
  private _change(patch: Partial<CardConfig>): void {
    this._config = { ...this._config, ...patch };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private _setEntity(key: MetricKey, value: string | undefined | null): void {
    if (value && !this.hass?.states[value]) return;
    const entities = { ...this._config.entities };
    if (value) entities[key] = value;
    else delete entities[key];
    this._change({ entities });
  }
  private _value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  private _entities(): string[] {
    return Object.keys(this.hass?.states || {})
      .filter((id) => /^(sensor|binary_sensor)\./.test(id))
      .sort();
  }
  private _label(id: string): string {
    const name = this.hass?.states[id]?.attributes.friendly_name;
    return name ? `${name} — ${id}` : id;
  }
  private _picker(key: MetricKey, label: string) {
    const selected = this._config.entities?.[key] || "";
    const available = this._entities();
    const suggestions = this.hass
      ? candidateEntities(key, this.hass, this._registry, this._roleDevices)
      : [];
    const nativePicker = Boolean(customElements.get("ha-entity-picker"));
    return html`<div class="entity-field" data-metric=${key}>
      ${nativePicker
        ? html`<ha-entity-picker
            .hass=${this.hass}
            .label=${label}
            .value=${selected || undefined}
            .includeDomains=${key === "rain_wet"
              ? ["binary_sensor"]
              : ["sensor"]}
            .includeEntities=${available}
            .allowCustomEntity=${false}
            @value-changed=${(event: CustomEvent<{ value?: string }>) => {
              event.stopPropagation();
              this._setEntity(key, event.detail.value);
            }}
          ></ha-entity-picker>`
        : html`<label
            >${label}<select
              aria-label=${label}
              .value=${selected}
              @change=${(event: Event) =>
                this._setEntity(key, this._value(event))}
            >
              <option value="">Nicht zugeordnet</option>
              ${selected && !available.includes(selected)
                ? html`<option value=${selected}>
                    ${selected} · nicht verfügbar
                  </option>`
                : nothing}
              ${available
                .filter((id) =>
                  key === "rain_wet"
                    ? id.startsWith("binary_sensor.")
                    : id.startsWith("sensor."),
                )
                .map(
                  (id) =>
                    html`<option value=${id} .selected=${selected === id}>
                      ${this._label(id)}
                    </option>`,
                )}
            </select></label
          >`}
      ${suggestions.length
        ? html`<div class="suggestions">
            <span>Gerätevorschläge – bitte prüfen:</span>
            ${suggestions
              .filter((id) => id !== selected)
              .map(
                (id) =>
                  html`<button
                    type="button"
                    class="suggestion"
                    @click=${() => this._setEntity(key, id)}
                    title=${id}
                  >
                    ${this._label(id)} übernehmen
                  </button>`,
              )}
            ${suggestions.includes(selected)
              ? html`<span class="matched"
                  >Zugeordneter Sensor gehört zum ausgewählten Gerät.</span
                >`
              : nothing}
          </div>`
        : nothing}
      ${selected && !this.hass?.states[selected]
        ? html`<p class="warning">
            Diese Entität ist derzeit nicht in Home Assistant verfügbar. Die
            Zuordnung bleibt erhalten.
          </p>`
        : nothing}
    </div>`;
  }
  private _multi(
    key: "extra_entities" | "diagnostic_entities",
    label: string,
    hint: string,
  ) {
    const current = this._config[key] || [];
    const ids = [...new Set([...current, ...this._entities()])];
    return html`<label
        >${label}<select
          multiple
          size="7"
          aria-label=${label}
          @change=${(event: Event) => {
            const value = [
              ...(event.target as HTMLSelectElement).selectedOptions,
            ].map((option) => option.value);
            this._change({ [key]: value });
          }}
        >
          ${ids.map(
            (id) =>
              html`<option value=${id} .selected=${current.includes(id)}>
                ${this._label(id)}${this.hass?.states[id]
                  ? ""
                  : " · nicht verfügbar"}
              </option>`,
          )}
        </select></label
      >
      <p class="hint">
        ${hint} Mehrfachauswahl mit Strg/⌘ oder über die native Mobil-Auswahl.
      </p>`;
  }
  private _number(
    key:
      | "image_rotation"
      | "image_target_x"
      | "image_target_y"
      | "history_hours"
      | "stale_after_minutes",
    label: string,
    value: number,
    min: number,
    max: number,
    step = 1,
  ) {
    return html`<label
      >${label}<input
        type="number"
        aria-label=${label}
        .value=${String(this._config[key] ?? value)}
        min=${min}
        max=${max}
        step=${step}
        @change=${(event: Event) => {
          const next = Number(this._value(event));
          if (Number.isFinite(next))
            this._change({ [key]: Math.max(min, Math.min(max, next)) });
        }}
    /></label>`;
  }
  protected render() {
    return html`<div class="editor">
      <p class="intro">
        Ordne deine vorhandenen Ecowitt-Sensoren zu. Ohne Zuordnung zeigt die
        Karte einen Einrichtungshinweis. Es werden keine Sensoren angelegt und
        keine Dashboard-Daten automatisch verändert.
      </p>
      <div class="fields">
        <label
          >Kartentitel<input
            aria-label="Kartentitel"
            .value=${this._config.title ?? ""}
            placeholder="Wetterstation (Ecowitt)"
            @change=${(event: Event) =>
              this._change({ title: this._value(event) })}
        /></label>
        <label
          >Untertitel<input
            aria-label="Untertitel"
            .value=${this._config.subtitle ?? ""}
            placeholder="Außensensoren"
            @change=${(event: Event) =>
              this._change({ subtitle: this._value(event) })}
        /></label>
      </div>
      <details open class="device-assistant">
        <summary>Geräte auswählen · Vorschläge prüfen</summary>
        <p class="hint">
          Geräte aus dem HA-Register begrenzen die Vorschläge. Eine Zuordnung
          wird erst mit „übernehmen“ gespeichert. Alle Sensorfelder bleiben frei
          auswählbar. WN32 wird für Temperatur/Feuchte bevorzugt, wenn
          ausgewählt.
        </p>
        ${this._registryState === "loading"
          ? html`<p role="status">Geräteregister wird geladen …</p>`
          : nothing}
        ${this._registryState === "unavailable" || !this.hass?.callWS
          ? html`<p class="hint">
              Geräteregister nicht verfügbar. Wähle deine Sensoren direkt in den
              Feldern aus.
            </p>`
          : nothing}
        ${this._devices.length
          ? html`<div class="fields">
              ${DEVICE_ROLES.map(
                (role) =>
                  html`<label
                    >${role === "WN31"
                      ? "WN31 / WH31 · Zusatzkanäle"
                      : role}<select
                      aria-label=${`Gerät ${role}`}
                      .value=${this._roleDevices[role] || ""}
                      @change=${(event: Event) => {
                        this._roleDevices = {
                          ...this._roleDevices,
                          [role]: this._value(event) || undefined,
                        };
                      }}
                    >
                      <option value="">Kein Gerät ausgewählt</option>
                      ${this._devices.map(
                        (device) =>
                          html`<option
                            value=${device.id}
                            .selected=${this._roleDevices[role] === device.id}
                          >
                            ${deviceLabel(device)}
                          </option>`,
                      )}
                    </select></label
                  >`,
              )}
            </div>`
          : nothing}
        ${this._roleDevices.WN31
          ? html`<p class="hint">
              WN31/WH31: Wähle die gewünschten Kanäle unten unter
              „Zusatzsensoren“ aus.
              ${this._registry
                .filter(
                  (item) =>
                    item.device_id === this._roleDevices.WN31 &&
                    !item.disabled_by &&
                    /^(sensor|binary_sensor)\./.test(item.entity_id) &&
                    this.hass?.states[item.entity_id],
                )
                .map(
                  (item) =>
                    html`<button
                      class="suggestion"
                      type="button"
                      @click=${() =>
                        this._change({
                          extra_entities: [
                            ...new Set([
                              ...(this._config.extra_entities || []),
                              item.entity_id,
                            ]),
                          ],
                        })}
                    >
                      ${this._label(item.entity_id)} hinzufügen
                    </button>`,
                )}
            </p>`
          : nothing}
      </details>
      ${["Wind", "Regen", "Außenklima", "Druck & Sonne"].map(
        (group) =>
          html`<details open>
            <summary>${group}</summary>
            ${group === "Regen"
              ? html`<p class="hint">
                  WH40-Mengen und -Rate separat zuordnen. WS90-Piezo: on = NASS,
                  off = TROCKEN; Feuchtigkeit ist keine Garantie für aktuell
                  fallenden Regen. „Heute“ ist nicht „letzte 24 h“.
                </p>`
              : nothing}
            <div class="fields">
              ${METRICS.filter((metric) => metric.group === group).map(
                (metric) => this._picker(metric.key, metric.label),
              )}
            </div>
            ${group === "Wind" &&
            this.hass?.states["sensor.ecowitt_wind_direction_avg_175da"] &&
            this._config.entities?.wind_direction_avg !==
              "sensor.ecowitt_wind_direction_avg_175da"
              ? html`<button
                  type="button"
                  class="suggestion"
                  @click=${() =>
                    this._setEntity(
                      "wind_direction_avg",
                      "sensor.ecowitt_wind_direction_avg_175da",
                    )}
                >
                  Vorhandenen bekannten Sensor für die mittlere Richtung
                  übernehmen: sensor.ecowitt_wind_direction_avg_175da
                </button>`
              : nothing}
          </details>`,
      )}
      <details>
        <summary>Private Bildquelle & Ausrichtung</summary>
        <label
          >Bildpfad / HA-URL<input
            type="text"
            aria-label="Bildpfad / HA-URL"
            .value=${this._config.site_image ??
            this._config.background_image ??
            ""}
            placeholder="HA-Bildpfad oder media-source://…"
            @change=${(event: Event) =>
              this._change({
                site_image: this._value(event),
                background_image: undefined,
              })}
        /></label>
        <p class="hint">
          Leer lassen für die generische Beispielgrafik. Akzeptiert werden
          HA-relative Pfade, URLs derselben Herkunft und media-source://. Keine
          Upload-Funktion, keine Cloud-Übertragung.
        </p>
        <p class="warning">
          /config/www → /local ist nicht automatisch zugriffsgeschützt. Für
          sensible Bilder eine authentisierte HA-Media-Lösung prüfen und den
          Zugriff testen. Eine Sicherheitsgarantie besteht nicht.
        </p>
        <div class="fields">
          ${this._number(
            "image_rotation",
            "Bildrotation · Grad im Uhrzeigersinn",
            0,
            -180,
            180,
          )}${this._number(
            "image_target_x",
            "Pfeilziel horizontal · %",
            50,
            10,
            90,
          )}${this._number(
            "image_target_y",
            "Pfeilziel vertikal · %",
            50,
            10,
            90,
          )}
        </div>
        <p class="hint">
          Nord muss im Bild oben liegen. Nur das Hintergrundbild wird gedreht,
          der Kompass bleibt nordorientiert. Das Pfeilziel markiert die
          gewünschte Hausposition.
        </p>
      </details>
      <details>
        <summary>Zusatzsensoren & Diagnosen</summary>
        ${this._multi(
          "extra_entities",
          "Zusatzsensoren · WN31 / WH31",
          "Diese vorhandenen Kanäle erscheinen im Sensor-Detailfenster.",
        )}
        ${this._multi(
          "diagnostic_entities",
          "Diagnosesensoren · Batterie, Signal, Status",
          "Nur ausgewählte Quellen erscheinen in den Diagnosen; kein abgeleiteter Online-Status.",
        )}
      </details>
      <details>
        <summary>Verlauf & Aktualität</summary>
        <div class="fields">
          ${this._number(
            "history_hours",
            "Recorder-Zeitraum · Stunden",
            24,
            1,
            168,
          )}${this._number(
            "stale_after_minutes",
            "Hinweis auf alte Werte · Minuten (0 = aus)",
            0,
            0,
            10080,
          )}
        </div>
        <p class="hint">
          Verläufe werden erst beim Öffnen eines Details aus Home Assistant
          geladen. Recorder muss die ausgewählten Sensoren aufzeichnen. Der
          Aktualitätshinweis richtet sich nach dem letzten HA-Update; selten
          veränderte Sensoren müssen nicht offline sein.
        </p>
      </details>
    </div>`;
  }
  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color, #182632);
    }
    * {
      box-sizing: border-box;
    }
    .editor {
      display: grid;
      gap: 16px;
      padding: 4px 0 20px;
      font: inherit;
    }
    .intro {
      line-height: 1.5;
      margin: 0;
    }
    details {
      border: 1px solid var(--divider-color, #aebdca);
      border-radius: 14px;
      padding: 0 14px 14px;
    }
    summary {
      cursor: pointer;
      min-height: 48px;
      padding: 14px 0;
      font-weight: 600;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr));
      gap: 14px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      font-size: 14px;
    }
    input,
    select {
      display: block;
      width: 100%;
      min-width: 0;
      min-height: 48px;
      padding: 10px 12px;
      color: var(--primary-text-color, #182632);
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #8d9ca8);
      border-radius: 8px;
      font: inherit;
    }
    select[multiple] {
      min-height: 168px;
      margin-top: 4px;
    }
    option {
      min-height: 32px;
    }
    ha-entity-picker {
      display: block;
      width: 100%;
      min-height: 56px;
    }
    .hint,
    .warning,
    .suggestions {
      font-size: 13px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .hint {
      color: var(--secondary-text-color, #516471);
    }
    .warning {
      border-inline-start: 3px solid var(--warning-color, #b16d00);
      padding: 8px 10px;
      background: var(--secondary-background-color, #f4f6f8);
    }
    .entity-field {
      min-width: 0;
    }
    .suggestions {
      display: grid;
      gap: 4px;
      margin-top: 6px;
    }
    button {
      min-height: 44px;
      cursor: pointer;
      color: var(--primary-text-color, #182632);
      background: var(--secondary-background-color, #f1f6fa);
      border: 1px solid var(--divider-color, #afc2d0);
      border-radius: 8px;
      padding: 8px 10px;
      font: inherit;
      overflow-wrap: anywhere;
      text-align: start;
    }
    .suggestion {
      margin-top: 6px;
      max-width: 100%;
    }
    .matched {
      color: var(--secondary-text-color, #516471);
    }
    :focus-visible {
      outline: 3px solid var(--primary-color, #007b96);
      outline-offset: 3px;
    }
  `;
}
if (!customElements.get("ecowitt-weather-card-editor"))
  customElements.define(
    "ecowitt-weather-card-editor",
    EcowittWeatherCardEditor,
  );
