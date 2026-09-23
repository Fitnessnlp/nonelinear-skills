import { chmod, mkdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

export const CREDENTIAL_VERSION = 1;
export const VERIFY_ENDPOINT = "https://api.nonelinear.com.cn/v1/models";

export class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

export function credentialFilePath(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const base = clean(env.APPDATA) ?? (clean(env.USERPROFILE) ? path.win32.join(env.USERPROFILE, "AppData", "Roaming") : undefined);
    if (!base) throw new CredentialError("credential_path_unavailable", "The Windows user profile path is unavailable.");
    return path.win32.join(base, "NoneLinear", "credentials.json");
  }

  const base = clean(env.XDG_CONFIG_HOME) ?? (clean(env.HOME) ? path.posix.join(env.HOME, ".config") : undefined);
  if (!base) throw new CredentialError("credential_path_unavailable", "The user configuration path is unavailable.");
  return path.posix.join(base, "nonelinear", "credentials.json");
}

export function readStoredApiKey(env = process.env, options = {}) {
  const file = credentialFilePath(env, options.platform);
  let text;
  try {
    text = (options.readFileSyncImpl ?? readFileSync)(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw new CredentialError("credential_file_unreadable", "The NoneLinear credential file could not be read.");
  }

  try {
    const stored = JSON.parse(text);
    if (stored.version !== CREDENTIAL_VERSION) throw new Error("version");
    return validateApiKey(stored.api_key);
  } catch {
    throw new CredentialError("credential_file_invalid", "The NoneLinear credential file is invalid.");
  }
}

export function resolveApiKey(env = process.env, options = {}) {
  const direct = clean(env.NONELINEAR_API_KEY) ?? clean(env.Nonelinear_API_KEY);
  if (direct) return direct;

  if (isNoneLinearHttpsUrl(env.OPENAI_BASE_URL)) {
    const openAiKey = clean(env.OPENAI_API_KEY);
    if (openAiKey) return openAiKey;
  }

  if (isNoneLinearHttpsUrl(env.ANTHROPIC_BASE_URL)) {
    const anthropicKey = clean(env.ANTHROPIC_AUTH_TOKEN) ?? clean(env.ANTHROPIC_API_KEY);
    if (anthropicKey) return anthropicKey;
  }

  try {
    return readStoredApiKey(env, options);
  } catch (error) {
    if (error instanceof CredentialError && error.code === "credential_path_unavailable") return undefined;
    throw error;
  }
}

export async function configureApiKey(apiKey, options = {}) {
  const key = validateApiKey(apiKey);
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const file = credentialFilePath(env, platform);

  if (typeof fetchImpl !== "function") {
    throw new CredentialError("unsupported_runtime", "Node.js 18 or newer with built-in fetch is required.");
  }

  if (!options.replace && (await exists(file))) {
    throw new CredentialError("credential_exists", "A NoneLinear credential is already configured. Confirm replacement first.");
  }

  let response;
  try {
    response = await fetchImpl(VERIFY_ENDPOINT, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new CredentialError("credential_verification_failed", "The API key could not be verified because the network request failed.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new CredentialError("invalid_api_key", "The NoneLinear API key is invalid or unauthorized.");
  }
  if (!response.ok) {
    throw new CredentialError("credential_verification_failed", `The API key verification endpoint returned HTTP ${response.status}.`);
  }

  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch((error) => {
    if (platform !== "win32") throw error;
  });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify({ version: CREDENTIAL_VERSION, api_key: key })}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    await chmod(temporary, 0o600).catch((error) => {
      if (platform !== "win32") throw error;
    });
    if (options.replace && platform === "win32") await rm(file, { force: true });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (error instanceof CredentialError) throw error;
    throw new CredentialError("credential_write_failed", "The NoneLinear credential could not be saved.");
  }

  return { status: "configured", credential_file: file, verification: "passed" };
}

export async function clearStoredApiKey(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const file = credentialFilePath(env, platform);
  try {
    await unlink(file);
    return { status: "cleared", credential_file: file, existed: true };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "cleared", credential_file: file, existed: false };
    throw new CredentialError("credential_clear_failed", "The NoneLinear credential could not be removed.");
  }
}

export function validateApiKey(value) {
  const key = clean(value);
  if (!key || key.length < 8 || key.length > 4096 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new CredentialError("invalid_api_key", "The NoneLinear API key format is invalid.");
  }
  return key;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new CredentialError("credential_file_unreadable", "The NoneLinear credential file could not be checked.");
  }
}

function clean(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isNoneLinearHttpsUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      ["api.nonelinear.com.cn", "api.nonelinear.com"].includes(parsed.hostname.toLowerCase()) &&
      (parsed.port === "" || parsed.port === "443")
    );
  } catch {
    return false;
  }
}
