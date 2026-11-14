import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import {
  METRICS,
  type CardConfig,
  type DeviceStatusConfig,
  type HomeAssistant,
  type MetricKey,
} from "./types";
import { normalizeConfig } from "./config";
import {
  DEVICE_ROLES,
  candidateEntities,
  deviceLabel,
  roleForDevice,
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
    _listSearch: { state: true },
    _mediaLoading: { state: true },
    _mediaItems: { state: true },
    _mediaError: { state: true },
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
  private _listSearch: Record<string, string> = {};
  private _mediaItems: {
    title: string;
    media_content_id: string;
    media_class?: string;
    media_content_type?: string;
    can_expand?: boolean;
  }[] = [];
  private _mediaError = "";
  private _mediaLoading = false;
  private _mediaRequest = 0;

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

  private _legacyIds(): string[] {
    return [
      ...new Set([
        ...(this._config.extra_entities || []),
        ...(this._config.diagnostic_entities || []),
      ]),
    ];
  }
  private _deviceViews(): DeviceStatusConfig[] {
    const configured = this._config.device_status || [];
    const selectedRoles = new Map(
      Object.entries(this._roleDevices)
        .filter(([, id]) => id)
        .map(([role, id]) => [id!, role as DeviceRole]),
    );
    const actual = this._devices.filter(
      (device) => roleForDevice(device) || selectedRoles.has(device.id),
    );
    const ids = [
      ...new Set([
        ...actual.map((device) => device.id),
        ...configured.map((device) => device.device_id),
      ]),
    ];
    return ids.flatMap((id) => {
      const existing = configured.find((device) => device.device_id === id);
      if (existing) return [existing];
      const device = actual.find((item) => item.id === id);
      const role = device && (roleForDevice(device) || selectedRoles.get(id));
      return device && role
        ? [
            {
              device_id: id,
              role,
              name: deviceLabel(device),
              show_on_main: false,
            },
          ]
        : [];
    });
  }
  private _deviceExtras(device: DeviceStatusConfig) {
    const statusIds = new Set(
      [device.battery, device.signal, device.connection].filter(Boolean),
    );
    const attached = this._registry.filter(
      (item) => item.device_id === device.device_id,
    );
    const attachedIds = new Set(attached.map((item) => item.entity_id));
    const legacy = this._legacyIds().filter((id) => attachedIds.has(id));
    const selected = [
      ...new Set([...(device.extra_entities || []), ...legacy]),
    ].filter((id) => !statusIds.has(id));
    const mainIds = new Set(Object.values(this._config.entities || {}));
    const available = attached
      .filter(
        (item) =>
          !item.disabled_by &&
          item.entity_id.startsWith("sensor.") &&
          this.hass?.states[item.entity_id],
      )
      .map((item) => item.entity_id)
      .filter(
        (id) =>
          !statusIds.has(id) && !mainIds.has(id) && !this._diagnosticSource(id),
      );
    const all = [...new Set([...selected, ...available])].sort();
    const search = (this._listSearch[device.device_id] || "")
      .toLowerCase()
      .trim();
    const visible = all.filter(
      (id) => !search || this._label(id).toLowerCase().includes(search),
    );
    return html`<section class="checkbox-list device-extras">
      <strong>Optionale zusätzliche Messwerte</strong>
      <p class="hint">
        Messwerte dieses Geräts erscheinen in den Sensor-Details. Bereits
        gespeicherte Zusatz- und Diagnoseauswahlen bleiben erhalten.
      </p>
      ${all.length
        ? html`<label
              >Messwerte durchsuchen
              <input
                type="search"
                aria-label=${`Messwerte durchsuchen · ${device.name || device.role}`}
                .value=${this._listSearch[device.device_id] || ""}
                @input=${(event: Event) => {
                  this._listSearch = {
                    ...this._listSearch,
                    [device.device_id]: this._value(event),
                  };
                }}
              />
            </label>
            <div class="check-groups">
              ${visible.map(
                (id) =>
                  html`<label class="check-row">
                    <input
                      type="checkbox"
                      .checked=${selected.includes(id)}
                      @change=${(event: Event) =>
                        this._toggleDeviceExtra(
                          device,
                          id,
                          (event.target as HTMLInputElement).checked,
                        )}
                    />
                    <span
                      >${this._label(id)}
                      ${legacy.includes(id)
                        ? html`<small
                            >Bestehende Auswahl ·
                            ${this._config.diagnostic_entities?.includes(id)
                              ? "Diagnose"
                              : "Zusatzwert"}</small
                          >`
                        : nothing}
                      ${!this.hass?.states[id]
                        ? html`<small
                            >Momentan nicht verfügbar; Zuordnung bleibt
                            erhalten.</small
                          >`
                        : nothing}
                    </span>
                  </label>`,
              )}
              ${!visible.length
                ? html`<p class="hint">Keine Treffer.</p>`
                : nothing}
            </div>`
        : html`<p class="hint">
            Keine weiteren Messwerte für dieses Gerät gefunden.
          </p>`}
    </section>`;
  }
  private _diagnosticSource(id: string): boolean {
    const dc = this.hass?.states[id]?.attributes.device_class;
    return (
      ["battery", "signal_strength", "connectivity"].includes(dc || "") ||
      /(?:battery|batterie|akku|rssi|signal|connectivity|connection)/i.test(
        this._label(id),
      )
    );
  }
  private _toggleDeviceExtra(
    device: DeviceStatusConfig,
    id: string,
    checked: boolean,
  ) {
    const configured = [...(this._config.device_status || [])];
    const index = configured.findIndex(
      (item) => item.device_id === device.device_id,
    );
    const extra = checked
      ? [...new Set([...(device.extra_entities || []), id])]
      : (device.extra_entities || []).filter((candidate) => candidate !== id);
    if (index >= 0)
      configured[index] = { ...configured[index], extra_entities: extra };
    else if (checked) configured.push({ ...device, extra_entities: extra });
    this._change({
      device_status: configured,
      ...(checked
        ? {}
        : {
            extra_entities: this._config.extra_entities?.filter(
              (candidate) => candidate !== id,
            ),
            diagnostic_entities: this._config.diagnostic_entities?.filter(
              (candidate) => candidate !== id,
            ),
          }),
    });
  }
  private _legacyEditor(devices: DeviceStatusConfig[]) {
    const deviceIds = new Set(devices.map((device) => device.device_id));
    const presented = new Set(
      devices.flatMap((device) => [
        device.battery,
        device.signal,
        device.connection,
        ...(device.extra_entities || []),
      ]),
    );
    const attached = new Set(
      this._registry
        .filter((item) => item.device_id && deviceIds.has(item.device_id))
        .map((item) => item.entity_id),
    );
    const ids = this._legacyIds().filter(
      (id) => !presented.has(id) && !attached.has(id),
    );
    if (!ids.length) return nothing;
    return html`<section class="legacy-config checkbox-list">
      <strong>Bestehende Auswahl ohne Gerätezuordnung</strong>
      <p class="hint">
        Diese Quellen aus extra_entities / diagnostic_entities bleiben lesbar
        und in den Sensor-Details erhalten. Das Geräteregister ordnet sie
        derzeit keinem angezeigten Gerät zu. Entfernen nur durch bewusstes
        Abwählen.
      </p>
      ${ids.map(
        (id) =>
          html`<label class="check-row"
            ><input
              type="checkbox"
              .checked=${true}
              @change=${(event: Event) => {
                if (!(event.target as HTMLInputElement).checked)
                  this._change({
                    extra_entities: this._config.extra_entities?.filter(
                      (candidate) => candidate !== id,
                    ),
                    diagnostic_entities:
                      this._config.diagnostic_entities?.filter(
                        (candidate) => candidate !== id,
                      ),
                  });
              }}
            /><span
              >${this._label(id)}
              <small
                >${this._config.extra_entities?.includes(id)
                  ? "Zusatzwert"
                  : "Diagnose"}${!this.hass?.states[id]
                  ? " · momentan nicht verfügbar"
                  : ""}</small
              >
            </span></label
          >`,
      )}
    </section>`;
  }
  private _deviceField(
    device: DeviceStatusConfig,
    key: "battery" | "signal" | "connection",
  ) {
    const registry = this._registry.filter(
      (item) =>
        item.device_id === device.device_id &&
        !item.disabled_by &&
        !!this.hass?.states[item.entity_id] &&
        /^(sensor|binary_sensor)\./.test(item.entity_id),
    );
    const ids = [
      ...new Set([
        ...(device[key] ? [device[key]!] : []),
        ...registry.map((item) => item.entity_id),
      ]),
    ];
    const priority =
      key === "battery"
        ? /batter|akku|voltage|spannung/i
        : key === "signal"
          ? /signal|rssi|empfang|qualit/i
          : /connect|verbund|online|offline|status/i;
    ids.sort(
      (a, b) =>
        Number(priority.test(this._label(b))) -
          Number(priority.test(this._label(a))) || a.localeCompare(b),
    );
    const title =
      key === "battery"
        ? "Batterie"
        : key === "signal"
          ? "Signalqualität"
          : "Verbindungsstatus";
    return html`<label
      >${title}
      <select
        aria-label=${`${title} · ${device.name || device.role}`}
        .value=${device[key] || ""}
        @change=${(event: Event) =>
          this._editDevice(device, { [key]: this._value(event) || undefined })}
      >
        <option value="">Nicht zugeordnet</option>
        ${ids.map(
          (id) =>
            html`<option value=${id} .selected=${device[key] === id}>
              ${this._label(id)}
            </option>`,
        )}
      </select>
    </label>`;
  }
  private _editDevice(
    device: DeviceStatusConfig,
    patch?: Partial<DeviceStatusConfig>,
    remove = false,
  ) {
    const configured = [...(this._config.device_status || [])];
    const index = configured.findIndex(
      (item) => item.device_id === device.device_id,
    );
    if (remove) {
      if (index >= 0) configured.splice(index, 1);
    } else if (index >= 0) {
      configured[index] = { ...configured[index], ...patch };
    } else configured.push({ ...device, ...patch });
    this._change({ device_status: configured });
  }
  private _deviceEditor() {
    const configured = this._config.device_status || [];
    const devices = this._deviceViews();
    return html`<section class="device-editor">
      <p class="hint">
        Hier werden Einstellungen dauerhaft gespeichert: Batterie, Signal,
        Verbindung und zusätzliche Messwerte pro Gerät. „Auf der Hauptkarte
        anzeigen“ gilt nur für den Gerätestatus; Zusatzwerte erscheinen in den
        Details. Quellen werden nicht automatisch zugeordnet.
      </p>
      ${devices.map(
        (device) =>
          html`<details
            class="device-config"
            data-device-id=${device.device_id}
            ?open=${configured.some(
              (item) => item.device_id === device.device_id,
            )}
          >
            <summary>
              <strong>${device.role}</strong> ·
              ${device.name || device.device_id}
            </summary>
            <div class="device-config-body">
              <label class="check-row">
                <input
                  type="checkbox"
                  .checked=${!!device.show_on_main}
                  @change=${(event: Event) =>
                    this._editDevice(device, {
                      show_on_main: (event.target as HTMLInputElement).checked,
                    })}
                />
                <span>Auf der Hauptkarte anzeigen</span>
              </label>
              <div class="fields">
                ${this._deviceField(device, "battery")}
                ${this._deviceField(device, "signal")}
                ${this._deviceField(device, "connection")}
              </div>
              <p class="hint">
                Batterie und Signal behalten ihre Quelleneinheit; Volt werden
                nicht in Prozent umgerechnet. Verbindung benötigt eine geeignete
                Connectivity- oder explizite Online-/Offline-Quelle. Ohne
                passende Quelle bleibt der Status unbekannt.
              </p>
              ${this._deviceExtras(device)}
            </div>
          </details>`,
      )}
      ${!devices.length
        ? html`<p class="warning">
            Keine Ecowitt-Geräte im HA-Geräteregister gefunden. Bestehende
            Sensorzuordnungen bleiben erhalten; Hauptmesswerte können direkt in
            ihren Sensorfeldern zugeordnet werden.
          </p>`
        : nothing}
      ${this._legacyEditor(devices)}
    </section>`;
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._mediaRequest++;
    this._mediaLoading = false;
  }
  private async _browseMedia(id = "media-source://media_source/local") {
    const request = ++this._mediaRequest;
    this._mediaError = "";
    this._mediaItems = [];
    if (!this.hass?.callWS) {
      this._mediaError =
        "Der Home-Assistant-Medienbrowser ist hier nicht verfügbar.";
      return;
    }
    if (!/^media-source:\/\/media_source\/local(?:\/|$)/.test(id)) {
      this._mediaError =
        "Bitte eine lokale Home-Assistant-Medienquelle verwenden.";
      return;
    }
    this._mediaLoading = true;
    try {
      const response = await this.hass.callWS<{
        children?: {
          title: string;
          media_content_id: string;
          media_class?: string;
          media_content_type?: string;
          can_expand?: boolean;
        }[];
      }>({ type: "media_source/browse_media", media_content_id: id });
      if (request !== this._mediaRequest) return;
      this._mediaItems = Array.isArray(response.children)
        ? response.children.filter(
            (item) =>
              typeof item.title === "string" &&
              typeof item.media_content_id === "string" &&
              /^media-source:\/\/media_source\/local(?:\/|$)/.test(
                item.media_content_id,
              ),
          )
        : [];
      if (!this._mediaItems.length)
        this._mediaError =
          "Keine lokalen Bilder oder Ordner gefunden. Alternativ eine media-source://-ID eingeben.";
    } catch {
      if (request === this._mediaRequest)
        this._mediaError =
          "Medien konnten nicht geladen werden. Alternativ eine media-source://-ID eingeben.";
    } finally {
      if (request === this._mediaRequest) this._mediaLoading = false;
    }
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
          Diese Geräteauswahl filtert nur vorübergehend die Sensorvorschläge und
          wird nicht gespeichert. Sie ersetzt keine vorhandene Sensorzuordnung.
          Erst ein bewusstes „übernehmen“ oder eine manuelle Sensorauswahl wird
          gespeichert. WN32 ist optional; ohne WN32 werden passende WS90-Quellen
          vorgeschlagen. Dauerhafte Gerätestatus-Einstellungen stehen weiter
          unten.
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
              ${DEVICE_ROLES.filter((role) => role !== "WN31").map(
                (role) =>
                  html`<label
                    >${role === "WN32" ? "WN32 · optional" : role}<select
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
        <summary>Darstellung, Wetteranimation und Theme</summary>
        <div class="fields">
          <label
            >Farbschema
            <select
              aria-label="Farbschema"
              .value=${this._config.theme_mode || "auto"}
              @change=${(event: Event) =>
                this._change({
                  theme_mode: this._value(event) as "auto" | "light" | "dark",
                })}
            >
              <option value="auto">Automatisch · wie Home Assistant</option>
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
            </select>
          </label>
          <label class="check-row check-preference">
            <input
              type="checkbox"
              .checked=${this._config.weather_animation !== false}
              @change=${(event: Event) =>
                this._change({
                  weather_animation: (event.target as HTMLInputElement).checked,
                })}
            />
            <span
              >Dezente Wetteranimationen aktivieren (Bewegung reduzieren wird
              respektiert)</span
            >
          </label>
        </div>
      </details>
      <details>
        <summary>Private Bildquelle & Ausrichtung</summary>
        <label
          >Bildpfad / HA-URL<input
            type="text"
            aria-label="Bildpfad / HA-URL"
            .value=${this._config.site_image ??
            this._config.background_image ??
            ""}
            placeholder="media-source://media_source/local/ecowitt/Wohnhaus.png"
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

        <p class="hint">
          Empfohlen: Bild unter
          <code>/media/ecowitt/Wohnhaus.png</code> speichern und im Feld
          <code>media-source://media_source/local/ecowitt/Wohnhaus.png</code>
          verwenden. Schreibweise und Groß-/Kleinschreibung beachten.
        </p>
        <button
          type="button"
          ?disabled=${this._mediaLoading}
          @click=${() => this._browseMedia()}
        >
          ${this._mediaLoading
            ? "Medien werden geladen …"
            : "Bild aus Home Assistant Medien auswählen …"}
        </button>
        ${this._mediaItems.length
          ? html`<div class="media-browser">
              <button type="button" @click=${() => this._browseMedia()}>
                Hauptordner anzeigen
              </button>
              ${this._mediaItems.map((item) => {
                const folder =
                  item.can_expand === true || item.media_class === "directory";
                const image =
                  !folder &&
                  (item.media_class === "image" ||
                    item.media_content_type?.startsWith("image/") ||
                    /\.(png|jpe?g|webp|gif|svg)$/i.test(item.title));
                if (!folder && !image) return nothing;
                return html`<button
                  type="button"
                  @click=${() =>
                    folder
                      ? this._browseMedia(item.media_content_id)
                      : (this._change({
                          site_image: item.media_content_id,
                          background_image: undefined,
                        }),
                        (this._mediaItems = []),
                        ++this._mediaRequest,
                        (this._mediaLoading = false))}
                >
                  ${folder ? "📁" : "🖼️"} ${item.title}
                </button>`;
              })}
            </div>`
          : nothing}
        ${this._mediaError
          ? html`<p class="warning" role="alert">${this._mediaError}</p>`
          : nothing}
        <p class="warning">
          /config/www → /local ist nicht automatisch zugriffsgeschützt. Der
          Medienordner ist die bevorzugte Alternative, aber die Zugriffsrechte
          müssen in deiner HA-Instanz geprüft werden.
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
        <summary>Zusatzsensoren & Diagnosen nach Gerät</summary>
        ${this._deviceEditor()}
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
    .check-groups {
      max-height: 360px;
      overflow-y: auto;
      display: grid;
      gap: 8px;
      padding: 4px;
    }
    .check-group {
      padding: 0 10px 10px;
    }
    .check-group summary {
      min-height: 44px;
      padding: 10px 0;
      font-size: 13px;
    }
    .check-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 5px 3px;
      overflow-wrap: anywhere;
    }
    .check-row input[type="checkbox"] {
      width: 22px;
      min-width: 22px;
      height: 22px;
      min-height: 22px;
      flex-shrink: 0;
      accent-color: var(--primary-color, #06a6c0);
    }
    .check-row span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .check-row small {
      display: block;
      color: var(--secondary-text-color, #627586);
    }
    .checkbox-list {
      display: grid;
      gap: 6px;
      margin: 16px 0;
    }
    .checkbox-list strong {
      font-size: 0.95rem;
    }
    .device-editor {
      display: grid;
      gap: 8px;
    }
    .device-config {
      padding: 10px 12px;
      border: 1px solid var(--divider-color, #aebdca);
      border-radius: 12px;
    }
    .device-config-body {
      padding: 8px 0 4px;
      display: grid;
      gap: 10px;
    }
    .check-preference {
      align-self: end;
    }
    .media-browser {
      display: grid;
      gap: 5px;
      margin-top: 8px;
      max-height: 240px;
      overflow-y: auto;
      padding: 8px;
      border: 1px solid var(--divider-color, #aebdca);
      border-radius: 10px;
    }
    .media-browser button {
      min-height: 44px;
    }
    code {
      font-size: 0.82em;
      overflow-wrap: anywhere;
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
