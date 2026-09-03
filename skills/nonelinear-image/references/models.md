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

Read the registry before selecting a non-default model or adding model-specific parameters.
Never invent model IDs, parameter names, or unsupported values.

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

`quality` is only valid for `gpt-image-2`: `low`, `medium`, `high`, or `auto`. Higher quality
usually increases latency, output tokens, and cost. `n` supports 1-10.

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
Kling, Qwen, Wan, Stability, OpenAI image-1/1.5, DALL-E, MiniMax, Flux, Luma, Reve, Imagen,
Seedream 4/4.5/Lite, and Vidu.

Use `passthrough` models only when the user explicitly requests them or when the registry has
enough documented constraints for the requested operation. Use `candidate` models only for
planning or capability discussion; the script returns `not_implemented` for exact candidate IDs.
