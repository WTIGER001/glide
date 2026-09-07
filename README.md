# Glide

Glide is a lightweight VS Code extension for low-latency AI code completion using GPT-5.6 Luna Fast or another OpenAI-compatible model endpoint.

Glide is intended primarily for isolated, restricted, enterprise, and government development environments where developers need Copilot-style inline code completion but cannot depend on a vendor-hosted IDE service.

The initial goal is deliberately narrow:

> Provide fast, useful ghost-text code completion that appears naturally while the developer types and can be accepted with Tab.

Glide is not initially intended to be a coding agent, chat assistant, repository management system, or replacement for tools such as Codex, Cline, Zoo Code, or VS Code Agent Mode.

Those tools solve a different problem.

Glide focuses on one thing and should do it well: predictive code completion.

---

## Current Implementation

Glide now has an installable V1 foundation with:

* native VS Code inline ghost text and normal Tab acceptance,
* direct OpenAI Responses API requests with Luna as the default,
* private stream consumption followed by atomic display,
* real fetch cancellation, request timeouts, generation IDs, and stale-editor validation,
* bounded prefix and suffix context from the active file,
* protected-file and workspace-trust safeguards,
* response cleanup, suffix/prefix overlap removal, and indentation normalization,
* exact and type-through continuation caching,
* API keys in VS Code SecretStorage with an `OPENAI_API_KEY` environment fallback,
* local source-free statistics and metadata-only optional diagnostics.

The initial code intentionally excludes chat, agents, sidebars, repository indexing, embeddings, and cross-file context.

## Install and Configure

Install the generated VSIX from VS Code's **Extensions: Install from VSIX...** command, then run:

```text
Glide: Set OpenAI API Key
Glide: Test Connection
```

Glide defaults to `gpt-5.6-luna` and OpenAI's `https://api.openai.com/v1` base URL. Terra and Sol can be selected through `glide.model`. Set `glide.baseUrl` to use a controlled Responses-compatible service; Glide appends the Responses path automatically. For Azure AI Foundry, use the Foundry project URL such as `https://RESOURCE.services.ai.azure.com/api/projects/PROJECT`, which Glide resolves to `/openai/v1/responses`. Glide requires HTTPS except for loopback development endpoints.

Glide never reads a workspace `.env` or `.env.local` file. For managed development environments, set `OPENAI_API_KEY` in the VS Code extension host's environment instead.

## Develop

Glide uses Node.js 24 LTS for development and supports VS Code 1.82 or newer.

```bash
npm install
npm run check
npm run package
```

The packaged extension is written to `glide-0.1.0.vsix`. Unit tests use captured Responses payloads and never require an API key.

---

## Why Glide Exists

Modern AI coding products generally fall into two categories.

The first category includes commercial products such as GitHub Copilot, Cursor, and Windsurf. These products provide excellent inline completion experiences, but their completion engines generally depend on vendor-operated infrastructure and cannot simply be pointed at an arbitrary private model endpoint.

The second category includes open-source tools such as Tabby and Continue. These provide significantly more deployment flexibility and have contributed important ideas around code context, fill-in-the-middle completion, local models, model routing, and repository awareness.

However, our requirements are unusually specific.

We already have access to GPT-5.6 Luna Fast through a controlled API endpoint. Luna is fast, inexpensive relative to larger reasoning models, and capable enough to be a strong candidate for frequent code completion requests.

Rather than inserting several generic abstraction layers between VS Code and Luna solely to obtain inline completion, Glide will explore whether a purpose-built Luna-oriented completion engine can provide a simpler and better-controlled solution.

The intended architecture is therefore:

```text
VS Code
   |
   v
Glide
   |
   +-- Context selection
   +-- Debounce / cancellation
   +-- Cache
   +-- Completion prompting
   +-- Output cleanup
   |
   v
GPT-5.6 Luna Fast
or another configured OpenAI-compatible endpoint
```

A gateway such as LiteLLM may optionally sit between Glide and the model endpoint for centralized authentication, routing, auditing, rate limiting, or model selection.

Glide must not require such a gateway.

---

## Design Principles

### Invisible by default

Autocomplete should not interrupt the developer's thought process.

Glide should primarily exist as ghost text inside the editor. The developer should not have to interact with a chat window, sidebar, panel, or agent to receive suggestions.

The main interaction should be:

```text
type code
    |
suggestion appears
    |
press Tab
```

### Latency matters more than maximum intelligence

Autocomplete is fundamentally different from agentic coding.

A powerful answer arriving several seconds later is usually useless as an inline completion.

Glide should optimize aggressively for:

* fast time to first suggestion,
* small prompts,
* cancellation of stale requests,
* minimal network traffic,
* useful rather than exhaustive context,
* short responses,
* low cognitive interruption.

GPT-5.6 Luna Fast should initially use the lowest practical reasoning effort for the normal autocomplete path.

Larger reasoning models belong in agents and deliberate coding workflows, not on the critical path of every keystroke.

### Context quality over context quantity

Glide should not send the entire repository with every completion request.

The initial context strategy should prioritize:

1. text immediately before the cursor,
2. text immediately after the cursor,
3. the current function, method, class, or symbol,
4. imports and relevant declarations,
5. nearby definitions,
6. recently edited code,
7. open or recently used files,
8. selectively retrieved repository context when justified.

Additional context should only be introduced when it measurably improves completion quality.

### Model-specific optimization is acceptable

Glide does not need to support every LLM provider or every historical completion format.

The initial implementation should be optimized around Luna Fast and OpenAI-compatible APIs.

A clean provider abstraction is desirable, but generic provider compatibility must not compromise latency or implementation simplicity.

### Isolated-environment friendly

Glide must be usable in environments where arbitrary outbound Internet access is prohibited.

The extension should not require:

* a GitHub account,
* a Glide cloud account,
* a telemetry service,
* a licensing server,
* a vendor proxy,
* an external indexing service.

The only model-related network destination should be the configured model endpoint or explicitly configured gateway.

Telemetry must be off by default.

No source code should be transmitted anywhere except the configured completion endpoint.

---

## Relationship to Existing Tools

Glide should learn from existing autocomplete systems without attempting to duplicate them wholesale.

### Tabby

Tabby is an important architectural reference because it treats code completion as a dedicated system rather than merely sending chat prompts from an editor.

Useful concepts to study include:

* prefix and suffix context,
* fill-in-the-middle prompting,
* repository context,
* relevant snippet selection,
* caching,
* prompt templates,
* completion post-processing,
* remote model support,
* client/server separation.

Glide does not initially require Tabby's server architecture because inference will occur remotely through Luna Fast.

### Continue

Continue is another useful reference, especially for:

* VS Code inline completion behavior,
* autocomplete request lifecycle,
* context gathering,
* cancellation,
* recently edited context,
* import context,
* configurable model endpoints.

Glide should adopt proven ideas where useful while remaining substantially smaller and more specialized.

### GitHub Copilot

Copilot represents the user-experience benchmark.

Glide should aspire to the same basic feeling:

* suggestions appear without explicit prompting,
* suggestions arrive quickly,
* suggestions are often short and obvious,
* multiline suggestions appear when useful,
* accepting a suggestion feels natural,
* poor suggestions disappear immediately when the developer continues typing.

Glide does not initially attempt to reproduce Copilot's entire feature set, including agent functionality or advanced next-edit prediction.

### Codex, Cline, Zoo Code, and other agents

These tools are complementary to Glide.

A likely developer environment is:

```text
VS Code
   |
   +-- Glide
   |     |
   |     +-- Luna Fast
   |         inline completion
   |
   +-- Codex / Cline / Zoo / Agent
         |
         +-- Sol or another stronger model
             planning, debugging, refactoring, agent work
```

Autocomplete and agentic coding should remain separate concerns unless future evidence suggests otherwise.

---

## Product Naming

The extension is named **Glide**.

The name represents the desired user experience: the developer continues moving naturally while code appears smoothly ahead of them.

The internal completion engine may use the name **Impulse**.

Example internal component names may include:

```text
ImpulseEngine
ImpulseContext
ImpulseCache
ImpulseRequest
ImpulseResultProcessor
```

This lets the product name describe the experience while the engine name describes the event-driven completion mechanism.

---

## Initial User Experience

Glide should not have a dedicated sidebar in the first release.

The primary interfaces should be:

### Inline ghost text

Suggestions appear directly in the editor and are accepted using the normal VS Code Tab workflow.

### Status bar

A small status indicator should provide visibility without consuming editor space.

Example:

```text
Glide: Luna
```

The status item should allow quick access to enable or disable completion.

### Command Palette

Initial commands should include:

```text
Glide: Enable
Glide: Disable
Glide: Toggle
Glide: Show Stats
Glide: Reset Stats
Glide: Clear Cache
Glide: Test Connection
```

### VS Code Settings

Configuration should use normal VS Code extension settings.

Example configuration concepts:

```json
{
  "glide.baseUrl": "https://example/v1",
  "glide.model": "gpt-5.6-luna",
  "glide.debounceMs": 175,
  "glide.maxPrefixTokens": 6000,
  "glide.maxSuffixTokens": 1500,
  "glide.maxCompletionTokens": 256
}
```

Secrets should preferably use VS Code SecretStorage, environment variables, platform credential storage, or another secure mechanism rather than plaintext settings.

---

## First Milestone

The first milestone is a working installable VSIX.

It should support:

* VS Code inline ghost-text completion,
* Tab acceptance,
* GPT-5.6 Luna Fast,
* configurable OpenAI-compatible endpoint,
* configurable authentication,
* prefix and suffix context,
* current-file context,
* current symbol/function context where practical,
* configurable debounce,
* cancellation of stale requests,
* request deduplication,
* simple local caching,
* response cleanup,
* duplicate-prefix and duplicate-suffix removal,
* indentation normalization,
* multiline completions,
* enable/disable status indicator,
* local statistics,
* optional diagnostic logging,
* no external telemetry,
* VSIX packaging.

The first languages to test heavily should be:

* Go,
* TypeScript,
* Python.

The architecture should remain language-independent where possible.

---

## Completion Request Lifecycle

A normal request should approximately follow this process:

```text
Developer types
      |
      v
Debounce timer
      |
      v
Is completion appropriate?
      |
      +-- no --> do nothing
      |
      v
Collect local context
      |
      v
Build completion request
      |
      v
Check cache / duplicate request
      |
      v
Send request to Luna Fast
      |
      v
Developer types again?
      |
      +-- yes --> cancel stale request
      |
      v
Receive completion
      |
      v
Clean / normalize / validate
      |
      v
Display ghost text
      |
      v
Accepted or ignored
      |
      v
Update local statistics
```

Glide should be willing to make **no suggestion**.

Silence is better than a distracting or obviously wrong completion.

---

## Prompting Strategy

Luna is a general-purpose model rather than a traditional dedicated FIM completion model.

Glide therefore needs to carefully structure completion requests.

A conceptual request may look like:

```text
You are a code completion engine.

Return only the text that belongs at the cursor.
Do not explain the result.
Do not use Markdown.
Do not repeat code that already exists.
Preserve the language, style, formatting, and indentation.

Language: Go
File: service.go

Relevant context:
...

<BEFORE>
...
func (s *Service) GetUser(ctx context.Context, id string) {
    user,
</BEFORE>

<CURSOR>

<AFTER>
    return user, nil
}
</AFTER>
```

The exact prompt should be treated as an implementation detail and tuned experimentally.

Prompt quality should be evaluated through benchmarks rather than intuition alone.

---

## Cancellation and Debouncing

Autocomplete requests become obsolete extremely quickly.

If the user continues typing after a request begins, Glide should immediately invalidate or cancel the old request when possible.

Requests should not be generated on every keystroke.

The debounce algorithm should initially be simple and configurable.

Future versions may make debounce timing adaptive based on:

* typing speed,
* cache availability,
* previous model latency,
* programming language,
* current syntactic context,
* whether the user appears to be pausing intentionally.

---

## Completion Cleanup

Raw model output should never automatically become visible ghost text.

Glide should normalize and validate results first.

Potential processing includes:

* removing Markdown fences,
* removing explanatory text,
* stripping duplicated prefix,
* stripping duplicated suffix,
* normalizing indentation,
* limiting excessive output,
* rejecting incomplete Markdown-style responses,
* rejecting obvious prompt leakage,
* rejecting repeated blocks,
* removing text already present after the cursor,
* handling whitespace-only suggestions,
* respecting editor insertion ranges.

This processing layer is expected to be one of the most important parts of completion quality.

---

## Local Statistics

Glide should measure its usefulness without collecting source code.

Local statistics may include:

```text
suggestions generated
suggestions displayed
suggestions accepted
suggestions rejected or ignored
characters suggested
characters accepted
request latency
time to first token
request cancellations
cache hits
completion length
language
```

Metrics should remain local unless a future explicit opt-in system is designed.

Source code, prompts, file contents, filenames, repository names, and completion contents should not be included in analytics by default.

---

## Testing Philosophy

Glide should be evaluated in three ways.

### Deterministic benchmark

Create completion cases by removing code from existing source files.

Each case contains:

```text
prefix
suffix
expected missing code
language
optional contextual snippets
```

Candidate completion strategies can then be compared repeatedly.

Useful measurements include:

* latency,
* exact match,
* edit similarity,
* syntactic validity,
* compilation success,
* test success,
* semantic equivalence,
* completion length.

### Real-world usage

Developers should use Glide during normal work.

The most meaningful signals are acceptance rate and how much useful typing the system eliminates.

### A/B comparison

Glide should periodically be compared against tools such as Copilot, Tabby, or Continue when those tools are available.

The benchmark is not merely whether Glide produces technically correct code.

The real target is:

> Does Glide help the developer write correct code faster without interrupting concentration?

---

## Future Capabilities

Features intentionally deferred from the first milestone include:

* repository-wide semantic indexing,
* embeddings,
* vector databases,
* persistent project indexes,
* next-edit suggestions,
* cross-file edit prediction,
* multiple completion candidates,
* completion history UI,
* dedicated sidebar,
* team telemetry,
* centralized management UI,
* model routing,
* fallback models,
* organization policy management.

These should only be added when testing demonstrates a meaningful benefit.

---

## Potential Future Architecture

A larger deployment might eventually use:

```text
Developer VS Code
       |
       v
     Glide
       |
       v
Central AI Gateway
such as LiteLLM
       |
       +-- Luna Fast
       +-- future completion model
       +-- local model fallback
```

This could provide:

* centralized authentication,
* virtual API keys,
* auditing,
* usage limits,
* model routing,
* fallback models,
* centralized cost control.

Glide itself should remain independent of the gateway implementation.

---

## Development Model

Glide should be developed primarily using GPT-5.6 Sol with a higher reasoning setting for architecture, code review, debugging, and analysis of reference implementations.

GPT-5.6 Luna Fast is the initial runtime completion model.

This distinction is intentional:

```text
Sol
  -> build the completion engine

Luna Fast
  -> run the completion engine
```

The system should be designed so that the runtime model can be replaced later without renaming or fundamentally redesigning Glide.

---

## Success Criteria

The first meaningful release of Glide is successful when:

1. it installs cleanly as a VSIX,
2. it works without any Glide-operated cloud service,
3. it talks only to the configured model endpoint,
4. suggestions appear quickly enough to be useful,
5. multiline completions work,
6. stale completions are reliably cancelled,
7. accepting suggestions feels natural,
8. poor model output is filtered effectively,
9. it works well for ordinary Go development,
10. developers voluntarily leave it enabled while coding.

The final criterion is the most important.

An autocomplete system that developers disable has failed regardless of benchmark scores.
