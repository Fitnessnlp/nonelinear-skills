#!/usr/bin/env node

import path from "node:path";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const MODEL_CAPABILITY_REGISTRY = require("../references/model-capabilities.json");
export const MODEL_CAPABILITY_REGISTRY_VERSION = MODEL_CAPABILITY_REGISTRY.version;
const MODEL_CAPABILITY_BY_ID = new Map(
  MODEL_CAPABILITY_REGISTRY.models.map((capability) => [capability.id, capability])
);
const FAMILY_CAPABILITY_BY_ID = new Map();
for (const family of MODEL_CAPABILITY_REGISTRY.families ?? []) {
  for (const id of family.model_ids ?? []) {
    FAMILY_CAPABILITY_BY_ID.set(id, family);
  }
}

export const API_ENDPOINT = MODEL_CAPABILITY_REGISTRY.endpoints.image_generation;
export const UPLOAD_ENDPOINT = MODEL_CAPABILITY_REGISTRY.endpoints.local_upload;
export const DEFAULT_MODEL = MODEL_CAPABILITY_REGISTRY.defaults.model;
export const DEFAULT_TIMEOUT_MS = MODEL_CAPABILITY_REGISTRY.defaults.request_timeout_ms;
export const SEEDREAM_5_MODEL = "doubao-seedream-5-0-pro-260628";
export const SEEDREAM_5_TIMEOUT_MS =
  modelCapabilityFor(SEEDREAM_5_MODEL)?.request_timeout_ms ?? 600_000;

const OPERATIONS = new Set(["generate", "edit", "fuse"]);
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const ASPECT_RATIO_PATTERN = /^(?:auto|[1-9]\d*:[1-9]\d*)$/;
const MAX_REFERENCE_IMAGES = 16;
const IMAGE_SUFFIXES = new Set(MODEL_CAPABILITY_REGISTRY.local_upload.allowed_file_extensions);

export class SkillError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SkillError";
    this.code = code;
  }
}

export function parseArguments(argv) {
  const values = { references: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new SkillError("invalid_arguments", "Unexpected positional argument.");
    }

    const equalsIndex = token.indexOf("=");
    const name = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
    const key = optionKey(name);

    let value = inlineValue;
    if (value === undefined) {
      index += 1;
      value = argv[index];
    }
    if (value === undefined || value.length === 0) {
      throw new SkillError("invalid_arguments", `${name} requires a value.`);
    }
    if (key === "imageUrl") {
      values.references.push({ kind: "url", url: validateImageUrl(value) });
    } else if (key === "imageFile") {
      values.references.push(validateImageFile(value));
    } else {
      values[key] = value;
    }
  }

  const prompt = normalizeRequired(values.prompt, "--prompt");
  const model = (values.model ?? DEFAULT_MODEL).trim();
  if (!MODEL_PATTERN.test(model)) {
    throw new SkillError("invalid_arguments", "--model contains unsupported characters.");
  }
  const modelCapability = modelCapabilityFor(model);
  if (modelCapability?.status === "candidate") {
    throw new SkillError("not_implemented", `${model} is documented but not connected by this Skill.`);
  }

  const responseFormat = (values.responseFormat ?? "url").trim();
  if (responseFormat !== "url") {
    throw new SkillError("invalid_arguments", "--response-format must be url; base64 output is disabled.");
  }

  const aspectRatio = normalizeOptional(values.aspectRatio);
  if (aspectRatio && !ASPECT_RATIO_PATTERN.test(aspectRatio)) {
    throw new SkillError("invalid_arguments", "--aspect-ratio must be a ratio such as 1:1 or 16:9.");
  }
  if (aspectRatio) {
    validateRegistryParameterValue(modelCapability, model, "aspect_ratio", aspectRatio, "--aspect-ratio");
  }

  const size = normalizeOptional(values.size);
  if (size && (size.length > 64 || /[\u0000-\u001f\u007f]/.test(size))) {
    throw new SkillError("invalid_arguments", "--size is invalid.");
  }
  if (size) {
    if (model === "gpt-image-2") {
      validateGptImage2Size(size);
    } else {
      validateRegistryParameterValue(modelCapability, model, "size", size, "--size");
    }
  }

  const quality = normalizeOptional(values.quality);
  if (quality) {
    validateRegistryParameterValue(modelCapability, model, "quality", quality, "--quality");
  }

  let n;
  if (values.n !== undefined) {
    n = Number(values.n);
    validateRegistryIntegerParameter(modelCapability, model, "n", n, "--n");
  }

  const outputFormat = normalizeOptional(values.outputFormat)?.toLowerCase();
  if (outputFormat) {
    validateRegistryParameterValue(modelCapability, model, "output_format", outputFormat, "--output-format");
  }

  const background = normalizeOptional(values.background)?.toLowerCase();
  if (background) {
    validateRegistryParameterValue(modelCapability, model, "background", background, "--background");
  }

  const watermark = parseOptionalBoolean(values.watermark, "--watermark");
  if (watermark !== undefined) {
    validateRegistryBooleanParameter(modelCapability, model, "watermark", "--watermark");
  }

  const optimizePromptMode = normalizeOptional(values.optimizePromptMode)?.toLowerCase();
  if (optimizePromptMode) {
    validateRegistryParameterValue(
      modelCapability,
      model,
      "optimize_prompt_options.mode",
      optimizePromptMode,
      "--optimize-prompt-mode"
    );
  }

  const references = values.references;
  if (references.length > maxReferenceImagesForModel(model)) {
    throw new SkillError("invalid_arguments", "Too many reference images for the selected model.");
  }

  const operation = normalizeOptional(values.operation) ?? inferOperation(references.length);
  if (!OPERATIONS.has(operation)) {
    throw new SkillError("invalid_arguments", "--operation must be generate, edit, or fuse.");
  }
  validateModelOperation(modelCapability, model, operation, references.length);
  validateOperationImages(operation, references.length);
  if (background && operation !== "generate") {
    throw new SkillError("invalid_arguments", "--background is currently supported only for generation.");
  }
  if (background === "transparent" && !["png", "webp"].includes(outputFormat)) {
    throw new SkillError(
      "invalid_arguments",
      "--background transparent requires --output-format png or webp."
    );
  }

  return {
    operation,
    model,
    prompt,
    references,
    aspectRatio,
    size,
    quality,
    n,
    responseFormat,
    outputFormat,
    background,
    watermark,
    optimizePromptMode
  };
}

export function resolveApiKey(env) {
  const direct = normalizeOptional(env.NONELINEAR_API_KEY) ?? normalizeOptional(env.Nonelinear_API_KEY);
  if (direct) return direct;

  if (isNoneLinearHttpsUrl(env.OPENAI_BASE_URL)) {
    const openAiKey = normalizeOptional(env.OPENAI_API_KEY);
    if (openAiKey) return openAiKey;
  }

  if (isNoneLinearHttpsUrl(env.ANTHROPIC_BASE_URL)) {
    return normalizeOptional(env.ANTHROPIC_AUTH_TOKEN) ?? normalizeOptional(env.ANTHROPIC_API_KEY);
  }

  return undefined;
}

export async function generateImage(options, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const readFileImpl = dependencies.readFileImpl ?? readFile;
  const timeoutMs = dependencies.timeoutMs ?? requestTimeoutMsForModel(options.model);
  const apiKey = resolveApiKey(env);

  if (!apiKey) {
    throw new SkillError(
      "missing_api_key",
      "No NoneLinear API key is configured in the process environment."
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new SkillError("unsupported_runtime", "Node.js 18 or newer with built-in fetch is required.");
  }

  const references = options.references ?? (options.images ?? []).map((url) => ({ kind: "url", url }));
  const imageUrls = await resolveReferenceUrls(
    references,
    apiKey,
    fetchImpl,
    readFileImpl,
    timeoutMs,
    options.model
  );

  const body = {
    model: options.model,
    prompt: options.prompt,
    response_format: options.responseFormat
  };
  if (options.aspectRatio) body.aspect_ratio = options.aspectRatio;
  if (options.size) body.size = options.size;
  if (options.quality) body.quality = options.quality;
  if (options.n !== undefined) body.n = options.n;
  if (options.outputFormat) body.output_format = options.outputFormat;
  if (options.background) body.background = options.background;
  if (options.watermark !== undefined) body.watermark = options.watermark;
  if (options.optimizePromptMode) {
    body.optimize_prompt_options = { mode: options.optimizePromptMode };
  }
  if (imageUrls.length) {
    body.image = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new SkillError("network_error", "The NoneLinear image request timed out.");
    }
    throw new SkillError("network_error", "Unable to reach the NoneLinear image API.");
  } finally {
    clearTimeout(timeout);
  }

  let responseText;
  try {
    responseText = await response.text();
  } catch {
    throw new SkillError("network_error", "The NoneLinear image API response could not be read.");
  }
  const parsed = parseJsonObject(responseText);

  if (!response.ok) {
    const upstreamMessage = extractApiError(parsed);
    const safeMessage = redactSecret(upstreamMessage, apiKey);
    if (looksLikeInvalidModel(response.status, safeMessage)) {
      throw new SkillError("invalid_model", safeMessage || "The requested model is invalid or unavailable.");
    }
    throw new SkillError(
      "api_error",
      safeMessage || `The NoneLinear image API returned HTTP ${response.status}.`
    );
  }

  if (!parsed) {
    throw new SkillError("api_error", "The NoneLinear image API returned an invalid JSON response.");
  }

  const images = extractUrlImages(parsed.data);
  if (images.length === 0) {
    if (containsBase64Image(parsed.data)) {
      throw new SkillError(
        "base64_output_blocked",
        "The provider returned base64 image data without a URL. Base64 output was not emitted to protect agent context."
      );
    }
    const recitation = responseText.includes("IMAGE_RECITATION");
    throw new SkillError(
      "no_image_output",
      recitation
        ? "The provider stopped without producing an image (IMAGE_RECITATION). Revise the prompt before retrying."
        : "The provider completed without returning image data. Revise the prompt before retrying."
    );
  }

  return {
    status: "completed",
    operation: options.operation,
    model: options.model,
    images,
    request_id: extractRequestId(response, parsed)
  };
}

export function failureResult(error, env = process.env) {
  const apiKey = resolveApiKey(env);
  if (error instanceof SkillError) {
    return {
      status: "failed",
      error: redactSecret(error.message, apiKey),
      code: error.code
    };
  }
  return {
    status: "failed",
    error: "An unexpected local error occurred.",
    code: "unknown_error"
  };
}

export async function run(argv, dependencies = {}) {
  const options = parseArguments(argv);
  return generateImage(options, dependencies);
}

function optionKey(name) {
  const options = {
    "--operation": "operation",
    "--model": "model",
    "--prompt": "prompt",
    "--image": "imageUrl",
    "--image-file": "imageFile",
    "--aspect-ratio": "aspectRatio",
    "--size": "size",
    "--quality": "quality",
    "--n": "n",
    "--response-format": "responseFormat",
    "--output-format": "outputFormat",
    "--background": "background",
    "--watermark": "watermark",
    "--optimize-prompt-mode": "optimizePromptMode"
  };
  const key = options[name];
  if (!key) {
    throw new SkillError("invalid_arguments", "Unknown option.");
  }
  return key;
}

function inferOperation(imageCount) {
  if (imageCount === 0) return "generate";
  if (imageCount === 1) return "edit";
  return "fuse";
}

function validateOperationImages(operation, imageCount) {
  if (operation === "generate" && imageCount !== 0) {
    throw new SkillError("invalid_arguments", "The generate operation does not accept reference images.");
  }
  if (operation === "edit" && imageCount !== 1) {
    throw new SkillError("invalid_arguments", "The edit operation requires exactly one reference image.");
  }
  if (operation === "fuse" && imageCount < 2) {
    throw new SkillError("invalid_arguments", "The fuse operation requires at least two reference images.");
  }
}

function validateImageUrl(value) {
  return validatePublicHttpsUrl(value, "Each --image value must be a public HTTPS URL.");
}

function validatePublicHttpsUrl(value, message) {
  const normalized = normalizeOptional(value);
  if (!normalized || normalized.length > 4096) {
    throw new SkillError("invalid_arguments", message);
  }
  try {
    const url = new URL(normalized);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      isPrivateHostname(url.hostname)
    ) {
      throw new Error("not public HTTPS");
    }
    return url.href;
  } catch {
    throw new SkillError("invalid_arguments", message);
  }
}

function validateImageFile(value) {
  const normalized = normalizeOptional(value);
  if (!normalized || normalized.length > 4096 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new SkillError("invalid_arguments", "Each --image-file value must be a local image path.");
  }

  const suffix = path.extname(normalized).toLowerCase();
  if (!IMAGE_SUFFIXES.has(suffix)) {
    throw new SkillError("invalid_arguments", "--image-file must use a supported image extension.");
  }

  return { kind: "file", path: path.resolve(normalized), suffix };
}

async function resolveReferenceUrls(references, apiKey, fetchImpl, readFileImpl, timeoutMs, model) {
  const urls = [];
  for (const reference of references) {
    if (reference.kind === "url") {
      urls.push(validateImageUrl(reference.url));
      continue;
    }
    if (reference.kind !== "file") {
      throw new SkillError("invalid_arguments", "A reference image is invalid.");
    }
    urls.push(await uploadLocalImage(reference, apiKey, fetchImpl, readFileImpl, timeoutMs, model));
  }
  return urls;
}

async function uploadLocalImage(reference, apiKey, fetchImpl, readFileImpl, timeoutMs, model) {
  let bytes;
  try {
    bytes = await readFileImpl(reference.path);
  } catch {
    throw new SkillError("file_read_error", "Unable to read a local reference image.");
  }
  const maxInputBytes = modelCapabilityFor(model)?.input_image_limits?.max_file_size_bytes;
  if (maxInputBytes && bytes.length > maxInputBytes) {
    throw new SkillError(
      "invalid_image",
      `Each local reference image for ${model} must not exceed ${Math.round(maxInputBytes / 1024 / 1024)} MB.`
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(UPLOAD_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: Buffer.from(bytes).toString("base64"),
        type: reference.suffix
      }),
      signal: controller.signal
    });
  } catch {
    throw new SkillError("upload_error", "Unable to upload a local reference image.");
  } finally {
    clearTimeout(timeout);
  }

  let responseText;
  try {
    responseText = await response.text();
  } catch {
    throw new SkillError("upload_error", "The file upload response could not be read.");
  }
  const parsed = parseJsonObject(responseText);
  if (!response.ok || !parsed || typeof parsed.url !== "string") {
    throw new SkillError("upload_error", "The file upload API did not return an image URL.");
  }

  try {
    return validatePublicHttpsUrl(parsed.url, "The file upload API returned an invalid image URL.");
  } catch {
    throw new SkillError("upload_error", "The file upload API returned an invalid image URL.");
  }
}

function maxReferenceImagesForModel(model) {
  const capability = modelCapabilityFor(model);
  if (Number.isInteger(capability?.reference_images?.max)) {
    return capability.reference_images.max;
  }
  return MAX_REFERENCE_IMAGES;
}

export function requestTimeoutMsForModel(model) {
  return modelCapabilityFor(model)?.request_timeout_ms ?? DEFAULT_TIMEOUT_MS;
}

export function modelCapabilityFor(model) {
  return MODEL_CAPABILITY_BY_ID.get(model) ?? familyCapabilityFor(model);
}

function familyCapabilityFor(model) {
  const family = FAMILY_CAPABILITY_BY_ID.get(model);
  if (!family) return undefined;
  return {
    id: model,
    registry_scope: "family",
    vendor: family.vendor,
    status: family.status,
    document_sources: family.document_sources,
    supported_operations: family.supported_operations,
    reference_images: { min: 0, max: MAX_REFERENCE_IMAGES, required: false },
    input_image_limits: { source: "provider_validated" },
    parameters: {},
    request_timeout_ms: DEFAULT_TIMEOUT_MS,
    may_return_empty_image: false,
    known_errors: ["provider_validation_error"],
    response_format: { url: true, b64_json: "blocked" }
  };
}

function validateRegistryParameterValue(capability, model, parameterName, value, optionName) {
  if (!capability) return;
  if (!Object.hasOwn(capability.parameters ?? {}, parameterName)) {
    if (capability.registry_scope === "family") return;
    throw new SkillError("invalid_arguments", `${model} does not support ${optionName}.`);
  }
  const parameter = capability.parameters?.[parameterName];
  if (!parameter?.supported) {
    throw new SkillError("invalid_arguments", `${model} does not support ${optionName}.`);
  }
  if (Array.isArray(parameter.allowed) && !parameter.allowed.includes(value)) {
    throw new SkillError(
      "invalid_arguments",
      `${model} ${optionName} must be one of: ${parameter.allowed.join(", ")}.`
    );
  }
}

function validateRegistryIntegerParameter(capability, model, parameterName, value, optionName) {
  const parameter = capability?.parameters?.[parameterName];
  if (!Number.isInteger(value)) {
    throw new SkillError("invalid_arguments", `${optionName} must be an integer.`);
  }
  if (capability) {
    if (!Object.hasOwn(capability.parameters ?? {}, parameterName)) {
      if (capability.registry_scope === "family") {
        return;
      }
      throw new SkillError("invalid_arguments", `${model} does not support ${optionName}.`);
    }
    if (!parameter?.supported) {
      throw new SkillError("invalid_arguments", `${model} does not support ${optionName}.`);
    }
  }
  const min = parameter?.min ?? 1;
  const max = parameter?.max ?? 10;
  if (value < min || value > max) {
    throw new SkillError("invalid_arguments", `${model} ${optionName} must be an integer from ${min} through ${max}.`);
  }
}

function validateRegistryBooleanParameter(capability, model, parameterName, optionName) {
  if (!capability) return;
  if (!Object.hasOwn(capability.parameters ?? {}, parameterName)) {
    if (capability.registry_scope === "family") return;
    throw new SkillError("invalid_arguments", `${model} does not support ${optionName}.`);
  }
  if (!capability.parameters?.[parameterName]?.supported) {
    throw new SkillError("invalid_arguments", `${model} does not support ${optionName}.`);
  }
}

function validateModelOperation(capability, model, operation, referenceCount) {
  if (!capability) return;
  if (!capability.supported_operations?.includes(operation)) {
    throw new SkillError("invalid_arguments", `${model} does not support the ${operation} operation.`);
  }
  const minimum = capability.reference_images?.min;
  if (Number.isInteger(minimum) && referenceCount < minimum) {
    throw new SkillError("invalid_arguments", `${model} requires at least ${minimum} reference image.`);
  }
}

function validateGptImage2Size(size) {
  if (size === "auto") return;
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    throw new SkillError("invalid_arguments", "gpt-image-2 --size must be auto or WIDTHxHEIGHT.");
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    Math.max(width, height) > 3840 ||
    ratio > 3 ||
    pixels < 655_360 ||
    pixels > 8_294_400
  ) {
    throw new SkillError("invalid_arguments", "gpt-image-2 --size does not meet the documented constraints.");
  }
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1"
  ) {
    return true;
  }

  if (isIP(normalized) === 6) {
    const firstGroup = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
    return (
      normalized === "::" ||
      normalized.startsWith("::ffff:") ||
      (firstGroup >= 0xfc00 && firstGroup <= 0xfdff) ||
      (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) ||
      firstGroup >= 0xff00
    );
  }

  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
    parts[0] >= 224
  );
}

function normalizeRequired(value, name) {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    throw new SkillError("invalid_arguments", `${name} is required.`);
  }
  return normalized;
}

function normalizeOptional(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseOptionalBoolean(value, name) {
  const normalized = normalizeOptional(value);
  if (normalized === undefined) return undefined;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new SkillError("invalid_arguments", `${name} must be true or false.`);
}

function isNoneLinearHttpsUrl(value) {
  const normalized = normalizeOptional(value);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "api.nonelinear.com" &&
      (url.port === "" || url.port === "443")
    );
  } catch {
    return false;
  }
}

function parseJsonObject(text) {
  if (!text.trim()) return undefined;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function extractUrlImages(data) {
  if (!Array.isArray(data)) return [];
  const images = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (typeof item.url === "string" && item.url.trim()) images.push({ url: item.url });
  }
  return images;
}

function containsBase64Image(data) {
  if (!Array.isArray(data)) return false;
  return data.some(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof item.b64_json === "string" &&
      item.b64_json.length > 0
  );
}

function extractRequestId(response, parsed) {
  const headerId = response.headers?.get?.("x-request-id") ?? response.headers?.get?.("request-id");
  if (headerId) return headerId;
  if (typeof parsed.request_id === "string" && parsed.request_id) return parsed.request_id;
  return null;
}

function extractApiError(parsed) {
  if (!parsed) return undefined;
  if (typeof parsed.error === "string") return truncate(parsed.error);
  if (parsed.error && typeof parsed.error === "object" && typeof parsed.error.message === "string") {
    return truncate(parsed.error.message);
  }
  if (typeof parsed.message === "string") return truncate(parsed.message);
  return undefined;
}

function looksLikeInvalidModel(status, message) {
  if (status !== 400 && status !== 404) return false;
  const normalized = message?.toLowerCase() ?? "";
  return normalized.includes("model") && /invalid|not found|not exist|unsupported|unavailable/.test(normalized);
}

function truncate(value) {
  const trimmed = value.trim();
  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
}

function redactSecret(message, apiKey) {
  const safeMessage = typeof message === "string" && message.trim() ? message.trim() : "Request failed.";
  if (!apiKey) return safeMessage;
  return safeMessage.split(apiKey).join("[REDACTED]");
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
    const result = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(failureResult(error))}\n`);
    process.exitCode = 1;
  }
}
