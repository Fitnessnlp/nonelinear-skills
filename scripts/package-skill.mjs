#!/usr/bin/env node

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.3.0";
const dist = path.join(root, "dist");
const source = path.join(root, "skills", "nonelinear-image");
const work = path.join(dist, ".pack-nonelinear-image");
const artifacts = [
  `nonelinear-image-${version}.zip`,
  `nonelinear-image-${version}.tgz`
];

await mkdir(dist, { recursive: true });
for (const artifact of artifacts) {
  await rm(path.join(dist, artifact), { force: true });
}
await rm(work, { force: true, recursive: true });
await mkdir(work, { recursive: true });
await cp(source, path.join(work, "nonelinear-image"), {
  recursive: true,
  filter: (sourcePath) => path.basename(sourcePath) !== ".DS_Store"
});

archive("zip", artifacts[0]);
archive("tgz", artifacts[1]);

const checksums = [];
for (const artifact of artifacts) {
  const bytes = await readFile(path.join(dist, artifact));
  checksums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${artifact}`);
}
await writeFile(path.join(dist, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");
await rm(work, { force: true, recursive: true });
process.stdout.write(`${artifacts.join("\n")}\nSHA256SUMS\n`);

function archive(format, filename) {
  const output = path.join(dist, filename);
  const command = format === "zip" ? "zip" : "tar";
  const args =
    format === "zip" ? ["-qr", output, "nonelinear-image"] : ["-czf", output, "nonelinear-image"];
  const result = spawnSync(command, args, { cwd: work, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${command} archive failed.\n`);
    process.exit(result.status ?? 1);
  }
}
