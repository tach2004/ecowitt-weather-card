import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("publication guard detects renamed images, embedded payloads and private paths", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/audit-public-assets.mjs", "--self-test"],
    { encoding: "utf8" },
  );
  assert.match(output, /10 checks passed/);
});
