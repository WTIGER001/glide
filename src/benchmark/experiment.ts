import { OpenAIResponsesClient, ResponsesApiError } from "../openaiResponsesClient";
import * as processor from "../outputProcessor";
import { hash } from "./corpus";
import { validateOptions } from "./live";
import type { LiveOptions } from "./live";
import { promptFor, requestedMode } from "./promptVariants";
import type { PromptVariant } from "./promptVariants";
import { runRegressions } from "./regressions";
import type { Capture, CompletionCase } from "./types";
import { selectSameFileContext } from "../sameFileContext";

function tail(value: string, limit: number): string {
  let result = value.length <= limit ? value : value.slice(value.length - limit);
  if (result.startsWith("\n") && value[value.length - limit - 1] === "\r") result = result.slice(1);
  if (result.length > 0 && /[\uDC00-\uDFFF]/u.test(result[0] ?? "")) result = result.slice(1);
  return result;
}
function head(value: string, limit: number): string {
  let result = value.length <= limit ? value : value.slice(0, limit);
  if (result.endsWith("\r") && value[limit] === "\n") result = result.slice(0, -1);
  if (result.length > 0 && /[\uD800-\uDBFF]/u.test(result.at(-1) ?? "")) result = result.slice(0, -1);
  return result;
}

export interface Arm {
  readonly id: string;
  readonly prompt: PromptVariant;
  readonly shortTokens: number;
  readonly blockTokens: number;
  readonly contextPolicy?: "existing" | "small" | "selected";
}
export const promptArms: readonly Arm[] = (["P0", "P1", "P2", "P3"] as const).map((prompt) => ({ id: prompt, prompt, shortTokens: 96, blockTokens: 96 }));
export const fragmentArm: Arm = { id: "P4", prompt: "P4", shortTokens: 96, blockTokens: 96 };
export const contextArms: readonly Arm[] = [
  { id: "C0", prompt: "P0", shortTokens: 96, blockTokens: 96, contextPolicy: "existing" },
  { id: "C1", prompt: "P0", shortTokens: 96, blockTokens: 96, contextPolicy: "small" },
  { id: "C2", prompt: "P0", shortTokens: 96, blockTokens: 96, contextPolicy: "selected" }
];
export function budgetArms(prompt: PromptVariant): Arm[] {
  return [{ id: `${prompt}-B0`, prompt, shortTokens: 96, blockTokens: 96 },
    { id: `${prompt}-B1`, prompt, shortTokens: 48, blockTokens: 96 },
    { id: `${prompt}-B2`, prompt, shortTokens: 96, blockTokens: 160 }];
}

export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}
function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = result[i]; const b = result[j];
    if (a !== undefined && b !== undefined) { result[i] = b; result[j] = a; }
  }
  return result;
}

export interface ExperimentSample {
  readonly entry: CompletionCase;
  readonly repetition: number;
  readonly arm: Arm;
  readonly maxOutputTokens: number;
  readonly prompt: { readonly instructions: string; readonly input: string };
  readonly requestHash: string;
}
export interface ExperimentCapture extends Capture {
  readonly armId: string;
  readonly maxOutputTokens: number;
  readonly requestHash: string;
}

export function planExperiment(entries: readonly CompletionCase[], arms: readonly Arm[], options: LiveOptions) {
  validateOptions(options);
  if (entries.length === 0 || arms.length === 0 || new Set(entries.map((entry) => entry.id)).size !== entries.length || new Set(arms.map((arm) => arm.id)).size !== arms.length) throw new Error("Empty or duplicated experiment selection.");
  if (new Set(entries.map((entry) => entry.split)).size !== 1) throw new Error("Do not mix development and holdout.");
  for (const arm of arms) {
    if (!["P0", "P1", "P2", "P3", "P4"].includes(arm.prompt) || !/^[A-Za-z0-9-]+$/u.test(arm.id) || [arm.shortTokens, arm.blockTokens].some((limit) => !Number.isInteger(limit) || limit < 16 || limit > 256)) throw new Error("Invalid experiment arm.");
  }
  const failures = runRegressions(processor).filter((row) => !row.passed);
  if (failures.length) throw new Error(`Boundary prerequisite failed: ${failures.map((row) => row.id).join(", ")}`);
  const next = random(options.seed);
  const blocks = shuffle(entries.flatMap((entry) => Array.from({ length: options.repetitions }, (_, repetition) => ({ entry, repetition }))), next);
  // Pair variants at each cursor/repetition; balanced rotations limit position bias.
  const order = shuffle(arms, next);
  const samples: ExperimentSample[] = blocks.flatMap(({ entry, repetition }, index) => {
    const rotated = [...order.slice(index % arms.length), ...order.slice(0, index % arms.length)];
    return rotated.map((arm) => {
      const small = { ...entry.context, prefix: tail(entry.context.prefix, 8000), suffix: head(entry.context.suffix, 2000) };
      const promptContext = arm.contextPolicy === "small" ? small : arm.contextPolicy === "selected"
        ? { ...small, relatedContext: selectSameFileContext(entry.context.prefix + entry.context.suffix, small, 2000) }
        : entry.context;
      const prompt = promptFor(arm.prompt, promptContext);
      const maxOutputTokens = requestedMode(entry.context) === "block" ? arm.blockTokens : arm.shortTokens;
      return { entry, repetition, arm, prompt, maxOutputTokens,
        requestHash: hash(JSON.stringify({ ...prompt, maxOutputTokens, model: options.model, reasoning: "none", temperature: 0.2 })) };
    });
  });
  if (samples.length > options.maxRequests) throw new Error("Experiment exceeds --max-requests before any network request.");
  const reservedUsd = samples.reduce((total, sample) => total +
    ((Buffer.byteLength(sample.prompt.instructions + sample.prompt.input) + 1024) * options.inputUsdPerMillion * 1.25 + sample.maxOutputTokens * options.outputUsdPerMillion) / 1_000_000, 0);
  if (reservedUsd > options.budgetUsd) throw new Error(`Experiment reservation $${reservedUsd.toFixed(6)} exceeds budget.`);
  return { samples, reservedUsd, arms, entries };
}

export async function runExperiment(plan: ReturnType<typeof planExperiment>, options: LiveOptions, apiKey: string, signal: AbortSignal,
  save: (captures: readonly ExperimentCapture[]) => void, client = new OpenAIResponsesClient()) {
  if (!apiKey.trim()) throw new Error("No OPENAI_API_KEY is available; dotenv is not read.");
  // Revalidate at the execution boundary, including all arms and total reservation.
  const validated = planExperiment(plan.entries, plan.arms, options);
  const signature = (candidate: typeof plan) => JSON.stringify(candidate.samples.map((sample) => [sample.entry.id, sample.repetition, sample.arm.id, sample.requestHash]));
  if (signature(validated) !== signature(plan) || validated.reservedUsd !== plan.reservedUsd) throw new Error("Plan/options changed before execution.");
  const captures: ExperimentCapture[] = [];
  for (const sample of validated.samples) {
    if (signal.aborted) break;
    const started = performance.now();
    const identity = { caseId: sample.entry.id, repetition: sample.repetition, armId: sample.arm.id, maxOutputTokens: sample.maxOutputTokens, requestHash: sample.requestHash };
    try {
      const result = await client.complete({ endpoint: options.endpoint, apiKey, authentication: "bearer", model: options.model,
        ...sample.prompt, reasoningEffort: "none", maxOutputTokens: sample.maxOutputTokens, timeoutMs: 8000, suffix: sample.entry.context.suffix }, signal);
      captures.push({ ...identity, status: result.status, raw: result.text, earlyStopped: result.earlyStopped, elapsedMs: performance.now() - started,
        firstTextMs: result.timeToFirstTokenMs ?? null, usage: result.usage, error: null });
    } catch (error) {
      captures.push({ ...identity, status: signal.aborted ? "cancelled" : "error", raw: "", earlyStopped: false, elapsedMs: performance.now() - started,
        firstTextMs: null, usage: {}, error: signal.aborted ? "cancelled" : error instanceof ResponsesApiError ? (error.timedOut ? "timeout" : `http-${error.statusCode ?? "unknown"}`) : "request-failed" });
    }
    save(captures);
    // Output-budget exhaustion is an outcome of the experiment, not transport failure.
    const status = captures.at(-1)?.status;
    if (status !== "completed" && status !== "incomplete") break;
  }
  return captures;
}
