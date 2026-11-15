import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceLabel,
  type SourceLabelConfig,
  type SourceRegistry,
} from "../src/source-label";
import type { HassEntity, HomeAssistant } from "../src/types";

const id = "sensor.fixture_temperature";
const state = (entity_id: string, friendly_name?: string): HassEntity => ({
  entity_id,
  state: "18",
  attributes: { friendly_name },
});
const hass = (friendly_name?: string): HomeAssistant => ({
  states: { [id]: state(id, friendly_name) },
});
const config: SourceLabelConfig = { type: "custom:ecowitt-weather-card" };
const registry = (model: string): SourceRegistry => ({
  devices: [{ id: "fixture-device", model }],
  entities: [{ entity_id: id, device_id: "fixture-device" }],
});

test("actual registry source replaces a preferred WN32 label hint with WS90", () => {
  assert.equal(
    sourceLabel(
      hass("Außentemperatur"),
      config,
      id,
      "Außentemperatur · WN32 bevorzugt",
      registry("wh90"),
    ),
    "Außentemperatur · WS90",
  );
  assert.equal(
    sourceLabel(
      hass(),
      config,
      id,
      "Außentemperatur · WN32 bevorzugt",
      registry("wh90"),
    ),
    "Außentemperatur · WS90",
  );
  assert.equal(
    sourceLabel(
      hass("Garten WN32"),
      config,
      id,
      "Außentemperatur · WN32 bevorzugt",
      registry("wh90"),
    ),
    "Garten · WS90",
  );
});

test("actual optional climate, extra-channel and gateway model roles stay distinct", () => {
  assert.equal(
    sourceLabel(hass("Außenklima"), config, id, "Temperatur", registry("wh32")),
    "Außenklima · WN32",
  );
  assert.equal(
    sourceLabel(hass("Gewächshaus"), config, id, undefined, registry("wh31")),
    "Gewächshaus · WN31",
  );
  assert.equal(
    sourceLabel(
      hass("Relativer Luftdruck"),
      config,
      id,
      "Luftdruck · GW3000",
      registry("GW3000A"),
    ),
    "Relativer Luftdruck · GW3000",
  );
});

test("saved device roles require an actual entity-to-device link", () => {
  const saved: SourceLabelConfig = {
    ...config,
    device_roles: { GW3000: "fixture-manual-gateway" },
  };
  const actual: SourceRegistry = {
    devices: [{ id: "fixture-manual-gateway", model: "Gateway" }],
    entities: [{ entity_id: id, device_id: "fixture-manual-gateway" }],
  };
  assert.equal(
    sourceLabel(hass("Luftdruck"), saved, id, "Luftdruck · GW3000", actual),
    "Luftdruck · GW3000",
  );
  assert.equal(
    sourceLabel(hass("Luftdruck"), saved, id, "Luftdruck · GW3000"),
    "Luftdruck",
  );
  assert.equal(
    sourceLabel(hass("Luftdruck"), saved, id, "Luftdruck · GW3000", {
      ...actual,
      entities: [{ entity_id: id, device_id: "fixture-other" }],
    }),
    "Luftdruck",
  );
});

test("explicit per-device source membership works without registry and ambiguous assignments stay neutral", () => {
  const saved: SourceLabelConfig = {
    ...config,
    device_status: [{ device_id: "fixture-rain", role: "WH40", battery: id }],
  };
  assert.equal(sourceLabel(hass("Batterie"), saved, id), "Batterie · WH40");
  saved.device_status![0] = {
    device_id: "fixture-extra",
    role: "WN31",
    extra_entities: [id],
  };
  assert.equal(
    sourceLabel(hass("Gewächshaus"), saved, id),
    "Gewächshaus · WN31",
  );
  saved.device_status!.push({
    device_id: "fixture-climate",
    role: "WN32",
    extra_entities: [id],
  });
  assert.equal(sourceLabel(hass("Gewächshaus"), saved, id), "Gewächshaus");
});

test("registry model evidence wins over mismatched saved assignments", () => {
  const saved: SourceLabelConfig = {
    ...config,
    device_roles: { GW3000: "fixture-device" },
    device_status: [
      { device_id: "fixture-other", role: "WN32", extra_entities: [id] },
    ],
  };
  assert.equal(
    sourceLabel(
      hass("Außentemperatur"),
      saved,
      id,
      "Temperatur · WN32 bevorzugt",
      registry("wh90"),
    ),
    "Außentemperatur · WS90",
  );
});

test("unknown source uses readable friendly name or a neutral metric, never entity-ID inference", () => {
  assert.equal(sourceLabel(hass("WS90 Garten"), config, id), "WS90 Garten");
  assert.equal(
    sourceLabel(hass(), config, id, "Außentemperatur · WN32 bevorzugt"),
    "Außentemperatur",
  );
  assert.equal(
    sourceLabel(hass(id), config, id, "Temperatur · WS90"),
    "Temperatur",
  );
  assert.equal(sourceLabel(undefined, config, id), "Quelle");
  const technical = "sensor.fixture_ws90_temperature";
  assert.equal(
    sourceLabel(
      { states: { [technical]: state(technical, "Garten") } },
      config,
      technical,
    ),
    "Garten",
  );
  assert.equal(
    sourceLabel(
      { states: { [technical]: state(technical, technical) } },
      config,
      technical,
    ),
    "Quelle",
  );
});

test("human names retain user wording and avoid duplicated compact source names", () => {
  assert.equal(
    sourceLabel(
      hass("Terrasse · WS90"),
      config,
      id,
      "Temperatur",
      registry("wh90"),
    ),
    "Terrasse · WS90",
  );
  assert.equal(
    sourceLabel(
      hass("GW3000A · Relativer Luftdruck"),
      config,
      id,
      undefined,
      registry("GW3000A"),
    ),
    "Relativer Luftdruck · GW3000",
  );
});

test("source labeling is pure and never queries HA or mutates saved selections", () => {
  const input: SourceLabelConfig = {
    ...config,
    device_status: [
      { device_id: "fixture-extra", role: "WN31", extra_entities: [id] },
    ],
  };
  const metadata = registry("wh31");
  const before = structuredClone({ input, metadata });
  const source = hass("Beet");
  source.callWS = async () => {
    throw new Error("Label rendering must not call HA");
  };
  assert.equal(
    sourceLabel(source, input, id, "Temperatur", metadata),
    "Beet · WN31",
  );
  assert.deepEqual({ input, metadata }, before);
});
