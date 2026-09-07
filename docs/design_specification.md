# Glide V1 Design Specification

**Status:** proposed for implementation  
**Product:** Glide (`wtiger001.glide-code-completion`)  
**License:** MIT — Copyright (c) 2026 John Bauer  
**Target:** desktop VS Code only  
**Last updated:** 2026-09-07

## 1. Purpose

Glide is a lightweight VS Code extension that supplies predictive inline code completions as ghost text. A developer types normally, Glide sends a deliberately small and relevant code-completion request to OpenAI, and the developer accepts a useful suggestion with the standard Tab action.

Glide is not a chat assistant, coding agent, repository manager, next-edit system, or general-purpose multi-provider LLM client. Its first release does one thing: cursor-based Tab completion.

The first runtime target is OpenAI's Responses API with GPT-5.6 Luna, Terra, or Sol. Luna is the default. The official model catalog describes Luna as the cost-sensitive, high-volume option and Terra as a balance of intelligence and cost; all three selected GPT-5.6 models support the Responses API and configurable reasoning effort. [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt)

## 2. Product principles

1. **Invisible by default.** The editor remains the product surface. Glide uses ghost text, a small status-bar item, normal settings, and a small Command Palette surface—never a permanent sidebar in V1.
2. **Latency over maximum intelligence.** A useful short completion delivered promptly is more valuable than a perfect response delivered after the developer has continued typing.
3. **Context quality over quantity.** Cursor-adjacent prefix and suffix are fundamental. Extra context is opt-in by evidence, not sent merely because it is available.
4. **Silence is success when appropriate.** Glide must reject poor, stale, unsafe, or low-confidence output rather than display it.
5. **Secure and local by default.** No Glide-operated service, telemetry endpoint, account, licensing server, or external index is required. Source content is sent only to OpenAI for an eligible completion request.
6. **Measure before expanding.** Prompt, context, caching, and model changes require benchmark and usage evidence.

## 3. Goals and non-goals

### 3.1 V1 goals

- Install as a public VSIX and run in desktop VS Code.
- Produce VS Code native inline completions that are accepted with Tab.
- Use OpenAI Responses API directly, with `gpt-5.6-luna` as the default and `gpt-5.6-terra` / `gpt-5.6-sol` as supported choices.
- Use prefix and suffix context from the active document.
- Debounce, deduplicate, locally cache, and truly abort stale requests.
- Securely store an API key with VS Code SecretStorage; support `OPENAI_API_KEY` as an environment fallback.
- Clean model output before it reaches the editor.
- Provide local-only statistics, diagnostic logging, a connection test, and VSIX packaging.
- Optimize initial quality testing for Go; keep the pipeline language-independent and test TypeScript and Python.

### 3.2 Explicit non-goals

- Chat, agent loops, tool use, MCP, web search, file search, apply-patch, command execution, or repository editing.
- Chat Completions, Anthropic, LiteLLM, local-model, gateway, or arbitrary OpenAI-compatible provider support.
- Browser-based VS Code support.
- Semantic repository indexes, embeddings, vector databases, persistent project indexes, or server-side components.
- Background completion history, completion candidates UI, partial word/line acceptance, next-edit prediction, or cross-file prediction.
- Remote telemetry, remote analytics, source-code logging, or a Glide cloud account.

## 4. Reference implementation lessons

Type Ahead and Twinny are useful references, not source dependencies or code-copying targets. Type Ahead contributes a compact modular completion lifecycle: native inline provider, debounce, context cache, trigger filter, prefix/suffix overlap removal, indentation normalization, stale result guards, status feedback, and a test-oriented build layout. [Type Ahead](https://github.com/mthooyavan/type-ahead)

Twinny demonstrates the importance of explicit fill-in-the-middle handling, both single- and multiline completions, configurable extension packaging, and the public-project hygiene expected of a widely installed VS Code extension (documentation, contribution guidance, code of conduct, test configuration, and VSIX ignore rules). [Twinny](https://github.com/twinnydotdev/twinny)

Glide intentionally improves on its relevant limitations:

| Reference pattern | Glide decision |
|---|---|
| Generic OpenAI-compatible, Anthropic, and LiteLLM backends | One direct OpenAI Responses API client only. |
| `fetch` requests are not passed an abort signal | Bridge VS Code cancellation to `AbortController`; abort every obsolete network request. |
| Collects snippets from other open files | V1 sends current-file context only. No other document is read or transmitted. |
| Plaintext settings API key and arbitrary key-helper command | SecretStorage-first; environment fallback only; no shell-command key helper. |
| Context gathered before trigger rejection/debounce | Run cheap eligibility checks first; build context only once a request is eligible. |
| Fixed generic prompt and post-processing | Treat prompt and filters as benchmarked, versioned Glide subsystems. |

Twinny's broader feature set is intentionally **not** Glide scope: chat/sidebar UX, saved conversations, embeddings, arbitrary endpoints/providers, code actions, diffs, document creation, and agent-like workflows. Its public-release discipline and FIM usability lessons are in scope.

## 5. User experience

### 5.1 Primary flow

```text
Developer types in an eligible editor
        |
        v
Glide waits briefly for a pause
        |
        v
Glide requests a completion for the current cursor state
        |
        +-- developer types/moves cursor --> abort and discard the request
        |
        v
Glide validates the returned text
        |
        +-- rejected --> remain silent
        |
        v
Native VS Code ghost text appears
        |
        +-- Tab --> normal editor acceptance
        +-- continue typing/Escape --> suggestion disappears
```

### 5.2 Status bar

The status item is compact and appears only while the extension is active:

| State | Display | Click action |
|---|---|---|
| Ready | `Glide: Luna` | Toggle enabled state |
| Requesting | `Glide: Luna $(loading~spin)` | Toggle enabled state |
| Disabled | `Glide: Off` | Enable Glide |
| Configuration/error | `Glide: !` | Open Glide output channel and show a concise action |

The selected model label is `Luna`, `Terra`, or `Sol`; it is never a claim that an agent is working.

### 5.3 Commands

- `Glide: Enable`
- `Glide: Disable`
- `Glide: Toggle`
- `Glide: Set API Key`
- `Glide: Remove API Key`
- `Glide: Test Connection`
- `Glide: Show Stats`
- `Glide: Reset Stats`
- `Glide: Clear Cache`
- `Glide: Open Diagnostic Log`

No custom acceptance keybinding is contributed. VS Code owns Tab and suggestion dismissal behavior.

## 6. Configuration

All configuration is scoped under `glide`. Settings marked “advanced” remain available in `settings.json` but do not need a dedicated UI.

| Setting | Type / default | Meaning |
|---|---|---|
| `glide.enabled` | boolean, `true` | Enables ghost-text completion. |
| `glide.baseUrl` | string, `https://api.openai.com/v1` | Advanced Responses-compatible base URL. Glide appends the Responses path and expands Azure AI Foundry project URLs to `/openai/v1/responses`. V1 has no Chat Completions or FIM compatibility. |
| `glide.authentication` | enum, `bearer` | Sends the credential as either `Authorization: Bearer` (OpenAI, LiteLLM, Microsoft Entra) or Azure's `api-key` header. |
| `glide.model` | enum, `gpt-5.6-luna` | `gpt-5.6-luna`, `gpt-5.6-terra`, or `gpt-5.6-sol`. |
| `glide.debounceMs` | integer, `175` | Pause required before a request is eligible; range 75–1000. |
| `glide.maxPrefixChars` | integer, `24000` | Maximum current-file text before cursor (advanced). |
| `glide.maxSuffixChars` | integer, `6000` | Maximum current-file text after cursor (advanced). |
| `glide.maxCompletionTokens` | integer, `96` | Output cap including reasoning/output limits imposed by the API; range 16–256. |
| `glide.reasoningEffort` | enum, `none` | `none`, `low`, `medium`, `high`, `xhigh`, `max`; normal completion defaults to `none`. |
| `glide.requestTimeoutMs` | integer, `8000` | End-to-end client timeout; range 1000–30000. |
| `glide.excludePatterns` | string array | Additional workspace-relative patterns in which Glide never requests completion. |
| `glide.diagnosticLogging` | boolean, `false` | Enables metadata-only diagnostic logging; never logs code, prompts, response text, or secrets. |

### 6.1 Keys and configuration precedence

1. An API key or access token saved by `Glide: Set API Key` in `ExtensionContext.secrets`.
2. `OPENAI_API_KEY` from the extension-host environment.
3. No key: Glide remains enabled but requests no completion and status indicates that setup is required.

Glide never reads `.env`, `.env.local`, shell profiles, arbitrary files, or a plaintext `glide.apiKey` setting. The developer may use `.env.local` to arrange their own development environment, but it is not an extension runtime input.

### 6.2 Protected files and workspace trust

Glide does not request completion if VS Code reports the workspace as untrusted or if the active file matches a built-in denylist: `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `*.p12`, `*.pfx`, `credentials*`, `secrets*`, `*.lock`, `package-lock.json`, generated/minified assets, or files inside `.git`, `node_modules`, `vendor`, `dist`, and `build`.

Users may add exclusions. Removing built-in secret protections requires an explicit `glide.allowSensitiveFiles` advanced opt-in, default `false`; a user cannot accidentally disable these protections merely by replacing the normal exclusion list.

## 7. Architecture

```text
VS Code InlineCompletionItemProvider
              |
              v
       CompletionCoordinator
     /       |        |       \
Eligibility  Request registry  Cache  Statistics
     |              |             |
     v              v             v
ContextBuilder --> PromptBuilder --> OpenAIResponsesClient
                                     |
                               AbortController
                                     |
                                     v
                      OutputProcessor --> InlineCompletionItem
```

### 7.1 Module responsibilities

| Module | Responsibility |
|---|---|
| `extension.ts` | Activation, service construction, command registration, disposal. |
| `configuration.ts` | Validates settings, resolves supported model identifier and environment fallback. |
| `secretStore.ts` | Owns SecretStorage reads/writes; exposes no key to logs. |
| `completionCoordinator.ts` | Owns one request lifecycle, generation IDs, cache checks, cancellation, and state transitions. |
| `eligibility.ts` | Cheap synchronous decision: enabled, desktop/trust state, URI scheme, language, protected path, cursor state, and trigger heuristics. |
| `contextBuilder.ts` | Captures bounded active-document prefix/suffix and language metadata after eligibility/debounce. |
| `promptBuilder.ts` | Builds a stable, versioned, fill-in-the-middle completion prompt. |
| `openaiResponsesClient.ts` | Calls `POST /v1/responses`, observes timeout/cancellation, parses response text and usage metadata. |
| `outputProcessor.ts` | Removes unsafe/non-code output and verifies an insertable suggestion. |
| `completionCache.ts` | In-memory LRU cache keyed by model, prompt version, language, prefix, suffix, and relevant settings. |
| `statistics.ts` | Persists aggregate local metrics without code or filenames. |
| `statusBar.ts` | Renders local state only. |
| `logger.ts` | Uses a dedicated OutputChannel and metadata-only diagnostic events. |

There is no server, indexer, database, language server, agent runtime, or provider plug-in layer.

## 8. Completion lifecycle and concurrency

### 8.1 Request state machine

```text
Idle -> Debouncing -> BuildingContext -> CacheLookup -> Requesting
  ^         |                 |               |             |
  |         +-- superseded ---+---------------+-------------+
  |                                                        |
  +---- rejected <--- Processing <--- Completed <----------+
                         |
                         +---- Displayed -> Accepted / Ignored -> Idle
```

Every lifecycle has a monotonically increasing `generation` and immutable anchor:

```ts
interface CompletionAnchor {
  readonly uri: string;
  readonly documentVersion: number;
  readonly position: { line: number; character: number };
  readonly generation: number;
}
```

An output may be displayed only if its anchor still matches the active provider invocation and the VS Code cancellation token is not cancelled.

### 8.2 Detailed algorithm

1. VS Code calls the inline completion provider.
2. Run `Eligibility.check` before any context gathering, disk scanning, or network action.
3. Increment the active generation and cancel the previous debounce timer and `AbortController` for the same provider instance.
4. Await the configured debounce; cancellation ends the operation silently.
5. Recheck eligibility and document version after the asynchronous pause.
6. Build current-file prefix/suffix context and calculate a stable cache key.
7. Return a valid in-memory cache hit only when its key and anchor remain current.
8. Start a request with a new `AbortController`. Register both the VS Code token and timeout to call `controller.abort()`.
9. On completion, reject the result if aborted, stale, failed, incomplete, empty, over policy limits, or unsafe.
10. Process the text. Cache only a fresh, displayable result. Return one `InlineCompletionItem` with a zero-width insertion range at the captured cursor.
11. Record local aggregate outcome metadata. A cache hit does not make a network request.

### 8.3 Cancellation rules

- A new provider invocation, text edit, cursor movement, document switch, setting change, disable action, deactivation, or timeout aborts the outstanding request.
- `AbortSignal` is passed to `fetch`; cancellation must terminate transport, not merely suppress the UI result.
- `AbortError` is normal control flow and never shows an error notification.
- A late response can never populate the cache or cause a retrigger for its former cursor position.
- At most one active network request exists per extension host. This favors predictable cost and prevents stale request queues.

### 8.4 Trigger policy

The initial policy is deliberately permissive but avoids obvious noise:

- Never trigger in a protected file, untrusted workspace, non-file URI, empty key state, or disabled state.
- Do not trigger immediately after a completed closer (`)`, `]`, `}`, `;`) unless a future benchmark demonstrates value.
- Do not trigger for whitespace-only lines until at least one non-whitespace character exists in the local window.
- Avoid comments and strings only where language-neutral VS Code tokenization can establish that the cursor is safely in prose; otherwise prefer context/output filtering over brittle language guessing.

## 9. Context model

### 9.1 Current-file fill-in-the-middle context

Glide captures code before and after the cursor from the active document. Prefix and suffix retain exact document text and use character budgets rather than an unavailable runtime tokenizer.

```text
<GLIDE_BEFORE>
bounded text before the cursor
</GLIDE_BEFORE>
<GLIDE_CURSOR />
<GLIDE_AFTER>
bounded text after the cursor
</GLIDE_AFTER>
```

The context contains:

- language identifier;
- basename only, not absolute path or workspace name;
- prefix and suffix;
- cursor column and current-line indentation for output validation.

V1 does **not** collect visible editors, open documents, imports from another file, repository search results, Git data, symbols from other files, or any persistent index. It may later add current-document symbols only if benchmarks demonstrate benefit and the data boundary stays current-file-only.

### 9.2 Context limits

- Trim prefix from its oldest edge, retaining code closest to the cursor.
- Trim suffix from its farthest edge, retaining code closest to the cursor.
- Avoid splitting UTF-16 surrogate pairs or line endings while truncating.
- Reject an unusually large single line rather than exceeding the configured byte/character budget.
- Never attempt request-side token counting in V1; collect API-reported token usage locally for later tuning.

## 10. Prompt and response policy

### 10.1 Prompt requirements

The prompt is a versioned constant, initially `completion-v1`. It states that Glide is a code-completion engine and must return only insertable text at the cursor. It forbids Markdown, explanations, tools, code fences, repeated prefix/suffix, and any text outside the intended insertion. It instructs the model to preserve language, style, indentation, and the supplied suffix.

The exact prompt is an implementation detail and must be changed only with deterministic benchmark results recorded alongside the change. There is no user-provided “custom instructions” setting in V1 because it expands prompt variability, privacy surface, and support burden.

### 10.2 OpenAI Responses API contract

Glide sends a single stateless `POST https://api.openai.com/v1/responses` request. It does not pass tools, conversation state, a previous response ID, custom metadata, a user identifier, or a prompt-cache key.

```json
{
  "model": "gpt-5.6-luna",
  "instructions": "<versioned Glide completion instructions>",
  "input": "<fill-in-the-middle context>",
  "reasoning": { "effort": "none" },
  "max_output_tokens": 96,
  "temperature": 0.2,
  "store": false,
  "stream": true,
  "text": { "verbosity": "low" }
}
```

`store: false` is mandatory because Responses are stored by default when the parameter is omitted. The API's `max_output_tokens` bounds both visible and reasoning tokens, so Glide uses a small value and defaults reasoning effort to `none`. Glide consumes the stream privately so it can stop and abort generation at a safe completion boundary, then runs complete cleanup, validation, and stale-request checks before returning one finalized inline item. V1 does not display partial streamed ghost text. If a configured Responses endpoint does not support streaming, the client may use a non-streaming request with the same final processing contract. The Responses API supports `input`, `instructions`, `reasoning`, `max_output_tokens`, `store`, `stream`, `text`, and response status/usage fields. [Official OpenAI API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

The streaming client accepts only supported text-delta and completion events, accumulates their text, and treats all other output items as non-completion data. The non-streaming fallback extracts text from supported SDK `output_text` accessors or safely traverses response output content items. Neither path assumes `output[0]` is text, as OpenAI documents that output order and length are model-dependent.

### 10.3 Model selection

| Display | API model | Intended use |
|---|---|---|
| Luna (default) | `gpt-5.6-luna` | Frequent low-cost, low-latency completion. |
| Terra | `gpt-5.6-terra` | Developer-selected quality/cost balance. |
| Sol | `gpt-5.6-sol` | Deliberate developer-selected higher capability; may be slower and more expensive. |

Glide does not automatically route between models. A model change cancels outstanding work, clears the in-memory completion cache, and becomes visible in the status bar. Advanced service tiers are not sent in V1; a configured project policy controls them at OpenAI.

### 10.4 Response handling

- `completed`: extract output text and pass it to `OutputProcessor`.
- `incomplete`, `failed`, `cancelled`, or an absent text output: record a local classified failure and show no suggestion.
- 401/403: show a non-secret setup notification once per session and set status to configuration required.
- 429: classify as rate-limited; do not automatically retry an inline request because the cursor context may already be obsolete.
- Network/5xx: classify as transient; no modal/error spam. A later eligible pause may make a fresh request.

## 11. Output processor

Raw text is never rendered directly. The processor returns either one normalized insertion string or `null`.

Processing steps, in order:

1. Reject empty or whitespace-only output.
2. Remove an enclosing Markdown code fence only when both opening and closing fences unambiguously wrap the response.
3. Reject obvious response leakage: role labels, XML/context tags used by the prompt, instruction restatements, tool-call-shaped output, or prose-only output.
4. Strip the longest prefix overlap against the active cursor line without removing intentional insertion text.
5. Strip the longest exact suffix overlap against the current suffix.
6. Reject if no insertion remains.
7. Preserve first-line cursor semantics; normalize subsequent indentation to the editor's tab/space style without inventing nesting depth.
8. Reject output that exceeds the configured token/character-derived display ceiling, contains NUL/control characters, or repeats a block beyond a bounded repetition threshold.
9. Verify document version and anchor once more immediately before display.

The processor must favor false negatives over unsafe or distracting ghost text. Its behavior is covered by deterministic fixtures for Go, TypeScript, Python, Markdown leakage, duplicated prefix/suffix, indentation, incomplete blocks, and Unicode boundaries.

## 12. Caching and deduplication

Glide uses an in-memory LRU cache only. It is never written to disk and is cleared on deactivation, model change, prompt version change, relevant setting change, or `Glide: Clear Cache`.

The key includes:

- model identifier;
- prompt version;
- language identifier;
- exact bounded prefix and suffix;
- context and output settings that affect generation.

The key is a SHA-256 digest held only in memory. Cache values are normalized completion strings. Default capacity: 64 entries; configurable only through an advanced setting. Cache hits are counted locally, but keys and values are not logged or persisted.

In-flight deduplication shares a request only for an exact matching key and anchor. A cancellation of either subscriber does not cancel a shared request unless every subscriber is gone. Since V1 allows one active request, this primarily prevents duplicate calls caused by repeated provider invocation at one cursor state.

## 13. Privacy, security, and data handling

### 13.1 Data sent to OpenAI

For an eligible request, Glide sends only:

- the selected model and completion settings;
- stable prompt instructions;
- active-document prefix/suffix, language identifier, and basename.

It does not send absolute paths, repository names, Git state, workspace settings, other open files, telemetry IDs, usage statistics, local cache content, keys, or source from protected files.

### 13.2 Local data

- API keys reside in SecretStorage, not settings or logs.
- Cache is memory-only.
- Aggregate statistics persist in `globalState`, with no source-derived fields.
- Diagnostic logs include timestamps, event classes, model, language identifier, numeric durations/counts, HTTP status class, and cancellation reason only.
- `store: false` is always present in the Responses request.

### 13.3 Supply-chain and release requirements

- Pin direct runtime dependencies with a lockfile.
- Avoid dependencies that execute post-install scripts unless required and reviewed.
- Publish source maps only if they contain no source or secrets beyond intended extension source.
- Package with `vsce`, inspect the generated VSIX contents, and ensure `.env*`, tests, fixtures containing secrets, local logs, and development configuration are excluded.
- Document exactly what source context is sent and how users can disable Glide.

## 14. Local statistics

Statistics are opt-in to viewing but always local. They reset only with the explicit command.

| Metric | Notes |
|---|---|
| Requests started/completed/failed/cancelled/timed out | Classified counters only. |
| Cache hits and in-flight deduplications | Measures local responsiveness. |
| End-to-end latency | Request start to response completion. |
| Time to displayable result | Includes output processing. |
| Suggestions returned/displayed | Distinguishes model output from valid UI output. |
| Suggestions accepted/ignored | Determined from VS Code events where available; otherwise explicitly labeled unavailable. |
| Characters displayed/accepted | Aggregate counts only. |
| Selected model and language identifier | Aggregate buckets; no filenames. |

V1 must not claim acceptance metrics that VS Code's inline completion API cannot observe reliably. Any fallback heuristic is documented in the stats view and excluded from headline acceptance-rate calculations.

## 15. Failure behavior

- Configuration errors are actionable and non-blocking: status changes and a single command prompt, never a modal loop.
- Aborted/stale requests are invisible to the developer.
- Rate limits and transient errors back off for a short per-session cooldown (default 2 seconds after 429, exponential capped cooldown after repeated 5xx) to avoid request storms.
- No automatic retry reuses old completion context.
- A disabled Glide never creates timers, requests, or context snapshots.

## 16. Testing and quality gates

### 16.1 Unit tests

- Settings validation and model enum resolution.
- SecretStorage precedence and never-log behavior.
- Path protection and workspace trust eligibility.
- Prefix/suffix construction, truncation, Unicode safety, and cursor anchors.
- Debounce, generation invalidation, actual fetch abort, timeout, cache, and in-flight deduplication.
- OpenAI Responses request serialization, streaming-event parsing, early-stop abort, and non-streaming fallback fixtures.
- Every output-processor rule.
- Statistics aggregation with source-free assertions.

### 16.2 Extension integration tests

- Registering the inline provider in a desktop VS Code extension-host test run.
- Tab acceptance of single- and multi-line suggestions.
- Editing during requests proves that the request `AbortSignal` fires and no stale suggestion appears.
- Model/settings changes clear cache and cancel work.
- Protected/open unrelated documents are never included in a captured client request.
- No key appears in configuration, OutputChannel text, thrown errors, or packaged artifacts.

### 16.3 Deterministic completion benchmark

Fixtures contain only redistributable code. Each case provides language, prefix, suffix, expected missing code, and expected processor result. Track exact match, edit similarity, syntactic validity, completion length, request latency, and compilation/test success where feasible.

Benchmarks are comparative instruments, not release gates by themselves. Real editor acceptance and latency determine product usefulness.

### 16.4 Release gates

Before a public VSIX:

1. TypeScript strict compilation, linting, unit tests, and extension integration tests pass.
2. VSIX contents are inspected and contain no keys or local artifacts.
3. A fresh desktop VS Code install completes key setup, connection test, Tab acceptance, disable/enable, cache clearing, and uninstall cleanly.
4. Go, TypeScript, and Python manual smoke tests demonstrate stale cancellation and multiline output.
5. README, privacy statement, changelog, Marketplace metadata, icon, license, repository URL, support/contact links, contribution guide, code of conduct, and VSIX ignore rules are present.

## 17. Delivery plan

### Milestone 0 — scaffold and package contract

- Node active LTS, current stable desktop VS Code engine, TypeScript strict mode, test harness, `vsce` packaging, metadata, MIT license, and `.gitignore`.
- Extension activates without network access and exposes the status item and commands.

### Milestone 1 — safe single-file completion

- SecretStorage key flow and environment fallback.
- Direct Responses client with hidden stream consumption, Luna default, Terra/Sol selection, request timeout, cancellation bridge.
- Eligibility, protected-file defaults, bounded prefix/suffix prompt, output processor.
- Native inline suggestion and Tab acceptance.

### Milestone 2 — quality and measurement

- Cache/dedupe, local stats, diagnostics, connection test.
- Deterministic fixtures and Go/TypeScript/Python integration coverage.
- Tune defaults through dogfooding.

### Milestone 3 — public-release hardening

- Marketplace assets and repository links.
- Package audit, privacy documentation, release notes, manual compatibility matrix, and VSIX installation validation.

## 18. Deferred decisions and future work

The following are intentionally deferred until measurement justifies them:

- streaming partial completion;
- adaptive debounce;
- current-document symbol extraction;
- optional bounded context from explicitly selected files;
- prompt caching strategies;
- model-specific prompt variants;
- semantic repository retrieval, gateways, other providers, and local models;
- next-edit/cross-file suggestions and any agent capability.

The public repository URL for Marketplace metadata and documentation is `https://github.com/wtiger001/glide`.

## 19. Definition of done for V1

Glide V1 is complete when it is a public-ready, installable desktop VSIX that securely calls OpenAI's Responses API, defaults to Luna while offering Terra and Sol, sends only bounded eligible current-file context, displays useful ghost-text completions through normal Tab behavior, reliably aborts stale calls, records source-free local metrics, and remains focused solely on Tab completion.
