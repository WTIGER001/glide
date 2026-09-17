import { describe, expect, it, vi } from "vitest";
import { OpenAIResponsesClient } from "../openaiResponsesClient";
import { buildCompletionInput, COMPLETION_INSTRUCTIONS } from "../promptBuilder";
import { corpus } from "./corpus";
import { planExperiment, promptArms, budgetArms, contextArms, fragmentArm, runExperiment } from "./experiment";
import type { ExperimentCapture } from "./experiment";
import { analyzeExperiment, clusteredDifference } from "./experimentAnalysis";
import { EXAMPLE, promptFor, requestedMode } from "./promptVariants";
import { checkSyntax } from "./syntaxChecks";

const options = { endpoint: "http://127.0.0.1:1234/v1/responses", model: "gpt-5.6-luna", maxOutputTokens: 96,
  repetitions: 3, seed: 17, maxRequests: 2000, budgetUsd: 2, inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.2 };
const entries = corpus.filter((entry) => entry.split === "development");
function first() { const item = entries[0]; if (!item) throw new Error("No cases"); return item; }
function oracleCaptures(plan: ReturnType<typeof planExperiment>): ExperimentCapture[] {
  return plan.samples.map((sample) => ({ caseId: sample.entry.id, repetition: sample.repetition, armId: sample.arm.id,
    maxOutputTokens: sample.maxOutputTokens, requestHash: sample.requestHash, status: "completed", raw: sample.entry.expected ?? "",
    earlyStopped: false, elapsedMs: 100, firstTextMs: 50, error: null, usage: { inputTokens: 100, outputTokens: 10 } }));
}

describe("controlled experiment prompts", () => {
  it("keeps P0 identical to production and P3 identical to P2 apart from section order", () => {
    const context = first().context;
    expect(promptFor("P0", context)).toEqual({ instructions: COMPLETION_INSTRUCTIONS, input: buildCompletionInput(context) });
    const p1 = promptFor("P1", context); const p2 = promptFor("P2", context); const p3 = promptFor("P3", context);
    expect(p2.instructions.startsWith(p1.instructions)).toBe(true);
    expect(p2.input).toBe(p1.input);
    expect(p3.instructions).toBe(p2.instructions);
    expect(p3.input.indexOf("<GLIDE_AFTER>")).toBeLessThan(p3.input.indexOf("<GLIDE_BEFORE>"));
    for (const variant of ["P0", "P1", "P2", "P3"] as const) {
      expect(promptFor(variant, context).input).toContain(context.prefix);
      expect(promptFor(variant, context).input).toContain(context.suffix);
      expect(promptFor(variant, context).input).not.toContain("panic(");
    }
    expect(checkSyntax("go", EXAMPLE.before + EXAMPLE.insertion + EXAMPLE.after).valid).toBe(true);
  });

  it("chooses budgets from cursor context without reading gold mode, answer or category", () => {
    const item = first();
    expect(requestedMode({ ...item.context, linePrefix: "return xs.map(" })).toBe("short");
    expect(requestedMode({ ...item.context, linePrefix: "  " })).toBe("block");
    const changed = { ...item, mode: "abstain" as const, expected: null, category: "SECRET_LABEL" };
    const a = planExperiment([item], budgetArms("P1"), options);
    const b = planExperiment([changed], budgetArms("P1"), options);
    expect(a.samples.map((sample) => [sample.prompt, sample.maxOutputTokens])).toEqual(b.samples.map((sample) => [sample.prompt, sample.maxOutputTokens]));
  });

  it("keeps selected context same-file, bounded, deduplicated, and free of the removed answer", () => {
    const far = entries.find((entry) => entry.id === "go-far-helper-hole");
    if (far === undefined) throw new Error("Missing far-helper case");
    const plan = planExperiment([far], contextArms, { ...options, repetitions: 1 });
    const c1 = plan.samples.find((sample) => sample.arm.id === "C1")?.prompt.input ?? "";
    const c2 = plan.samples.find((sample) => sample.arm.id === "C2")?.prompt.input ?? "";
    expect(c1).not.toContain("func helper(n int)");
    expect(c2).toContain("<GLIDE_RELATED_SAME_FILE>");
    expect(c2).toContain("func helper(n int)");
    expect(c2).not.toContain(far.expected ?? "MISSING");
    expect(c2.length - c1.length).toBeLessThan(2000);
  });

  it("scores fragment arms only after exact typed-prefix derivation", () => {
    const typed = entries.find((entry) => entry.id === "py-sorted-typed");
    if (typed === undefined) throw new Error("Missing typed case");
    const plan = planExperiment([typed], [fragmentArm], { ...options, repetitions: 1 });
    const base = oracleCaptures(plan)[0];
    if (base === undefined) throw new Error("Missing capture");
    const fullFragment = `sor${typed.expected ?? ""}`;
    const passed = analyzeExperiment(plan, [{ ...base, raw: fullFragment }]);
    const rejected = analyzeExperiment(plan, [{ ...base, raw: "different" }]);
    expect(passed.byArm.P4?.completionReferenceMatches).toBe(1);
    expect(rejected.byArm.P4?.completionReferenceMatches).toBe(0);
    expect(rejected.byArm.P4?.unexpectedEmptyCompletions).toBe(1);
  });
});

describe("experiment ordering and budget", () => {
  it("pairs all arms per case/repetition, balances positions, and records deterministic requests", () => {
    const plan = planExperiment(entries, promptArms, options);
    expect(plan.samples).toHaveLength(entries.length * 4 * 3);
    expect(plan.samples).toEqual(planExperiment(entries, promptArms, options).samples);
    const positions = new Map<string, number[]>();
    for (let i = 0; i < plan.samples.length; i += 4) {
      const block = plan.samples.slice(i, i + 4);
      expect(new Set(block.map((sample) => sample.entry.id)).size).toBe(1);
      expect(new Set(block.map((sample) => sample.repetition)).size).toBe(1);
      expect(new Set(block.map((sample) => sample.arm.id)).size).toBe(4);
      block.forEach((sample, position) => { const counts = positions.get(sample.arm.id) ?? [0, 0, 0, 0]; counts[position] = (counts[position] ?? 0) + 1; positions.set(sample.arm.id, counts); });
    }
    for (const counts of positions.values()) expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(() => planExperiment(entries, promptArms, { ...options, maxRequests: 100 })).toThrow("max-requests");
    expect(() => planExperiment(entries, promptArms, { ...options, budgetUsd: 0.001 })).toThrow("budget");
    expect(() => planExperiment(corpus, promptArms, options)).toThrow("mix");
  });

  it("requires the same frozen requests on execution and rejects missing credentials before network", async () => {
    const plan = planExperiment([first()], promptArms, options);
    const fetchMock = vi.fn<typeof fetch>(); const client = new OpenAIResponsesClient(fetchMock);
    await expect(runExperiment(plan, options, "", new AbortController().signal, () => undefined, client)).rejects.toThrow("No OPENAI_API_KEY");
    await expect(runExperiment(plan, { ...options, model: "gpt-5.6-terra" }, "synthetic", new AbortController().signal, () => undefined, client)).rejects.toThrow("changed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps incomplete outputs as outcomes, then stops on transport failure without leaking error bodies", async () => {
    const plan = planExperiment([first()], promptArms, { ...options, repetitions: 1 });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "incomplete", output_text: "partial", usage: { output_tokens: 96 } }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("secret server payload", { status: 429 }));
    const snapshots: string[] = [];
    const captures = await runExperiment(plan, { ...options, repetitions: 1 }, "synthetic-key", new AbortController().signal,
      (rows) => { snapshots.push(JSON.stringify(rows)); }, new OpenAIResponsesClient(fetchMock));
    expect(captures.map((capture) => capture.status)).toEqual(["incomplete", "error"]);
    expect(snapshots).toHaveLength(2);
    expect(JSON.stringify(captures)).not.toMatch(/synthetic-key|secret server payload/u);
    const report = analyzeExperiment(plan, captures);
    expect(report.complete).toBe(false);
    expect(report.unattemptedSamples).toBe(2);
    expect(report.comparisons).toEqual([]);
  });
});

describe("paired analysis", () => {
  it("uses families as clusters, rejects duplicates and mismatched requests", () => {
    const plan = planExperiment(entries, promptArms.slice(0, 2), options);
    const captures = oracleCaptures(plan);
    const report = analyzeExperiment(plan, captures);
    expect(report.complete).toBe(true);
    expect(report.comparisons[0]?.interval).toMatchObject({ families: 61, meanDifference: 0, low95: 0, high95: 0 });
    const sample = captures[0]; if (!sample) throw new Error("No samples");
    expect(() => analyzeExperiment(plan, [...captures, sample])).toThrow("Duplicate");
    expect(() => analyzeExperiment(plan, [{ ...sample, requestHash: "wrong" }])).toThrow("frozen");
    expect(clusteredDifference([1, 1, 1])).toMatchObject({ meanDifference: 1, low95: 1, high95: 1 });
    expect(clusteredDifference([0])).toBeNull();
  });

  it("does not reward an all-empty candidate through aggregate abstention accuracy", () => {
    const plan = planExperiment(entries, promptArms.slice(0, 2), options);
    const captures = oracleCaptures(plan).map((capture) => capture.armId === "P1" ? { ...capture, raw: "" } : capture);
    const report = analyzeExperiment(plan, captures);
    expect(report.byArm.P1?.completionReferenceMatches).toBe(0);
    expect(report.byArm.P1?.correctAbstentions).toBeGreaterThan(0);
    expect(report.comparisons[0]?.interval?.meanDifference).toBeLessThan(-0.9);
  });
});
