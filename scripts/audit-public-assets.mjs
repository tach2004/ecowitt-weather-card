/** Read-only publication guard. Geometry and screenshots still need human review. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const screenshotPaths = new Set([
  "docs/screenshots/desktop.png",
  "docs/screenshots/mobile.png",
]);
const svgAssetPaths = new Set([
  "assets/generic-site.svg",
  "src/assets/generic-site.svg",
  "demo/generic-image.svg",
]);
const maxBlobBytes = 24 * 1024 * 1024;

export function forbiddenPath(path) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return (
    /(^|\/)(private|private-assets|private_assets|bilder|local_assets)(\/|$)/.test(
      normalized,
    ) ||
    /(?:_privat|\.private|_priv)(?:\.|$)/.test(normalized) ||
    /(?:original_luftbild|finales_dashboard_design|grundstueck_4zu3|grundstueck_quadrat|ecowitt_card_design_reference|beleuchteter_garten_mit_modernem_wohnhaus|grafik\(9\))/.test(
      normalized,
    )
  );
}

export function imageKind(data) {
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "jpeg";
  if (/^GIF8[79]a/.test(data.subarray(0, 6).toString("ascii"))) return "gif";
  if (
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (data.subarray(0, 2).toString("ascii") === "BM") return "bmp";
  if (["II*\0", "MM\0*"].includes(data.subarray(0, 4).toString("ascii")))
    return "tiff";
  if (
    data.subarray(4, 8).toString("ascii") === "ftyp" &&
    /avif|heic|heix|mif1/.test(data.subarray(8, 32).toString("ascii"))
  )
    return "avif/heif";
  return undefined;
}

export function inspectAsset(path, data) {
  const findings = [];
  const assets = [];
  if (forbiddenPath(path)) findings.push("private asset filename or directory");
  const kind = imageKind(data);
  const digest = createHash("sha256").update(data).digest("hex");
  if (kind) {
    assets.push({ path, kind, sha256: digest, bytes: data.length });
    if (!screenshotPaths.has(path) || kind !== "png")
      findings.push("raster image outside reviewed screenshot allowlist");
  }
  if (!kind && data.includes(0))
    findings.push("opaque binary payload requires manual review");
  if (/\.(?:zip|tar|tgz|gz|7z|rar)$/i.test(path))
    findings.push("archive payload requires separate content review");
  const text = data.includes(0) ? "" : data.toString("utf8");
  // Match an actual payload, not documentation mentioning the data:image syntax.
  if (
    /data\s*:\s*image\/[\w.+-]+(?:;[^,\s"'<>]*)?,[A-Za-z0-9+/%][A-Za-z0-9+/%=]{31,}/i.test(
      text,
    )
  ) {
    findings.push("embedded image data URI");
  }
  // Catch common raster signatures even when an image is hidden in a JSON/base64 string.
  if (
    /(?:iVBORw0KGgo[A-Za-z0-9+/]{40,}|\/9j\/[A-Za-z0-9+/]{40,}|R0lGOD[lh][A-Za-z0-9+/]{40,}|UklGR[A-Za-z0-9+/]{60,})/.test(
      text,
    )
  ) {
    findings.push("embedded raster base64 payload");
  }
  const svg = /<svg(?:\s|>)/i.test(text);
  if (svg) {
    assets.push({
      path,
      kind: path.endsWith(".svg") ? "svg" : "inline-svg-source",
      sha256: digest,
      bytes: data.length,
    });
    if (path.endsWith(".svg") && !svgAssetPaths.has(path))
      findings.push("SVG asset outside generic illustration allowlist");
    // Static raster/remote references inside an SVG can conceal copied imagery.
    // Dynamic href bindings in the card are expected: they display the user's HA-local URL at runtime.
    if (
      /<image\b[^>]*(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i.test(
        text,
      )
    ) {
      findings.push("SVG embeds a static remote or encoded image");
    }
  }
  if (!kind && /\.(?:png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i.test(path)) {
    findings.push("unrecognized image file; manual review required");
  }
  return { findings: [...new Set(findings)], assets };
}

function selfTest() {
  assert(forbiddenPath("assets/renamed_PRIVAT.png"));
  assert(forbiddenPath("private-assets/renamed.txt"));
  assert(!forbiddenPath("docs/PRIVATE_IMAGES.md"));
  assert.equal(imageKind(Buffer.from([255, 216, 255, 224])), "jpeg");
  assert(
    inspectAsset("renamed.txt", Buffer.from([255, 216, 255, 224])).findings
      .length,
  );
  assert.equal(
    inspectAsset(
      "docs/screenshots/mobile.png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ).findings.length,
    0,
  );
  assert(
    inspectAsset(
      "asset.js",
      Buffer.from(
        'const x="data:image/png;base64,iVBORw0KGgo' + "A".repeat(70) + '"',
      ),
    ).findings.includes("embedded image data URI"),
  );
  assert.equal(
    inspectAsset(
      "README.md",
      Buffer.from("Do not embed data:image in the release."),
    ).findings.length,
    0,
  );
  assert(
    inspectAsset(
      "assets/generic-site.svg",
      Buffer.from(
        "<svg><image h" + 'ref="https://example.test/photo.png"/></svg>',
      ),
    ).findings.length,
  );
  assert.equal(
    inspectAsset(
      "assets/generic-site.svg",
      Buffer.from('<svg><rect width="10" height="10"/></svg>'),
    ).findings.length,
    0,
  );
  console.log("Privacy guard self-test: 10 checks passed.");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const cwd = process.cwd();
  const git = (args, encoding = "utf8") =>
    execFileSync("git", ["-C", cwd, ...args], {
      encoding,
      maxBuffer: 64 * 1024 * 1024,
    });
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  if (resolve(root) !== resolve(cwd))
    throw new Error("Run the audit from the repository root.");
  const failures = [];
  const reported = new Map();
  let checked = 0;
  const inspect = (path, data, source) => {
    checked++;
    const result = inspectAsset(path, data);
    for (const finding of result.findings)
      failures.push(`${source}: ${path}: ${finding}`);
    for (const asset of result.assets)
      reported.set(`${path}:${asset.sha256}`, { ...asset, source });
  };
  const candidates = new Set(
    git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
      .split("\0")
      .filter(Boolean),
  );
  const walk = (dir) => {
    try {
      for (const item of readdirSync(resolve(root, dir), {
        withFileTypes: true,
      })) {
        const path = `${dir}/${item.name}`;
        if (item.isDirectory()) walk(path);
        else candidates.add(path);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
  // dist is ignored by Git but is the exact HACS publication candidate.
  walk("dist");
  for (const path of candidates) {
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root + sep)) {
      failures.push(`working tree: invalid path ${path}`);
      continue;
    }
    try {
      const stat = lstatSync(absolute);
      if (
        stat.isSymbolicLink() ||
        !realpathSync(absolute).startsWith(root + sep)
      ) {
        failures.push(
          `working tree: symlink or escaped path requires review ${path}`,
        );
        continue;
      }
      if (!stat.isFile()) {
        failures.push(`working tree: unexpected non-file ${path}`);
        continue;
      }
      if (stat.size > maxBlobBytes) {
        failures.push(`working tree: oversized file requires review ${path}`);
        continue;
      }
      inspect(path, readFileSync(absolute), "working tree");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  // Scan the actual index: a private image removed locally can still be staged.
  const staged = git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean);
  const checkedIndex = new Set();
  for (const entry of staged) {
    const [metadata, path] = entry.split("\t");
    const [, sha] = metadata.split(" ");
    const key = `${path}:${sha}`;
    if (!checkedIndex.has(key)) {
      inspect(path, git(["cat-file", "blob", sha], null), "Git index");
      checkedIndex.add(key);
    }
  }
  // Check every historical path independently: rev-list chooses only one path for duplicate blobs.
  for (const path of git(["log", "--all", "--format=", "--name-only", "-z"])
    .split("\0")
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (forbiddenPath(path))
      failures.push(
        `Git history: ${path}: private asset filename or directory`,
      );
  }
  for (const line of git(["rev-list", "--objects", "--all"])
    .split("\n")
    .filter(Boolean)) {
    const space = line.indexOf(" ");
    if (space < 0) continue;
    const sha = line.slice(0, space);
    const path = line.slice(space + 1);
    if (git(["cat-file", "-t", sha]).trim() !== "blob") continue;
    const size = Number(git(["cat-file", "-s", sha]).trim());
    if (size > maxBlobBytes) {
      failures.push(`Git history: oversized blob requires review ${path}`);
      continue;
    }
    inspect(path, git(["cat-file", "blob", sha], null), "Git history");
  }
  console.log(
    `Publication audit: checked ${checked} working-tree, index and historical file versions.`,
  );
  for (const asset of reported.values())
    console.log(`REVIEW ${JSON.stringify(asset)}`);
  if (failures.length) {
    console.error([...new Set(failures)].join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "No forbidden image payloads or paths detected. Review the listed SVG geometry and screenshots visually before publication.",
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
