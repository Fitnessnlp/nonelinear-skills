# Image Models

Use the exact, case-sensitive model IDs below. The gateway can add models over time, but this
Skill must not invent IDs. If the user explicitly provides another model ID, pass it through and
let the API validate it; do not silently substitute a model.

## Recommended Models

| Model ID | Reference images | Parameters | Documented values |
| --- | --- | --- | --- |
| `gemini-2.5-flash-image` | 0-3 | `aspect_ratio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `gemini-3.1-flash-image-preview` | 0-14 | `aspect_ratio`, `size` | ratio also supports `1:4`, `1:8`, `4:1`, `8:1`; size: `512`, `1K`, `2K`, `4K` |
| `gemini-3-pro-image-preview` | 0-14 | `aspect_ratio`, `size` | standard ratios; size: `1K`, `2K`, `4K` |
| `gpt-image-2` | 0-16 | `size`, `quality`, `n` | custom size or `auto`; quality: `low`, `medium`, `high`, `auto`; `n`: 1-10 |
| `doubao-seedream-5-0-pro-260628` | 0-10 | `size`, `output_format`, `watermark`, `optimize_prompt_options` | size: `1K`, `2K`, `1024x1024`, `1280x720`, `2048x2048`; format: `png`, `jpeg`; prompt mode: `standard`, `fast` |
| `imagen-4.0-generate-001` | none | `aspect_ratio`, `size`, `n` | ratio: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`; size: `1K`, `2K`; `n`: 1-4 |
| `imagen-4.0-ultra-generate-001` | none | `aspect_ratio`, `size`, `n` | ratio: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`; size: `1K`, `2K`; `n`: 1-4 |
| `imagen-4.0-fast-generate-001` | none | `aspect_ratio`, `n` | ratio: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`; `n`: 1-4 |

For `gemini-2.5-flash-image`, omit `size`; it is not documented for that model. Its default
aspect ratio is `1:1`.

## gpt-image-2 Size and Quality

Use `size` rather than `aspect_ratio`. `size` accepts `auto` or any `WIDTHxHEIGHT` resolution
that satisfies every constraint:

- Maximum edge: 3840 pixels.
- Width and height: both multiples of 16.
- Long-edge to short-edge ratio: at most 3:1.
- Total pixels: 655,360 through 8,294,400.

Common sizes:

- `1024x1024`: square.
- `1536x1024`: landscape.
- `1024x1536`: portrait.
- `2048x2048`: 2K square.
- `2048x1152`: 2K landscape.
- `3840x2160`: 4K landscape.
- `2160x3840`: 4K portrait.
- `auto`: API default.

`quality` is exclusive to `gpt-image-2`:

- `low`: fastest; drafts and rapid iteration.
- `medium`: balance quality, latency, and cost.
- `high`: final-quality rendering.
- `auto`: model-selected and the API default.

Higher quality usually increases latency, output tokens, and cost. Omit `quality` for every
other model.

## Doubao Seedream 5 Pro

Use the exact ID `doubao-seedream-5-0-pro-260628`. It supports text-to-image, single-image
editing, and multi-image fusion with at most ten references.

- `size`: `1K`, `2K`, `1024x1024`, `1280x720`, or `2048x2048`; default is `2K`.
- `output_format`: `png` or `jpeg`.
- `watermark`: use `false` when the user requests no watermark.
- `optimize_prompt_options.mode`: `standard` for quality/completeness or `fast` for previews.
- Do not send `aspect_ratio`, `n`, `quality`, or `sequential_image_generation`.
- Express orientation with a pixel size or in the prompt.
- `<point>x y</point>` can identify a single edit location in the prompt.
- `<bbox>x1 y1 x2 y2</bbox>` can identify a region in a reference image.

Local reference files must be jpeg, png, webp, bmp, tiff, or gif and no larger than 10 MB.
The provider also requires width and height greater than 14 pixels, aspect ratio between 1:16
and 16:1, and total dimensions no greater than 6000 by 6000 pixels. Public URL inputs are
validated by the provider.

## Other Documented Generation IDs

These IDs are documented by NoneLinear, but parameter support varies. Prefer the recommended
table unless the user requests one of these explicitly:

- `glm-image`, `cogview-4-250304`, `cogview-4`, `cogview-3-flash`
- `Kolors`, `step-1x-medium`, `step-2x-large`
- `qwen-image-2.0`, `qwen-image-2.0-pro`, `Qwen-Image`, `qwen-image-max`, `qwen-image-plus`
- `z-image-turbo`, `wan2.6-t2i`, `wan2.5-t2i-preview`, `wan2.2-t2i-plus`,
  `wan2.2-t2i-flash`, `wanx2.1-t2i-plus`, `wanx2.1-t2i-turbo`
- `Stable-Diffusion-3.5-Large`, `Stable-Diffusion-3.5-Large-Turbo`,
  `Stable-Diffusion-3.5-Medium`, `Stable-Diffusion-3.5-Flash`, `Stable-Image-Ultra`,
  `Stable-Image-Core`
- `gpt-image-1-high`, `gpt-image-1-medium`, `gpt-image-1-low`,
  `gpt-image-1-mini-high`, `gpt-image-1-mini-medium`, `gpt-image-1-mini-low`,
  `gpt-image-1.5-high`, `gpt-image-1.5-medium`, `gpt-image-1.5-low`
- `dall-e-2`, `dall-e-3-hd`, `dall-e-3-standard`
- `minimax-image-01`, `minimax-image-01-live`, `reve-create-latest`
- `doubao-seedream-4-0-250828`, `doubao-seedream-4-5-251128`,
  `Doubao-Seedream-5.0-lite`

## Editing and Fusion IDs

The following documented families accept reference images. Input limits and optional parameters
vary, so use the main NoneLinear model table when selecting a non-recommended model:

- Gemini: `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`,
  `gemini-3.1-flash-image-preview`
- OpenAI: `gpt-image-1-*`, `gpt-image-1-mini-*`, `gpt-image-1.5-*`, `gpt-image-2`
- Qwen: `Qwen-Image-Edit`, `qwen-image-edit-max`, `qwen-image-edit-plus`
- Wan: `wan2.7-image`, `wan2.7-image-pro`, `wan2.6-image`, `wan2.5-i2i-preview`,
  `wanx2.1-imageedit`
- Kling: `kling-image-o1`, `kling-v2-new`, `kling-v2-1`, `kling-v2`, `kling-v1-5`, `kling-v1`
- Flux: `flux.2-klein-4b`, `flux.2-max`, `flux.2-flex`, `flux.2-pro`
- Doubao: `doubao-seedream-5-0-pro-260628` (0-10 references)
- Other documented edit models: `step-1x-edit`, `minimax-image-01`,
  `minimax-image-01-live`, `reve-edit-latest`, `reve-remix-latest`

Do not use edit-only models for a `generate` operation. `reve-edit-latest` is single-image edit;
`reve-remix-latest` is multi-image fusion.
