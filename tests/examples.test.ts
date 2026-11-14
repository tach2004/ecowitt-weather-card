import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const read = (name: string) =>
  parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8"));

test("Panel example is one complete view containing the unconfigured card", () => {
  const view = read("view-panel.yaml");
  assert.equal(view.type, "panel");
  assert.equal(view.title, "Wetter");
  assert.equal(view.cards.length, 1);
  assert.equal(view.cards[0].type, "custom:ecowitt-weather-card");
  assert.equal(view.cards[0].entities, undefined);
  assert.equal(view.views, undefined);
});

test("Sections example spans one grid and uses the same card at full width", () => {
  const view = read("view-sections.yaml");
  assert.equal(view.type, "sections");
  assert.equal(view.sections.length, 1);
  assert.equal(view.sections[0].type, "grid");
  assert.equal(view.sections[0].column_span, view.max_columns);
  assert.equal(view.sections[0].cards.length, 1);
  const card = view.sections[0].cards[0];
  assert.equal(card.type, "custom:ecowitt-weather-card");
  assert.equal(card.grid_options.columns, "full");
  assert.equal(card.entities, undefined);
  assert.equal(view.views, undefined);
});

test("HACS metadata points at the single release bundle", () => {
  const hacs = JSON.parse(
    readFileSync(new URL("../hacs.json", import.meta.url), "utf8"),
  );
  assert.equal(hacs.filename, "ecowitt-weather-card.js");
  assert.equal(hacs.content_in_root, false);
  assert.equal(hacs.render_readme, true);
  assert.equal(hacs.hide_default_branch, true);
});
