import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/ecowitt-weather-card.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/ecowitt-weather-card.js",
  minify: true,
  legalComments: "eof",
});
