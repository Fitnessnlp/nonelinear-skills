# Security Policy

## Reporting a vulnerability

Do not open a public issue for API key exposure, credential handling, arbitrary command execution,
endpoint redirection, local file disclosure, or another security-sensitive problem.

Use the repository's GitHub Security Advisory form:

```text
Security > Advisories > Report a vulnerability
```

Include the affected version, host application, operating system, reproduction steps, and
redacted output. Never include a real API key, Authorization header, local credential file, or
customer image.

For ordinary non-sensitive bugs, use GitHub Issues.

## Credential boundary

- Release archives never contain `.env` or credentials.
- Scripts do not accept API keys through command-line arguments.
- OpenAI and Anthropic credentials are reused only when the paired base URL points to the exact
  NoneLinear HTTPS hostname.
- Request endpoints are fixed in source code.
- Failures redact the active credential and do not expose complete headers or request bodies.

## Supported versions

Security fixes are applied to the latest released version.
