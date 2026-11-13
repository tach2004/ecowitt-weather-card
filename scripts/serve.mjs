import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(".");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
const port = Number(process.env.PORT || 4173);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url || "/", "http://localhost").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/demo/index.html" : pathname),
    );
    if (
      !path.startsWith(root + sep) ||
      path.includes(`${sep}.git${sep}`) ||
      path.includes(`${sep}work${sep}`)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (!(await stat(path)).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const bytes = await readFile(path);
    res
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Local synthetic demo: http://127.0.0.1:${port}\n`),
);
