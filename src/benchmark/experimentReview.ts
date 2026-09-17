import { corpusForHash } from "./corpus";
import { planExperiment } from "./experiment";
import type { Arm, ExperimentCapture } from "./experiment";
import { analyzeExperiment } from "./experimentAnalysis";
import type { LiveOptions } from "./live";
import { readCaptures } from "./replay";
import { checkSyntax } from "./syntaxChecks";
import type { Language } from "./types";

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

export function reviewExperiment(value: unknown, syntax: boolean) {
  if (!record(value) || !record(value.manifest) || !record(value.manifest.options) || typeof value.manifest.corpusHash !== "string" ||
      !Array.isArray(value.manifest.arms) || !Array.isArray(value.manifest.selectedCaseIds) || !Array.isArray(value.captures)) throw new Error("Malformed experiment report or wrong corpus.");
  const manifest = value.manifest;
  const reportCorpusHash = manifest.corpusHash;
  if (typeof reportCorpusHash !== "string") throw new Error("Malformed experiment report or wrong corpus.");
  const resolved = corpusForHash(reportCorpusHash);
  if (resolved === undefined) throw new Error("Malformed experiment report or wrong corpus.");
  const ids = manifest.selectedCaseIds as unknown[];
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) throw new Error("Invalid selected cases.");
  const entries = ids.map((id) => { const entry = resolved.cases.find((entry) => entry.id === id); if (!entry) throw new Error("Unknown case."); return entry; });
  const options = manifest.options as LiveOptions;
  const arms = manifest.arms as Arm[];
  const plan = planExperiment(entries, arms, options);
  const captures: ExperimentCapture[] = [];
  for (const arm of arms) {
    const selected = value.captures.filter((capture: unknown) => record(capture) && capture.armId === arm.id);
    const checked = readCaptures({ manifest, captures: selected }, entries, resolved.hash);
    for (let i = 0; i < checked.length; i += 1) {
      const source: unknown = selected[i]; const capture = checked[i];
      if (!capture || !record(source) || typeof source.requestHash !== "string" || typeof source.maxOutputTokens !== "number") throw new Error("Missing experiment capture metadata.");
      captures.push({ ...capture, armId: arm.id, requestHash: source.requestHash, maxOutputTokens: source.maxOutputTokens });
    }
  }
  if (captures.length !== value.captures.length) throw new Error("Unknown arm in captured results.");
  const analysis = analyzeExperiment(plan, captures);
  const syntaxResults = syntax ? analysis.rows.filter((row) => row.mode !== "abstain").map((row) => ({ armId: row.armId, caseId: row.caseId, repetition: row.repetition,
    raw: checkSyntax(row.language as Language, row.rawScore.reconstructed), processed: checkSyntax(row.language as Language, row.processedScore.reconstructed) })) : null;
  return { originalManifest: manifest, analysis, syntax: syntaxResults,
    reviewQueue: analysis.rows.filter((row) => row.status === "completed" && row.mode !== "abstain" && !row.processedScore.empty && !row.successfulOutcome).map((row) => ({ armId: row.armId, caseId: row.caseId, repetition: row.repetition,
      raw: row.raw, processed: row.processed, reconstructed: row.processedScore.reconstructed, decision: "unreviewed" })) };
}
