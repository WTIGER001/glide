import type { Capture, CompletionCase, Language, Processor } from "./types";
import { families } from "./corpus";
import { checkData } from "./dataChecks";

export function editSimilarity(left: string, right: string): number {
  // Character similarity is diagnostic only, never semantic correctness.
  const a = Array.from(left.slice(0, 4096));
  const b = Array.from(right.slice(0, 4096));
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      next.push(Math.min((next[j] ?? 0) + 1, (row[j + 1] ?? 0) + 1, (row[j] ?? 0) + (a[i] === b[j] ? 0 : 1)));
    }
    row = next;
  }
  return 1 - (row[b.length] ?? 0) / Math.max(1, a.length, b.length);
}

function candidateScore(entry: CompletionCase, candidate: string) {
  const empty = candidate.trim() === "";
  const exact = entry.expected !== null && candidate === entry.expected;
  const knownAlternative = entry.expected !== null && entry.alternatives.includes(candidate);
  const data = entry.expected === null ? null : checkData(entry.context.language as Language, entry.context.prefix + candidate + entry.context.suffix,
    families.find((family) => family.id === entry.family)?.checks ?? "null");
  return {
    empty,
    exact,
    knownAlternative,
    oracleMatch: entry.expected === null ? empty : exact || knownAlternative,
    data,
    semanticStatus: entry.expected === null ? "abstention-policy" : exact || knownAlternative ? "reference-match" : "unverified",
    editSimilarity: entry.expected === null ? null : Math.max(...[entry.expected, ...entry.alternatives].map((expected) => editSimilarity(candidate, expected))),
    reconstructed: entry.context.prefix + candidate + entry.context.suffix,
    characters: candidate.length
  };
}

export function scoreCapture(entry: CompletionCase, capture: Capture, processor: Processor, maxOutputTokens = 96) {
  const start = performance.now();
  const processed = capture.status === "completed"
    ? processor.processCompletion(capture.raw, entry.context, { maxCompletionTokens: maxOutputTokens }) ?? ""
    : "";
  const processingMs = performance.now() - start;
  const raw = candidateScore(entry, capture.raw);
  const insertion = candidateScore(entry, processed);
  return {
    caseId: entry.id,
    family: entry.family,
    split: entry.split,
    language: entry.context.language,
    category: entry.category,
    mode: entry.mode,
    repetition: capture.repetition,
    status: capture.status,
    stopReason: capture.status !== "completed" ? capture.status : capture.earlyStopped ? "client-early-stop" : "response-completed",
    raw: capture.raw,
    processed,
    rawScore: raw,
    processedScore: insertion,
    // Transport failures do not earn abstention credit.
    successfulOutcome: capture.status === "completed" && (insertion.oracleMatch || insertion.data?.valueMatches === true),
    cleanupChangedKnownGood: capture.status === "completed" && raw.oracleMatch && !insertion.oracleMatch,
    rejected: capture.status === "completed" && !raw.empty && insertion.empty,
    elapsedMs: capture.elapsedMs,
    firstTextMs: capture.firstTextMs,
    processingMs,
    usage: Object.keys(capture.usage).length === 0 ? null : capture.usage,
    error: capture.error
  };
}

export type ScoredCapture = ReturnType<typeof scoreCapture>;

export function percentiles(values: readonly number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const at = (q: number): number | null => sorted.length === 0 ? null : sorted[Math.ceil(sorted.length * q) - 1] ?? null;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95) };
}

export function summarize(rows: readonly ScoredCapture[]) {
  const completionRows = rows.filter((row) => row.mode !== "abstain");
  const abstentionRows = rows.filter((row) => row.mode === "abstain");
  return {
    samples: rows.length,
    families: new Set(rows.map((row) => row.family)).size,
    completionSamples: completionRows.length,
    completionReferenceMatches: completionRows.filter((row) => row.status === "completed" && row.processedScore.oracleMatch).length,
    completionReferenceMatchRate: completionRows.length === 0 ? null : completionRows.filter((row) => row.status === "completed" && row.processedScore.oracleMatch).length / completionRows.length,
    completionReferenceOrDataValueMatches: completionRows.filter((row) => row.successfulOutcome).length,
    abstentionSamples: abstentionRows.length,
    correctAbstentions: abstentionRows.filter((row) => row.successfulOutcome).length,
    unexpectedEmptyCompletions: completionRows.filter((row) => row.processedScore.empty).length,
    cleanupChangedKnownGood: rows.filter((row) => row.cleanupChangedKnownGood).length,
    transportFailures: rows.filter((row) => row.status !== "completed").length,
    unknownUsageSamples: rows.filter((row) => row.usage === null).length,
    responseLatencyMs: percentiles(rows.flatMap((row) => row.elapsedMs === null ? [] : [row.elapsedMs])),
    firstTextLatencyMs: percentiles(rows.flatMap((row) => row.firstTextMs === null ? [] : [row.firstTextMs])),
    processingLatencyMs: percentiles(rows.map((row) => row.processingMs))
  };
}

export function groupedSummary(rows: readonly ScoredCapture[], key: "language" | "category" | "split") {
  return Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, summarize(rows.filter((row) => row[key] === value))]));
}
