import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { buildCompletionInput } from "../promptBuilder";
import * as processor from "../outputProcessor";
import { corpus, corpusForHash, corpusHash, cursorOffsetAt, cursorPositionAt, expandFamily, families, legacyCorpus, legacyCorpusHash, validateCorpus } from "./corpus";
import { checkData } from "./dataChecks";
import { planLive, runLive } from "./live";
import type { LiveOptions } from "./live";
import { readCaptures } from "./replay";
import { runRegressions } from "./regressions";
import { scoreCapture, summarize } from "./scoring";
import type { Capture } from "./types";
import { checkSyntax } from "./syntaxChecks";

function entry(id: string) {
  const value = corpus.find((item) => item.id === id);
  if (!value) throw new Error(`Missing ${id}`);
  return value;
}
function capture(id: string, raw: string, status: Capture["status"] = "completed"): Capture {
  return { caseId: id, repetition: 0, raw, status, earlyStopped: false, elapsedMs: null, firstTextMs: null, error: null, usage: {} };
}
const options: LiveOptions = { endpoint: "https://api.openai.com/v1/responses", model: "gpt-5.6-luna", maxOutputTokens: 96,
  repetitions: 1, seed: 17, maxRequests: 200, budgetUsd: 1, inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.2 };

describe("synthetic completion corpus", () => {
  it("keeps all related cursor states within one split with the declared language balance", () => {
    validateCorpus();
    expect(corpus).toHaveLength(186);
    expect(families).toHaveLength(93);
    expect(corpus.filter((row) => row.split === "development")).toHaveLength(130);
    expect(corpus.filter((row) => row.split === "holdout")).toHaveLength(56);
    for (const language of ["go", "typescript", "python", "yaml", "json"]) {
      const expected = language === "go" ? 76 : language === "json" ? 26 : 28;
      expect(corpus.filter((row) => row.context.language === language)).toHaveLength(expected);
    }
    const sourceSplits = new Map<string, string>();
    for (const family of families) {
      expect(corpus.filter((row) => row.family === family.id)).toHaveLength(2);
      const shape = family.template.replace(/\s+/gu, "");
      expect(sourceSplits.has(shape)).toBe(false);
      sourceSplits.set(shape, family.split);
    }
    const hole = entry("go-sum-hole");
    expect(() => validateCorpus([hole, { ...hole, id: "other", split: "holdout" }])).toThrow("crosses split");
    expect(entry("json-crlf-typed").context.prefix.endsWith("\r\n")).toBe(true);
    const legacyCrlf = legacyCorpus.find((row) => row.id === "json-crlf-typed");
    expect(legacyCrlf).toBeDefined();
    expect(() => validateCorpus(legacyCrlf === undefined ? [] : [legacyCrlf])).toThrow("Unrepresentable cursor");
    expect(corpusForHash(legacyCorpusHash)?.cases).toBe(legacyCorpus);
    expect(corpusForHash(corpusHash)?.cases).toBe(corpus);
  });

  it("labels intent-constrained quality cases separately from reconstruction and abstention stress cases", () => {
    const contract = corpus.filter((row) => row.evaluation === "contract");
    expect(contract.map((row) => row.family).filter((value, index, values) => values.indexOf(value) === index)).toHaveLength(9);
    expect(new Set(contract.map((row) => row.context.language))).toEqual(new Set(["go", "typescript", "python", "yaml", "json"]));
    expect(corpus.filter((row) => row.evaluation === "abstention")).toHaveLength(20);
  });

  it("round-trips VS Code-style UTF-16 cursor positions without splitting CRLF or surrogate pairs", () => {
    const text = "a😀\r\nb";
    for (const offset of [0, 1, 3, 5, 6]) {
      const position = cursorPositionAt(text, offset);
      expect(position).toBeDefined();
      if (position !== undefined) expect(cursorOffsetAt(text, position)).toBe(offset);
    }
    expect(cursorPositionAt(text, 2)).toBeUndefined();
    expect(cursorPositionAt(text, 4)).toBeUndefined();
  });

  it("serializes context alone; evaluator answers, assertions and policy do not enter requests", () => {
    const family = families[0];
    if (!family) throw new Error("No families");
    const cases = expandFamily({ ...family, id: "ANSWER_ONLY_ID", checks: "EVALUATOR_ASSERTION", abstain: "EVALUATOR_POLICY" });
    for (const item of cases) {
      const prompt = buildCompletionInput(item.context);
      expect(prompt).not.toMatch(/ANSWER_ONLY_ID|EVALUATOR_ASSERTION|EVALUATOR_POLICY|⟦|⟧/u);
    }
    for (const item of corpus) {
      expect(item.context.cursorOffset).toBe(item.context.prefix.length);
      expect(item.context.linePrefix).toBe(item.context.prefix.split("\n").at(-1));
      if (item.expected !== null) expect(item.context.prefix + item.expected + item.context.suffix).not.toMatch(/[⟦⟧]/u);
    }
  });

  it("parses every authored YAML and JSON reference and alternative into the intended data", () => {
    for (const family of families.filter((row) => ["yaml", "json"].includes(row.language) && row.abstain === undefined)) {
      const answer = /⟦([\s\S]*?)⟧/u.exec(family.template)?.[1] ?? "";
      for (const insertion of [answer, ...(family.alternatives ?? [])]) {
        expect(checkData(family.language, family.template.replace(/⟦[\s\S]*?⟧/u, () => insertion), family.checks), family.id).toEqual({ syntaxValid: true, valueMatches: true });
      }
    }
    expect(checkData("yaml", "x: 1\nx: 2", '{"x":2}')?.syntaxValid).toBe(false);
    expect(checkData("json", '{"x": true,}', '{"x":true}')?.syntaxValid).toBe(false);
    expect(checkData("yaml", "x: !private value", '{}')?.syntaxValid).toBe(false);
    expect(checkData("yaml", "x: 'false'", '{"x":false}')).toEqual({ syntaxValid: true, valueMatches: false });
  });
});

describe("scoring and replay", () => {
  it("checks captured TypeScript and data syntax without executing the source", () => {
    expect(checkSyntax("typescript", 'throw new Error("MUST_NOT_EXECUTE");').valid).toBe(true);
    expect(checkSyntax("typescript", 'const x = (').valid).toBe(false);
    expect(checkSyntax("json", '{"x":').valid).toBe(false);
    expect(checkSyntax("yaml", 'x: [1, 2]').valid).toBe(true);
  });
  it("accepts a known valid alternative without mislabeling it exact, and marks novel code unverified", () => {
    const item = entry("go-sum-hole");
    const alternative = scoreCapture(item, capture(item.id, "total = total + n"), processor);
    expect(alternative.successfulOutcome).toBe(true);
    expect(alternative.processedScore.exact).toBe(false);
    expect(alternative.processedScore.knownAlternative).toBe(true);
    expect(scoreCapture(item, capture(item.id, "total = n + total"), processor).processedScore.semanticStatus).toBe("unverified");
  });

  it("does not reward transport failures or indiscriminate abstention", () => {
    const emptyRows = corpus.map((item) => scoreCapture(item, capture(item.id, ""), processor));
    expect(summarize(emptyRows).completionReferenceMatches).toBe(0);
    expect(summarize(emptyRows).correctAbstentions).toBe(20);
    const abstain = entry("yaml-unknown-enum-hole");
    expect(scoreCapture(abstain, capture(abstain.id, "", "failed"), processor).successfulOutcome).toBe(false);
    const ordinary = entry("go-sum-hole");
    const failed = scoreCapture(ordinary, capture(ordinary.id, ordinary.expected ?? "", "incomplete"), processor);
    expect(failed.processed).toBe("");
    expect(failed.successfulOutcome).toBe(false);
    expect(failed.usage).toBeNull();
  });

  it("keeps measured cleanup changes separate from valid data formatting changes", () => {
    const item = entry("json-multiline-hole");
    const raw = '{"name":"build","enabled":true}';
    const result = scoreCapture(item, capture(item.id, raw), processor);
    expect(result.processedScore.exact).toBe(false);
    expect(result.processedScore.data).toEqual({ syntaxValid: true, valueMatches: true });
    expect(result.successfulOutcome).toBe(true);
    // This harness must expose a bad processor instead of sharing its assumptions.
    const nested = runRegressions({ processCompletion: () => "broken", shouldStopStream: () => true });
    expect(nested.find((row) => row.id === "F3-nested-call")?.passed).toBe(false);
  });

  it("replays deterministically and rejects duplicates, unknown cases, bad metrics and a different corpus", () => {
    const item = entry("go-closer-hole");
    const sample = capture(item.id, item.expected ?? "");
    const report = { manifest: { corpusHash }, captures: [sample] };
    expect(readCaptures(report, corpus, corpusHash)).toEqual([sample]);
    const first = scoreCapture(item, sample, processor);
    const second = scoreCapture(item, readCaptures(report, corpus, corpusHash)[0] ?? sample, processor);
    expect({ ...first, processingMs: 0 }).toEqual({ ...second, processingMs: 0 });
    expect(() => readCaptures({ ...report, captures: [sample, sample] }, corpus, corpusHash)).toThrow("Duplicate");
    expect(() => readCaptures(report, corpus, "wrong")).toThrow("corpusHash");
    expect(() => readCaptures({ ...report, captures: [{ ...sample, elapsedMs: -1 }] }, corpus, corpusHash)).toThrow("Invalid");
    expect(() => readCaptures({ ...report, captures: [{ ...sample, caseId: "unknown" }] }, corpus, corpusHash)).toThrow("Invalid");
  });
});

describe("bounded live runner", () => {
  it("validates request, cost, output, model and destination limits before network use", () => {
    expect(() => planLive(corpus, { ...options, maxRequests: 1 })).toThrow("max-requests");
    expect(() => planLive(corpus, { ...options, budgetUsd: 0.000001 })).toThrow("budget-usd");
    expect(() => planLive(corpus, { ...options, budgetUsd: NaN })).toThrow("Invalid");
    expect(() => planLive(corpus, { ...options, maxOutputTokens: 0 })).toThrow();
    expect(() => planLive(corpus, { ...options, model: "other" })).toThrow();
    expect(() => planLive(corpus, { ...options, endpoint: "https://example.com/v1/responses" })).toThrow();
    expect(() => planLive(corpus, { ...options, endpoint: "https://api.openai.com/v1/responses?key=secret" })).toThrow();
    const selected = corpus.slice(0, 6);
    expect(planLive(selected, options).samples).toEqual(planLive(selected, options).samples);
    expect(planLive(selected, { ...options, seed: 20 }).samples).not.toEqual(planLive(selected, options).samples);
  });

  it("uses the production Responses client against loopback, persists partial results and stops after failure", async () => {
    const bodies: string[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (part: string) => { body += part; });
      request.on("end", () => {
        bodies.push(body);
        if (bodies.length === 1) {
          response.writeHead(200, { "Content-Type": "text/event-stream" });
          response.end('data: {"type":"response.output_text.delta","delta":"leaf()"}\n\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":40,"output_tokens":3,"total_tokens":43}}}\n\n');
        } else {
          response.writeHead(429); response.end("SECRET_SERVER_BODY");
        }
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const liveOptions = { ...options, endpoint: `http://127.0.0.1:${port}/v1/responses`, repetitions: 3 };
    const saved: string[] = [];
    try {
      const result = await runLive([entry("go-closer-hole")], liveOptions, "SYNTHETIC_KEY", new AbortController().signal, (rows) => { saved.push(JSON.stringify(rows)); });
      expect(result).toHaveLength(2);
      expect(saved).toHaveLength(2);
      expect(result[0]?.usage).toEqual({ inputTokens: 40, outputTokens: 3, totalTokens: 43 });
      expect(result[1]?.error).toBe("transport-http-429");
      expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_KEY|SECRET_SERVER_BODY/u);
      const body: unknown = JSON.parse(bodies[0] ?? "{}");
      expect(body).toMatchObject({ model: "gpt-5.6-luna", reasoning: { effort: "none" }, max_output_tokens: 96, stream: true, store: false });
      expect(bodies[0]).not.toContain('panic');
      const before = bodies.length;
      await expect(runLive(corpus, { ...liveOptions, maxRequests: 1 }, "SYNTHETIC_KEY", new AbortController().signal, () => undefined)).rejects.toThrow("max-requests");
      expect(bodies).toHaveLength(before);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
