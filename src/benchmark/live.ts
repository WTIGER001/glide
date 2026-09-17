import { buildCompletionInput, COMPLETION_INSTRUCTIONS } from "../promptBuilder";
import { OpenAIResponsesClient, ResponsesApiError } from "../openaiResponsesClient";
import type { Capture, CompletionCase } from "./types";

export interface LiveOptions {
  readonly endpoint: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly repetitions: number;
  readonly seed: number;
  readonly maxRequests: number;
  readonly budgetUsd: number;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
}

export function validateOptions(options: LiveOptions): void {
  const endpoint = new URL(options.endpoint);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/v1/responses" ||
      !(endpoint.href === "https://api.openai.com/v1/responses" || (endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
    throw new Error("Use the direct OpenAI /v1/responses endpoint, or an HTTP loopback fixture server.");
  }
  if (!["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"].includes(options.model)) throw new Error("Unsupported model.");
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid ${key}.`);
  }
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 10 ||
      !Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 16 || options.maxOutputTokens > 256 ||
      !Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1 || !Number.isSafeInteger(options.seed) || options.seed > 0xffff_ffff) {
    throw new Error("Invalid request count, repetitions, seed, or output token limit.");
  }
  if (options.budgetUsd <= 0 || options.inputUsdPerMillion <= 0 || options.outputUsdPerMillion <= 0) throw new Error("Declare positive budget and current input/output prices.");
}

export function planLive(entries: readonly CompletionCase[], options: LiveOptions) {
  validateOptions(options);
  const samples = entries.flatMap((entry) => Array.from({ length: options.repetitions }, (_, repetition) => ({ entry, repetition })));
  if (samples.length === 0 || samples.length > options.maxRequests) throw new Error("Planned samples exceed --max-requests (or the selection is empty).");
  let state = options.seed >>> 0;
  for (let i = samples.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const first = samples[i];
    const second = samples[j];
    if (first !== undefined && second !== undefined) { samples[i] = second; samples[j] = first; }
  }
  // Deliberately conservative planning proxy, NOT a tokenizer or guaranteed billing ceiling.
  // UTF-8 bytes + overhead, with a 1.25 input multiplier to reserve cache-write overhead.
  const reservedUsd = samples.reduce((total, { entry }) => total +
    ((Buffer.byteLength(COMPLETION_INSTRUCTIONS + buildCompletionInput(entry.context), "utf8") + 1024) * options.inputUsdPerMillion * 1.25 +
      options.maxOutputTokens * options.outputUsdPerMillion) / 1_000_000, 0);
  if (reservedUsd > options.budgetUsd) throw new Error(`Estimated reservation $${reservedUsd.toFixed(6)} exceeds --budget-usd.`);
  return { samples, reservedUsd };
}

export async function runLive(
  entries: readonly CompletionCase[], options: LiveOptions, apiKey: string, signal: AbortSignal,
  save: (captures: readonly Capture[]) => void,
  client = new OpenAIResponsesClient()
): Promise<Capture[]> {
  const { samples } = planLive(entries, options); // Validate all limits before touching the network.
  if (apiKey.trim() === "") throw new Error("Set OPENAI_API_KEY explicitly; dotenv files are never read.");
  const captures: Capture[] = [];
  for (const { entry, repetition } of samples) {
    if (signal.aborted) break;
    const started = performance.now();
    try {
      const result = await client.complete({ endpoint: options.endpoint, apiKey, authentication: "bearer", model: options.model,
        instructions: COMPLETION_INSTRUCTIONS, input: buildCompletionInput(entry.context), reasoningEffort: "none",
        maxOutputTokens: options.maxOutputTokens, timeoutMs: 8000, suffix: entry.context.suffix }, signal);
      captures.push({ caseId: entry.id, repetition, status: result.status, raw: result.text, earlyStopped: result.earlyStopped,
        elapsedMs: performance.now() - started, firstTextMs: result.timeToFirstTokenMs ?? null, usage: result.usage, error: null });
    } catch (error) {
      captures.push({ caseId: entry.id, repetition, status: signal.aborted ? "cancelled" : "error", raw: "", earlyStopped: false,
        elapsedMs: performance.now() - started, firstTextMs: null, usage: {},
        error: signal.aborted ? "cancelled" : error instanceof ResponsesApiError ? (error.timedOut ? "timeout" : `transport${error.statusCode === undefined ? "" : `-http-${error.statusCode}`}`) : "request-failed" });
    }
    save(captures);
    // Authentication/rate/transport failures should not burn the rest of an experiment budget.
    if (captures.at(-1)?.status !== "completed") break;
  }
  return captures;
}
