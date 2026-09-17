import type { Capture, CompletionCase } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readReplayManifest(value: unknown): Record<string, unknown> {
  if (!record(value) || !record(value.manifest)) throw new Error("Missing replay manifest.");
  return value.manifest;
}

/** Refuse wrong-corpus, duplicate or malformed samples instead of inflating scores. */
export function readCaptures(value: unknown, cases: readonly CompletionCase[], expectedHash: string): Capture[] {
  if (!record(value) || !record(value.manifest) || value.manifest.corpusHash !== expectedHash || !Array.isArray(value.captures)) {
    throw new Error("Replay must contain a matching corpusHash and captures array.");
  }
  const ids = new Set(cases.map((entry) => entry.id));
  const seen = new Set<string>();
  return value.captures.map((item: unknown) => {
    if (!record(item) || typeof item.caseId !== "string" || !ids.has(item.caseId) ||
        !nonnegative(item.repetition) || !Number.isInteger(item.repetition) ||
        typeof item.status !== "string" || !["completed", "incomplete", "failed", "cancelled", "error"].includes(item.status) ||
        typeof item.raw !== "string" || item.raw.length > 100_000 || typeof item.earlyStopped !== "boolean" ||
        !(item.elapsedMs === null || nonnegative(item.elapsedMs)) || !(item.firstTextMs === null || nonnegative(item.firstTextMs)) ||
        !(item.error === null || typeof item.error === "string") || !record(item.usage) ||
        Object.entries(item.usage).some(([key, n]) => !["inputTokens", "cachedInputTokens", "cacheWriteInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens"].includes(key) || !nonnegative(n))) {
      throw new Error("Invalid replay sample.");
    }
    const key = `${item.caseId}:${item.repetition}`;
    if (seen.has(key)) throw new Error("Duplicate replay sample.");
    seen.add(key);
    return item as unknown as Capture;
  });
}
