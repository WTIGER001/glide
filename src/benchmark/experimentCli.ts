import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { corpus, corpusHash, CORPUS_VERSION, hash } from "./corpus";
import { budgetArms, contextArms, fragmentArm, planExperiment, promptArms, runExperiment } from "./experiment";
import type { ExperimentCapture } from "./experiment";
import { analyzeExperiment } from "./experimentAnalysis";
import type { PromptVariant } from "./promptVariants";
import { reviewExperiment } from "./experimentReview";

function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

async function main() {
  const { values } = parseArgs({ options: {
    phase: { type: "string", default: "screen" }, arms: { type: "string" }, prompt: { type: "string", default: "P0" },
    cases: { type: "string" }, repetitions: { type: "string" }, seed: { type: "string", default: "17" },
    "max-requests": { type: "string" }, "budget-usd": { type: "string" }, "input-price": { type: "string" }, "output-price": { type: "string" },
    model: { type: "string", default: "gpt-5.6-luna" }, endpoint: { type: "string", default: "https://api.openai.com/v1/responses" },
    out: { type: "string" }, execute: { type: "boolean" }, "frozen-config": { type: "string" },
    hypothesis: { type: "string" }, replay: { type: "string" }, syntax: { type: "boolean" }
  } });
  if (values.replay) {
    if (values.execute) throw new Error("Replay cannot execute API requests.");
    const path = resolve(values.out ?? `benchmarks/runs/gl07-review-${Date.now()}.json`);
    if (existsSync(path)) throw new Error("Output already exists.");
    const source = readFileSync(values.replay, "utf8");
    const review = reviewExperiment(JSON.parse(source) as unknown, Boolean(values.syntax));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ reviewedAt: new Date().toISOString(), sourceArtifactHash: hash(source), ...review }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ report: path, complete: review.analysis.complete, reviewQueue: review.reviewQueue.length }));
    return;
  }
  if (values.syntax) throw new Error("Use --syntax with --replay, outside live measurements.");
  const phase = values.phase;
  if (!["pilot", "screen", "confirm", "budgets", "context", "holdout"].includes(phase)) throw new Error("Unknown phase.");
  if (!["P0", "P1", "P2", "P3", "P4"].includes(values.prompt)) throw new Error("Unknown prompt.");
  if (!values.hypothesis?.trim()) throw new Error("Declare --hypothesis before an experiment.");
  for (const key of ["max-requests", "budget-usd", "input-price", "output-price"] as const) if (!values[key]) throw new Error(`Declare --${key}; no requests sent.`);
  const available = phase === "budgets" ? budgetArms(values.prompt as PromptVariant) : phase === "context" ? contextArms : [...promptArms, fragmentArm, ...budgetArms(values.prompt as PromptVariant)];
  const ids = (values.arms ?? (phase === "pilot" ? "P0" : phase === "budgets" ? budgetArms(values.prompt as PromptVariant).map((arm) => arm.id).join(",") : phase === "context" ? "C0,C1,C2" : "P0,P1,P2,P3")).split(",");
  if (ids.length !== new Set(ids).size) throw new Error("Duplicate arms.");
  const arms = ids.map((id) => {
    const arm = available.find((arm) => arm.id === id);
    if (!arm) throw new Error(`Unknown arm ${id}.`);
    return arm;
  });
  if (["screen", "confirm"].includes(phase) && arms.some((arm) => arm.shortTokens !== 96 || arm.blockTokens !== 96)) throw new Error("Hold output budgets fixed during prompt comparisons.");
  const split = phase === "holdout" ? "holdout" : "development";
  const selectedIds = (values.cases ?? (phase === "pilot" ? "go-closer-hole" : "")).split(",").filter(Boolean);
  const entries = corpus.filter((entry) => entry.split === split && (!selectedIds.length || selectedIds.includes(entry.id)));
  if (selectedIds.length && (new Set(selectedIds).size !== selectedIds.length || selectedIds.length !== entries.length)) throw new Error("Unknown, duplicated, or wrong-split cases.");
  const options = { endpoint: values.endpoint, model: values.model, maxOutputTokens: 96,
    repetitions: Number(values.repetitions ?? (["confirm", "holdout", "budgets"].includes(phase) ? "3" : "1")), seed: Number(values.seed),
    maxRequests: Number(values["max-requests"]), budgetUsd: Number(values["budget-usd"]),
    inputUsdPerMillion: Number(values["input-price"]), outputUsdPerMillion: Number(values["output-price"]) };
  if (["confirm", "holdout"].includes(phase) && options.repetitions < 3) throw new Error("Finalist comparisons require at least three repetitions.");
  const plan = planExperiment(entries, arms, options);
  if (phase === "pilot" && plan.samples.length !== 1) throw new Error("Capability pilot is exactly one synthetic request.");
  const paths = git(["ls-files", "--cached", "--others", "--exclude-standard", "src", "scripts/run-benchmark.mjs", "package-lock.json"]).split("\n").filter(Boolean);
  const sourceHashes = Object.fromEntries([...new Set(paths)].sort().map((path) => [path, hash(readFileSync(path, "utf8"))]));
  const pipelineHash = hash(JSON.stringify(sourceHashes));
  let frozenFrom: string | null = null;
  if (phase === "holdout") {
    if (!values["frozen-config"]) throw new Error("Holdout requires --frozen-config pointing to a completed development finalist report.");
    const frozen: unknown = JSON.parse(readFileSync(values["frozen-config"], "utf8")) as unknown;
    const previous = object(frozen) && object(frozen.manifest) ? frozen.manifest : null;
    const previousArms = previous && Array.isArray(previous.arms) ? previous.arms as unknown[] : [];
    if (!object(frozen) || !previous || !object(frozen.analysis) || frozen.analysis.complete !== true || frozen.executionStarted !== true ||
        previous.split !== "development" || !["confirm", "budgets"].includes(String(previous.phase)) ||
        previous.corpusHash !== corpusHash || previous.pipelineHash !== pipelineHash || !object(previous.options) ||
        previous.options.model !== options.model || previous.options.endpoint !== options.endpoint ||
        arms.some((arm) => !previousArms.some((item) => JSON.stringify(item) === JSON.stringify(arm)))) {
      throw new Error("Holdout must reuse the completed development report's corpus, pipeline, endpoint, model, and frozen arms.");
    }
    frozenFrom = hash(readFileSync(values["frozen-config"], "utf8"));
  }
  const manifest = { experimentVersion: "gl07-v1", createdAt: new Date().toISOString(), phase, split, hypothesis: values.hypothesis,
    corpusVersion: CORPUS_VERSION, corpusHash, revision: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]).length > 0,
    pipelineHash, sourceHashes, node: process.version, platform: process.platform, arch: process.arch, options, arms, frozenFrom,
    request: { reasoningEffort: "none", temperature: 0.2, verbosity: "low", timeoutMs: 8000, stream: true, store: false, authentication: "bearer" },
    selectedCaseIds: entries.map((entry) => entry.id), reservedUsd: plan.reservedUsd,
    order: plan.samples.map((sample) => ({ caseId: sample.entry.id, repetition: sample.repetition, armId: sample.arm.id,
      maxOutputTokens: sample.maxOutputTokens, requestHash: sample.requestHash, instructionsHash: hash(sample.prompt.instructions), inputHash: hash(sample.prompt.input) })),
    budgetCaveat: "UTF-8-byte proxy plus 1024 input overhead, 1.25 input multiplier, full output cap. Planning estimate, not a billing guarantee; no retries or released reservations."
  };
  const path = resolve(values.out ?? `benchmarks/runs/gl07-${phase}-${Date.now()}.json`);
  if (existsSync(path)) throw new Error("Output already exists; choose a new artifact path to preserve previous evidence.");
  mkdirSync(dirname(path), { recursive: true });
  let executionStarted = false;
  const save = (captures: readonly ExperimentCapture[]) => {
    const priced = captures.filter((capture) => capture.usage.inputTokens !== undefined && capture.usage.outputTokens !== undefined);
    const report = { manifest, executionStarted, captures, analysis: analyzeExperiment(plan, captures),
      usagePricedEstimateUsd: priced.reduce((sum, capture) => sum + ((capture.usage.inputTokens ?? 0) * options.inputUsdPerMillion + (capture.usage.outputTokens ?? 0) * options.outputUsdPerMillion) / 1_000_000, 0),
      unknownCostSamples: captures.length - priced.length };
    writeFileSync(`${path}.tmp`, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  };
  save([]);
  if (values.execute) {
    const key = process.env.OPENAI_API_KEY ?? "";
    if (!key.trim()) throw new Error(`Plan saved to ${path}. No OPENAI_API_KEY available; no requests sent.`);
    executionStarted = true;
    const controller = new AbortController();
    const abort = (): void => controller.abort("interrupted");
    process.once("SIGINT", abort);
    try {
      const captures = await runExperiment(plan, options, key, controller.signal, save);
      save(captures);
      if (captures.length !== plan.samples.length) process.exitCode = 1;
    } finally { process.removeListener("SIGINT", abort); }
  }
  console.log(JSON.stringify({ mode: executionStarted ? "live" : "dry-run", phase, report: path, plannedRequests: plan.samples.length, reservedUsd: plan.reservedUsd }));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Experiment failed."); process.exitCode = 1; });
