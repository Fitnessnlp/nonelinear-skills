# Changelog

## 0.3.0 - 2026-08-06

- Added `references/model-capabilities.json` as the versioned image model capability registry.
- Centralized model IDs, vendors, status levels, supported operations, reference-image limits,
  parameter values, request timeouts, known errors, and response-format rules.
- Updated the image script to derive default model, endpoint, local upload suffixes, model
  operation checks, parameter validation, reference limits, timeout values, and local image size
  limits from the registry.
- Added candidate-model blocking with `not_implemented`.
- Updated Skill and repository docs for the 0.3.0 model registry.
- Added validated `gpt-image-2` transparent-background generation with PNG/WebP output.

## 0.2.0 - 2026-07-29

- Added text-to-image, single-image editing, and multi-image fusion.
- Added local image upload without exposing image bytes or base64 to Agent context.
- Added `gpt-image-2` custom size and quality validation.
- Added `doubao-seedream-5-0-pro-260628` generation, editing, fusion, and model-specific options.
- Added stable JSON output and stable error codes.
- Added protection against base64-only provider responses and empty Gemini image results.
- Added exact-host validation before reusing OpenAI or Anthropic environment credentials.
- Published the Skill as a standalone, platform-neutral repository.
