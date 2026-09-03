# NoneLinear Image API

## Request

- Method: `POST`
- Fixed URL: `https://api.nonelinear.com/v1/images/generations`
- Authentication: `Authorization: Bearer <API key>`
- Content type: `application/json`
- Behavior: synchronous; generation may take several minutes.

Image request fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes | Use a documented model ID. |
| `prompt` | string | yes | Text description of the requested image. |
| `image` | string or string[] | edit/fuse | One public URL for editing; an ordered URL array for fusion. |
| `response_format` | string | fixed | Always `url`; base64 output is disabled by this Skill. |
| `aspect_ratio` | string | no | Include only for models that support it. |
| `size` | string | no | Include only for models that support it. |
| `quality` | string | no | `gpt-image-2` only: `low`, `medium`, `high`, or `auto`; the bundled script defaults to `low`. |
| `n` | integer | no | Include only for models that support it. |
| `output_format` | string | no | `gpt-image-2`: `png`, `jpeg`, or `webp`; Seedream 5 Pro: `png` or `jpeg`. |
| `background` | string | no | `gpt-image-2` generation only: `auto`, `opaque`, or `transparent`. |
| `watermark` | boolean | no | Seedream 5 Pro only in this Skill. |
| `optimize_prompt_options` | object | no | Seedream 5 Pro only: `{ "mode": "standard" }` or `fast`. |

The bundled script intentionally does not accept an endpoint option, arbitrary headers, or an
arbitrary JSON body. It accepts `--api-key` for a user-provided key used by the current invocation.

For a transparent `gpt-image-2` result, set `background=transparent`, use PNG or WebP output,
and explicitly request a transparent background in the prompt. Exclude floors, shadows,
reflections, and scene elements when a clean cutout is required.

Model-specific support is versioned in
[model-capabilities.json](model-capabilities.json). The script uses that registry for default
model selection, supported operations, reference image limits, allowed parameter values, request
timeouts, and candidate-model blocking.

All three operations use this endpoint:

- Generate: omit `image`.
- Edit: send `image` as one URL string.
- Fuse: send `image` as an array of at least two URLs, preserving reference order.

## Local Image Upload

The script accepts local raster files with `--image-file`. It performs this internal flow before
calling the image endpoint:

1. Read the local file inside the child Node.js process.
2. Base64-encode the bytes without a data URL prefix.
3. Send `POST https://nonelinear.com/api/upload-file` with the same bearer credential.
4. Use the returned public HTTPS `url` as the image reference.

Upload request body:

```json
{
  "image": "<base64-without-data-url-prefix>",
  "type": ".png"
}
```

The `type` value is the lowercase file suffix including the dot. Supported local suffixes are
`.bmp`, `.gif`, `.jpeg`, `.jpg`, `.png`, `.tif`, `.tiff`, and `.webp`. URL and file references
may be mixed; the script uploads files sequentially and preserves reference order.

For Seedream 5 Pro, each local input is rejected before upload when it exceeds 10 MB. Pixel
dimensions and public URL inputs remain subject to provider validation.

The upload URL and image API URL are fixed in code. The script never emits input bytes, base64,
the upload request body, the source path, or the temporary input URL in its result.

## Response

Treat a response as successful only when at least one item in `data` contains a non-empty `url`.
A `200` response with `data: []` is not a generated image. If the provider unexpectedly returns
only `b64_json`, map it to `base64_output_blocked` and never write the payload to stdout.

Gemini image models can occasionally return HTTP success without image data. Known forms include:

- `data: []` with `text: "[ERROR]: FinishReason.IMAGE_RECITATION"`.
- `data: []` with ordinary text such as a promise to generate an image.
- A `NO_IMAGE` outcome or any response whose data items have no `url`.

The script maps all of these responses to `no_image_output`. Do not treat HTTP 200 alone as
success, and do not automatically retry a billable request. Suggest revising the prompt for
`IMAGE_RECITATION`; let the user decide whether to retry other empty results.

The script exposes only the selected image fields and request ID. It does not expose raw HTTP
headers or the complete upstream response.

For Seedream 5 Pro, `output_format` controls the returned file encoding, but the temporary URL
suffix may not match it. A real `output_format: "jpeg"` response has been observed with a URL
ending in `.png` while the downloaded bytes were valid JPEG. Do not infer the MIME type solely
from the URL suffix.

## Error Codes

| Code | Meaning |
| --- | --- |
| `missing_api_key` | No credential was supplied through `--api-key` or a supported environment variable. |
| `invalid_arguments` | A required argument is missing or an option is malformed. |
| `invalid_model` | The API rejected or could not find the model ID. |
| `not_implemented` | The model is documented or mentioned, but this Skill has not connected it. |
| `file_read_error` | A local reference image could not be read. |
| `upload_error` | A local reference image could not be uploaded or produced no valid URL. |
| `invalid_image` | A local reference image violates a model-specific input limit. |
| `network_error` | The endpoint could not be reached or timed out. |
| `api_error` | The API rejected the request or returned an invalid response. |
| `no_image_output` | The API completed without returning image data. |
| `base64_output_blocked` | The API returned base64 without a URL; the payload was suppressed. |
| `unsupported_runtime` | Node.js is older than version 18 or lacks `fetch`. |
| `unknown_error` | An unexpected local failure occurred. |

## Context Boundary

For edit and fusion, the script sends reference URL strings to the image API. A public URL is
passed through unchanged. A local file is read and encoded only inside the child process, then
uploaded through the fixed upload endpoint. Neither the original bytes nor their base64 form is
written to stdout, stderr, the prompt, or the final JSON result.

Host behavior is separate from script behavior. If Claude Code or another host reads or attaches
a local image before invoking this Skill, the host may put that image into model context before
the script starts. Provide the local path as plain text and let the script handle the file.
