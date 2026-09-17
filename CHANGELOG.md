# Changelog

## Unreleased

- Add UTF-16/CRLF cursor validation and a versioned 186-case corpus while preserving historical V1 replay.
- Evaluate exact full-fragment derivation and retain the production insertion-only protocol after lower recognized quality.
- Add bounded same-file context behind a disabled-by-default experimental setting; retain the adjacent-context default after an inconclusive live comparison.
- Make explicit invocation immediate while retaining the 175 ms automatic debounce, and add automatic/explicit opportunity and active-editing aggregates.
- Parse Responses cache-read, cache-write, and reasoning-token usage; rely on automatic provider caching without durable cache identifiers.
- Validate the release candidate on VS Code 1.82 and stable, add CI, and bundle for the minimum extension-host syntax level.
- Preserve generated nested closing braces, decline uncertain suffix echoes, and wait for Responses terminal status rather than stopping on suffix similarity.
- Add interleaved P0–P3 prompt/output-budget experiments, paired family analysis, frozen holdout configuration checks, and offline generated-output review.
- Record live Luna prompt/cap results and reproducible synthetic captures; retain the production prompt and 96-token limit after inconclusive quality comparisons.
- Add a 168-case Go/TypeScript/Python/YAML/JSON evaluation corpus, offline replay and functional/parser checks, and a budgeted opt-in Luna benchmark runner.
- Reject HTTP redirects before credentials or source context can be replayed.
- Preserve significant insertion punctuation and whitespace, and avoid whitespace-only streaming stops.
- Add real editor acceptance and request-lifecycle regression coverage.
- Make source-free local measurements accurately distinguish returned and accepted suggestions.
- Serve cache hits before debounce and preserve continuation reuse across sliding context windows.
- Align the Marketplace identity with `wtiger001.glide` and the V1 OpenAI Responses-only scope.

## 0.1.3 - 2026-09-07

- Add `Glide: Set Base URL`, which validates and globally saves a Responses-compatible base URL and shows the resolved endpoint.

## 0.1.2 - 2026-09-07

- Make `glide.baseUrl` the only endpoint setting so configured base URLs always determine the request route.

## 0.1.1 - 2026-09-07

- Add Azure AI Foundry and compatible Responses base URL support.
- Support bearer and Azure `api-key` authentication headers.
- Allow an exact model or deployment-name override.
- Add sanitized, rate-limited Output-channel logging for important request failures.

## 0.1.0

- Initial implementation of Luna-oriented inline code completion.
