#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.2.0";
const dist = path.join(root, "dist");
const artifacts = [
  `nonelinear-image-${version}.zip`,
  `nonelinear-image-${version}.tgz`
];

await mkdir(dist, { recursive: true });
for (const artifact of artifacts) {
  await rm(path.join(dist, artifact), { force: true });
}

archive("zip", artifacts[0]);
archive("tar.gz", artifacts[1]);

const checksums = [];
for (const artifact of artifacts) {
  const bytes = await readFile(path.join(dist, artifact));
  checksums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${artifact}`);
}
await writeFile(path.join(dist, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");
process.stdout.write(`${artifacts.join("\n")}\nSHA256SUMS\n`);

function archive(format, filename) {
  const result = spawnSync(
    "git",
    [
      "archive",
      `--format=${format}`,
      "--prefix=nonelinear-image/",
      `--output=${path.join(dist, filename)}`,
      "HEAD:skills/nonelinear-image"
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "git archive failed.\n");
    process.exit(result.status ?? 1);
  }
}
