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
  private _listSearch: Record<"extra_entities" | "diagnostic_entities", string> = {
    extra_entities: "", diagnostic_entities: "",
  };
  private _mediaItems: { title: string; media_content_id: string; media_class?: string; media_content_type?: string }[] = [];
  private _mediaError = "";
  private _mediaCurrent = "media-source://media_source/local";

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

  private _toggleSelected(
    key: "extra_entities" | "diagnostic_entities", id: string, checked: boolean,
  ) {
    const current = this._config[key] || [];
    this._change({ [key]: checked
      ? [...new Set([...current, id])]
      : current.filter((candidate) => candidate !== id) });
  }
  private _multi(
    key: "extra_entities" | "diagnostic_entities",
    label: string,
    hint: string,
  ) {
    const selected = this._config[key] || [];
    const search = this._listSearch[key].toLowerCase().trim();
    const all = [...new Set([...selected, ...this._entities()])];
    const devicesById = new Map(this._devices.map((device) => [device.id, device]));
    const registryById = new Map(this._registry.map((item) => [item.entity_id, item]));
    const groups = new Map<string, { title: string; ids: string[] }>();
    for (const id of all) {
      const labelText = this._label(id);
      const registryDevice = devicesById.get(registryById.get(id)?.device_id || "");
      const role = registryDevice ? roleForDevice(registryDevice) : undefined;
      if (!search && !selected.includes(id) && !role) continue;
      if (search && ![labelText, id, registryDevice ? deviceLabel(registryDevice) : ""]
        .join(" ").toLowerCase().includes(search)) continue;
      const title = registryDevice
        ? (role ? role + " · " : "") + deviceLabel(registryDevice)
        : "Sonstige oder nicht zugeordnete Sensoren";
      const group = groups.get(title) || { title, ids: [] };
      group.ids.push(id);
      groups.set(title, group);
    }
    return html`<section class="checkbox-list">
      <strong>${label}</strong>
      <p class="hint">${hint} Keine Strg-Taste erforderlich.</p>
      <label class="search-label">Sensoren durchsuchen
        <input type="search" placeholder="Sensorname, Gerät oder Entity-ID"
          .value=${this._listSearch[key]}
          @input=${(event: Event) => {
            this._listSearch = { ...this._listSearch, [key]: this._value(event) };
          }} />
      </label>
      <p class="hint">${selected.length} Sensoren ausgewählt ·
        ${search ? "Suchergebnisse" : "Ecowitt-Geräte und ausgewählte Sensoren"}
      </p>
      <div class="check-groups">
        ${[...groups.values()].map((group) => html`<details class="check-group" open>
          <summary>${group.title} · ${group.ids.filter((id) => selected.includes(id)).length}/${group.ids.length}</summary>
          ${group.ids.map((id) => html`<label class="check-row">
            <input type="checkbox" .checked=${selected.includes(id)}
              @change=${(event: Event) => this._toggleSelected(key, id, (event.target as HTMLInputElement).checked)} />
            <span>${this._label(id)}
              ${!this.hass?.states[id] ? html`<small>Momentan nicht verfügbar</small>` : nothing}
            </span>
          </label>`)}
        </details>`)}
        ${!groups.size ? html`<p class="hint">
          Keine Treffer. Nutze die Suche oder wähle die Ecowitt-Geräte oben aus.
        </p>` : nothing}
      </div>
    </section>`;
  }
  private _deviceField(device: DeviceStatusConfig, key: "battery" | "signal" | "connection") {
    const registry = this._registry
      .filter((item) => item.device_id === device.device_id && !item.disabled_by &&
        !!this.hass?.states[item.entity_id]);
    const ids = [...new Set([...(device[key] ? [device[key]!] : []),
      ...registry.map((item) => item.entity_id)])];
    const priority = key === "battery" ? /batter|akku|voltage|spannung/i
      : key === "signal" ? /signal|rssi|empfang|qualit/i
      : /connect|verbund|online|offline|status/i;
    ids.sort((a, b) => Number(priority.test(this._label(b))) - Number(priority.test(this._label(a))) ||
      a.localeCompare(b));
    const title = key === "battery" ? "Batterie" : key === "signal" ? "Signalqualität" : "Verbindungsstatus";
    return html`<label>${title}
      <select .value=${device[key] || ""} @change=${(event: Event) =>
        this._editDevice(device, { [key]: this._value(event) || undefined })}>
        <option value="">Nicht zugeordnet</option>
        ${ids.map((id) => html`<option value=${id} .selected=${device[key] === id}>
          ${this._label(id)}
        </option>`)}
      </select>
    </label>`;
  }
  private _editDevice(device: DeviceStatusConfig, patch?: Partial<DeviceStatusConfig>, remove = false) {
    const configured = [...(this._config.device_status || [])];
    const index = configured.findIndex((item) => item.device_id === device.device_id);
    if (remove) {
      if (index >= 0) configured.splice(index, 1);
    } else if (index >= 0) {
      configured[index] = { ...configured[index], ...patch };
    } else configured.push({ ...device, ...patch });
    this._change({ device_status: configured });
  }
  private _deviceEditor() {
    const configured = this._config.device_status || [];
    const byId = new Map(this._devices.map((device) => [device.id, device]));
    const matches = this._devices.filter((device) => roleForDevice(device));
    const ids = [...new Set([...matches.map((d) => d.id), ...configured.map((d) => d.device_id)])];
    return html`<section class="device-editor">
      <p class="hint">Jedes Gerät besitzt eigene Batterie-, Signal- und
        Verbindungsquellen. Markiere die Geräte für die Hauptkarte; WS90 wird
        vorgeschlagen. Mehrere WN31/WH31 sind möglich. Keine Werte werden geraten.</p>
      ${ids.map((id) => {
        const existing = configured.find((device) => device.device_id === id);
        const registryDevice = byId.get(id);
        const role = existing?.role || (registryDevice ? roleForDevice(registryDevice) : undefined);
        if (!role) return nothing;
        const device: DeviceStatusConfig = existing || {
          device_id: id, role, name: registryDevice ? deviceLabel(registryDevice) : role,
          show_on_main: role === "WS90",
        };
        return html`<div class="device-config">
          <label class="check-row">
            <input type="checkbox" .checked=${!!existing}
              @change=${(event: Event) => this._editDevice(device, undefined,
                !(event.target as HTMLInputElement).checked)} />
            <span><strong>${role}</strong> · ${device.name || id}</span>
          </label>
          ${existing ? html`<div class="device-config-body">
            <label class="check-row">
              <input type="checkbox" .checked=${!!existing.show_on_main}
                @change=${(event: Event) =>
                  this._editDevice(device, { show_on_main: (event.target as HTMLInputElement).checked })} />
              <span>Auf der Hauptkarte anzeigen</span>
            </label>
            <div class="fields">
              ${this._deviceField(device, "battery")}
              ${this._deviceField(device, "signal")}
              ${this._deviceField(device, "connection")}
            </div>
          </div>` : nothing}
        </div>`;
      })}
      ${!ids.length ? html`<p class="warning">
        Keine Ecowitt-Geräte im HA-Geräteregister gefunden. Bitte die
        Integration und Gerätezuordnung prüfen.
      </p>` : nothing}
    </section>`;
  }
  private async _browseMedia(id = "media-source://media_source/local") {
    this._mediaError = "";
    if (!this.hass?.callWS) {
      this._mediaError = "Der Home-Assistant-Medienbrowser ist hier nicht verfügbar.";
      return;
    }
    try {
      const response = await this.hass.callWS<{
        children?: {title:string;media_content_id:string;media_class?:string;media_content_type?:string}[];
      }>({ type: "media_source/browse_media", media_content_id: id });
      this._mediaCurrent = id;
      this._mediaItems = response.children || [];
    } catch {
      this._mediaError = "Medien konnten nicht geladen werden. Alternativ eine media-source://-ID eingeben.";
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
        <summary>Darstellung, Wetteranimation und Theme</summary>
        <div class="fields">
          <label>Farbschema
            <select aria-label="Farbschema" .value=${this._config.theme_mode || "auto"}
              @change=${(event: Event) => this._change({ theme_mode: this._value(event) as "auto" | "light" | "dark" })}>
              <option value="auto">Automatisch · wie Home Assistant</option>
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
            </select>
          </label>
          <label class="check-row check-preference">
            <input type="checkbox" .checked=${this._config.weather_animation !== false}
              @change=${(event: Event) => this._change({ weather_animation: (event.target as HTMLInputElement).checked })} />
            <span>Dezente Wetteranimationen aktivieren (Bewegung reduzieren wird respektiert)</span>
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

        <p class="hint">Empfohlen: Bild unter
          <code>/media/ecowitt/Wohnhaus.png</code> speichern und im Feld
          <code>media-source://media_source/local/ecowitt/Wohnhaus.png</code>
          verwenden. Schreibweise und Groß-/Kleinschreibung beachten.
        </p>
        <button type="button" @click=${() => this._browseMedia()}>
          Bild aus Home Assistant Medien auswählen …
        </button>
        ${this._mediaItems.length ? html`<div class="media-browser">
          <button type="button" @click=${() => this._browseMedia()}>Hauptordner anzeigen</button>
          ${this._mediaItems.map((item) => {
            const folder = item.media_class === "directory";
            const image = !folder && (item.media_content_type?.startsWith("image/") ||
              /\.(png|jpe?g|webp|gif|svg)$/i.test(item.title));
            if (!folder && !image) return nothing;
            return html`<button type="button" @click=${() => folder
              ? this._browseMedia(item.media_content_id)
              : (this._change({ site_image: item.media_content_id, background_image: undefined }),
                this._mediaItems = [])}>
              ${folder ? "📁" : "🖼️"} ${item.title}
            </button>`;
          })}
        </div>` : nothing}
        ${this._mediaError ? html`<p class="warning" role="alert">${this._mediaError}</p>` : nothing}
        <p class="warning">
          /config/www → /local ist nicht automatisch zugriffsgeschützt.
          Der Medienordner ist die bevorzugte Alternative, aber die
          Zugriffsrechte müssen in deiner HA-Instanz geprüft werden.
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
    .check-groups { max-height: 360px; overflow-y: auto; display: grid; gap: 8px; padding: 4px; }
    .check-group { padding: 0 10px 10px; }
    .check-group summary { min-height: 44px; padding: 10px 0; font-size: 13px; }
    .check-row { display: flex; flex-direction: row; align-items: center;
      gap: 10px; min-height: 44px; padding: 5px 3px; overflow-wrap: anywhere; }
    .check-row input[type="checkbox"] { width: 22px; min-width: 22px; height: 22px;
      min-height: 22px; flex-shrink: 0; accent-color: var(--primary-color, #06a6c0); }
    .check-row span { min-width: 0; overflow-wrap: anywhere; }
    .check-row small { display: block; color: var(--secondary-text-color, #627586); }
    .checkbox-list { display: grid; gap: 6px; margin: 16px 0; }
    .checkbox-list strong { font-size: 0.95rem; }
    .device-editor { display: grid; gap: 8px; }
    .device-config { padding: 10px 12px; border: 1px solid var(--divider-color, #aebdca);
      border-radius: 12px; }
    .device-config-body { padding: 8px 0 4px 30px; display: grid; gap: 10px; }
    .check-preference { align-self: end; }
    .media-browser { display: grid; gap: 5px; margin-top: 8px; max-height: 240px;
      overflow-y: auto; padding: 8px; border: 1px solid var(--divider-color, #aebdca);
      border-radius: 10px; }
    .media-browser button { min-height: 38px; }
    code { font-size: 0.82em; overflow-wrap: anywhere; }
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
