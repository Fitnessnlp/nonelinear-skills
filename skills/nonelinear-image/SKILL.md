---
name: nonelinear-image
description: Generate images, create transparent-background PNGs, edit one image, or fuse multiple reference images through the NoneLinear image API, including Doubao Seedream 5 Pro. Use when a user asks a shell-capable agent to create, draw, render, restyle, modify, combine, or blend images with NoneLinear, including requests that specify an image model, local image paths, public reference image URLs, aspect ratio, size, count, background, or response format.
metadata:
  version: "0.3.0"
---

# NoneLinear Image

Generate or transform images by running the bundled dependency-free Node.js script. Do not call the
`nonelinear` or `nl` CLI, and do not use the host agent's built-in image generator for a
NoneLinear request.

## Workflow

1. Treat an explicit request to generate or transform an image as authorization to make one billable API
   request. Do not make an API request when the user only asks about capabilities or setup.
2. Select the operation from the user's intent:
   - `generate`: no reference images.
   - `edit`: exactly one local image path or public HTTPS reference image URL.
   - `fuse`: at least two local paths or public HTTPS reference image URLs.
3. Extract the prompt and optional model, aspect ratio, size, quality, and count.
4. Default the model to `gemini-2.5-flash-image`. Always request URL output.
5. Read [references/models.md](references/models.md) and, when exact limits matter,
   [references/model-capabilities.json](references/model-capabilities.json) before selecting a
   non-default model or adding model-specific parameters. Never invent a model ID or unsupported
   parameter.
6. Locate `scripts/generate-image.mjs` relative to this `SKILL.md` and invoke it with Node.js
   18 or newer. In Claude Code, `${CLAUDE_SKILL_DIR}` is the skill directory. In other hosts,
   use the absolute directory from which this skill was loaded.
7. Parse the single JSON object written to stdout. Claim success only when `status` is
   `completed` and `images` contains at least one `url` field.
8. Return image URLs as clickable links. Never return or display base64 image data.

When the user gives a local image path, pass that path string directly to `--image-file`. Do not
use `Read`, attach the image, inspect it, or encode it in the agent. The child script reads and
base64-encodes the file in its own process, uploads it to the fixed NoneLinear upload endpoint,
and passes only the returned URL to the image API. Base64 bytes never enter stdout or the model
context.

## Script Invocation

Text-to-image with the defaults:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --prompt "白色陶瓷马克杯放在胡桃木桌面上，清晨自然光，真实摄影风格"
```

Specify supported options only when requested or required by the chosen model:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --model "gemini-2.5-flash-image" \
  --prompt "未来城市天际线，电影感广角摄影，日落自然光" \
  --aspect-ratio "16:9" \
  --response-format "url"
```

Edit one image:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --operation "edit" \
  --image "https://example.com/source.png" \
  --prompt "把背景替换为浅灰色摄影棚，保留主体不变" \
  --aspect-ratio "1:1"
```

Edit a local image without loading it into agent context:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --operation "edit" \
  --image-file "/absolute/path/to/source.png" \
  --prompt "把背景替换为浅灰色摄影棚，保留主体不变"
```

Fuse multiple images by repeating `--image` in the intended reference order:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --operation "fuse" \
  --image "https://example.com/product.png" \
  --image "https://example.com/scene.png" \
  --prompt "把图一的产品自然放入图二的场景，保持产品外观"
```

Local files and URLs can be mixed. Preserve their command-line order:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --operation "fuse" \
  --image-file "/absolute/path/to/product.png" \
  --image "https://example.com/scene.png" \
  --prompt "把图一的产品自然放入图二的场景，保持产品外观"
```

Use `quality` and `size` with `gpt-image-2`:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --model "gpt-image-2" \
  --prompt "白色陶瓷马克杯产品图，浅灰摄影棚背景" \
  --size "2048x1152" \
  --quality "high"
```

Generate a transparent PNG with `gpt-image-2`:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --model "gpt-image-2" \
  --prompt "一瓶高端植物精华液概念瓶，主体完整，透明背景，不要场景、地面、底座、投影和倒影" \
  --size "1024x1024" \
  --quality "high" \
  --background "transparent" \
  --output-format "png"
```

Use Seedream 5 Pro for text-to-image:

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --model "doubao-seedream-5-0-pro-260628" \
  --prompt "透明玻璃茶壶放在胡桃木桌面上，1:1 构图，真实产品摄影" \
  --size "1K" \
  --output-format "png" \
  --watermark "false" \
  --optimize-prompt-mode "standard"
```

Supported script arguments:

- `--prompt <text>`: required.
- `--operation <generate|edit|fuse>`: optional; inferred from the reference image count when omitted.
- `--image <public-https-url>`: repeat for each reference image; preserve the user's order.
- `--image-file <local-path>`: repeat for local references; may be mixed with `--image` in order.
- `--model <id>`: optional; defaults to `gemini-2.5-flash-image`.
- `--aspect-ratio <ratio>`: optional; for example `1:1` or `16:9`.
- `--size <size>`: optional; use only for a model documented to support it.
- `--quality <low|medium|high|auto>`: optional and valid only for `gpt-image-2`; its API default is `auto`.
- `--n <count>`: optional integer from 1 through 10; omit when the model does not support it.
- `--response-format <url>`: optional compatibility argument; only `url` is accepted.
- `--output-format <png|jpeg|webp>`: model-specific; read the capability registry before use.
- `--background <auto|opaque|transparent>`: `gpt-image-2` generation only.
- `--watermark <true|false>`: Seedream 5 Pro only.
- `--optimize-prompt-mode <standard|fast>`: Seedream 5 Pro only.

Do not pass the API key as a command argument. Do not construct the request with `curl` or an
ad hoc script; the bundled script enforces endpoint and output safety.

For the default model, use no more than three reference images. Pass each URL or local path string
directly to the script. Do not use `Read`, WebFetch, `curl`, browser tools, or another command to
fetch, inspect, download, or base64-encode an input image before calling the script.

## Context Safety

Keep image bytes outside the agent context:

- Never attach local image bytes to a tool call for this workflow.
- Never put base64, a data URL, or binary image content in the prompt, command, stdout, or reply.
- Pass local references as path strings with `--image-file`; the child process handles upload.
- Base64 exists briefly only inside the child process and the upload HTTP body. It is never
  printed, returned, logged, or passed back through the agent.
- If the user already attached an image to the conversation, explain that the host may already
  have counted that image against context before this Skill ran; the Skill cannot remove it.
- If the API unexpectedly returns only `b64_json`, report `base64_output_blocked`. Do not print
  the payload or retry automatically.

For `gpt-image-2`, use `size`, not `aspect_ratio`. Higher `quality` usually increases latency,
output tokens, and cost. Read [references/models.md](references/models.md) for complete size
constraints before choosing a custom resolution.

For a transparent image, use `gpt-image-2` with `--background transparent` and
`--output-format png` or `webp`. The prompt must also say that the background is transparent.
Exclude the scene, floor, base, reflection, and shadow when the user wants a clean cutout. This
Skill currently exposes transparent backgrounds only for text-to-image generation.

For `doubao-seedream-5-0-pro-260628`, use `size`, never `aspect_ratio` or `n`. It supports
text-to-image, one-image editing, and fusion with up to ten references. Preserve `<point>` and
`<bbox>` tags in prompts. Do not attempt grouped output or pass `sequential_image_generation`;
this model does not support it. Its request timeout is 600 seconds.

## Credentials

The script reads credentials from the child process environment in this order:

1. `NONELINEAR_API_KEY`
2. `Nonelinear_API_KEY`
3. `OPENAI_API_KEY`, only when `OPENAI_BASE_URL` is an HTTPS URL whose exact hostname is
   `api.nonelinear.com`
4. `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`, only when `ANTHROPIC_BASE_URL` is an HTTPS
   URL whose exact hostname is `api.nonelinear.com`

Do not read `.env`, cc-switch databases, or Claude/Codex configuration files. Those tools may
inject credentials into the agent process environment. If the script returns
`missing_api_key`, ask the user to configure an environment variable outside chat. Never ask
the user to paste a real key into the conversation.

Request destinations are fixed to `https://nonelinear.com/api/upload-file` for local inputs and
`https://api.nonelinear.com/v1/images/generations` for image generation. Environment variables
cannot redirect them.

## Result Handling

Success has this shape:

```json
{
  "status": "completed",
  "operation": "edit",
  "model": "gemini-2.5-flash-image",
  "images": [{ "url": "https://example.com/image.png" }],
  "request_id": "request-id-or-null"
}
```

Failure has this shape:

```json
{
  "status": "failed",
  "error": "Human readable message",
  "code": "stable_error_code"
}
```

Gemini can return HTTP success with `data: []`, text only, `IMAGE_RECITATION`, or `NO_IMAGE`.
Treat all such responses as failure unless an item contains a non-empty `url`. Block a base64-only
response instead of emitting it.
For `no_image_output`, explain that the provider returned no image and suggest revising the
prompt. Do not automatically retry, because each request may incur cost. For `missing_api_key`,
give environment setup guidance. For all other failures, report only `error` and `code`; never
show request headers, an Authorization value, a complete request object, or credential values.

Do not use this Skill for video generation, model listing, general-purpose file uploading, or
downloading output files. Local image upload is only an internal preprocessing step for edit and
fusion requests.
