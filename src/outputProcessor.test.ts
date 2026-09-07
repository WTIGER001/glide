import { describe, expect, it } from "vitest";
import type { CompletionContext } from "./contextBuilder";
import { longestSuffixPrefixOverlap, processCompletion, shouldStopStream } from "./outputProcessor";

function context(overrides: Partial<CompletionContext> = {}): CompletionContext {
  return {
    uri: "file:///work/main.go",
    documentVersion: 1,
    language: "go",
    filename: "main.go",
    prefix: "func main() {\n\tfmt.Pr",
    suffix: "\n}",
    cursorLine: 1,
    cursorColumn: 7,
    linePrefix: "\tfmt.Pr",
    indentation: "\t",
    insertSpaces: false,
    tabSize: 4,
    ...overrides
  };
}

describe("outputProcessor", () => {
  it("unwraps a complete Markdown fence", () => {
    expect(processCompletion("```go\nintln(\"hi\")\n```", context(), { maxCompletionTokens: 96 })).toBe(
      "intln(\"hi\")"
    );
  });

  it("rejects incomplete fences, prose, prompt leakage, and control characters", () => {
    expect(processCompletion("```go\nvalue", context(), { maxCompletionTokens: 96 })).toBeUndefined();
    expect(processCompletion("Here is the code: value", context(), { maxCompletionTokens: 96 })).toBeUndefined();
    expect(processCompletion("<GLIDE_AFTER>bad", context(), { maxCompletionTokens: 96 })).toBeUndefined();
    expect(processCompletion("bad\u0000value", context(), { maxCompletionTokens: 96 })).toBeUndefined();
  });

  it("removes echoed cursor-line text", () => {
    expect(
      processCompletion("\tfmt.Println(\"hi\")", context(), { maxCompletionTokens: 96 })
    ).toBe("intln(\"hi\")");
  });

  it("removes text already present in the suffix", () => {
    expect(processCompletion("intln(\"hi\")\n}", context(), { maxCompletionTokens: 96 })).toBe("intln(\"hi\")");
  });

  it("normalizes generated indentation to editor tabs", () => {
    expect(processCompletion("intln(\"hi\")\n    return", context(), { maxCompletionTokens: 96 })).toBe(
      "intln(\"hi\")\n\treturn"
    );
  });

  it("rejects repeated and excessive output", () => {
    expect(processCompletion("x\nx\nx", context(), { maxCompletionTokens: 96 })).toBeUndefined();
    expect(processCompletion("x".repeat(200), context(), { maxCompletionTokens: 16 })).toBeUndefined();
  });

  it("computes suffix overlap and safe stream cutoff", () => {
    expect(longestSuffixPrefixOverlap("value\n}", "\n}" )).toBe(2);
    expect(shouldStopStream("value\n}", "\n}", 96)).toBe(true);
    expect(shouldStopStream("value", "\n}", 96)).toBe(false);
  });
});
