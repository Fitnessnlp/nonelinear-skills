# Image Model Capabilities

Use [model-capabilities.json](model-capabilities.json) as the source of truth for model IDs,
status, supported operations, reference image limits, parameter values, request timeouts, known
empty-image behavior, and response handling.

## Status Levels

| Status | Meaning |
| --- | --- |
| `candidate` | Documented or mentioned, but not connected by this Skill. |
| `passthrough` | The Skill can pass the model ID with generic safety checks, but lacks complete model-specific validation. |
| `implemented` | The Skill has model-specific parameter mapping, limits, and error handling. |
| `live_verified` | A direct real API request has passed. |
| `host_verified` | A real host Agent end-to-end flow has passed. |

## Current Implemented Models

| Model ID | Vendor | Status | Operations | Reference Images | Parameters |
| --- | --- | --- | --- | --- | --- |
| `gemini-2.5-flash-image` | Google | `host_verified` | generate, edit, fuse | 0-3 | `aspect_ratio`; URL output only |
| `gpt-image-2` | OpenAI | `implemented` | generate, edit, fuse | 0-16 | `size`, `quality`, `n`, `background`, `output_format`; URL output only |
| `doubao-seedream-5-0-pro-260628` | ByteDance Doubao | `implemented` | generate, edit, fuse | 0-10 | `size`, `output_format`, `watermark`, `optimize_prompt_options.mode`; URL output only |
| `qwen-image-2.0` | Alibaba Qwen | `live_verified` | generate, edit, fuse | 0-3 | `size`, `n`, `prompt_extend`, `negative_prompt`, `seed`, `watermark`; generate verified |
| `qwen-image-2.0-pro` | Alibaba Qwen | `live_verified` | generate, edit, fuse | 0-3 | `size`, `n`, `prompt_extend`, `negative_prompt`, `seed`, `watermark`; generate verified |
| `qwen-image-3.0` | Alibaba Qwen | `host_verified` | generate, edit, fuse | 0-3 | follows `qwen-image-2.0`: `size`, `n`; plus Qwen 3.0 extended params; generate host-verified |
| `qwen-image-3.0-pro` | Alibaba Qwen | `live_verified` | generate, edit, fuse | 0-3 | follows `qwen-image-2.0`: `size`, `n`; plus Qwen 3.0 extended params; pending `api/images.mdx` sync |
| `wan2.7-image` | Alibaba Wan | `live_verified` | generate, edit, fuse | generic 0-16 | `size`, `n`; generate verified |
| `wan2.7-image-pro` | Alibaba Wan | `live_verified` | generate, edit, fuse | generic 0-16 | `size`, `n`; generate verified |

Read the registry before selecting a non-default model or adding model-specific parameters.
Never invent model IDs, parameter names, or unsupported values.

## Historical Benchmark Snapshot

[model-benchmark-snapshot.json](model-benchmark-snapshot.json) contains successful,
cost-confirmed single-image observations from the August 2026 text-to-image and single-image
editing runs. It is local reference data, not a live pricing source.

Filter by `operation` and `comparison_group` before comparing records. Keep exact pixel requests,
observed 1024-square results, and native/non-1024 square results separate. Always show
`request_dimension_mode`, `request_size`, and `actual_size` as distinct fields. Quote prices and
latency with the snapshot date and describe them as single benchmark observations.

## gpt-image-2

Use `size`, not `aspect_ratio`.

Documented sizes:

- `1024x1024`, `832x1248`, `1248x832`, `864x1184`, `1184x864`
- `896x1152`, `1152x896`, `768x1344`, `1344x768`
- `1536x1024`, `1024x1536`, `1792x1024`, `1024x1792`
- `2048x2048`, `auto`

The docs also state that custom `WIDTHxHEIGHT` values are valid when all constraints hold:

- maximum edge: 3840 px
- width and height: multiples of 16
- long-edge to short-edge ratio: at most 3:1
- total pixels: 655,360 through 8,294,400

`quality` is only valid for `gpt-image-2`: `low`, `medium`, `high`, or `auto`. The bundled script
defaults to `low`; higher quality usually increases latency, output tokens, and cost. `n` supports
1-10.

For transparent text-to-image output, use `background=transparent` with `output_format=png` or
`webp`. Also state "transparent background" in the prompt and exclude the scene, floor, base,
reflection, and shadow when those elements are unwanted. The Skill currently exposes this option
only for `generate`; transparent editing and fusion require separate verification.

## Google Gemini Image Models

`gemini-2.5-flash-image` supports `aspect_ratio` only. Do not send `size`, `quality`, or `n`.

`gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview` are registered as
`passthrough`: the Skill records documented `aspect_ratio`, `size`, reference-count limits, and
Gemini empty-image behavior, but they still need direct and host verification before promotion.

Gemini can return HTTP success without image data. Treat success as valid only when a response
item contains a non-empty `url`. Empty `data`, `IMAGE_RECITATION`, `NO_IMAGE`, or text-only
success maps to `no_image_output`. Do not auto-retry.

## Doubao Seedream

`doubao-seedream-5-0-pro-260628` supports text-to-image, single-image editing, and multi-image
fusion. Use `size`, not `aspect_ratio`; do not send `n` or `sequential_image_generation`.

Valid Seedream 5 Pro values:

- `size`: `1K`, `2K`, `1024x1024`, `1280x720`, `2048x2048`
- `output_format`: `png`, `jpeg`
- `watermark`: boolean
- `optimize_prompt_options.mode`: `standard`, `fast`

Input image limits for Seedream 5 Pro:

- formats: jpeg, png, webp, bmp, tiff, gif
- max local file size before upload: 10 MB
- width and height: greater than 14 px
- aspect ratio: 1:16 through 16:1
- total dimensions: no greater than 6000x6000 px
- reference images: at most 10

Preserve `<point>` and `<bbox>` tags in prompts. The returned URL suffix may not match
`output_format`; verify downloaded bytes when MIME type matters.

## Passthrough and Candidate Models

The registry also tracks documented model families from `api/images.mdx`, including Zhipu,
Kling, remaining Qwen IDs, remaining Wan IDs, Stability, OpenAI image-1/1.5, DALL-E, MiniMax,
Flux, Luma, Reve, Imagen, Seedream 4/4.5/Lite, and Vidu.

Use `passthrough` models only when the user explicitly requests them or when the registry has
enough documented constraints for the requested operation. Use `candidate` models only for
planning or capability discussion; the script returns `not_implemented` for exact candidate IDs.

## 2026-09-03 Live Smoke Results

These models returned at least one image URL from a real text-to-image request through
`POST /v1/images/generations`:

- `qwen-image-2.0`: `size=1024*1024`, `n=1`, 4.4s
- `qwen-image-2.0-pro`: `size=1024*1024`, `n=1`, 12.2s
- `qwen-image-2.0`: `prompt_extend`, `negative_prompt`, `seed`, `watermark`, `size=1024*1024`,
  `n=2`, returned 1 URL
- `qwen-image-2.0-pro`: `prompt_extend`, `negative_prompt`, `seed`, `watermark`, `size=1024*1024`,
  `n=2`, returned 1 URL
- `qwen-image-3.0`: `size=1024*1024`, `n=1`, 43.8s
- `qwen-image-3.0-pro`: `size=1024*1024`, `n=1`, 35.9s
- `qwen-image-3.0`: `size=1024*1536`, `n=2`, returned 1 URL
- `qwen-image-3.0`: single-image editing, `size=1024*1536`, `n=2`, returned 1 URL
- `qwen-image-3.0-pro`: `prompt_extend`, `prompt_extend_mode`, `enable_thinking`,
  `negative_prompt`, `seed`, `watermark`, `size=1024*1024`, `n=2`, returned 1 URL
- `qwen-image-3.0-pro`: three-image fusion, `size=1024*1536`, `n=2`, returned 1 URL
- `qwen-image-3.0`: Claude Code host end-to-end text-to-image returned 1 URL on 2026-09-04
- `wan2.7-image`: `size=1280*1280`, `n=1`, 13.3s
- `wan2.7-image-pro`: `size=1280*1280`, `n=1`, 20.1s

Text-to-image is live-verified for these six models. `qwen-image-3.0` single-image editing and
`qwen-image-3.0-pro` three-image fusion have also passed direct API tests. Remaining editing and
fusion paths still need separate API and host-agent verification before they can be marked
host-verified.
