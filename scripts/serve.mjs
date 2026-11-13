import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
// Exact routes keep the local demo independent of checkout directory names and
// prevent serving repository internals, traversal paths or private scratch files.
const routes = new Map([
  ["/", ["demo/index.html", "text/html; charset=utf-8"]],
  ["/demo/index.html", ["demo/index.html", "text/html; charset=utf-8"]],
  ["/demo/generic-image.svg", ["demo/generic-image.svg", "image/svg+xml"]],
  [
    "/dist/ecowitt-weather-card.js",
    ["dist/ecowitt-weather-card.js", "text/javascript; charset=utf-8"],
  ],
]);
const port = Number(process.env.PORT ?? 4173);
const server = createServer(async (req, res) => {
  // Do not normalize or decode paths: encoded aliases and dot-segment traversal
  // must not become one of the explicitly allowed public routes.
  const route = routes.get((req.url ?? "/").split("?")[0]);
  if (!route) {
    res.writeHead(404).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const [relativePath, contentType] = route;
    const bytes = await readFile(resolve(root, relativePath));
    res
      .writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    process.stdout.write(
      `Local synthetic demo: http://127.0.0.1:${address.port}\n`,
    );
  }
});
