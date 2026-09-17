# Glide Architecture and Product Decisions

This document records the major decisions made during the initial design of Glide and, importantly, the reasoning behind them.

The purpose is to prevent future development from accidentally revisiting settled questions without understanding why the original decision was made.

These decisions are not immutable. They may be changed when evidence from implementation or testing justifies doing so.

The [2026-09-16 Luna completion research](luna-completion-research.md) and [completion action plan](completion-action-plan.md) propose follow-up experiments. They do not supersede accepted decisions by themselves; record evidence here when an implementation adopts a substantive change.

---

# ADR-001: Build a New VS Code Extension

## Status

Accepted

## Decision

Build a purpose-built VS Code inline completion extension rather than standardizing on Copilot, Continue, Tabby, Void, Cline, Zoo Code, or another existing tool.

## Context

The core requirement is unusually specific:

* AI inline Tab completion,
* VS Code,
* controlled or isolated development environments,
* bring-your-own API endpoint,
* GPT-5.6 Luna Fast,
* no mandatory vendor cloud,
* minimal infrastructure,
* strong control over network behavior.

Several existing products solve portions of this problem.

GitHub Copilot provides excellent inline completion, but inline completion remains tied to GitHub's completion infrastructure rather than allowing an arbitrary private endpoint to fully replace the service.

Cline and Zoo Code provide strong BYOK agent functionality but are not primarily Tab-completion systems.

Tabby is architecturally strong and now supports remote models, but its completion architecture is designed around dedicated completion/FIM endpoints. Connecting a general OpenAI-style Luna endpoint may require an additional adapter or compatibility layer.

Continue provides flexible model integration and inline completion, but it carries substantial generic multi-provider functionality that Glide does not require.

Void demonstrated that a VS Code fork could combine BYOK and autocomplete, but the project was deprecated and is therefore not an acceptable foundation for a long-term supported environment.

A custom extension can use VS Code's native InlineCompletionItemProvider API directly.

## Rationale

The VS Code portion of inline completion is relatively straightforward.

The difficult engineering is not displaying ghost text.

The difficult engineering is:

* determining when to request a completion,
* deciding what context to send,
* handling prefix and suffix,
* keeping latency low,
* cancelling stale requests,
* shaping Luna prompts,
* cleaning model output,
* caching,
* avoiding distracting completions,
* measuring usefulness.

These are exactly the areas where a Luna-specific implementation can benefit from being smaller and more focused than general-purpose tools.

A custom extension also minimizes infrastructure:

```text
VS Code -> Glide -> Luna
```

rather than:

```text
VS Code -> extension -> completion server -> adapter -> gateway -> Luna
```

Additional infrastructure may still be introduced later when it provides clear operational value.

## Consequences

The project assumes responsibility for completion quality and extension maintenance.

However, the implementation can remain relatively small because it does not initially need to support many providers or agent capabilities.

---

# ADR-002: Product Name Is Glide

## Status

Accepted

## Decision

The extension will be named **Glide**.

The internal completion engine may be named **Impulse**.

## Rationale

"Glide" describes the intended user experience: programming continues smoothly while useful code appears ahead of the developer.

The name is not tied to Luna or any particular model.

This is important because the runtime model may change.

"Impulse" also fit the project well and can be retained as an internal engine/component name.

Examples:

```text
ImpulseEngine
ImpulseContext
ImpulseCache
ImpulseRequest
```

---

# ADR-003: Luna Fast Is the Initial Runtime Model

## Status

Accepted

## Decision

Use GPT-5.6 Luna Fast as the initial completion model.

## Rationale

Autocomplete has a different performance profile from agentic coding.

The most important runtime characteristics are:

* low latency,
* high generation speed,
* adequate coding capability,
* low cost per request,
* ability to handle many frequent requests.

A larger reasoning model may produce better answers in isolation but can still provide a worse autocomplete experience if suggestions arrive too late.

Luna Fast appears better aligned with the completion workload.

## Consequence

The extension will initially optimize request shaping around Luna.

The model abstraction should remain clean enough that another model can be substituted later.

---

# ADR-004: Use Minimal Reasoning for Runtime Completion

## Status

Accepted

## Decision

The normal autocomplete path should use the lowest practical reasoning effort.

## Rationale

Inline completion is highly latency sensitive.

Long internal reasoning is generally undesirable when the expected answer may only be:

```go
if err != nil {
    return nil, err
}
```

Complex reasoning belongs in deliberate agent interactions.

If future testing identifies classes of completions that benefit from deeper reasoning, a secondary path may be explored.

---

# ADR-005: Use Sol High for Building Glide

## Status

Accepted

## Decision

Use GPT-5.6 Sol with High reasoning as the default development model for the project.

## Rationale

Building Glide involves substantially different work from running Glide.

Development requires:

* repository analysis,
* architecture,
* understanding Tabby and Continue,
* VS Code API design,
* TypeScript implementation,
* debugging,
* prompt analysis,
* benchmark design,
* refactoring.

These activities benefit more from a stronger reasoning model than the runtime completion workload does.

---

# ADR-006: Glide Is an Autocomplete Product, Not an Agent

## Status

Accepted

## Decision

Do not turn Glide into a chat or coding-agent platform during the initial development phase.

## Rationale

Existing tools already provide sophisticated agent functionality.

Examples include:

* Codex,
* Cline,
* Zoo Code,
* VS Code Agent Mode.

Combining agent functionality into Glide would substantially increase scope while providing little immediate benefit to the primary requirement.

A developer can use both:

```text
Glide -> Luna -> instant completion

Codex / Cline / Zoo
    -> stronger model
    -> deliberate development work
```

The two workflows are complementary.

---

# ADR-007: No Sidebar in V1

## Status

Accepted

## Decision

Glide will not add a permanent VS Code Activity Bar or sidebar interface in its initial version.

## Rationale

Autocomplete should be largely invisible.

The UI should consist primarily of:

* inline ghost text,
* a small status bar indicator,
* Command Palette commands,
* standard VS Code settings.

A sidebar would consume editor space without improving the primary autocomplete workflow.

If Glide later develops features such as repository indexing, context inspection, benchmark analysis, or completion history, a dedicated UI can be reconsidered.

---

# ADR-008: Learn from Tabby and Continue

## Status

Accepted

## Decision

Use Tabby and Continue as reference implementations when designing Glide.

Do not blindly copy their architecture.

## Rationale

Both projects contain years of practical lessons about AI code completion.

Areas worth studying include:

### Tabby

* FIM architecture,
* prefix and suffix handling,
* repository context,
* snippet retrieval,
* model prompting,
* remote models,
* caching,
* completion serving,
* output processing.

### Continue

* VS Code inline completion integration,
* request lifecycle,
* debounce,
* cancellation,
* recent-file context,
* import context,
* configurable providers,
* output handling.

Glide should reproduce useful behaviors through its own simpler architecture.

Licensing requirements must be respected when examining external source code.

---

# ADR-009: Do Not Start with Repository Embeddings

## Status

Accepted

## Decision

Do not implement embeddings, a vector database, or full repository semantic indexing in the first version.

## Rationale

Useful completion may be achievable with much cheaper context sources:

* current file,
* current symbol,
* imports,
* nearby definitions,
* open files,
* recently edited files,
* lexical repository search,
* VS Code symbol APIs.

Semantic indexing introduces complexity, state management, storage requirements, indexing delays, and additional models.

It should only be added if measurements show that simpler context retrieval is inadequate.

---

# ADR-010: Prefix and Suffix Are Fundamental Context

## Status

Accepted

## Decision

Every normal completion request should consider both code before and code after the cursor.

## Rationale

Autocomplete is fundamentally a fill-in-the-middle problem even when the runtime model is not natively trained as a FIM model.

The code following the cursor strongly constrains what should be inserted.

Ignoring suffix context can produce:

* duplicated code,
* inappropriate closing syntax,
* unnecessary return statements,
* repeated declarations,
* suggestions inconsistent with upcoming code.

Glide should treat suffix context as a first-class input.

---

# ADR-011: Favor Small Relevant Context

## Status

Accepted

## Decision

Context selection should favor relevance over volume.

## Rationale

Large prompts increase:

* latency,
* cost,
* model distraction,
* network traffic,
* probability of irrelevant completion behavior.

Autocomplete frequently requires only a small amount of context.

The context system should begin with local information and expand only when useful.

---

# ADR-012: Stale Requests Must Be Cancelled

## Status

Accepted

## Decision

Cancellation is a core feature, not an optimization to add later.

## Rationale

Autocomplete requests become stale as soon as the developer continues typing.

Displaying a completion generated for an earlier cursor state produces a visibly poor experience.

Glide should use VS Code cancellation mechanisms and internal request generation identifiers so obsolete responses are never displayed.

---

# ADR-013: Debounce Requests

## Status

Accepted

## Decision

Do not call Luna on every keystroke.

## Rationale

Generating a request for every typed character would:

* waste API calls,
* increase cost,
* generate many stale requests,
* create unnecessary model load,
* potentially increase latency.

Initial debounce should be configurable.

An adaptive debounce strategy may be introduced later.

---

# ADR-014: Output Processing Is a Core Subsystem

## Status

Accepted

## Decision

Never display raw Luna output directly.

## Rationale

A general-purpose model may return:

* Markdown,
* explanations,
* duplicated code,
* surrounding context,
* repeated suffix,
* excessive completions,
* malformed indentation.

The Impulse output-processing pipeline should clean and validate every suggestion before presenting it to VS Code.

This subsystem is expected to materially affect perceived completion quality.

---

# ADR-015: Silence Is an Acceptable Completion

## Status

Accepted

## Decision

Glide should not attempt to produce ghost text at every opportunity.

## Rationale

Bad autocomplete is worse than no autocomplete.

A completion engine should be willing to return nothing when:

* confidence appears low,
* the user is typing rapidly,
* context is insufficient,
* the cursor is in an inappropriate location,
* output quality checks fail,
* the request became stale.

The objective is useful assistance, not maximum suggestion frequency.

---

# ADR-016: Keep Telemetry Local by Default

## Status

Accepted

## Decision

Glide should collect only local usage statistics unless an explicit future opt-in mechanism is designed.

## Rationale

The target environments may have significant security and privacy constraints.

Useful statistics do not require source code.

Potential local metrics include:

* request latency,
* suggestions returned by the inline provider,
* observed acceptance commands,
* accepted characters,
* characters accepted,
* cache hits,
* cancellations,
* language.

Source content should not be included in analytics.

---

# ADR-017: Build Measurement into V1

## Status

Accepted

## Decision

Completion statistics and benchmarking should be part of the initial implementation rather than added after the engine is built.

## Rationale

Autocomplete quality is subjective unless it is measured.

Without metrics, development can easily degrade into repeated prompt changes based on anecdotal impressions.

Glide should be able to answer questions such as:

* Did this prompt improve acceptance rate?
* Did additional context increase latency?
* Are long completions accepted less often?
* Does Luna perform better in Go than TypeScript?
* Does caching materially improve perceived latency?
* Is a context source improving completion quality enough to justify its cost?

---

# ADR-018: Use Real Coding as the Primary Evaluation

## Status

Accepted

## Decision

Benchmarks are useful, but actual developer behavior is the final measure of success.

## Rationale

Exact reproduction of hidden code is not necessarily the purpose of autocomplete.

A suggestion can differ from the original code and still be highly useful.

The key product question is:

> Did the completion save the developer useful typing without interrupting their thought process?

Real acceptance behavior is therefore a critical metric.

---

# ADR-019: Make A/B Testing Easy

## Status

Accepted

## Decision

Glide should be simple to toggle on and off so developers can compare it with other autocomplete systems.

## Rationale

The project should eventually be compared against:

* GitHub Copilot,
* Tabby,
* Continue,
* future completion systems.

The status bar and Command Palette should provide immediate enable/disable functionality without requiring an editor restart.

---

# ADR-020: LiteLLM Is Optional Infrastructure

## Status

Superseded by ADR-026 for V1

## Decision

Do not make LiteLLM a required component of Glide.

## Rationale

LiteLLM can provide significant value as a centralized model gateway:

* API key management,
* routing,
* rate limits,
* logging,
* virtual keys,
* fallback models,
* cost tracking.

However, Glide should also be able to communicate directly with an OpenAI-compatible endpoint.

This preserves a minimal deployment:

```text
VS Code -> Glide -> Luna
```

while allowing enterprise deployments such as:

```text
VS Code -> Glide -> LiteLLM -> Luna
```

---

# ADR-021: Start as a Local VS Code Extension

## Status

Accepted

## Decision

Glide should initially run entirely inside the VS Code extension host.

Do not introduce a dedicated Glide server unless future requirements justify one.

## Rationale

Because model inference occurs remotely, a separate server provides limited value during initial development.

Keeping everything inside the extension reduces deployment and operational complexity.

A server architecture may become useful later for:

* centralized repository indexing,
* team-wide context,
* organization policy,
* model gateway functionality,
* shared caches.

Those needs do not currently justify the complexity.

---

# ADR-022: Go Is the Initial Quality Target

## Status

Accepted

## Decision

The extension should remain language-independent, but Go should receive the most intensive initial testing.

TypeScript and Python should also be included in the first milestone.

## Rationale

A focused language target makes it easier to judge completion quality.

The underlying architecture should not hard-code Go-specific assumptions unless they clearly belong in a language adapter.

---

# ADR-023: Model Choice Must Remain Replaceable

## Status

Accepted

## Decision

Do not make Luna part of the Glide brand or tightly couple the architecture to a single model identifier.

## Rationale

Luna is currently the preferred runtime model, but model capabilities evolve rapidly.

Future testing may show that:

* another OpenAI model performs better,
* a dedicated FIM model performs better,
* a local model becomes preferable,
* different models should handle different languages.

Changing the model should be configuration rather than a product rewrite.

---

# ADR-024: Next-Edit Prediction Is Deferred

## Status

Accepted

## Decision

Do not attempt Copilot-style next-edit prediction in the first implementation.

## Rationale

Inline completion and next-edit prediction are related but different problems.

The project should first achieve reliable, fast cursor-based completion.

Once the completion pipeline is mature, Glide may explore predicting changes elsewhere in the current file or repository.

---

# ADR-025: The First Deliverable Is an Installable VSIX

## Status

Accepted

## Decision

The first useful project milestone is not a prototype script.

It is an installable VSIX that can be used during normal development.

## Rationale

Autocomplete quality cannot be properly evaluated outside the actual editor workflow.

The extension needs to be dogfooded early.

The first milestone should therefore produce something that can be installed into a normal VS Code environment and used for real coding.

---

# Guiding Product Principle

When making future design decisions, prefer the choice that best supports this experience:

```text
The developer types normally.

Glide understands enough context to predict something useful.

The suggestion appears quickly.

The developer presses Tab without thinking about the AI.

Then continues working.
```

If a feature makes that interaction slower, noisier, less predictable, or more complicated, it should have a strong justification before being added.

---

# ADR-026: V1 Uses the OpenAI Responses API Directly

## Status

Accepted

## Decision

The first public version of Glide will use OpenAI's Responses API directly.

Chat Completions compatibility, third-party providers, local-model backends, and gateway integrations are out of scope for V1.

## Rationale

Glide's goal is a narrow, high-quality Tab-completion experience rather than a general-purpose LLM client. A single API integration reduces configuration, test surface, and latency-path complexity while allowing deliberate optimization for the selected OpenAI models.

The internal client boundary should remain small enough to permit a future, evidence-based change.

---

# ADR-027: Expose Luna, Terra, and Sol as OpenAI Model Choices

## Status

Accepted

## Decision

Glide will offer GPT-5.6 Luna, Terra, and Sol as runtime model choices. Luna is the default.

## Rationale

Luna is the preferred default for frequent completion requests because latency and cost are central to the product. Terra and Sol give developers an explicit way to trade more latency and cost for capability without expanding Glide into a multi-provider product.

The model selection must remain a normal extension setting, while the API and completion behavior remain otherwise consistent.

---

# ADR-028: Stream Internally, Display Atomically

## Status

Accepted

## Decision

Glide V1 will consume completion responses as a stream when the configured Responses endpoint supports streaming.

Streamed text must remain private to the completion pipeline. Glide will accumulate it, apply incremental stop conditions, abort generation when a safe completion boundary is reached, run the complete response-processing and stale-request checks, and only then return one finalized `InlineCompletionItem` to VS Code.

Glide will not display partial streamed ghost text in V1. If streaming is unavailable, the client may fall back to a non-streaming Responses request with the same final processing and validation contract.

## Rationale

Twinny, Tabby, and Continue all consume model output incrementally somewhere in their completion path. They use the stream to stop at suffix overlap, line or indentation boundaries, repeated output, model control tokens, or time limits. Early termination reduces latency, output cost, and irrelevant trailing code even when the editor ultimately receives only a complete suggestion.

This preserves atomic, non-flickering ghost text while capturing the material latency and quality advantages of streaming. It supersedes the non-streaming V1 transport preference in the design specification; it does not expand Glide into partial rendering or a conversational streaming UI.

---

# ADR-029: Configure a Responses Base URL

## Status

Accepted

## Decision

Expose `glide.baseUrl` rather than requiring users to construct a full Responses endpoint. Glide derives the final endpoint by appending `/responses` to OpenAI-style `/v1` URLs and `/openai/v1/responses` to Azure AI Foundry project URLs.

## Rationale

Azure AI Foundry provides a project-scoped base URL such as `https://RESOURCE.services.ai.azure.com/api/projects/PROJECT`; sending a request to that URL directly fails because its Responses route is nested below `/openai/v1/responses`. A base URL field makes the supported contract clear, avoids error-prone manual URL assembly, and preserves Glide's narrow Responses-only integration.

---

# ADR-030: Support Bearer and API-Key Authentication Headers

## Status

Accepted

## Decision

Store one credential in VS Code SecretStorage and allow users to choose either `Authorization: Bearer` or `api-key` request headers through `glide.authentication`.

## Rationale

OpenAI uses bearer credentials, while Azure AI Foundry also supports an `api-key` header and Microsoft Entra bearer tokens. Making the header format explicit supports the two direct Responses endpoints without adding a provider abstraction, alternate protocol, or plaintext secret setting.

---

# ADR-031: Allow an Exact Model or Deployment Override

## Status

Accepted

## Decision

Keep the Luna, Terra, and Sol presets while allowing `glide.modelOverride` to supply an exact model or deployment name to the configured endpoint.

## Rationale

Azure AI Foundry deployments can expose names that differ from the underlying model identifier. Sending a configured override verbatim preserves Glide's simple Responses request while supporting that direct deployment model.

---

# ADR-032: Always Log Sanitized Important Failures

## Status

Accepted

## Decision

Write authentication failures, request failures, and timeouts to the Glide Output channel even when verbose diagnostics are disabled. Each entry includes the normalized endpoint, authentication mode, model/deployment name, status when available, and a failure category. Repeated identical failures are rate-limited.

## Rationale

Endpoint configuration failures are otherwise difficult to diagnose in restricted environments. These fields identify the request route and credential format while avoiding source text, prompts, filenames, completion text, tokens, credentials, query parameters, and URL fragments.

---

# ADR-033: Reject Responses Redirects

## Status

Accepted

## Decision

Every completion and connection-test request uses `redirect: "error"`. Users must configure the final Responses endpoint directly.

## Rationale

The Fetch default follows redirects and may replay the authorization header and request body. The body includes bounded source context. Rejecting redirects at the transport layer preserves Glide's promise that credentials and source travel only to the configured endpoint. A two-origin loopback regression covers 301, 302, 303, 307, and 308 for bearer and `api-key` authentication.

---

# ADR-034: Measure Provider Returns, Not Assumed Displays

## Status

Accepted

## Decision

Local statistics distinguish completion opportunities, provider requests, valid inline items returned, and observed acceptance commands. They do not label a returned item as displayed. Latencies use bounded aggregate histograms, and acceptance IDs exist only in bounded memory.

## Rationale

VS Code's inline-completion API does not provide a reliable rendered event. Calling every returned item “displayed” overstated the evidence and made acceptance ratios ambiguous. Aggregate buckets support p50/p95 comparisons without retaining source, completion text, filenames, repository names, or durable hashes.

---

# ADR-035: Validate Cache Reuse Before Debounce

## Status

Accepted

## Decision

After cheap eligibility checks, Glide checks exact and continuation caches before the network debounce. Continuation reuse requires the same endpoint, model, prompt policy, file URI, suffix, editor formatting, and an advancing cursor whose inserted text exactly matches the beginning of the prior suggestion.

## Rationale

Local reuse should feel immediate. The former post-debounce lookup added 175 ms by default and stopped working when the bounded prefix window slid. Cursor offsets plus tail alignment preserve safe type-through and matching paste reuse while invalidating undo, replacement text, suffix changes, file switches, and formatting or model-policy changes.

---

# ADR-036: Separate Completion Evaluation from Runtime Telemetry

## Status

Accepted

## Decision

Maintain an independently authored MIT synthetic corpus with fixed source-family development/holdout splits. Include Go, TypeScript, Python, YAML, and JSON. Record raw versus processed output, exact/alternative matches, abstention, syntax, and parsed data equality separately. Execute only trusted reference programs; never execute captured model-generated code on the host. New behavioral equivalences require reviewed references or a separately designed sandbox.

The standalone live benchmark reuses the production Responses client and prompt, defaults to dry-run planning, and requires explicit request/output limits and budget/rate assumptions before execution. It uses only synthetic fixture context. Working benchmark artifacts may contain that public synthetic source and are gitignored under `benchmarks/runs/`. Deliberately reviewed public synthetic captures may be preserved as compressed, hash-indexed research artifacts under `docs/benchmarks/artifacts/` for cross-session reproducibility. Both locations are excluded from the VSIX and do not alter source-free runtime statistics. Never archive private dogfood source or credentials. Record missing usage as unknown and preserve full budget reservations after early stops.

## Rationale

The GL-06 corpus audit reproduced the original F2/F3 failures on the historical processor and found a remaining nested-brace boundary defect in the current implementation. Unit-test success and exact-match rates alone are insufficient evidence. CRLF normalization also changed four oracle strings without breaking their behavior, so formatting changes must not automatically be labeled corruption. A declared planning budget bounds intended work but is not a provider billing guarantee. No prompt-quality or editor-latency claim follows from an offline oracle run.

---

# ADR-037: Wait for Protocol Completion and Check Delimiter Ownership

## Status

Accepted during the GL-07 prerequisite repair, 2026-09-16.

## Decision

Disable suffix-similarity stream termination. A response is complete only after the Responses protocol says so; cancellation, the existing timeout, and the server output-token cap still bound work. Keep the early-stop field for compatibility with historical benchmark captures, but the current client does not deliberately stop on suffix text.

For final cleanup, preserve closing delimiters belonging to openings generated in the insertion. Consider trimming a delimiter-only suffix echo only with an available full prefix, a cursor in recognized code, and matching prefix-owned openings. Prefix ownership alone is insufficient: preserve an already-balanced reconstruction; trim only if the original reconstruction has unmatched closers and trimming yields balanced delimiters. This is a deliberately limited lexer for Go, TypeScript/JavaScript and JSON/JSONC, not a general syntax validator. Recognized strings/comments are ignored structurally; ambiguous regex/template states, mixed ownership, or a truncated prefix prevent confident trimming. Reject substantial uncertain overlaps instead of deleting source. Other language punctuation stays unchanged. Significant terminal spaces continue to be preserved.

## Rationale

GL-06 demonstrated that an inner block's final `\n}` could be mistaken for the outer function's existing suffix. Even a long match can be intentional source, and text-delta boundaries can expose shorter transient matches. A completed-response fallback avoids inventing success before a later incomplete/failed event, and makes output-budget comparisons and usage accounting meaningful. The updated regression suite covers nested Go/TypeScript/JSON braces, literals/comments, ambiguous syntax, prefix truncation, and multibyte SSE chunks. The authored corpus retains its prior outcomes.

This may reject useful ambiguous completions and may increase latency compared with a valid early stop. Measure those costs in GL-07; do not reintroduce a similarity-based cutoff to improve a latency number. No claim of universal syntax preservation follows from this limited check.

---

# ADR-038: Preserve Insertion-Only Editing After the Fragment Experiment

## Status

Accepted after GL-07b, 2026-09-17.

## Decision

Keep the P0 insertion-only prompt and an empty editor replacement range. Preserve the exact-prefix full-fragment derivation as a benchmark strategy, not production behavior. Any future reconstruction strategy must exactly match already typed source before deriving an insertion; mismatch means no suggestion and never silent replacement.

Version the synthetic corpus as V2 for the repaired CRLF cursor, UTF-16/position validation and new contract/context families. Retain V1 and its hash for historical capture replay. Keep the original 56-case holdout unused for prompt tuning.

## Rationale

Across 36 attempts per arm, P4 was faster but produced 7 recognized reference/data matches versus P0's 12 and 18 unexpected empty insertions versus 3. Seven full-fragment responses failed the prefix check and four repeated only the typed fragment; the derivation rejected all safely. The result supports the safety contract but not promotion.

---

# ADR-039: Keep Selected Same-File Context Experimental

## Status

Accepted after GL-08, 2026-09-17.

## Decision

Provide bounded selected same-file context behind `glide.sameFileContext`, default `false`. Selection may inspect only the active eligible document, up to 500,000 source characters, and may transmit at most 2,000 selected characters. It has a 25 ms deadline, two-call concurrency cap, cancellation/staleness checks, adjacent deduplication and a cache-identity field. Do not add cross-file retrieval or a persistent index.

## Rationale

The selected C2 arm matched 18/24 dependency-family samples by the frozen reference/data proxy, compared with 21/24 for the smaller adjacent C1 arm and 20/24 for C0. The five-family interval was wide and YAML regressed. The implementation is useful for controlled dogfood, but the evidence does not justify expanding default transmission.

---

# ADR-040: Separate Explicit and Automatic Completion Timing

## Status

Accepted after GL-09 machine validation, 2026-09-17.

## Decision

Retain a fixed 175 ms automatic debounce. Explicit VS Code inline-completion invocation bypasses that delay and automatic-only noise suppressions while retaining trust, sensitive-file, credential, endpoint, selection and size guards. Local statistics separately count automatic and explicit opportunities and estimate active editing time from bounded inter-opportunity intervals.

## Rationale

Deterministic traces showed that 75/175/300 ms would issue 18/13/8 requests for the same 29 opportunities, while each produced six results before the next edit under the trace assumptions. The trace does not measure distraction or usefulness, so it does not support a default change. Immediate explicit invocation is user-requested work and has direct lifecycle/editor tests.

---

# ADR-041: Observe Automatic Prompt Caching Without Stable Identifiers

## Status

Accepted after GL-10, 2026-09-17.

## Decision

Parse and preserve Responses cached-input, cache-write-input and reasoning-output token details. Rely on provider automatic prompt caching when eligible. Do not send a production `prompt_cache_key`, stable user/repository identifier, filler, or retained source history. Keep `store:false` and document that it does not disable provider prompt caching.

## Rationale

The repeated long-context experiment recorded 95,130 cache-read and 47,565 cache-write tokens, but cache-read request latency was not better than cache-write latency in the small interleaved sample. Shorter GL-07b prompts had no cache activity. Accurate usage is valuable; explicit cache controls have no demonstrated editor benefit and would add privacy and identity decisions.

---

# ADR-042: Bundle for the Minimum VS Code Extension Host

## Status

Accepted during GL-11 release-candidate validation, 2026-09-17.

## Decision

Use Node 24 for development tools while bundling production and integration code to the Node 16.14 syntax target supported by the VS Code 1.82 baseline. CI and local release checks run the native editor integration suite on VS Code 1.82 and current stable.

## Rationale

The previous Node 24 bundle target did not match the declared minimum editor runtime. The revised bundle passes the same activation, completion, acceptance, guard and stale-request scenarios on VS Code 1.82.0 and 1.138.0. The package inspection confirms that only the bundled runtime, source map and release assets ship.
