# Glide Architecture and Product Decisions

This document records the major decisions made during the initial design of Glide and, importantly, the reasoning behind them.

The purpose is to prevent future development from accidentally revisiting settled questions without understanding why the original decision was made.

These decisions are not immutable. They may be changed when evidence from implementation or testing justifies doing so.

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
* suggestions displayed,
* suggestions accepted,
* acceptance percentage,
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

Accepted

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
