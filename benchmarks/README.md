# Completion evaluation

GL-06 supplies an offline corpus and an opt-in Responses runner. It does not establish Luna's completion quality or editor latency. The first results and known blocking defect are in [the GL-06 report](../docs/benchmarks/2026-09-16-gl06.md).

GL-07 fixes that recorded boundary defect and adds `npm run benchmark:experiment` for interleaved prompt comparisons, output-budget arms, family-level uncertainty and a frozen holdout gate. See [the experiment protocol](../docs/benchmarks/2026-09-16-gl07-protocol.md) and [completed live results](../docs/benchmarks/2026-09-16-gl07.md). The corrected 440-request prompt screen and 288-request cap study support retaining P0/fixed96; compact prompts were faster but quality was inconclusive. The 56-case holdout remains unused for live inference. Suffix-based stream early stops are disabled, so current runs wait for terminal protocol status.

GL-07b versions the corpus and adds cursor-validity, visible-contract and bounded-context fixtures. See the [GL-07b report](../docs/benchmarks/2026-09-17-gl07b.md), [GL-08 report](../docs/benchmarks/2026-09-17-gl08.md), and [preregistered continuation protocol](../docs/benchmarks/2026-09-17-remaining-protocol.md).

## Corpus and split

The executable corpus lives in `src/benchmark/fixtures/`, with expansion and validation in `src/benchmark/corpus.ts`. Active version: `glide-synthetic-v2`; V1 remains available by its historical hash for replay. All examples were independently authored for this repository and use its MIT license; no external repository code or private development files were collected.

| Language | Families | Cursor cases | Development | Holdout |
| --- | ---: | ---: | ---: | ---: |
| Go | 38 | 76 | 52 | 24 |
| TypeScript | 14 | 28 | 20 | 8 |
| Python | 14 | 28 | 20 | 8 |
| YAML | 14 | 28 | 20 | 8 |
| JSON | 13 | 26 | 18 | 8 |
| Total | 93 | 186 | 130 | 56 |

The original 120-case plan was expanded at the user's request to include YAML and JSON. Every family has a removed-span case and a typing-continuation case. Both stay in the same split; they are correlated observations, not independent trials. Family templates contain one `⟦answer⟧` marker. Evaluator assertions, alternatives, provenance, and abstention labels never enter model input. Requests serialize only the production instructions and cursor context. Continuation cases deliberately contain the already-typed portion of the answer. Generic filenames avoid task-name hints.

There are 166 completion and 20 conservative-abstention cases. V2 adds explicit intent contracts, far same-file declarations, and cursor validation that rejects offsets inside CRLF or UTF-16 surrogate pairs. Coverage includes partial identifiers/values, nested calls and delimiters, significant spaces, CRLF, Unicode, escaped and raw strings, Go errors, local types/helpers, Python indentation, YAML aliases/block scalars/flow collections, and JSON objects/arrays/scalars. Authored alternatives have separate functional checks. YAML checks use YAML 1.2 core with duplicate-key rejection, no custom tags, and bounded alias expansion. JSON means strict JSON, not JSONC. See the [YAML parser documentation](https://eemeli.org/yaml/).

Holdout is fixed before prompt experiments, not hidden from the corpus author. Offline validation of the authored answers is permitted; do not use live holdout outputs to tune variants. Live runs select development by default; holdout requires `--split holdout` and cannot be combined with development in one live run. If a holdout result drives changes, retire it as holdout and author new families before making another held-out claim. Language-level similarities remain; this small synthetic corpus is not an independent real-world benchmark.

## Offline commands

Run from the repository root with dependencies installed. Full checks need Go, Python 3, and the locally installed TypeScript compiler. No API key is required and no network request is made by these commands:

```sh
npm run benchmark:offline -- --out benchmarks/runs/oracle.json
npm run benchmark:offline -- --functional --syntax --out benchmarks/runs/checked.json
npm run benchmark:offline -- --language yaml --split development
npm run benchmark:offline -- --replay benchmarks/runs/live.json --syntax --out benchmarks/runs/replayed.json
```

`--functional` compiles/runs only trusted repository-authored programs and alternatives, plus processor transformations of those authored answers. Go network module/toolchain fetching is disabled. TypeScript is typechecked and run; Python is run in isolated mode. YAML/JSON are parsed and compared with expected data. Changed oracle insertions are checked separately so equivalent formatting is not called a behavioral regression. This flag is deliberately incompatible with live/replay mode: arbitrary generated code is never executed.

`--syntax` parses raw and processed reconstructions using `gofmt`, Python `ast.parse`, TypeScript syntactic diagnostics, and the data parsers. It does not execute captured output. A missing/timed-out parser is reported as unknown, not a pass. Syntax validity is not type correctness, behavior, or evidence that a suggestion is useful. Incomplete surrounding files may cause valid fragments to fail whole-file parsing. Run syntax checks during offline replay, outside live latency measurements.

The offline runner loads the actual processor from baseline commit `9a31109bac2d20ab110f1f25c6db93f4e72b5392` and requires it to reproduce F2/F3. That git object must exist; fetch the project history if a shallow checkout lacks it. No model is involved. Corpus changes and malformed captures fail validation. Reference compilation/assertion failures fail the command. Measured current-processor mismatches and regression failures are written to the report, so **a zero exit status is not a correctness gate**: inspect `regressions`, `syntax`, and `changedReferences` before advancing GL-07.

Replay checks corpus identity, sample shape, IDs, duplicates, and nonnegative metrics. It retains the original manifest and uses its output limit unless explicitly overridden for a processor experiment. Replay evaluates the current processor; an override changes the evaluation policy, not the original captured request. Original live order/settings remain in the source artifact. Missing selected cases are listed. Do not compare partial runs as if they had full coverage.

## Live planning and execution

The runner reuses the production `OpenAIResponsesClient`, instructions, prompt builder, and output processor. It makes one sequential attempt per selected case/repetition with no retries, stops after a failed request, saves after every attempt, and aborts on Ctrl-C. Defaults: Luna, reasoning `none`, 96 output tokens, temperature 0.2, low verbosity, eight-second timeout, streamed Responses with `store:false`. The raw field is the text observed by that client; a client early stop can truncate it before the server completes.

First declare the selection, maximum requests, budget, and current prices. This command is a dry run and makes **zero API requests**:

```sh
npm run benchmark:luna -- \
  --cases go-closer-hole \
  --max-requests 1 --budget-usd 0.01 \
  --input-price 0.20 --output-price 1.20 \
  --out benchmarks/runs/pilot-plan.json
```

Prices above are an illustrative Luna snapshot, USD per million tokens, checked on 2026-09-16. Verify [current model pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna) before executing. Rates are required even for dry-run planning; no model-specific price is silently assumed. The [Responses API contract](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) defines the output limit to include reasoning and visible output.

Only after declaring the actual experiment budget, set `OPENAI_API_KEY` in the invoking process and add `--execute` to that command, using a different output path. No dotenv file is read; no key is written to a report. Live commands are never invoked by extension activation, tests, or `npm run check`.

Additional options: `--model gpt-5.6-luna|gpt-5.6-terra|gpt-5.6-sol`, `--language go|typescript|python|yaml|json`, `--split development|holdout`, `--cases` with comma-separated exact IDs, `--repetitions 1..10`, `--seed 0..4294967295`, and `--max-output-tokens 16..256`. Case IDs are visible in `corpus` and offline report manifests. This harness accepts direct `https://api.openai.com/v1/responses` or HTTP loopback `/v1/responses` for fixtures. It does not change the extension's existing endpoint settings or add a gateway. Model/deployment aliases and Azure authentication are not implemented in this first benchmark runner.

The entire plan is checked against the request cap and estimated budget before the first request. Planning reserves UTF-8 prompt bytes plus 1,024 overhead units as an input-token proxy, a 1.25 input-price multiplier, and the full output-token cap. This is deliberately conservative but **not a tokenizer or guaranteed billing ceiling**. Provider pricing, caching, and overhead may differ. No allowance is released when usage is missing. Usage-priced estimates in the report use the declared base input/output rates. Captures also preserve cached-input, cache-write-input, and reasoning-output details when returned, so a later report can apply documented cache multipliers explicitly. Missing usage remains unknown, including after cancellation. Repetition order is reproducibly shuffled and recorded; a seed does not make model sampling deterministic.

## Interpretation and artifacts

Reports contain corpus/version hashes, selected IDs, git revision and dirty state, relevant source/lockfile hashes, runtime versions, instruction/input hashes, output policy, raw and processed insertions, reconstructed source, status, early-stop reason, timing, and usage. Live reports add request settings, exact order, planned/unattempted samples, and cost assumptions. Errors are classified without logging response bodies or credentials. Default artifacts live under gitignored `benchmarks/runs/` and are excluded from the VSIX along with benchmark code and dependencies.

Exact match, known alternative, edit similarity, parsed data equality, and syntax are separate signals. An unrecognized valid program is **unverified**, not proven incorrect. Data equality checks the authored target value; arbitrary config values may have other reasonable completions. Abstention labels are an explicit conservative evaluation policy, not objective proof that nothing useful could be suggested. Always report completion and abstention denominators separately; an always-empty model gets zero completion matches. Transport failure never earns abstention credit.

Response and first-text p50/p95 are request measurements, not last-edit-to-display latency. Processor timings are microbenchmarks, not cache/provider/editor measurements. Report attempted and unattempted samples, missing usage, per-language/category results, and family counts. Inspect novel outputs and syntax results manually, or add a separately reviewed sandbox before claiming behavioral correctness for them. Do not run novel model code on the host. Human acceptance, keystroke savings, context-builder selection, cache effects, and distraction require the later editor/dogfood work.

GL-07 implements predeclared interleaved arms, repeated development trials and family-level uncertainty. Its [archive index](../docs/benchmarks/2026-09-16-gl07-artifact-index.json) preserves public synthetic captures as gzip JSON with compressed/uncompressed SHA-256 hashes. Decompress a capture into a new `benchmarks/runs/` path, then run `npm run benchmark:experiment -- --replay PATH --syntax --out NEW_PATH` without credentials or network. Replay applies the current processor; source hashes distinguish it from historical analysis. Compressed research artifacts under `docs/` are also excluded from the VSIX. Do not report oracle success as live model quality or tune against holdout; GL-07b addresses the evaluation limitations discovered in the live run.
