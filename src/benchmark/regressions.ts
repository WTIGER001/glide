import type { CompletionContext } from "../contextBuilder";
import type { Processor } from "./types";

function context(prefix: string, suffix: string): CompletionContext {
  const linePrefix = prefix.split("\n").at(-1) ?? "";
  return { uri: "file:///synthetic/regression.go", filename: "regression.go", documentVersion: 1,
    language: "go", prefix, suffix, cursorLine: prefix.split("\n").length - 1,
    cursorColumn: linePrefix.length, cursorOffset: prefix.length, linePrefix,
    indentation: "", insertSpaces: false, tabSize: 4 };
}

export const regressionCases = [
  { id: "F2-whitespace-stop", context: context("func f() {\n\t", "\n\treturn result\n}"), raw: "if err != nil {\n\t", shouldStop: false },
  { id: "F3-nested-call", context: context("foo(", ")"), raw: "bar()", expected: "bar()" },
  { id: "F3-terminal-space", context: context("const x = ", "foo()"), raw: "await ", expected: "await " },
  { id: "nested-brace", context: context("function f() {\n", "\n}"), raw: "if (ok) {\n  run();\n}", expected: "if (ok) {\n  run();\n}", shouldStop: false },
  { id: "prefix-owned-inner-brace", context: context("func f() {\n if ok {\n", "\n}"), raw: "run()\n}", expected: "run()\n}", shouldStop: false },
  { id: "python-indent", context: { ...context("def f():\n    ", "\n    return 1"), language: "python", insertSpaces: true }, raw: "if ok:\n        run()", expected: "if ok:\n        run()" },
  { id: "empty-abstention", context: context("x = ", ""), raw: " \n", expected: undefined },
  { id: "prose-rejection", context: context("x = ", ""), raw: "Here is the code: 1", expected: undefined }
] as const;

export function runRegressions(processor: Processor) {
  return regressionCases.map((entry) => {
    const actual = processor.processCompletion(entry.raw, entry.context, { maxCompletionTokens: 96 });
    const stopped = processor.shouldStopStream(entry.raw, entry.context.suffix, 96);
    return { id: entry.id, raw: entry.raw, processed: actual ?? null, stopped,
      passed: (!("expected" in entry) || actual === entry.expected) && (!("shouldStop" in entry) || stopped === entry.shouldStop) };
  });
}
