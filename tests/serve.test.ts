import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { once } from "node:events";
import { resolve, join } from "node:path";

async function startServer(
  cwd: string,
): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise<number>((accept, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Demo server did not start"));
    }, 10_000);
    let output = "";
    child.stdout!.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        accept(Number(match[1]));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Demo server exited before startup: ${code}`));
    });
  });
  return { child, port };
}

// Raw request paths deliberately preserve dot segments that fetch/URL normalize.
function get(
  port: number,
  path: string,
): Promise<{ status: number; body: string; type: string }> {
  return new Promise((accept, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, method: "GET" },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          accept({
            status: response.statusCode!,
            body,
            type: String(response.headers["content-type"] ?? ""),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("demo serves public routes from a checkout nested under work and denies internals/traversal", async () => {
  await mkdir("work", { recursive: true });
  const scratch = await mkdtemp(resolve("work/serve-regression-"));
  const checkout = join(scratch, "work", "checkout");
  let child: ChildProcess | undefined;
  try {
    await Promise.all(
      ["scripts", "demo", "dist", ".git", "work", "src"].map((dir) =>
        mkdir(join(checkout, dir), { recursive: true }),
      ),
    );
    await copyFile(
      resolve("scripts/serve.mjs"),
      join(checkout, "scripts/serve.mjs"),
    );
    await Promise.all([
      writeFile(
        join(checkout, "demo/index.html"),
        "<!doctype html><title>Synthetic demo fixture</title>",
      ),
      writeFile(
        join(checkout, "demo/generic-image.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
      ),
      writeFile(
        join(checkout, "dist/ecowitt-weather-card.js"),
        "export const syntheticFixture = true;",
      ),
      writeFile(join(checkout, ".git/config"), "INTERNAL_FIXTURE_SENTINEL"),
      // This is dummy text, not a private image or user attachment.
      writeFile(
        join(checkout, "work/private.png"),
        "INTERNAL_FIXTURE_SENTINEL",
      ),
      writeFile(join(checkout, "src/internal.js"), "INTERNAL_FIXTURE_SENTINEL"),
    ]);
    const started = await startServer(checkout);
    child = started.child;
    assert.ok(started.port > 0, "PORT=0 must print the actual allocated port");
    for (const path of ["/", "/demo/index.html", "/demo/index.html?test=1"]) {
      const response = await get(started.port, path);
      assert.equal(response.status, 200, path);
      assert.match(response.body, /Synthetic demo fixture/);
      assert.match(response.type, /^text\/html/);
    }
    const bundle = await get(started.port, "/dist/ecowitt-weather-card.js");
    assert.equal(bundle.status, 200);
    assert.match(bundle.body, /syntheticFixture/);
    assert.match(bundle.type, /^text\/javascript/);
    const image = await get(started.port, "/demo/generic-image.svg");
    assert.equal(image.status, 200);
    assert.equal(image.type, "image/svg+xml");
    for (const path of [
      "/.git/config",
      "/work/private.png",
      "/src/internal.js",
      "/scripts/serve.mjs",
      "/demo/../.git/config",
      "/demo/../dist/ecowitt-weather-card.js",
      "/demo/%2e%2e/.git/config",
      "/%2e%2e/.git/config",
      "/%64emo/index.html",
      "//demo/index.html",
      "/dist/ecowitt-weather-card.js/../other.js",
    ]) {
      const response = await get(started.port, path);
      assert.ok(
        [403, 404].includes(response.status),
        `${path}: expected denied route, got ${response.status}`,
      );
      assert.ok(!response.body.includes("INTERNAL_FIXTURE_SENTINEL"), path);
    }
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
