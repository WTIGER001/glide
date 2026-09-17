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
    cursorOffset: 21,
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
    const prefix = "func main() {\n\tfmt.Pr";
    expect(processCompletion("intln(\"hi\")\n}", context({ cursorOffset: prefix.length }), { maxCompletionTokens: 96 })).toBe("intln(\"hi\")");
  });

  it("preserves punctuation that can belong to the insertion", () => {
    expect(
      processCompletion("bar()", context({ prefix: "foo(", linePrefix: "foo(", suffix: ")" }), {
        maxCompletionTokens: 96
      })
    ).toBe("bar()");
  });

  it("preserves significant terminal whitespace before the suffix", () => {
    expect(
      processCompletion("await ", context({ prefix: "const x = ", linePrefix: "const x = ", suffix: "foo()" }), {
        maxCompletionTokens: 96
      })
    ).toBe("await ");
  });

  it.each([
    ["escaped string", `value := "a\\"b"`, `value := "a\\"b"`],
    ["comment", "// keep this comment", "// keep this comment"],
    ["TypeScript template", "`hello ${name}`", "`hello ${name}`"],
    ["Unicode", 'fmt.Println("世界")', 'fmt.Println("世界")'],
    ["CRLF normalization", "if ok {\r\n    run()\r\n}", "if ok {\n\trun()\n}"],
    ["legitimate repeated punctuation", "values[i]]", "values[i]]"]
  ])("preserves valid %s output", (_name, raw, expected) => {
    expect(processCompletion(raw, context({ prefix: "", linePrefix: "", suffix: "" }), { maxCompletionTokens: 96 })).toBe(expected);
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
    expect(shouldStopStream("value\n}", "\n}", 96)).toBe(false);
    expect(shouldStopStream("value", "\n}", 96)).toBe(false);
    expect(shouldStopStream("if err != nil {\n\t", "\n\treturn result\n}", 96)).toBe(false);
    expect(shouldStopStream("bar()", ")", 96)).toBe(false);
  });

  it.each([
    ["typescript", "function f() {\n", "if (ok) {\n  run();\n}", "\n}"],
    ["typescript", "function f() {\n if (ok) {\n", "run();\n}", "\n}"],
    ["go", "func f() {\n if ok {\n", "run()\n}", "\n}"],
    ["json", '{"x": {\n', '"a": 1\n}', "\n}"],
    ["go", "func f() {\n", "if ok {\n run()\n}", "\n}"],
    ["json", '{"x": ', '{"a": 1\n}', "\n}"],
    ["typescript", "function f() {\n", 'if (ok) {\n run("}"); // }\n}', "\n}"]
  ])("preserves generated nested closers in %s", (language, prefix, raw, suffix) => {
    expect(processCompletion(raw, context({ language, prefix, linePrefix: "", cursorOffset: prefix.length, suffix, insertSpaces: true }), { maxCompletionTokens: 96 })).toBe(raw);
  });

  it("does not treat literal/comment punctuation as structural and declines opaque echoes", () => {
    const prefix = "function f() {\n";
    const ctx = context({ language: "typescript", prefix, linePrefix: "", cursorOffset: prefix.length, suffix: "\n}" });
    expect(processCompletion('run("}");\n}', ctx, { maxCompletionTokens: 96 })).toBe('run("}");');
    expect(processCompletion('run(); /* } */\n}', ctx, { maxCompletionTokens: 96 })).toBe('run(); /* } */');
    expect(processCompletion('const r = /}/;\n}', ctx, { maxCompletionTokens: 96 })).toBeUndefined();
    expect(processCompletion('run();\n}', { ...ctx, cursorOffset: 1000 }, { maxCompletionTokens: 96 })).toBeUndefined();
    expect(processCompletion('work();\nreturn value;', { ...ctx, suffix: "\nreturn value;\n}" }, { maxCompletionTokens: 96 })).toBeUndefined();
  });
});
