#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skills", "nonelinear-image");
const requiredFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/image-api.md",
  "references/models.md",
  "scripts/generate-image.mjs"
];
const blockedNames = new Set([".env", "node_modules", ".DS_Store"]);
const placeholderPatterns = [
  /authorization:\s*bearer\s+(?!<|\[|"nl-xxx")[^\s"']+/i,
  /\b(?:NONELINEAR_API_KEY|Nonelinear_API_KEY)\s*=\s*(?!["']?nl-xxx\b)[^\s]+/
];

for (const relativePath of requiredFiles) {
  await readFile(path.join(skillRoot, relativePath), "utf8");
}

const skillText = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1];
if (
  !frontmatter ||
  !/^name:\s*nonelinear-image\s*$/m.test(frontmatter) ||
  !/^description:\s*\S.+$/m.test(frontmatter)
) {
  fail("SKILL.md must contain valid name and description frontmatter.");
}
if (!skillText.includes('version: "0.2.0"')) {
  fail("SKILL.md version must match release version 0.2.0.");
}

const files = await walk(root);
for (const filePath of files) {
  const relativePath = path.relative(root, filePath);
  const segments = relativePath.split(path.sep);
  if (segments.some((segment) => blockedNames.has(segment))) {
    fail(`Blocked release path found: ${relativePath}`);
  }
  if (relativePath.startsWith(`dist${path.sep}`)) continue;

  const text = await readFile(filePath, "utf8").catch(() => "");
  for (const pattern of placeholderPatterns) {
    if (pattern.test(text)) {
      fail(`Possible credential found in ${relativePath}`);
    }
  }
}

process.stdout.write(`Validated ${files.length} repository files; no blocked paths or credentials found.\n`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
