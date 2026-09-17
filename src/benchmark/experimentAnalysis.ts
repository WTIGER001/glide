import * as processor from "../outputProcessor";
import { deriveFragmentInsertion } from "../fragmentProtocol";
import { random } from "./experiment";
import type { ExperimentCapture, planExperiment } from "./experiment";
import { scoreCapture, summarize, percentiles, groupedSummary } from "./scoring";

export function clusteredDifference(differences: readonly number[], seed = 17) {
  if (differences.length < 2) return null;
  const next = random(seed);
  const mean = differences.reduce((total, value) => total + value, 0) / differences.length;
  const resamples = Array.from({ length: 2000 }, () => {
    let total = 0;
    for (let i = 0; i < differences.length; i += 1) total += differences[Math.floor(next() * differences.length)] ?? 0;
    return total / differences.length;
  }).sort((a, b) => a - b);
  return { families: differences.length, meanDifference: mean, low95: resamples[49], high95: resamples[1949],
    method: "paired source-family bootstrap; 2000 draws, descriptive and not multiple-comparison adjusted" };
}

export function analyzeExperiment(plan: ReturnType<typeof planExperiment>, captures: readonly ExperimentCapture[]) {
  const key = (sample: { caseId: string; repetition: number; armId: string }) => `${sample.caseId}:${sample.repetition}:${sample.armId}`;
  const byKey = new Map(captures.map((capture) => [key(capture), capture]));
  if (byKey.size !== captures.length) throw new Error("Duplicate experiment capture.");
  const planned = new Map(plan.samples.map((sample) => [`${sample.entry.id}:${sample.repetition}:${sample.arm.id}`, sample]));
  const rows = captures.map((capture) => {
    const sample = planned.get(key(capture));
    if (!sample || sample.requestHash !== capture.requestHash || sample.maxOutputTokens !== capture.maxOutputTokens) throw new Error("Capture does not match frozen request.");
    const fragment = sample.arm.prompt === "P4" ? deriveFragmentInsertion(capture.raw, sample.entry.context) : null;
    const transformed = fragment?.applied ? { ...capture, raw: fragment.insertion ?? "" } : capture;
    return { armId: capture.armId, modelRaw: capture.raw, fragmentProtocol: fragment,
      ...scoreCapture(sample.entry, transformed, processor, capture.maxOutputTokens) };
  });
  const complete = captures.length === plan.samples.length;
  const byArm = Object.fromEntries(plan.arms.map((arm) => {
    const selected = rows.filter((row) => row.armId === arm.id);
    const plannedSamples = plan.samples.filter((sample) => sample.arm.id === arm.id).length;
    const known = selected.filter((row) => row.successfulOutcome && row.mode !== "abstain");
    return [arm.id, { ...summarize(selected), plannedSamples, unattemptedSamples: plannedSamples - selected.length,
      completedResponses: selected.filter((row) => row.status === "completed").length,
      incompleteResponses: selected.filter((row) => row.status === "incomplete").length,
      nonemptyProcessedResponses: selected.filter((row) => row.status === "completed" && !row.processedScore.empty).length,
      rawCompletionMatches: selected.filter((row) => row.mode !== "abstain" && row.status === "completed" && (row.rawScore.oracleMatch || row.rawScore.data?.valueMatches === true)).length,
      novelUnverifiedCompletions: selected.filter((row) => row.status === "completed" && row.mode !== "abstain" && !row.processedScore.empty && !row.successfulOutcome).length,
      processedLength: percentiles(selected.filter((row) => !row.processedScore.empty).map((row) => row.processed.length)),
      knownGoodCharacters: known.reduce((total, row) => total + row.processed.length, 0),
      completedResponseLatencyMs: percentiles(selected.flatMap((row) => row.status === "completed" && row.elapsedMs !== null ? [row.elapsedMs] : [])),
      byLanguage: groupedSummary(selected, "language"), byCategory: groupedSummary(selected, "category"),
      usage: { inputTokens: selected.reduce((sum, row) => sum + (row.usage?.inputTokens ?? 0), 0), outputTokens: selected.reduce((sum, row) => sum + (row.usage?.outputTokens ?? 0), 0),
        missing: selected.filter((row) => row.usage?.inputTokens === undefined || row.usage.outputTokens === undefined).length }
    }];
  }));
  const baseline = plan.arms[0]?.id;
  const comparisons = complete ? plan.arms.slice(1).map((arm) => {
    const familyIds = [...new Set(rows.filter((row) => row.mode !== "abstain").map((row) => row.family))];
    const differences = familyIds.map((family) => {
      const mean = (id: string | undefined) => {
        const familyRows = rows.filter((row) => row.family === family && row.armId === id);
        return familyRows.filter((row) => row.successfulOutcome).length / familyRows.length;
      };
      return mean(arm.id) - mean(baseline);
    });
    return { baseline, candidate: arm.id, metric: "completion reference-or-data-value matches; not semantic accuracy", interval: clusteredDifference(differences) };
  }) : [];
  return { complete, plannedSamples: plan.samples.length, attemptedSamples: captures.length, unattemptedSamples: plan.samples.length - captures.length,
    rows, byArm, comparisons, decision: "No automatic promotion. Review novel outputs, syntax, abstention, latency and all hard gates before selecting a finalist." };
}
