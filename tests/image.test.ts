import test from "node:test";
import assert from "node:assert/strict";
import { localImageUrl, resolveImage } from "../src/image";
import type { HomeAssistant } from "../src/types";
const origin = "https://ha.example.invalid";
test("local image paths and absolute URLs stay on the selected HA origin", () => {
  assert.equal(
    localImageUrl("/local/generic-example.svg", origin),
    `${origin}/local/generic-example.svg`,
  );
  assert.equal(
    localImageUrl(`${origin}/api/media/file?authSig=fixture`, origin),
    `${origin}/api/media/file?authSig=fixture`,
  );
  assert.equal(
    localImageUrl("//ha.example.invalid/local/example.svg", origin),
    `${origin}/local/example.svg`,
  );
});
test("foreign hosts, protocols, credentials and protocol changes are rejected before image fetch", () => {
  for (const source of [
    "https://third-party.invalid/property.png",
    "//third-party.invalid/property.png",
    "http://ha.example.invalid/local/example.svg",
    "https://ha.example.invalid:444/local/example.svg",
    "https://user:password@ha.example.invalid/local/example.svg",
    "https://ha.example.invalid.third-party.invalid/local/example.svg",
    "data:image/svg+xml,<svg/>",
    "blob:https://ha.example.invalid/fixture",
    "javascript:alert(1)",
    "file:///tmp/property.png",
    "",
  ])
    assert.throws(() => localImageUrl(source, origin), source);
});
test("HA Media resolution uses only the native websocket request and checks the resolved origin", async () => {
  const calls: Record<string, unknown>[] = [];
  const hass: HomeAssistant = {
    states: {},
    callWS: async <T>(message: Record<string, unknown>): Promise<T> => {
      calls.push(message);
      return { url: "/api/media/file?authSig=fixture" } as T;
    },
  };
  const source = "media-source://media_source/local/generic-example.svg";
  assert.equal(
    await resolveImage(hass, source, origin),
    `${origin}/api/media/file?authSig=fixture`,
  );
  assert.deepEqual(calls, [
    { type: "media_source/resolve_media", media_content_id: source },
  ]);
  const external: HomeAssistant = {
    states: {},
    callWS: async <T>(): Promise<T> =>
      ({ url: "https://third-party.invalid/property.png" }) as T,
  };
  await assert.rejects(
    resolveImage(external, source, origin),
    /Home-Assistant-Instanz/,
  );
  await assert.rejects(
    resolveImage({ states: {} }, source, origin),
    /HA-Media/,
  );
});
test("direct local source resolves without a websocket call or uploading image bytes", async () => {
  const hass: HomeAssistant = {
    states: {},
    callWS: async () => {
      throw new Error("unexpected request");
    },
  };
  assert.equal(
    await resolveImage(hass, "/local/generic-example.svg", origin),
    `${origin}/local/generic-example.svg`,
  );
});
