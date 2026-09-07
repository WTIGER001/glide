# Glide contributor guidance

## Product boundary

Glide is a lightweight VS Code extension for predictive inline code completion.

- Optimize for fast, useful ghost-text suggestions accepted naturally with Tab.
- Keep V1 focused on cursor-based completion. Do not add chat, coding-agent, sidebar, repository-management, or next-edit-prediction features unless the task explicitly expands scope.
- A valid outcome is no suggestion: avoid distracting or low-quality output.

## Architecture and privacy

- Run the initial implementation in the VS Code extension host; do not introduce a Glide server without clear evidence that it is needed.
- Support OpenAI's Responses API only. Offer GPT-5.6 Luna, Terra, and Sol as runtime choices, defaulting to Luna; do not add alternate providers or Chat Completions compatibility in V1.
- Glide must work directly with the OpenAI API; LiteLLM or another gateway is out of scope for V1.
- Do not add mandatory external services, telemetry, accounts, licensing checks, or source-code transmission beyond the configured completion endpoint.
- Keep telemetry off by default. Statistics are local and must never include source content, prompts, filenames, repository names, or completion text.
- Store the OpenAI API key through VS Code SecretStorage. An `OPENAI_API_KEY` environment-variable fallback is permitted for development and managed environments; never require, bundle, or automatically read a workspace `.env.local` file at runtime.
- Do not request completions from an untrusted workspace or protected/sensitive files by default. Built-in protections may require an explicit advanced opt-in to override.

## Completion pipeline requirements

- Treat prefix and suffix as first-class completion context.
- Prefer small, relevant local context: cursor vicinity, current symbol, imports/declarations, and nearby definitions. Defer embeddings, vector databases, and persistent semantic indexes.
- Debounce completion requests, deduplicate equivalent requests, cache safely, and cancel/invalidate stale requests immediately. Never display a response for an obsolete document/cursor state.
- Use minimal practical reasoning and short responses on the autocomplete path; latency outweighs maximum deliberation.
- Always process model output before display. Reject or clean Markdown, explanation/prompt leakage, duplicated prefix or suffix, repeated blocks, excessive output, whitespace-only output, and indentation problems.

## V1 UX and delivery

- Prefer native VS Code inline completions, a small enable/disable status indicator, Command Palette commands, and normal settings. Do not add a permanent Activity Bar or sidebar in V1.
- Preserve the normal VS Code Tab acceptance workflow and support useful multiline completions.
- The first milestone is an installable VSIX that can be dogfooded in normal development.
- Target desktop VS Code only; browser-based VS Code environments are out of scope.
- Prepare the project for public VS Code Marketplace release under the `wtiger001.glide` identity, with repository URL `https://github.com/wtiger001/glide`. Use publishable metadata, clear documentation, the MIT license with `John Bauer` as copyright holder, and no hard-coded credentials or private infrastructure assumptions.
- Prioritize Go quality first, while keeping the core language-independent and testing TypeScript and Python as well.

## Quality and change discipline

- Build local measurements into the product: latency, cancellation, cache-hit, suggestion/display/acceptance counts, accepted characters, completion length, and language are appropriate examples.
- Benchmark prompt/context/output-processing changes with deterministic completion cases where possible, then validate by real editor usage and acceptance behavior.
- Favor relevance over prompt volume; introduce extra context or infrastructure only when measured results justify its latency and complexity costs.
- Keep design decisions in `docs/design_decisions.md` current when a substantive architectural or product decision changes. Do not revisit accepted decisions casually; document the evidence for a reversal.
- Treat Type Ahead and Twinny as reference implementations only. Do not copy their source; learn from Type Ahead's modular completion lifecycle and Twinny's FIM UX and public-extension release discipline, while avoiding uncancelled fetches, broad context collection, plaintext key configuration, multi-provider scope, embeddings, chat, and agent-like features.
- Before implementation, consult `README.md` and `docs/design_decisions.md` for product intent and settled decisions.
