#!/usr/bin/env node

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const registry = require("../references/model-capabilities.json");
const snapshot = require("../references/model-benchmark-snapshot.json");

const ONE_K_GROUPS = {
  common: ["fixed_1024_pixel_request", "measured_1024_square"],
  exact: ["fixed_1024_pixel_request"],
  observed: ["measured_1024_square"]
};

class QueryError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function parseQueryArguments(argv) {
  const command = argv[0] ?? "benchmark";
  if (!new Set(["benchmark", "capabilities"]).has(command)) {
    throw new QueryError("invalid_arguments", "Query must be benchmark or capabilities.");
  }

  const values = {};
  const allowed =
    command === "capabilities"
      ? new Set(["models", "operation", "resolution"])
      : new Set([
          "operation",
          "resolution",
          "aspect-ratio",
          "basis",
          "sort",
          "limit",
          "include-cost-source"
        ]);
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new QueryError("invalid_arguments", "Options must use --name value pairs.");
    }
    const key = name.slice(2);
    if (!allowed.has(key)) throw new QueryError("invalid_arguments", `Unknown option: ${name}`);
    values[key] = value;
  }

  if (command === "capabilities") {
    const operation = values.operation?.toLowerCase();
    const resolution = values.resolution?.toLowerCase();
    if (operation && !new Set(["generate", "edit", "fuse"]).has(operation)) {
      throw new QueryError("invalid_arguments", "--operation must be generate, edit, or fuse.");
    }
    if (resolution && !new Set(["1k", "2k"]).has(resolution)) {
      throw new QueryError("invalid_arguments", "--resolution must be 1k or 2k.");
    }
    return {
      command,
      models: values.models?.split(",").map((value) => value.trim()).filter(Boolean) ?? [],
      operation,
      resolution
    };
  }

  const operation = (values.operation ?? "generate").toLowerCase();
  const resolution = (values.resolution ?? "1k").toLowerCase();
  const aspectRatio = values["aspect-ratio"] ?? "1:1";
  const basis = (values.basis ?? "common").toLowerCase();
  const sort = (values.sort ?? "cost").toLowerCase();
  const limit = Number(values.limit ?? 3);
  const includeCostSource = values["include-cost-source"] === "true";

  if (!new Set(["generate", "edit", "fuse"]).has(operation)) {
    throw new QueryError("invalid_arguments", "--operation must be generate, edit, or fuse.");
  }
  if (!new Set(["1k", "2k"]).has(resolution)) {
    throw new QueryError("invalid_arguments", "--resolution must be 1k or 2k.");
  }
  if (!/^\d+:\d+$/.test(aspectRatio)) {
    throw new QueryError("invalid_arguments", "--aspect-ratio must be a ratio such as 1:1.");
  }
  if (!new Set(Object.keys(ONE_K_GROUPS)).has(basis)) {
    throw new QueryError("invalid_arguments", "--basis must be common, exact, or observed.");
  }
  if (!new Set(["cost", "latency"]).has(sort)) {
    throw new QueryError("invalid_arguments", "--sort must be cost or latency.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new QueryError("invalid_arguments", "--limit must be an integer from 1 through 20.");
  }
  if (
    values["include-cost-source"] !== undefined &&
    !new Set(["true", "false"]).has(values["include-cost-source"])
  ) {
    throw new QueryError("invalid_arguments", "--include-cost-source must be true or false.");
  }

  return { command, operation, resolution, aspectRatio, basis, sort, limit, includeCostSource };
}

export function queryBenchmarks(options) {
  const result = {
    status: "completed",
    query: {
      operation: options.operation,
      resolution: options.resolution,
      aspect_ratio: options.aspectRatio,
      basis: options.basis,
      sort: options.sort,
      limit: options.limit
    },
    scope: "historical_cost_and_latency_only",
    data_version: snapshot.data_version,
    as_of: snapshot.as_of,
    currency: snapshot.currency,
    groups: [],
    warnings: [
      "Records are single historical observations, not live prices or quality rankings.",
      "A zero-cost observation does not mean that a model is free."
    ]
  };

  if (options.operation === "fuse") {
    result.warnings.push("No multi-image fusion benchmark data is available; edit prices are not substitutes.");
    return result;
  }
  if (options.resolution !== "1k" || options.aspectRatio !== "1:1") {
    result.warnings.push("No directly comparable benchmark group is available for this resolution and aspect ratio.");
    return result;
  }

  for (const comparisonGroup of ONE_K_GROUPS[options.basis]) {
    const rows = snapshot.records.filter(
      (record) =>
        record.operation === options.operation && record.comparison_group === comparisonGroup
    );
    const positive = rows.filter((record) => Number(record.cost_rmb) > 0).sort(compareRows(options.sort));
    const zero = rows.filter((record) => Number(record.cost_rmb) === 0).sort(compareRows("latency"));
    result.groups.push({
      comparison_group: comparisonGroup,
      records: positive.slice(0, options.limit).map((record) => compactRecord(record, options.includeCostSource)),
      zero_cost_observations: zero.map((record) => compactRecord(record, options.includeCostSource))
    });
  }

  return result;
}

export function queryCapabilities(options) {
  const exact = new Map(registry.models.map((model) => [model.id, model]));
  const family = new Map();
  for (const entry of registry.families ?? []) {
    for (const id of entry.model_ids ?? []) family.set(id, entry);
  }
  const ids = options.models.length > 0 ? options.models : [...exact.keys()];
  const models = ids.map((id) => {
    const model = exact.get(id);
    if (model) {
      const result = {
        model_id: id,
        vendor: model.vendor,
        status: model.status,
        supported_operations: model.supported_operations,
        reference_images: model.reference_images,
        parameters: model.parameters,
        request_timeout_ms: model.request_timeout_ms,
        may_return_empty_image: model.may_return_empty_image,
        known_errors: model.known_errors
      };
      if (options.models.length === 0 && (options.operation || options.resolution)) {
        result.parameters = {
          aspect_ratio: model.parameters?.aspect_ratio,
          size: model.parameters?.size
        };
        delete result.reference_images;
        delete result.request_timeout_ms;
        delete result.may_return_empty_image;
        delete result.known_errors;
      }
      return result;
    }
    const familyEntry = family.get(id);
    if (familyEntry) {
      return {
        model_id: id,
        vendor: familyEntry.vendor,
        status: familyEntry.status,
        supported_operations: familyEntry.supported_operations,
        parameter_summary: familyEntry.parameter_summary
      };
    }
    throw new QueryError("invalid_model", `Model is not present in the bundled capability registry: ${id}`);
  }).filter(
    (model) =>
      (!options.operation || model.supported_operations.includes(options.operation)) &&
      (!options.resolution || supportsResolution(model, options.resolution))
  );

  return {
    status: "completed",
    registry_version: registry.version,
    query: {
      operation: options.operation ?? null,
      resolution: options.resolution ?? null
    },
    models
  };
}

function supportsResolution(model, resolution) {
  const size = model.parameters?.size;
  if (!size?.supported) return false;
  const pixels = resolution === "2k" ? 2048 : 1024;
  const labels = new Set([resolution, `${pixels}x${pixels}`, `${pixels}*${pixels}`]);
  if ((size.allowed ?? []).some((value) => labels.has(String(value).toLowerCase()))) return true;
  if ((size.observed_values ?? []).some((value) => labels.has(String(value).toLowerCase()))) return true;

  const constraints = size.custom_constraints;
  const totalPixels = pixels * pixels;
  return Boolean(
    constraints &&
      (!constraints.min_total_pixels || totalPixels >= constraints.min_total_pixels) &&
      (!constraints.max_total_pixels || totalPixels <= constraints.max_total_pixels) &&
      (!constraints.max_edge_px || pixels <= constraints.max_edge_px) &&
      (!constraints.width_height_multiple || pixels % constraints.width_height_multiple === 0)
  );
}

function compareRows(sort) {
  const field = sort === "latency" ? "elapsed_seconds" : "cost_rmb";
  return (left, right) =>
    Number(left[field]) - Number(right[field]) ||
    left.configuration_label.localeCompare(right.configuration_label, "en");
}

function compactRecord(record, includeCostSource) {
  return {
    configuration_label: record.configuration_label,
    model_id: record.model_id,
    provider: record.provider,
    request_dimension_mode: record.request_dimension_mode,
    request_size: record.request_size,
    request_aspect_ratio: record.request_aspect_ratio,
    actual_size: record.actual_size,
    returned_image_count: record.returned_image_count,
    elapsed_seconds: record.elapsed_seconds,
    cost_rmb: record.cost_rmb,
    ...(includeCostSource ? { cost_source: record.cost_source } : {})
  };
}

function failure(error) {
  return {
    status: "failed",
    error: error instanceof QueryError ? error.message : "Unexpected local query failure.",
    code: error instanceof QueryError ? error.code : "unknown_error"
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseQueryArguments(process.argv.slice(2));
    const result = options.command === "benchmark" ? queryBenchmarks(options) : queryCapabilities(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(failure(error))}\n`);
    process.exitCode = 1;
  }
}
