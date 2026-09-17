# GL-07b through GL-10 evaluation protocol

Prepared 2026-09-17 before the new live requests. This continues the user's instruction to complete the remaining action-plan objectives within the existing **$2 total** authorization. GL-07 reserved $0.66109435, leaving $1.33890565. The two plans below reserve $0.27426615, so cumulative reservations remain at $0.93536050. Use direct `https://api.openai.com/v1/responses`, `gpt-5.6-luna`, reasoning `none`, and the previously authorized one-off `.env.local` credential injection. Never load dotenv from extension or runner code. Preserve the original 56-case V1 holdout without live requests.

## Frozen implementation and corpus

Active corpus `glide-synthetic-v2` fixes only the unrepresentable V1 `json-crlf-typed` cursor, adds UTF-16/CRLF cursor validation, and adds nine visible-contract development families. Historical V1 families and hash remain in code so prior captures replay under their original contexts. V2 separates `contract`, `reconstruction`, and `abstention` labels; this does not alter historical GL-07 scores.

The experimental P4 fragment protocol asks Luna for the entire current fragment. Glide derives insertion text only when the response begins with the exact already-typed fragment. A mismatch becomes no suggestion; the editor replacement range remains empty. P4 falls back to P0 at positions without a typed identifier or quoted fragment. Do not promote P4 from an overall match gain that comes only from silence, or if it introduces boundary/source replacement failures.

The context experiment has three P0 arms: C0 existing full synthetic context, C1 an 8,000-character prefix plus 2,000-character suffix, and C2 the same small adjacent window plus up to 2,000 characters of imports/relevant declarations selected from the same synthetic file. Selection receives the document with the answer removed. It cannot read another file and must deduplicate adjacent text. The four far-dependency families use authored comment padding to place a helper/anchor outside C1; JSON is a no-applicable-context control.

## GL-07b fragment confirmation

Hypothesis: exact full-fragment derivation improves intent-constrained and known partial-token completions without replacement, corruption, or unacceptable latency. Cases are the typed states for five new language-balanced visible-contract families plus `py-sorted`, `py-enumerate`, `ts-await`, `json-escape`, `yaml-quoted`, `go-append`, and `go-escape`. Compare P0 and P4, three repetitions, interleaved by case/repetition, seed 17, 96 output tokens: **72 requests**, reserved **$0.0384309**.

Primary proxy is processed reference/data-value matching per source family. Also report mismatch-derived abstentions separately, syntax, valid nonempty return, latency, token usage, and concrete failures. Promotion requires higher intent-constrained/known-fragment matching, no deterministic boundary regression, no source replacement path, and no material malformed-output or p95-latency regression. Descriptive paired family bootstrap intervals are not confirmatory significance. An inconclusive result retains direct P0 and records P4 as experimental or rejected. Do not query holdout.

## GL-08 same-file context comparison

Hypothesis: a bounded selected same-file declaration window matches C0 and improves over C1 on far-dependency cases without cross-file input or material latency cost. Cases: both cursor states for Go/TypeScript/Python far-helper and YAML far-anchor, plus both JSON contract-timeout states as a no-selection control. Compare C0/C1/C2, three repetitions, interleaved, seed 17, fixed P0/fixed96: **90 requests**, reserved **$0.23583525**.

Primary proxy is reference/data matching on the four dependency families. The JSON control should not change across context arms beyond model sampling. Report per-language results, selected text size, request/first-text latency, usage and syntax. Ship selected context only if C2 improves on C1 and is not materially worse than C0, while its local collector meets the 25 ms bound and stale cancellation tests. Otherwise keep `glide.sameFileContext` disabled by default. Do not use live holdout or imply general repository-context quality from these four synthetic dependencies.

## GL-09 timing and GL-10 caching

GL-09 uses source-free deterministic typing traces for 75/175/300 ms and editor integration tests for explicit invocation. Fixed 175 ms remains production unless a complete human session tradeoff supports another value. Track automatic/explicit opportunities, request/cancellation volume, latency, acceptances, accepted characters, and active editing time. Five human coding sessions and subjective distraction cannot be manufactured by automated tests; machine release-candidate work may finish while that validation remains an explicit human gate.

GL-10 is evaluated statically first. Current official documentation says GPT-5.6 caching requires a minimum 1,024-token reusable prefix, charges cache writes at 1.25× input, exposes cached/write token fields, and retains eligible cached state for at least 30 minutes. Glide must parse those fields. Do not add filler or a stable repository/user identifier. If the actual reusable prefix in the synthetic request is below the minimum, mark caching deferred without paid calls; `store:false` remains distinct from provider prompt-cache retention.
