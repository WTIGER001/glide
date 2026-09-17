# Glide completion action plan

Created: 2026-09-16.  
Baseline: `9a31109bac2d20ab110f1f25c6db93f4e72b5392` / `0.1.3`.  
Status: GL-07b through GL-10 evaluated; GL-11 machine release candidate complete; five-session human gate remains (2026-09-17).  
Research: [Usable Tab completion with Luna](luna-completion-research.md), including primary sources S01–S17.

## Objective and constraints

Make short, useful Luna suggestions arrive reliably at the cursor and work with normal Tab acceptance. Preserve Responses-only transport, default Luna, explicit minimal reasoning, SecretStorage, source-free local statistics, current-file context, and private streaming with atomic display. Keep Go as the primary quality target with TypeScript, Python, YAML, and JSON coverage.

This plan proposes experiments, not a claim that a particular prompt or latency target already works. It does not authorize adding alternate providers, cross-file transmission, chat, agents, indexing, a server, or next-edit prediction. Do not remove existing endpoint settings as incidental cleanup. Resolve documentation conflicts deliberately in GL-11, following the user's instructions and `AGENTS.md`.

**Next: complete the five-session human dogfood gate, then make a publish/no-publish decision.** [GL-07b](benchmarks/2026-09-17-gl07b.md) retained P0 after a 72-call fragment comparison; [GL-08](benchmarks/2026-09-17-gl08.md) kept selected same-file context disabled after a 90-call context comparison. GL-09 retains fixed 175 ms pending human evidence, and GL-10 relies on automatic caching without an explicit key. The 56-case holdout remains unused for live inference. Cumulative planning reservations were $0.93536050 against the authorized $2; known usage-priced estimates total approximately $0.0778096 plus the earlier cancelled request with unknown usage, before cache-tier adjustment.

## Findings carried forward from the code assessment

| ID | Finding and evidence | Required follow-up |
| --- | --- | --- |
| F1 — P1 | `fetch` followed redirects and could forward a credential and prompt between origins. | Fixed in GL-01. |
| F2 — P1 | Streaming stopped on whitespace overlap and could yield an unfinished block opener. | Fixed in GL-02. |
| F3 — P1 | Cleanup removed required punctuation or significant terminal whitespace. | Original cases and the GL-06 nested-brace reproduction fixed; conservative ambiguity handling documented in ADR-037. |
| F4 — P2 | Cache checks followed debounce, and continuation failed when the bounded prefix window slid. | Fixed in GL-05. |
| F5 — P2 | Provider-returned items were labeled displayed; timing was a mean; safe numeric diagnostics were filtered. | Fixed in GL-04. |
| F6 — P1 quality gap | Coordinator and real-editor coverage were insufficient; no completion benchmark existed. | Automated lifecycle/editor, V2 corpus, and live experiment work is complete; five real coding sessions remain. |
| F7 — release consistency | Identity, endpoint scope, and VSIX documentation conflicted. | Reconciled and package-inspected; publishing remains separate. |

The prior review ran `npm run check` and `npm run test:integration` successfully. The reproducible defects above remain unfixed at this plan's creation. Later sessions should verify the current revision rather than assume these observations remain true.

## Work sequence and tracker

| Ticket | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| GL-01 | Enforce the configured network destination | None | [x] Complete |
| GL-02 | Preserve insertion semantics and safe stream boundaries | None | [x] Follow-up fixed; limited lexical contract documented |
| GL-03 | Exercise lifecycle, transport, and real editor behavior | GL-01, GL-02 | [x] Complete |
| GL-04 | Make local measurements accurate and usable | GL-03 | [x] Complete |
| GL-05 | Make exact/continuation reuse fast and correct | GL-02, GL-03 | [x] Complete |
| GL-06 | Build deterministic fixtures and a Luna evaluation harness | GL-01–GL-04 | [x] Harness complete; prerequisite defect reported |
| GL-07 | Run controlled insertion-prompt and output-budget experiments | GL-05, GL-06 | [x] Evaluated; no promotion, retain P0/fixed96 |
| GL-07b | Improve evaluation validity and partial-token insertion | GL-07 | [x] Evaluated; retain P0 |
| GL-08 | Test bounded, relevant same-file context | GL-07b | [x] Evaluated; opt-in remains off |
| GL-09 | Tune automatic timing and selective suggestions | GL-04, GL-07; use GL-08 winner if available | [~] Machine work complete; human sessions open |
| GL-10 | Evaluate server prompt caching only if worthwhile | GL-06–GL-08 | [x] Evaluated; explicit controls deferred |
| GL-11 | Dogfood, reconcile docs, and validate a release candidate | GL-01–GL-09; GL-10 optional | [~] Machine RC complete; five-session gate open |

Remaining work is human editor validation under the GL-11 criteria, followed by a publish/no-publish decision. Preserve the frozen benchmark artifacts and do not use the untouched holdout for prompt tuning.

## Suggested development model by ticket

These are engineering estimates for the Codex sessions that implement this plan, not measured model comparisons on Glide. They do not change Luna as the runtime completion model. Recommendations checked against official model guidance on 2026-09-16: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) for complex reasoning/coding/research, [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) for complex professional work, and [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) for balancing capability and cost. API pricing does not establish Codex subscription usage or total task cost.

Default to **GPT-5.6 Sol / High** for implementation. Use **GPT-6 Astra / High** where boundary semantics or experimental validity require more judgment. If simplicity and quality matter more than conserving usage, staying on Astra High for every ticket is reasonable; switching is optional.

| Ticket | Recommended model / reasoning | Why |
| --- | --- | --- |
| GL-01 — Block redirects | GPT-5.6 Terra / Medium | Small, specified transport change with a decisive two-server regression test. Escalate to Sol High if authentication/transport behavior requires broader changes. |
| GL-02 — Insertion and stream boundaries | GPT-6 Astra / High | Highest semantic risk: punctuation, whitespace, partial syntax, and chunk boundaries interact across languages. |
| GL-03 — Lifecycle and editor tests | GPT-5.6 Sol / High | Async cancellation, deduplication, editor state, and a realistic fixture server require careful integration work. |
| GL-04 — Honest local metrics | GPT-5.6 Sol / Medium | Mostly defined instrumentation, with care needed around acceptance attribution and source-free persistence. |
| GL-05 — Cache fast path and continuation | GPT-5.6 Sol / High | Sliding prefix windows, document identity, and stale-state protection interact. |
| GL-06 — Corpus and evaluation harness | GPT-6 Astra / High | Corpus validity, holdout isolation, scoring, and functional checks determine whether later conclusions are trustworthy. Sol High can implement a settled harness design. |
| GL-07 — Prompt and output experiments | GPT-6 Astra / High | Hypothesis design and interpretation must distinguish model failures, cleanup effects, and latency tradeoffs. Live completions must still be generated by Luna. |
| GL-07b — Evaluation and partial-token insertion | GPT-6 Astra / High | The live screen exposed ambiguous intended answers, an invalid CRLF cursor, and fragment/suffix failures. Separate evaluation validity from model quality before promotion. |
| GL-08 — Selected same-file context | GPT-5.6 Sol / High | Context selection, versioning, deadlines, and language-provider behavior need coordinated implementation. |
| GL-09 — Timing and selectivity | GPT-5.6 Sol / High | Scheduling changes must preserve lifecycle guarantees and be evaluated against session-level usefulness. Use Astra High if the results are ambiguous. |
| GL-10 — Provider prompt caching | GPT-5.6 Sol / Medium | A bounded capability/measurement experiment; verifying current endpoint semantics matters more than additional reasoning. |
| GL-11 — Dogfood and release candidate | GPT-5.6 Sol / High | Cross-version editor behavior, packaging, CI, and release/documentation consistency span the project. Terra Medium is suitable for isolated documentation fixes. |

**Escalation:** do not start any ticket at XHigh/Max by default. Try Astra High when a smaller model cannot explain a reproducible failure. Consider Astra XHigh only for a persistent, isolated boundary/race defect or difficult experimental interpretation after collecting a minimal reproduction and relevant evidence. More reasoning cannot replace real editor tests, controlled Luna calls, or human dogfooding.

**Runtime distinction:** the implementation assistant may be Astra, Sol, or Terra, but the primary GL-06–GL-10 evaluation target remains Luna under the declared runtime settings. Do not use a stronger assistant's completion quality as evidence about Luna. Record the development model/reasoning in session handoffs when useful; model choice does not relax any acceptance gate.

## GL-01 — Enforce the configured network destination

**Status: Complete (2026-09-16).** Fetch uses `redirect: "error"`. A real two-origin test covers 301/302/303/307/308 with bearer and `api-key` authentication and verifies that the target receives nothing.

**Purpose:** fix F1 before normal dogfooding. Evidence: local reproduction; project privacy contract.

**Files:** `src/openaiResponsesClient.ts`, its tests, and privacy documentation if explanatory wording changes.

**Implementation:** reject HTTP redirects by default at the transport layer (`redirect: "error"` is the simplest starting design). A redirect failure should produce a sanitized, actionable diagnostic. Do not follow a redirect and inspect its destination afterward. Apply the same client policy to the connection-test command. Retain HTTPS validation and loopback development support.

**Done when:** a local two-server test covers 301/302/303/307/308 with both supported auth modes; the second server receives no request, body, or credentials. Direct success still works; no response body, key, or source enters error logs. Tests use a synthetic key and content only. Run `npm run check`.

**Handoff:** record the chosen redirect behavior, regression tests, revision, and any user-facing diagnostic change. Do not broaden gateway support.

## GL-02 — Preserve insertion semantics and safe stream boundaries

**Status: Follow-up fixed (2026-09-16 GL-07 prerequisite).** The original F2/F3 cases and GL-06 nested-brace reproduction now pass. Suffix-based early termination is disabled; final cleanup distinguishes generated versus prefix-owned delimiters with a deliberately limited lexer and declines uncertain substantial overlaps. Tests include true echoed closers, nested Go/TypeScript/JSON blocks, literals/comments, opaque regex syntax, truncated prefixes, and terminal incomplete status across 1/2/7/1024-byte SSE chunks. ADR-037 states the limits. The [GL-06 report](benchmarks/2026-09-16-gl06.md) remains the historical record of the defect; this does not establish general syntactic correctness.

**Purpose:** fix F2/F3. Research motivation: S05/S06; the concrete remedies must be demonstrated locally.

**Files:** `src/outputProcessor.ts`, `src/openaiResponsesClient.ts`, both test files; add table-driven completion fixtures.

**Implementation:** remove whitespace-only suffix stops; preserve significant terminal spaces; stop deleting matching punctuation without evidence that it is duplicated context. Separate incremental boundary detection from final output cleanup. Validate the candidate against both sides of the cursor. Use conservative behavior when lexical structure is ambiguous, and retain completed-response fallback. Keep user cancellations/timeouts distinct from deliberately validated early stops.

**Required regression families:** the three F2/F3 examples; nested calls/braces; legitimate repeated punctuation; quotes, escaped strings, comments; Go tabs; Python indentation; TypeScript templates; CRLF; Unicode; empty suffix; multiline suffix echoes; repeated blocks; fences and prose. Preserve useful fragments even when the surrounding document is still being edited.

**Done when:** valid synthetic insertions survive unchanged where appropriate; actual suffix echoes are handled conservatively; replaying a response with alternate text-delta and byte chunk boundaries does not introduce corruption. No fragment from an ordinary aborted/incomplete request is displayed. Record raw versus processed outcomes. Run `npm run check` and applicable integration checks.

**Handoff:** document the boundary contract and remaining false negatives. Do not claim general syntax correctness from a bracket counter.

## GL-03 — Exercise lifecycle, transport, and real editor behavior

**Status: Complete (2026-09-16).** Lifecycle tests cover shared and cancelled subscribers, stale and superseded work, unrelated documents, disposal, and status races. Stream tests cover failure/incompletion, CRLF, multibyte chunks, terminal frames, and real loopback cancellation. VS Code 1.82 triggers and accepts a multiline inline suggestion against a loopback Responses server and verifies final bytes.

**Purpose:** close F6's most important gaps and protect the architecture while optimizing it.

**Files:** `src/completionCoordinator.ts`, `src/extension.ts`, `src/openaiResponsesClient.ts`, mocks, integration tests, and integration scripts.

**Implementation:** build an isolated loopback Responses fixture server with controllable delay, deltas, disconnects, statuses, and captured synthetic requests. Add tests for typing, moving the cursor, switching documents, disable/config/key changes, deactivation, timeout, and one/all deduplicated subscriber cancellations. Include an already-cancelled subscriber and a late result from a superseded operation. Check that old operations cannot reset the status of newer work.

Scope editor/document invalidation to the active request; unrelated document changes should not cancel it. Verify that malformed/error/incomplete streams cannot return a successful candidate. Handle CRLF SSE framing, multibyte chunk boundaries, and missing completion events. Document that parsing a JSON response to `stream:true` is not the same as retrying an endpoint that rejects streaming; add no silent duplicate request policy.

**Done when:** VS Code tests insert single- and multiline ghost-text candidates using the native accept command and assert resulting document bytes. Manual physical-Tab verification remains part of GL-11. Stale work produces neither returned items nor cache writes. The local server observes cancellation. Tests never use a real credential or contact a production endpoint. Run `npm run check:all`.

## GL-04 — Make local measurements accurate and usable

**Status: Complete (2026-09-16).** Statistics schema v2 records opportunities, requests, returned candidates, observed deduplicated acceptances, rejection categories, and bounded latency histograms. It uses ephemeral acceptance IDs and explicitly states that returned does not prove displayed. Numeric token/timing diagnostics use an explicit finite-value allowlist.

**Purpose:** fix F5 and establish honest evaluation. Research motivation: S11–S13.

**Files:** `src/statistics.ts`, `src/logger.ts`, coordinator/client/acceptance wiring, new statistics tests, and stats documentation.

**Implementation:** count provider opportunities, requests, valid candidates returned, output rejection reasons, empty outputs, stale cancellations, timeouts, incomplete responses, exact hits, continuation hits, and observed acceptances separately. Rename “displayed” to “returned” unless an actual supported show event is established. Do not infer rejection from a return that may never have been visible. Deduplicate acceptance accounting with ephemeral suggestion IDs and verify behavior after typing through part of a suggestion.

Record bounded histograms or a bounded in-memory reservoir for provider latency, last-edit-to-return, first-text latency, processing time, and cancellation time, with counts and clear percentile labels. Use finite numeric diagnostic allowlists so safe token/time fields survive. Persist only aggregate buckets; no source, completion text, filenames, repository names, or durable source hashes. Unknown usage after early abort remains unknown. Test persistence, reset, invalid stored state, and privacy.

**Done when:** scripted scenarios produce exact expected counters; no returned item is presented as proven visible; stats distinguish request latency from useful-result latency; seeded sensitive values do not appear in logs/state. Run `npm run check` and relevant integration tests.

## GL-05 — Make exact/continuation reuse fast and correct

**Status: Complete (2026-09-16).** Validated exact and continuation lookups occur before debounce. Continuation identity includes URI, cursor offset, suffix, endpoint/model/prompt policy, and editor formatting; window-tail alignment supports a sliding prefix cap. Large-file context extraction uses bounded ranges. On an Apple M5 with 32 GB memory, 10,000 warm exact lookups measured p50 0.000083 ms, p95 0.000166 ms, and p99 0.000875 ms in Node 26.7.0; these microbenchmarks exclude editor/provider overhead.

**Purpose:** fix both F4 defects without weakening safety.

**Files:** `src/completionCache.ts`, coordinator/context code, and their tests.

**Implementation:** place a bounded validated cache lookup after eligibility checks but before network debounce. Track continuation through document-edit events and absolute anchors, including a sliding context window. Verify typed text matches the suggested prefix and that suffix/context invariants hold. Revalidate relevant formatting and policy settings; include new context/prompt/processor modes in cache identities. Clear state on credential/configuration changes and disposal. Read context through bounded ranges rather than reading the whole document just to get its length.

**Done when:** exact hits and type-through hits avoid both debounce and fetch; continuation works beyond the configured prefix cap. Undo, paste, multiple cursors, replacement edits, changed suffix, switched file, changed indentation, and config changes safely invalidate or are explicitly supported. Large-file tests show bounded extraction. Provisional cached provider-return p95 target: under 50 ms on the test machine, recorded with hardware and sample count. Run `npm run check:all`.

## GL-06 — Build deterministic fixtures and a Luna evaluation harness

**Status: Implemented (2026-09-16), no live model experiment.** [Runner guide](../benchmarks/README.md), [results](benchmarks/2026-09-16-gl06.md), and [machine-readable audit](benchmarks/2026-09-16-gl06-summary.json). `npm run check:all` passes; the offline harness detects the remaining GL-02 failure rather than hiding it.

**Purpose:** make later prompt and context changes falsifiable. Research motivation: S05/S06/S10 and the existing design specification.

**Artifacts:** authored fixtures in `src/benchmark/fixtures/`, corpus/scoring/live/replay/parser/reference modules in `src/benchmark/`, `scripts/run-benchmark.mjs`, `benchmarks/README.md`, and `docs/benchmarks/` summaries. `npm run benchmark:offline` and `npm run benchmark:luna` are implemented. Generated captures are gitignored under `benchmarks/runs/` and excluded from the VSIX.

**Implementation:** the initial research proposal was expanded at the user's request to **168 cases: 72 Go and 24 each TypeScript, Python, YAML, JSON**, with **112 development / 56 holdout** cases split by 84 source families. Attach source provenance/licenses, mode, cursor, surrounding text, properties, and compile/test/parser checks. Include deliberate no-suggestion cases and unknown dependencies. Keep removed answers and evaluator checks out of model requests. Replay captured synthetic responses without an API key. Functional execution is limited to trusted authored references; generated programs receive syntax checks and known-reference matching, with novel behavior labeled unverified.

The live runner must be an explicit development action, never part of normal extension activation or `npm run check`. It should accept an endpoint/model, use only selected public/synthetic fixtures, cap requests/output, estimate cost before execution, and write run metadata plus results. No implicit `.env.local` loading. Require a declared experiment budget when a later session actually runs paid comparisons; elapsed time or this planning document is not a budget.

**Done when:** the offline runner detects F2/F3 on the baseline, evaluates valid alternate insertions, reports raw/processed results and abstention, and can replay without network. Live-run plumbing is testable with the fixture server. Every reported run has a manifest and reproducible settings. Run `npm run check:all` plus the new offline benchmark.

## GL-07 — Run controlled insertion-prompt and output-budget experiments

**Status: Evaluated (2026-09-16); retain P0 and fixed96.** [Results](benchmarks/2026-09-16-gl07.md), [machine summary/ledger](benchmarks/2026-09-16-gl07-summary.json), [archived captures](benchmarks/2026-09-16-gl07-artifact-index.json). A no-improvement result satisfies this ticket; usable editor completion has not yet been established.

**Purpose:** find a usable instruction-model strategy for this Luna deployment. Research motivation: S01/S02/S04–S06/S15/S17.

**Files:** prompt builder/constants, request/context policy only as necessary, benchmark runner, and result reports. Keep experiment variants in the development harness until a winner is supported.

**Sequence:** freeze the corrected client as baseline. Verify the actual endpoint accepts the intended Luna request options with a synthetic case. Compare P0 current prompt, P1 compact insertion contract, P2 P1 plus one small verified example, and P3 P2 with suffix-first source ordering. Hold budgets/context/processor fixed during this comparison. Screen on development fixtures, then test finalists with at least three requests per case. Interleave arms rather than running one entire variant at a different time of day.

**Outcome:** the nested-brace prerequisite is fixed. `benchmark:experiment` supplies interleaved P0–P3 arms, conditional output-budget arms, source-family bootstrap intervals, a frozen-development-report holdout gate, partial-run accounting, and safe offline syntax/review queues. The [protocol](benchmarks/2026-09-16-gl07-protocol.md) fixed selection criteria before screening. Corrected development screen: P0/P1/P2/P3 had 33/31/30/25 reference/data matches out of 102 completion cases, with request p50 2,417/1,029/749/763 ms. None passed the higher-match criterion; finalist confirmation was skipped. The repeated 16-family cap study had 26/24/26 matches out of 96 attempts per arm, no incomplete responses and a maximum of 24 output tokens. Retain fixed96. YAML/JSON are reported separately; unknown behavior remains unverified. No live holdout use and no production prompt/cap change.

The short/block cap comparison is complete within its explicitly narrowed subset scope; it is not full development confirmation. `none` versus `low` was not tested. Live errors motivate GL-07b's partial-token and evaluation work; do not add reasoning or silently replace existing code as an unmeasured fix.

**Done when:** an experiment report separates correctness, valid return rate, abstention, useful length, latency, and usage; holdout examples have not been used to tune the prompt. Any shipped variant passes all correctness fixtures and wins a documented tradeoff, with a rollback baseline and bumped prompt/policy version. “No improvement; retain P0” is a valid result.

## GL-07b — Improve evaluation validity and partial-token insertion

**Status: Evaluated (2026-09-17); retain P0.** The [GL-07b report](benchmarks/2026-09-17-gl07b.md) records corpus V2, cursor validation, deterministic checks, and the repeated P0/P4 live comparison. P4 was faster but had fewer recognized matches and many more empty insertions. Exact-prefix derivation remains benchmark-only; the original holdout is untouched.

**Purpose:** make the next quality comparison informative, then isolate the most concrete insertion failures. Compact P1/P2 were faster in GL-07, but did not meet the predeclared quality criterion. More context is not yet a demonstrated remedy.

**Work in order:**

1. Add cursor validation covering UTF-16 offsets, surrogate pairs and CRLF boundaries, plus a VS Code position round-trip test. Repair the invalid development `json-crlf` fixture in a newly versioned corpus. Keep the original captures and corpus hash reproducible.
2. Separate ambiguous reconstruction/formatting stress cases from intent-constrained quality cases. Add independently authored visible contracts and behavioral checks for Go first, retaining TypeScript, Python, YAML and JSON. Do not expose removed answers or evaluator assertions to the model. Distinguish multiple reasonable answers from demonstrably invalid output. Design any generated-code execution in a separately reviewed sandbox; continue static/reference checks on the host.
3. Preregister a small development experiment comparing direct insertion with a fragment-reconstruction protocol for mid-identifier and quoted/value cases. If the protocol reconstructs a token or line, require an exact match of the already-typed fragment before deriving insertion text; decline mismatches and never replace existing source silently. Include suffix punctuation, `await ` whitespace, indentation, unknown dependencies and empty-output behavior. Keep prompt example content outside evaluation families. Use the live error patterns in the GL-07 report as regression motivation, not proof of a specific fix.
4. Compare P0 and at most one compact candidate with repeated, interleaved trials on the revised development set. Declare the primary correctness/latency tradeoff before calls, preserve all failures and unknowns, and record the new corpus/policy versions. An inconclusive result retains P0. Do not spend remaining GL-07 allowance automatically in another session; obtain an explicit new live budget.

**Done when:** cursor positions are editor-representable, quality labels are supported by visible intent, deterministic boundary cases pass, and a repeated report supports promotion or explicitly retains baseline. Freeze a finalist before any live holdout use. The original 56-case holdout has not been queried; do not use it to author/tune the fragment protocol. If the new evaluation question needs new holdout families, version and document that choice in advance. A shipped protocol must preserve cancellation/cache/privacy boundaries and native Tab behavior, and update its policy version and ADR. Then proceed to GL-08 with Sol High.

## GL-08 — Test bounded, relevant same-file context

**Status: Evaluated (2026-09-17); implemented as an experimental opt-in and disabled by default.** The [GL-08 report](benchmarks/2026-09-17-gl08.md) records the 90-call C0/C1/C2 comparison. C2 did not improve the dependency-family proxy over C1, so no default context expansion was promoted.

**Purpose:** improve context-dependent accuracy without broadening transmission. Research motivation: S07–S10.

**Files:** context builder, prompt serialization, cache identity, optional current-file context adapter, tests and benchmarks.

**Implementation:** compare the existing window, a smaller equal-budget window, and a relevance-selected variant. Start with the report's 8k/2k/2k character allocation; treat it as an experiment parameter. Add same-file imports, current function/receiver, relevant type declarations, and a few helper signatures. Deduplicate against adjacent context. Use versioned caches and a provisional 25 ms optional-context deadline with bounded outstanding provider work. Fall back immediately when an optional source is absent/slow.

**Done when:** held-out cases demonstrate whether selection helps relative to both baselines; report per-language and dependency-sensitive results. Captured requests contain only the eligible current file. No answer leakage, cross-file reads/transmission, or persistent semantic index is introduced. A context provider cannot delay stale cancellation. Ship additional context only if measured usefulness justifies its cost; otherwise retain the smaller design.

## GL-09 — Tune automatic timing and selective suggestions

**Status: Machine work complete (2026-09-17); retain fixed 175 ms pending human sessions.** Explicit invocation is immediate while retaining all security guards. Statistics V3 and reproducible timing traces are implemented. See the [GL-09 report](benchmarks/2026-09-17-gl09.md). Five real coding sessions and subjective distraction remain a human evidence gate.

**Purpose:** improve useful availability while reducing waste and distraction. Research motivation: S12/S13, not their claimed effect sizes.

**Files:** coordinator/eligibility, local statistics, replay fixtures, and experiment settings.

**Implementation:** compare fixed 75/175/300 ms automatic debounce using reproducible typing traces, then coding-session trials. Keep cache fast paths immediate. Give explicit invocation a separately tested policy and bypass automatic debounce, while preserving trust/file guards. Revisit unconditional suppression after `)`, `]`, `}`, and `;` using Go cases rather than removing the heuristic indiscriminately. If warranted, test a bounded local adaptive policy based on typing cadence and cancellation history.

Use measured distributions to decide whether an automatic usefulness deadline should differ from the current 8-second hard request timeout. Never queue obsolete work or add a remote trigger classifier. Record changes to suggestion opportunities, not only acceptance percentages.

**Done when:** the selected policy improves a predeclared utility/cost tradeoff without increasing known corruption/stale failures. Report accepted characters per active minute, request/cancellation volume, and subjective distraction for complete sessions. A fixed policy is acceptable if adaptive scheduling adds complexity without a clear gain.

## GL-10 — Evaluate server prompt caching only if worthwhile

**Status: Evaluated (2026-09-17); defer explicit cache controls.** Automatic prompt caching produced reads and writes on the repeated long-context run. Usage parsing is implemented; no production cache key, filler, stable identifier or prompt reordering was added. See the [GL-10 report](benchmarks/2026-09-17-gl10.md).

**Purpose:** optional latency/cost experiment after local correctness and caching. Research motivation: S03; this is not required for V1.

**Files:** Responses serialization/usage parsing, context/prompt construction, benchmark reports.

**Prerequisites:** the endpoint explicitly supports the relevant cache fields and its data-retention behavior fits deployment requirements. Recheck current official documentation at implementation time. Do not equate `store:false` with disabling provider-side prompt caching or all retention.

**Implementation:** measure current cached tokens first. Compare an unchanged request baseline with stable same-file context placed before changing cursor data and, where supported, an explicit stable breakpoint. Use public/synthetic cases and separate cold/warm runs. Do not add filler, append historic source snapshots, or transmit stable user/repository identifiers to seek hits. Measure cache-write charges as well as reads.

**Done when:** a report shows supported/unsupported status, cache reads/writes, total latency, and estimated cost with unknown usage labeled. Ship only on a demonstrated benefit and updated privacy/design wording; otherwise mark “evaluated, deferred.” Do not delay GL-11 for an unhelpful experiment.

## GL-11 — Dogfood, reconcile docs, and validate a release candidate

**Status: Machine release candidate complete (2026-09-17); human dogfood gate open.** The [release-candidate report](benchmarks/2026-09-17-gl11-rc.md) records passing checks on VS Code 1.82 and stable, package inspection, CI, runtime-target rationale and the remaining five-session physical-editor work. Marketplace publishing remains a separate action.

**Purpose:** complete F6/F7 and establish the real editor outcome.

**Files:** integration scripts/tests, CI configuration, `README.md`, `PRIVACY.md`, `CHANGELOG.md`, `docs/design_specification.md`, `docs/design_decisions.md`, package/release metadata, and this tracker.

**Implementation:** test a VSIX in the minimum supported VS Code and a current stable desktop version. Verify actual physical Tab acceptance, multiline insertion, typing through suggestions, Escape, edits during requests, other completion providers, key setup/removal, disable/enable, and restricted files/workspaces. Add CI for deterministic checks and suitable editor tests. Inspect packaged contents and validate runtime assumptions; a Node 24 build target and VS Code 1.82 engine declaration should have an explicit tested compatibility rationale.

Reconcile the Marketplace identity with `AGENTS.md` and any verified published identity/history before changing a package name. Clarify Responses-only scope and the existing Azure/base-URL settings versus gateway-specific integrations. Update stale installation filenames and mark implemented versus proposed specifications. Record substantive adopted decisions as new/superseding ADRs with evidence rather than rewriting historical rationale.

**Done when:** use at least five real coding sessions, primarily Go, with a stable configuration and a written usability report; small samples are labeled as such. Run `npm run check:all`, offline benchmarks, packaging, and package inspection. No known F1–F3 regression remains, stale requests cannot display, and measurements are honest. If Luna misses the latency/usability goal, document that outcome and retain a narrower useful policy rather than declaring success from unit tests alone. Publishing is a separate action from preparing this release candidate.

## Experiment decisions and acceptance gates

Before each live experiment, record its hypothesis, primary outcome, budget, corpus split, and settings. Compare one factor at a time before testing combinations. Proposed pilot targets: cached p95 <50 ms; short automatic completion last-edit-to-return p50 <700 ms and p95 <1,500 ms; optional context p95 <25 ms. These are product goals to assess, not guarantees or literature constants.

Hard gates: no reproduced boundary corruption, stale display, unintended source destination, secret logging, or holdout leakage. Soft gates: useful output, latency, request cost, and disruption improve together or have an explicitly accepted tradeoff. An apparent percentage gain on a small holdout needs uncertainty and follow-up; report inconclusive results honestly. Do not reward a strategy simply for returning nothing or always suggesting tiny fragments.

Record a report under `docs/benchmarks/` for each completed experiment. Keep private dogfood source out of committed reports. Use aggregate results plus voluntarily authored minimal reproductions. Benchmark prompts/outputs may be stored only for the explicit public/synthetic corpus.

## How to resume in another session

Use this request:

```text
Read AGENTS.md, README.md, docs/design_decisions.md,
docs/luna-completion-research.md, and docs/completion-action-plan.md.
Work on ticket GL-XX only, respecting its dependencies and acceptance criteria.
Check the current implementation and tracker before changing anything.
Preserve the V1 product/privacy boundary. Run the applicable checks.
Update the ticket status and append a handoff entry with files, checks,
results, unresolved issues, and the next recommended ticket.
Do not claim a prompt/context improvement without recorded evaluation.
```

Each implementation session should leave a handoff in this form:

```text
Date / ticket / status:
Starting and ending revision (or uncommitted changes):
What changed and why:
Files and relevant tests:
Commands run and outcomes:
Experiment manifest/result path, or “no live model experiment”:
Observed limitations / unresolved failures:
ADR or documentation updates:
Next ticket and prerequisites:
```

## Handoff log

- **2026-09-16 — Research/planning complete.** Reviewed the implementation baseline and primary literature; created the research report and this plan. Prior review checks passed, but F1–F7 remain open. No runtime changes, model benchmark, paid inference, or release was performed. Recommended next ticket: **GL-01**, followed by **GL-02**.
- **2026-09-16 — GL-01 through GL-05 complete (uncommitted worktree).** Fixed F1–F5; added the GL-03 portion of F6; resolved F7 identity/scope/documentation conflicts ahead of final release validation. The suite now has 78 passing unit tests plus a VS Code 1.82 native multiline acceptance test. `npm run check:all` passes. No live Luna request, paid inference, marketplace publication, or physical-Tab dogfood was performed. Next ticket: **GL-06**, using **GPT-6 Astra / High** for corpus and evaluation design.
- **2026-09-16 — GL-06 implemented; GL-02 follow-up reopened (uncommitted worktree, starting/ending HEAD `9a31109`).** Added the 168-case synthetic corpus including user-requested YAML/JSON, raw/processed scoring, safe syntax checks, trusted-reference functional checks, historical processor replay, and budgeted opt-in live runner. Added 10 harness tests; `npm run check:all` passes with 88 unit tests and the VS Code 1.82 integration test. All 81 authored reference/alternative programs pass; all 148 completion reconstructions parse before and after processing; four CRLF-normalized insertions also pass behavior/value checks. All three original F2/F3 repros fail on the historical processor and pass on the current one. A separate nested-brace regression still fails and blocks GL-07. See the result report and machine manifest for precise evidence and limitations. No live model experiment or paid inference; loopback transport tests and a one-case dry run only. ADR-036 records the evaluation boundary. Next: **GL-02 follow-up with Astra High**, then **GL-07 with Astra High** and a declared budget.
- **2026-09-16 — GL-02 follow-up fixed; GL-07 evaluated, no promotion (Astra High; uncommitted worktree, starting/ending HEAD `9a31109`).** Added `insertionBoundary.ts`, terminal-status/boundary regressions, interleaved experiment planning/analysis/replay in `src/benchmark/`, and `scripts/review-gl07-equivalence.mjs`. `npm run check:all` passes with 107 unit tests and VS Code 1.82 integration; offline `--functional --syntax` passes 81 trusted checks, 148 raw/processed syntax checks and eight minimal regressions. Package inspection excludes benchmark code/captures/docs and env files. A capability pilot, stopped initial screen, corrected 440-request prompt screen and 288-request cap study total 929 attempts, 928 completed and one deliberate cancellation. Full reservations $0.66109435 of authorized $2; known usage estimate $0.044572 plus one unknown. See the GL-07 report, summary, review decisions and nine hash-indexed compressed artifacts under `docs/benchmarks/`. ADR-037 records limited lexical cleanup and terminal-status completion; ADR-036 clarifies public synthetic artifact retention. Retain P0/fixed96; quality remains inconclusive, abstention weak, and several targets underdetermined. The invalid `json-crlf` development family was excluded before the restarted screen; corpus hash preserved. No live holdout, generated-code execution, marketplace publication or physical-Tab dogfood. Next: **GL-07b with Astra High**, then GL-08 with Sol High. A future live experiment needs its own explicit budget.
- **2026-09-17 — GL-07b through GL-10 evaluated; GL-11 machine release candidate complete (Astra High; uncommitted worktree, HEAD `9a31109`).** Added corpus V2 with 186 cases and historical V1 replay, exact full-fragment benchmark protocol, optional bounded same-file context, explicit-trigger policy, timing traces, statistics V3, cache-detail parsing, expanded editor integration and CI. The P0/P4 run completed 72 calls and retained P0; the C0/C1/C2 run completed 90 calls and kept selected context off by default. New full reservations are $0.27426615 and known usage estimates are $0.0332376 before cache-tier adjustment; cumulative session reservations are $0.93536050 of the authorized $2. `npm run check` passes 121 tests; all 90 trusted V2 references, 166 syntax reconstructions and eight regressions pass. Native integration passes VS Code 1.82.0 and 1.138.0. `glide-0.1.3.vsix` is inspected and excludes source, tests, captures, docs and environment files. No live holdout, generated-code execution, secret capture, marketplace publication or fabricated dogfood. Next: run five primarily-Go physical editor sessions and decide whether Luna's measured latency is usable before publication.
