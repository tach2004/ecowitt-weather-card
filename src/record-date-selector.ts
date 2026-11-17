import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import {
  RECORD_PRESETS, dateMs, monthCells, monthStart, prettyRange,
  rangeForPreset, shiftDateRange, shiftDay, shiftMonth,
  type DateRange, type RecordPreset,
} from "./record-date-range";

/** Local, self-contained HA Energy-style selector; never changes the Energy dashboard's range. */
@customElement("ecowitt-record-date-selector")
export class EcowittRecordDateSelector extends LitElement {
  @property({ type: String }) startDate = "";
  @property({ type: String }) endDate = "";
  @property({ type: String }) today = "";
  @state() private _open = false;
  @state() private _month = "";
  @state() private _draft: DateRange = { from: "", to: "" };
  @state() private _selectingEnd = false;
  @state() private _preset: RecordPreset | "" = "";
  private get _range(): DateRange {
    return { from: this.startDate, to: this.endDate };
  }
  private _openPicker() {
    this._draft = this._range;
    this._month = monthStart(this.endDate || this.today);
    this._selectingEnd = false;
    this._preset = "";
    this._open = true;
  }
  private _closePicker() { this._open = false; }
  private _onKeys(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this._closePicker();
    }
  }
  private _presetSelected(key: RecordPreset) {
    this._draft = rangeForPreset(key, this.today);
    this._month = monthStart(this._draft.to);
    this._preset = key;
    this._selectingEnd = false;
  }
  private _selectDay(date: string) {
    if (!this._selectingEnd || date < this._draft.from) {
      this._draft = { from: date, to: date };
      this._selectingEnd = true;
    } else {
      this._draft = { from: this._draft.from, to: date };
      this._selectingEnd = false;
    }
    this._preset = "";
  }
  private _apply(range: DateRange) {
    if (!range.from || !range.to || dateMs(range.from) > dateMs(range.to) ||
        dateMs(range.from) > dateMs(this.today))
      return;
    this._closePicker();
    this.dispatchEvent(new CustomEvent("record-range-selected", {
      bubbles: true, composed: true, detail: range,
    }));
  }
  private _move(direction: -1 | 1) {
    const range = shiftDateRange(this._range, direction);
    if (dateMs(range.from) > dateMs(this.today)) return;
    this._apply({
      from: range.from,
      to: range.to > this.today ? this.today : range.to,
    });
  }
  protected render() {
    if (!this.startDate || !this.endDate || !this.today) return nothing;
    const range = this._range;
    const days = this._open ? monthCells(this._month) : [];
    const monthName = this._open
      ? new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" })
          .format(new Date(dateMs(this._month)))
      : "";
    return html`<section class="period-selector" @keydown=${this._onKeys}>
      <div class="period-toolbar">
        <button type="button" class="calendar-trigger" aria-label="Kalender und Zeitraum auswählen"
          aria-expanded=${this._open ? "true" : "false"} @click=${this._openPicker}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6 M17 2v6 M3 10h18"/></svg>
        </button>
        <button type="button" class="period-label" @click=${this._openPicker}>
          ${prettyRange(range)}
        </button>
        <button type="button" class="period-now" @click=${() => this._apply(rangeForPreset("today", this.today))}>Jetzt</button>
        <button type="button" class="period-step" aria-label="Vorheriger Zeitraum" @click=${() => this._move(-1)}>‹</button>
        <button type="button" class="period-step" aria-label="Nächster Zeitraum"
          ?disabled=${range.to >= this.today} @click=${() => this._move(1)}>›</button>
      </div>
      ${this._open ? html`<section class="period-picker" aria-label="Kalenderzeitraum" role="group">
        <div class="picker-main">
          <nav class="picker-presets" aria-label="Schnellwahl">
            ${RECORD_PRESETS.map(p => html`<button type="button"
              aria-pressed=${this._preset === p.key ? "true" : "false"}
              class=${this._preset === p.key ? "chosen" : ""}
              @click=${() => this._presetSelected(p.key)}>${p.label}</button>`)}
          </nav>
          <div class="picker-calendar">
            <div class="picker-month">
              <button type="button" aria-label="Vorheriger Monat"
                @click=${() => { this._month = shiftMonth(this._month, -1); }}>‹</button>
              <strong>${monthName}</strong>
              <button type="button" aria-label="Nächster Monat"
                ?disabled=${this._month >= monthStart(this.today)}
                @click=${() => { this._month = shiftMonth(this._month, 1); }}>›</button>
            </div>
            <div class="picker-weekdays" aria-hidden="true">
              ${["M", "D", "M", "D", "F", "S", "S"].map(day => html`<span>${day}</span>`)}
            </div>
            <div class="picker-days" role="group" aria-label="Kalendertage">
              ${days.map(cell => html`<button type="button"
                class=${[
                  !cell.inMonth ? "outside" : "",
                  cell.date === this.today ? "today" : "",
                  cell.date === this._draft.from || cell.date === this._draft.to ? "selected" : "",
                  cell.date > this._draft.from && cell.date < this._draft.to ? "in-range" : "",
                ].join(" ")}
                ?disabled=${cell.date > this.today}
                aria-pressed=${cell.date >= this._draft.from && cell.date <= this._draft.to}
                aria-label=${new Intl.DateTimeFormat("de-DE", {
                  timeZone: "UTC", dateStyle: "full",
                }).format(new Date(dateMs(cell.date)))}
                @click=${() => this._selectDay(cell.date)}>${Number(cell.date.slice(-2))}</button>`)}
            </div>
            <p class="picker-hint" aria-live="polite">
              ${this._selectingEnd ? "Enddatum auswählen" : prettyRange(this._draft)}
            </p>
          </div>
        </div>
        <footer class="picker-actions">
          <button type="button" class="picker-cancel" @click=${this._closePicker}>Abbrechen</button>
          <button type="button" class="picker-apply"
            ?disabled=${this._draft.from > this._draft.to || this._draft.to > this.today}
            @click=${() => this._apply(this._draft)}>Auswählen</button>
        </footer>
      </section>` : nothing}
    </section>`;
  }

  static styles = css`
    :host { display: block; min-width: 0; color: var(--primary-text-color, #edf5fc); }
    button { font: inherit; cursor: pointer; color: inherit; }
    button:disabled { opacity: .35; cursor: default; }
    button:focus-visible { outline: 2px solid var(--cyan, #0b9fbe); outline-offset: 2px; }
    .period-toolbar {
      display: flex; align-items: center; min-height: 54px; gap: 6px;
      padding: 6px 10px; background: var(--surface, #fff);
      border: 1px solid var(--line, #ddd); border-radius: 14px;
      box-shadow: 0 4px 14px #0000000c;
    }
    .calendar-trigger, .period-step {
      flex: 0 0 44px; height: 44px; display: grid; place-items: center;
      background: transparent; border: 0; border-radius: 10px; font-size: 1.8rem;
    }
    .calendar-trigger svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .period-label { flex: 1 1 auto; min-width: 0; padding: 9px 6px; background: transparent; border: 0; text-align: left; font-weight: 650; font-size: .93rem; }
    .period-now {
      border: 0; border-radius: 999px; background: color-mix(in srgb, var(--cyan, #0b9fbe) 16%, var(--surface, #fff));
      color: var(--cyan, #0b9fbe); padding: 9px 13px; font-size: .83rem;
    }
    .period-picker { border: 1px solid var(--line, #ddd); background: var(--surface, #fff); border-radius: 16px; margin-top: 8px; overflow: hidden; box-shadow: 0 12px 35px #0002; }
    .picker-main { display: grid; grid-template-columns: 158px minmax(0, 1fr); }
    .picker-presets { display: grid; align-content: start; gap: 2px; padding: 9px; border-right: 1px solid var(--line, #ddd); }
    .picker-presets button { padding: 11px 8px; text-align: left; border: 0; border-radius: 8px; background: none; font-size: .79rem; min-height: 36px; }
    .picker-presets button.chosen, .picker-presets button:hover { background: color-mix(in srgb, var(--cyan, #0b9fbe) 14%, var(--surface, #fff)); }
    .picker-calendar { min-width: 0; padding: 12px; }
    .picker-month { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 10px; }
    .picker-month strong { font-size: .93rem; text-align: center; }
    .picker-month button { background: transparent; border: 0; min-width: 34px; min-height: 40px; font-size: 1.5rem; }
    .picker-weekdays, .picker-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; }
    .picker-weekdays { color: var(--muted, #777); font-size: .77rem; margin-bottom: 5px; }
    .picker-weekdays span { padding: 8px 0; }
    .picker-days button { border: 0; background: transparent; border-radius: 50%; aspect-ratio: 1; min-width: 0; padding: 0; font-size: .84rem; }
    .picker-days button.outside { color: var(--muted, #aaa); opacity: .55; }
    .picker-days button.today { outline: 1px solid var(--cyan, #0b9fbe); outline-offset: -2px; }
    .picker-days button.in-range { background: color-mix(in srgb, var(--cyan, #0b9fbe) 20%, transparent); border-radius: 6px; }
    .picker-days button.selected { background: var(--cyan, #0b9fbe); color: white; font-weight: 700; }
    .picker-hint { font-size: .75rem; min-height: 18px; color: var(--muted, #777); margin: 9px 0 0; text-align: center; }
    .picker-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 12px; border-top: 1px solid var(--line, #ddd); }
    .picker-actions button { padding: 10px 15px; border: 0; border-radius: 999px; min-height: 44px; font-size: .85rem; }
    .picker-cancel { background: transparent; color: var(--cyan, #0b9fbe); }
    .picker-apply { background: var(--cyan, #0b9fbe); color: white; }
    @media (max-width: 500px) {
      .period-toolbar { padding: 4px; gap: 0; }
      .calendar-trigger,.period-step { flex-basis: 36px; width: 36px; height: 44px; }
      .period-label { font-size: .78rem; padding: 6px 1px; }
      .period-now { padding: 9px 7px; font-size: .77rem; }
      .picker-main { grid-template-columns: 1fr; }
      .picker-presets { display: flex; flex-wrap: nowrap; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line, #ddd); padding: 8px; }
      .picker-presets button { flex: 0 0 auto; padding: 8px 10px; }
      .picker-calendar { padding: 8px; }
      .picker-days button { min-height: 36px; }
      .picker-month { margin-bottom: 5px; }
    }
  `;
}
