#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CredentialError, clearStoredApiKey, configureApiKey } from "./credentials.mjs";

export async function runCredentialSetup(argv, dependencies = {}) {
  const options = parseArguments(argv);
  if (options.clear) {
    return await clearStoredApiKey(dependencies);
  }

  const apiKey = dependencies.inputText ?? (await readHiddenInput());
  return await configureApiKey(apiKey, { ...dependencies, replace: options.replace });
}

export function parseArguments(argv) {
  const options = { clear: false, replace: false };
  for (const argument of argv) {
    if (argument === "--clear") options.clear = true;
    else if (argument === "--replace") options.replace = true;
    else throw new CredentialError("invalid_arguments", "Only --replace and --clear are supported.");
  }
  if (options.clear && options.replace) {
    throw new CredentialError("invalid_arguments", "--clear and --replace cannot be used together.");
  }
  return options;
}

async function readHiddenInput(input = process.stdin, output = process.stderr) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    let value = "";
    input.setEncoding("utf8");
    for await (const chunk of input) value += chunk;
    return value;
  }

  output.write("Paste the NoneLinear API key (input hidden), then press Enter: ");
  return await new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") return finish(new CredentialError("cancelled", "Credential setup was cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\b" || character === "\u007f") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function failureResult(error) {
  if (error instanceof CredentialError) {
    return { status: "failed", error: error.message, code: error.code };
  }
  return { status: "failed", error: "Credential setup failed.", code: "internal_error" };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const result = await runCredentialSetup(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(failureResult(error))}\n`);
    process.exitCode = 1;
  }
}
