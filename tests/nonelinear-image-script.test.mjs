import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  API_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  SEEDREAM_5_MODEL,
  SEEDREAM_5_TIMEOUT_MS,
  UPLOAD_ENDPOINT,
  SkillError,
  failureResult,
  generateImage,
  parseArguments,
  requestTimeoutMsForModel,
  resolveApiKey
} from "../skills/nonelinear-image/scripts/generate-image.mjs";

const TEST_KEY = "sentinel-secret-value";
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(testDirectory, "../skills/nonelinear-image/scripts/generate-image.mjs");

test("parses a Chinese prompt with stable defaults", () => {
  assert.deepEqual(parseArguments(["--prompt", "生成一张清晨自然光下的白色陶瓷杯产品图"]), {
    operation: "generate",
    model: DEFAULT_MODEL,
    prompt: "生成一张清晨自然光下的白色陶瓷杯产品图",
    references: [],
    aspectRatio: undefined,
    size: undefined,
    quality: undefined,
    n: undefined,
    responseFormat: "url",
    outputFormat: undefined,
    watermark: undefined,
    optimizePromptMode: undefined
  });
});

test("parses supported gpt-image-2 options", () => {
  assert.deepEqual(
    parseArguments([
      "--model=gpt-image-2",
      "--prompt",
      "生成一张红色圆形海报",
      "--size",
      "1024x1024",
      "--quality",
      "high",
      "--n",
      "2",
      "--response-format",
      "url"
    ]),
    {
      operation: "generate",
      model: "gpt-image-2",
      prompt: "生成一张红色圆形海报",
      references: [],
      aspectRatio: undefined,
      size: "1024x1024",
      quality: "high",
      n: 2,
      responseFormat: "url",
      outputFormat: undefined,
      watermark: undefined,
      optimizePromptMode: undefined
    }
  );
});

test("infers edit and fuse operations from repeated image URLs", () => {
  assert.deepEqual(
    parseArguments([
      "--prompt",
      "把背景改成浅灰色",
      "--image",
      "https://images.example.test/source.png"
    ]),
    {
      operation: "edit",
      model: DEFAULT_MODEL,
      prompt: "把背景改成浅灰色",
      references: [{ kind: "url", url: "https://images.example.test/source.png" }],
      aspectRatio: undefined,
      size: undefined,
      quality: undefined,
      n: undefined,
      responseFormat: "url",
      outputFormat: undefined,
      watermark: undefined,
      optimizePromptMode: undefined
    }
  );

  const fused = parseArguments([
    "--operation",
    "fuse",
    "--prompt",
    "融合两张图片",
    "--image=https://images.example.test/a.png",
    "--image",
    "https://images.example.test/b.png"
  ]);
  assert.equal(fused.operation, "fuse");
  assert.deepEqual(fused.references, [
    { kind: "url", url: "https://images.example.test/a.png" },
    { kind: "url", url: "https://images.example.test/b.png" }
  ]);
});

test("parses local files and preserves mixed reference order", () => {
  const parsed = parseArguments([
    "--operation",
    "fuse",
    "--prompt",
    "融合本地产品图和远程场景图",
    "--image-file",
    "./fixtures/product.png",
    "--image",
    "https://images.example.test/scene.webp"
  ]);

  assert.deepEqual(parsed.references, [
    {
      kind: "file",
      path: path.resolve("./fixtures/product.png"),
      suffix: ".png"
    },
    { kind: "url", url: "https://images.example.test/scene.webp" }
  ]);
});

test("rejects unsupported local image extensions", () => {
  assert.throws(
    () => parseArguments(["--prompt", "测试", "--image-file", "./notes.txt"]),
    hasCode("invalid_arguments")
  );
});

test("validates operation image counts and rejects non-public image URLs", () => {
  assert.throws(
    () => parseArguments(["--operation", "edit", "--prompt", "测试"]),
    hasCode("invalid_arguments")
  );
  assert.throws(
    () =>
      parseArguments([
        "--operation",
        "fuse",
        "--prompt",
        "测试",
        "--image",
        "https://images.example.test/a.png"
      ]),
    hasCode("invalid_arguments")
  );
  assert.throws(
    () =>
      parseArguments([
        "--prompt",
        "测试",
        "--image",
        "http://images.example.test/a.png"
      ]),
    hasCode("invalid_arguments")
  );
  assert.throws(
    () =>
      parseArguments([
        "--prompt",
        "测试",
        "--image",
        "https://127.0.0.1/a.png"
      ]),
    hasCode("invalid_arguments")
  );
});

test("rejects base64 response format to protect agent context", () => {
  assert.throws(
    () => parseArguments(["--prompt", "测试", "--response-format", "b64_json"]),
    hasCode("invalid_arguments")
  );
});

test("validates that quality is a gpt-image-2-only option", () => {
  assert.throws(
    () => parseArguments(["--prompt", "测试", "--quality", "ultra"]),
    hasCode("invalid_arguments")
  );
  assert.throws(
    () => parseArguments(["--prompt", "测试", "--quality", "high"]),
    hasCode("invalid_arguments")
  );
});

test("validates gpt-image-2 size constraints and rejects aspect_ratio", () => {
  assert.equal(
    parseArguments(["--model", "gpt-image-2", "--prompt", "测试", "--size", "auto"]).size,
    "auto"
  );
  assert.throws(
    () => parseArguments(["--model", "gpt-image-2", "--prompt", "测试", "--size", "1000x1000"]),
    hasCode("invalid_arguments")
  );
  assert.throws(
    () =>
      parseArguments([
        "--model",
        "gpt-image-2",
        "--prompt",
        "测试",
        "--aspect-ratio",
        "1:1"
      ]),
    hasCode("invalid_arguments")
  );
});

test("parses every supported Seedream 5 Pro option", () => {
  assert.deepEqual(
    parseArguments([
      "--model",
      SEEDREAM_5_MODEL,
      "--prompt",
      "透明玻璃茶壶产品摄影",
      "--size",
      "1K",
      "--output-format",
      "PNG",
      "--watermark",
      "false",
      "--optimize-prompt-mode",
      "FAST"
    ]),
    {
      operation: "generate",
      model: SEEDREAM_5_MODEL,
      prompt: "透明玻璃茶壶产品摄影",
      references: [],
      aspectRatio: undefined,
      size: "1K",
      quality: undefined,
      n: undefined,
      responseFormat: "url",
      outputFormat: "png",
      watermark: false,
      optimizePromptMode: "fast"
    }
  );
});

test("enforces Seedream 5 Pro model-specific parameter rules", () => {
  const args = ["--model", SEEDREAM_5_MODEL, "--prompt", "测试"];
  for (const extra of [
    ["--size", "4K"],
    ["--size", "1536x1024"],
    ["--aspect-ratio", "16:9"],
    ["--n", "2"],
    ["--output-format", "webp"],
    ["--watermark", "no"],
    ["--optimize-prompt-mode", "turbo"]
  ]) {
    assert.throws(() => parseArguments([...args, ...extra]), hasCode("invalid_arguments"));
  }

  assert.throws(
    () => parseArguments(["--prompt", "测试", "--output-format", "png"]),
    hasCode("invalid_arguments")
  );
  assert.throws(
    () => parseArguments(["--prompt", "测试", "--watermark", "false"]),
    hasCode("invalid_arguments")
  );
});

test("enforces the Seedream 5 Pro ten-reference limit", () => {
  const references = Array.from({ length: 10 }, (_, index) => [
    "--image",
    `https://images.example.test/${index + 1}.png`
  ]).flat();
  const parsed = parseArguments([
    "--model",
    SEEDREAM_5_MODEL,
    "--operation",
    "fuse",
    "--prompt",
    "融合参考图",
    ...references
  ]);
  assert.equal(parsed.references.length, 10);

  assert.throws(
    () =>
      parseArguments([
        "--model",
        SEEDREAM_5_MODEL,
        "--operation",
        "fuse",
        "--prompt",
        "融合参考图",
        ...references,
        "--image",
        "https://images.example.test/11.png"
      ]),
    hasCode("invalid_arguments")
  );
});

test("uses a 600 second timeout for Seedream 5 Pro", () => {
  assert.equal(requestTimeoutMsForModel(SEEDREAM_5_MODEL), SEEDREAM_5_TIMEOUT_MS);
  assert.equal(requestTimeoutMsForModel(DEFAULT_MODEL), DEFAULT_TIMEOUT_MS);
});

test("enforces the documented three-reference limit for the default model", () => {
  assert.throws(
    () =>
      parseArguments([
        "--operation",
        "fuse",
        "--prompt",
        "融合参考图",
        "--image",
        "https://images.example.test/1.png",
        "--image",
        "https://images.example.test/2.png",
        "--image",
        "https://images.example.test/3.png",
        "--image",
        "https://images.example.test/4.png"
      ]),
    hasCode("invalid_arguments")
  );
});

test("rejects missing and unknown arguments", () => {
  assert.throws(() => parseArguments([]), hasCode("invalid_arguments"));
  assert.throws(
    () => parseArguments(["--prompt", "测试", "--endpoint", "https://example.com"]),
    hasCode("invalid_arguments")
  );
});

test("does not echo an unexpected positional value in argument errors", () => {
  const accidentalSecret = "accidental-sensitive-value";
  let caught;
  try {
    parseArguments([accidentalSecret]);
  } catch (error) {
    caught = error;
  }
  assert.equal(caught instanceof SkillError, true);
  assert.equal(caught.message.includes(accidentalSecret), false);
});

test("resolves direct and proof-paired gateway credentials in priority order", () => {
  assert.equal(
    resolveApiKey({
      NONELINEAR_API_KEY: "direct-key",
      OPENAI_API_KEY: "openai-key",
      OPENAI_BASE_URL: "https://api.nonelinear.com/v1"
    }),
    "direct-key"
  );
  assert.equal(
    resolveApiKey({
      OPENAI_API_KEY: "openai-key",
      OPENAI_BASE_URL: "https://api.nonelinear.com/v1",
      ANTHROPIC_AUTH_TOKEN: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.nonelinear.com/anthropic"
    }),
    "openai-key"
  );
  assert.equal(
    resolveApiKey({
      ANTHROPIC_AUTH_TOKEN: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.nonelinear.com/anthropic"
    }),
    "anthropic-key"
  );
});

test("does not reuse provider credentials without an exact NoneLinear HTTPS hostname", () => {
  assert.equal(
    resolveApiKey({ OPENAI_API_KEY: TEST_KEY, OPENAI_BASE_URL: "https://api.nonelinear.com.example.org/v1" }),
    undefined
  );
  assert.equal(
    resolveApiKey({ ANTHROPIC_API_KEY: TEST_KEY, ANTHROPIC_BASE_URL: "http://api.nonelinear.com/anthropic" }),
    undefined
  );
});

test("returns missing_api_key without making a request", async () => {
  let called = false;
  await assert.rejects(
    generateImage(baseOptions(), {
      env: {},
      fetchImpl: async () => {
        called = true;
        throw new Error("must not run");
      }
    }),
    hasCode("missing_api_key")
  );
  assert.equal(called, false);
});

test("calls the fixed endpoint and returns a stable successful result", async () => {
  let capturedUrl;
  let capturedInit;
  const result = await generateImage(
    { ...baseOptions(), aspectRatio: "1:1" },
    {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(
          JSON.stringify({
            data: [{ url: "https://images.example.test/result.png", revised_prompt: "revised" }]
          }),
          { status: 200, headers: { "x-request-id": "request-test-1" } }
        );
      }
    }
  );

  assert.equal(capturedUrl, API_ENDPOINT);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Authorization, `Bearer ${TEST_KEY}`);
  assert.deepEqual(JSON.parse(capturedInit.body), {
    model: DEFAULT_MODEL,
    prompt: "生成一张测试图片",
    response_format: "url",
    aspect_ratio: "1:1"
  });
  assert.deepEqual(result, {
    status: "completed",
    operation: "generate",
    model: DEFAULT_MODEL,
    images: [{ url: "https://images.example.test/result.png" }],
    request_id: "request-test-1"
  });
});

test("sends gpt-image-2 size and quality at the top level", async () => {
  let requestBody;
  const options = parseArguments([
    "--model",
    "gpt-image-2",
    "--prompt",
    "生成一张产品图",
    "--size",
    "2048x1152",
    "--quality",
    "low"
  ]);

  await generateImage(options, {
    env: { NONELINEAR_API_KEY: TEST_KEY },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return imageResponse("gpt-image-2.png");
    }
  });

  assert.equal(requestBody.size, "2048x1152");
  assert.equal(requestBody.quality, "low");
});

test("sends Seedream 5 Pro options at the documented top-level fields", async () => {
  let requestBody;
  const options = parseArguments([
    "--model",
    SEEDREAM_5_MODEL,
    "--prompt",
    "透明玻璃茶壶产品摄影",
    "--size",
    "2048x2048",
    "--output-format",
    "jpeg",
    "--watermark",
    "false",
    "--optimize-prompt-mode",
    "standard"
  ]);

  await generateImage(options, {
    env: { NONELINEAR_API_KEY: TEST_KEY },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return imageResponse("seedream.jpg");
    }
  });

  assert.deepEqual(requestBody, {
    model: SEEDREAM_5_MODEL,
    prompt: "透明玻璃茶壶产品摄影",
    response_format: "url",
    size: "2048x2048",
    output_format: "jpeg",
    watermark: false,
    optimize_prompt_options: { mode: "standard" }
  });
});

test("rejects Seedream 5 Pro local inputs larger than 10 MB before upload", async () => {
  let fetchCalled = false;
  const options = parseArguments([
    "--model",
    SEEDREAM_5_MODEL,
    "--operation",
    "edit",
    "--prompt",
    "编辑图片",
    "--image-file",
    "./large.png"
  ]);

  await assert.rejects(
    generateImage(options, {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      readFileImpl: async () => Buffer.alloc(10 * 1024 * 1024 + 1),
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("must not run");
      }
    }),
    hasCode("invalid_image")
  );
  assert.equal(fetchCalled, false);
});

test("sends one reference image as a string for editing", async () => {
  let requestBody;
  const result = await generateImage(
    {
      ...baseOptions(),
      operation: "edit",
      prompt: "把背景改成白色摄影棚",
      references: [{ kind: "url", url: "https://images.example.test/source.png" }]
    },
    {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return imageResponse("edited.png");
      }
    }
  );

  assert.equal(requestBody.image, "https://images.example.test/source.png");
  assert.equal(result.operation, "edit");
});

test("uploads a local image without exposing base64 and uses the returned URL for editing", async () => {
  const sourceBytes = Buffer.from("local-image-byte-sentinel");
  const sourceBase64 = sourceBytes.toString("base64");
  const sourcePath = path.resolve("./private/source.png");
  const uploadedUrl = "https://tempfile-user.tos-cn-beijing.volces.com/uploaded.png";
  const calls = [];

  const result = await generateImage(
    {
      ...baseOptions(),
      operation: "edit",
      prompt: "把背景改成白色摄影棚",
      references: [{ kind: "file", path: sourcePath, suffix: ".png" }]
    },
    {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      readFileImpl: async (filePath) => {
        assert.equal(filePath, sourcePath);
        return sourceBytes;
      },
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url === UPLOAD_ENDPOINT) {
          return new Response(JSON.stringify({ url: uploadedUrl }), { status: 200 });
        }
        return imageResponse("edited-local.png");
      }
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, UPLOAD_ENDPOINT);
  assert.deepEqual(JSON.parse(calls[0].init.body), { image: sourceBase64, type: ".png" });
  assert.equal(calls[1].url, API_ENDPOINT);
  assert.equal(JSON.parse(calls[1].init.body).image, uploadedUrl);
  assert.equal(JSON.stringify(result).includes(sourceBase64), false);
  assert.equal(JSON.stringify(result).includes(sourcePath), false);
  assert.deepEqual(result.images, [{ url: "https://images.example.test/edited-local.png" }]);
});

test("uploads mixed local and URL references sequentially and preserves their order", async () => {
  const requestUrls = [];
  let generationBody;
  await generateImage(
    {
      ...baseOptions(),
      operation: "fuse",
      references: [
        { kind: "url", url: "https://images.example.test/first.png" },
        { kind: "file", path: path.resolve("./second.jpg"), suffix: ".jpg" },
        { kind: "url", url: "https://images.example.test/third.webp" }
      ]
    },
    {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      readFileImpl: async () => Buffer.from("second-image"),
      fetchImpl: async (url, init) => {
        requestUrls.push(url);
        if (url === UPLOAD_ENDPOINT) {
          return new Response(
            JSON.stringify({ url: "https://tempfile-user.tos-cn-beijing.volces.com/second.jpg" }),
            { status: 200 }
          );
        }
        generationBody = JSON.parse(init.body);
        return imageResponse("mixed.png");
      }
    }
  );

  assert.deepEqual(requestUrls, [UPLOAD_ENDPOINT, API_ENDPOINT]);
  assert.deepEqual(generationBody.image, [
    "https://images.example.test/first.png",
    "https://tempfile-user.tos-cn-beijing.volces.com/second.jpg",
    "https://images.example.test/third.webp"
  ]);
});

test("maps local file and upload failures to stable errors without leaking request data", async () => {
  const options = {
    ...baseOptions(),
    operation: "edit",
    references: [{ kind: "file", path: path.resolve("./secret.png"), suffix: ".png" }]
  };

  await assert.rejects(
    generateImage(options, {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      readFileImpl: async () => {
        throw new Error("ENOENT /sensitive/path/secret.png");
      },
      fetchImpl: async () => {
        throw new Error("must not run");
      }
    }),
    hasCode("file_read_error")
  );

  const secretBytes = "upload-body-secret";
  let caught;
  try {
    await generateImage(options, {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      readFileImpl: async () => Buffer.from(secretBytes),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: `rejected ${secretBytes} ${TEST_KEY}` }), { status: 400 })
    });
  } catch (error) {
    caught = error;
  }

  const output = failureResult(caught, { NONELINEAR_API_KEY: TEST_KEY });
  assert.equal(output.code, "upload_error");
  assert.equal(JSON.stringify(output).includes(secretBytes), false);
  assert.equal(JSON.stringify(output).includes(TEST_KEY), false);
});

test("sends multiple reference images as an array for fusion", async () => {
  let requestBody;
  const references = [
    "https://images.example.test/product.png",
    "https://images.example.test/background.png"
  ];
  const result = await generateImage(
    {
      ...baseOptions(),
      operation: "fuse",
      prompt: "把图一的产品放入图二的场景",
      references: references.map((url) => ({ kind: "url", url }))
    },
    {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return imageResponse("fused.png");
      }
    }
  );

  assert.deepEqual(requestBody.image, references);
  assert.equal(result.operation, "fuse");
});

test("rejects a successful HTTP response with no image payload", async () => {
  await assert.rejects(
    generateImage(baseOptions(), {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [], text: "[ERROR]: FinishReason.IMAGE_RECITATION" }), {
          status: 200
        })
    }),
    hasCode("no_image_output")
  );
});

test("rejects a text-only successful response with no image URL or base64 payload", async () => {
  await assert.rejects(
    generateImage(baseOptions(), {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [], text: "好的，我来为你生成这张图片。" }), {
          status: 200
        })
    }),
    hasCode("no_image_output")
  );
});

test("never emits provider base64 image data", async () => {
  const base64Payload = "sensitive-base64-payload".repeat(1000);
  let caught;
  try {
    await generateImage(baseOptions(), {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [{ b64_json: base64Payload }] }), {
          status: 200
        })
    });
  } catch (error) {
    caught = error;
  }

  const output = failureResult(caught, { NONELINEAR_API_KEY: TEST_KEY });
  assert.equal(output.code, "base64_output_blocked");
  assert.equal(JSON.stringify(output).includes(base64Payload), false);
  assert.equal(JSON.stringify(output).length < 500, true);
});

test("maps a response body read failure to network_error", async () => {
  await assert.rejects(
    generateImage(baseOptions(), {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("connection closed");
        }
      })
    }),
    hasCode("network_error")
  );
});

test("maps model API errors and redacts the configured credential", async () => {
  let caught;
  try {
    await generateImage(baseOptions(), {
      env: { NONELINEAR_API_KEY: TEST_KEY },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: { message: `Model not found; credential=${TEST_KEY}` } }),
          { status: 404 }
        )
    });
  } catch (error) {
    caught = error;
  }

  const output = failureResult(caught, { NONELINEAR_API_KEY: TEST_KEY });
  assert.equal(output.status, "failed");
  assert.equal(output.code, "invalid_model");
  assert.equal(JSON.stringify(output).includes(TEST_KEY), false);
  assert.match(output.error, /\[REDACTED\]/);
});

test("the executable prints exactly one JSON failure object without a key", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--prompt", "生成一张中文测试图片"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" }
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    status: "failed",
    error: "No NoneLinear API key is configured in the process environment.",
    code: "missing_api_key"
  });
});

function baseOptions() {
  return {
    operation: "generate",
    model: DEFAULT_MODEL,
    prompt: "生成一张测试图片",
    references: [],
    aspectRatio: undefined,
    size: undefined,
    quality: undefined,
    n: undefined,
    responseFormat: "url",
    outputFormat: undefined,
    watermark: undefined,
    optimizePromptMode: undefined
  };
}

function imageResponse(filename) {
  return new Response(JSON.stringify({ data: [{ url: `https://images.example.test/${filename}` }] }), {
    status: 200
  });
}

function hasCode(code) {
  return (error) => error instanceof SkillError && error.code === code;
}
