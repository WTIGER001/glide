import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { transformSync } from "esbuild";
import * as processor from "../outputProcessor";
import { COMPLETION_INSTRUCTIONS, buildCompletionInput } from "../promptBuilder";
import { CORPUS_VERSION, corpus, corpusForHash, corpusHash, families, hash, legacyFamilies, validateCorpus } from "./corpus";
import { planLive, runLive } from "./live";
import { readCaptures, readReplayManifest } from "./replay";
import { checkReferences } from "./referenceChecks";
import { runRegressions } from "./regressions";
import { groupedSummary, scoreCapture, summarize } from "./scoring";
import type { Capture, Processor } from "./types";
import type { Language } from "./types";
import { checkSyntax } from "./syntaxChecks";

const BASELINE = "9a31109bac2d20ab110f1f25c6db93f4e72b5392";
function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}
function version(command: string, args: string[]): string {
  try { return execFileSync(command, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { return "unavailable"; }
}
function baseline() {
  const directory = mkdtempSync(join(tmpdir(), "glide-baseline-"));
  try {
    const source = git(["show", `${BASELINE}:src/outputProcessor.ts`]);
    const path = join(directory, "processor.cjs");
    writeFileSync(path, transformSync(source, { loader: "ts", format: "cjs", target: "node24" }).code);
    const previous = createRequire(resolve("package.json"))(path) as Processor;
    return { revision: BASELINE, sourceHash: hash(source), regressions: runRegressions(previous),
      summary: summarize(corpus.map((entry) => scoreCapture(entry, oracle(entry.id, entry.expected ?? ""), previous))) };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function oracle(caseId: string, raw: string): Capture {
  return { caseId, repetition: 0, raw, status: "completed", earlyStopped: false, elapsedMs: null, firstTextMs: null, usage: {}, error: null };
}
function writeReport(path: string, report: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    live: { type: "boolean" }, execute: { type: "boolean" }, functional: { type: "boolean" }, syntax: { type: "boolean" }, replay: { type: "string" },
    split: { type: "string" }, language: { type: "string" }, cases: { type: "string" }, out: { type: "string" },
    "max-requests": { type: "string" }, "budget-usd": { type: "string" }, "input-price": { type: "string" }, "output-price": { type: "string" },
    repetitions: { type: "string" }, seed: { type: "string" }, "max-output-tokens": { type: "string" },
    endpoint: { type: "string" }, model: { type: "string" }
  } });
  validateCorpus();
  if ((values.live && values.replay) || (values.execute && !values.live) || (values.syntax && values.live) || (values.functional && (values.live || values.replay))) throw new Error("Incompatible modes.");
  const replayEnvelope: unknown = values.replay ? JSON.parse(readFileSync(values.replay, "utf8")) as unknown : null;
  const replayManifest = values.replay ? readReplayManifest(replayEnvelope) : null;
  const replayCorpusHash = replayManifest?.corpusHash;
  const replayCorpus = replayManifest === null || typeof replayCorpusHash !== "string" ? undefined : corpusForHash(replayCorpusHash);
  if (values.replay && replayCorpus === undefined) throw new Error("Replay uses an unsupported corpusHash.");
  const activeCorpus = replayCorpus?.cases ?? corpus;
  const activeCorpusHash = replayCorpus?.hash ?? corpusHash;
  const activeCorpusVersion = replayCorpus?.version ?? CORPUS_VERSION;
  const activeFamilies = activeCorpusVersion === "glide-synthetic-v1" ? legacyFamilies : families;
  const split = values.split ?? (values.live ? "development" : "all");
  if (!["all", "development", "holdout"].includes(split) || (values.live && split === "all")) throw new Error("Live runs select development or holdout separately.");
  if (values.language && !["go", "typescript", "python", "yaml", "json"].includes(values.language)) throw new Error("Unknown language.");
  const requested = values.cases?.split(",");
  const selected = activeCorpus.filter((entry) => (split === "all" || entry.split === split) && (!values.language || entry.context.language === values.language) && (!requested || requested.includes(entry.id)));
  if (selected.length === 0 || (requested && (new Set(requested).size !== requested.length || requested.length !== selected.length))) throw new Error("Empty selection, duplicate, unknown, or excluded case IDs.");
  const maxOutputTokens = Number(values["max-output-tokens"] ?? replayManifest?.maxOutputTokens ?? "96");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 16 || maxOutputTokens > 256) throw new Error("Output limit must be 16–256 tokens.");
  const paths = ["src/outputProcessor.ts", "src/insertionBoundary.ts", "src/openaiResponsesClient.ts", "src/promptBuilder.ts", "src/constants.ts", "package-lock.json",
    ...git(["ls-files", "--cached", "--others", "--exclude-standard", "src/benchmark", "scripts/run-benchmark.mjs"]).split("\n").filter(Boolean)];
  const manifest = { corpusVersion: activeCorpusVersion, corpusHash: activeCorpusHash, createdAt: new Date().toISOString(), revision: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]).length > 0, sourceHashes: Object.fromEntries([...new Set(paths)].sort().map((path) => [path, hash(readFileSync(path, "utf8"))])),
    node: process.version, platform: process.platform, arch: process.arch,
    toolchains: values.functional || values.syntax ? { go: version("go", ["version"]), python: version("python3", ["--version"]) } : null,
    split, selectedCaseIds: selected.map((entry) => entry.id),
    instructionsHash: hash(COMPLETION_INSTRUCTIONS), inputHashes: Object.fromEntries(selected.map((entry) => [entry.id, hash(buildCompletionInput(entry.context))])),
    maxOutputTokens, interpretation: "Synthetic fixture evidence; not a human acceptance rate or end-to-end editor latency." };
  const mode = values.live ? "live" : values.replay ? "replay" : "offline-oracle";
  const path = resolve(values.out ?? `benchmarks/runs/${mode}-${Date.now()}.json`);
  const assemble = (captures: readonly Capture[]) => {
    const rows = captures.map((capture) => {
      const entry = selected.find((entry) => entry.id === capture.caseId);
      if (!entry) throw new Error("Captured case outside selection.");
      return scoreCapture(entry, capture, processor, maxOutputTokens);
    });
    return { manifest, mode, captures, rows, summary: summarize(rows), byLanguage: groupedSummary(rows, "language"),
      byCategory: groupedSummary(rows, "category"), bySplit: groupedSummary(rows, "split") };
  };
  if (values.live) {
    for (const key of ["max-requests", "budget-usd", "input-price", "output-price"] as const) if (!values[key]) throw new Error(`Live planning requires --${key}; nothing has been sent.`);
    const options = { endpoint: values.endpoint ?? "https://api.openai.com/v1/responses", model: values.model ?? "gpt-5.6-luna", maxOutputTokens,
      repetitions: Number(values.repetitions ?? "1"), seed: Number(values.seed ?? "17"), maxRequests: Number(values["max-requests"]),
      budgetUsd: Number(values["budget-usd"]), inputUsdPerMillion: Number(values["input-price"]), outputUsdPerMillion: Number(values["output-price"]) };
    const plan = planLive(selected, options);
    const liveManifest = { options, reservedUsd: plan.reservedUsd, order: plan.samples.map(({ entry, repetition }) => ({ caseId: entry.id, repetition })),
      request: { reasoningEffort: "none", timeoutMs: 8000, temperature: 0.2, verbosity: "low", stream: true, store: false },
      budgetCaveat: "Planning estimate using UTF-8 bytes + 1024 overhead and 1.25 input multiplier; no billing guarantee. Unknown usage keeps full reservation. No retries." };
    const save = (captures: readonly Capture[]) => {
      const known = captures.filter((capture) => capture.usage.inputTokens !== undefined && capture.usage.outputTokens !== undefined);
      writeReport(path, { ...assemble(captures), live: liveManifest, executed: Boolean(values.execute), plannedSamples: plan.samples.length,
        unattemptedSamples: plan.samples.length - captures.length,
        usagePricedEstimateUsd: known.reduce((total, capture) => total + ((capture.usage.inputTokens ?? 0) * options.inputUsdPerMillion + (capture.usage.outputTokens ?? 0) * options.outputUsdPerMillion) / 1_000_000, 0),
        unknownCostSamples: captures.length - known.length });
    };
    save([]);
    if (values.execute) {
      const controller = new AbortController();
      const abort = (): void => controller.abort("interrupted");
      process.once("SIGINT", abort);
      try {
        const captures = await runLive(selected, options, process.env.OPENAI_API_KEY ?? "", controller.signal, save);
        save(captures);
        if (captures.length < plan.samples.length || captures.some((capture) => capture.status !== "completed")) process.exitCode = 1;
      } finally { process.removeListener("SIGINT", abort); }
    }
    console.log(JSON.stringify({ mode: values.execute ? "live" : "dry-run", report: path, requests: plan.samples.length, reservedUsd: plan.reservedUsd }));
  } else {
    const captures = values.replay ? readCaptures(replayEnvelope, selected, activeCorpusHash) : selected.map((entry) => oracle(entry.id, entry.expected ?? ""));
    const report = assemble(captures);
    const references = values.functional ? checkReferences(activeFamilies.filter((family) => selected.some((entry) => entry.family === family.id))) : null;
    // These candidates originate ONLY in authored oracle strings transformed by our processor.
    // Never run this path for model captures. CRLF normalization need not be a semantic failure.
    const changedReferences = values.functional ? checkReferences(report.rows.filter((row) => row.cleanupChangedKnownGood).map((row) => {
      const family = activeFamilies.find((entry) => entry.id === row.family);
      if (!family) throw new Error("Missing family.");
      return { ...family, id: row.caseId, template: `⟦${row.processedScore.reconstructed}⟧`, alternatives: [] };
    })) : null;
    const regressions = runRegressions(processor);
    const syntax = values.syntax ? report.rows.filter((row) => row.mode !== "abstain").map((row) => ({ caseId: row.caseId, repetition: row.repetition,
      raw: checkSyntax(row.language as Language, row.rawScore.reconstructed), processed: checkSyntax(row.language as Language, row.processedScore.reconstructed) })) : null;
    const previous = values.replay ? null : baseline();
    writeReport(path, { ...report, replaySource: values.replay ? resolve(values.replay) : null, replayManifest, references, changedReferences, syntax, regressions, baseline: previous,
      missingSelectedCases: selected.filter((entry) => !captures.some((capture) => capture.caseId === entry.id)).map((entry) => entry.id) });
    console.log(JSON.stringify({ report: path, summary: report.summary, regressions, referenceFailures: references?.filter((row) => !row.passed) ?? null,
      changedReferenceFailures: changedReferences?.filter((row) => !row.passed) ?? null }, null, 2));
    // Oracle cleanup differences are measured findings, not a harness execution failure.
    if (references?.some((row) => !row.passed)) process.exitCode = 1;
    if (previous && ["F2-whitespace-stop", "F3-nested-call", "F3-terminal-space"].some((id) => previous.regressions.find((row) => row.id === id)?.passed !== false)) throw new Error("Baseline did not reproduce F2/F3.");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Benchmark failed.");
  process.exitCode = 1;
});
