# Changelog

## 0.2.0 - 2026-07-29

- Added text-to-image, single-image editing, and multi-image fusion.
- Added local image upload without exposing image bytes or base64 to Agent context.
- Added `gpt-image-2` custom size and quality validation.
- Added `doubao-seedream-5-0-pro-260628` generation, editing, fusion, and model-specific options.
- Added stable JSON output and stable error codes.
- Added protection against base64-only provider responses and empty Gemini image results.
- Added exact-host validation before reusing OpenAI or Anthropic environment credentials.
- Published the Skill as a standalone, platform-neutral repository.
