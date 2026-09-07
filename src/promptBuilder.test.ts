import { describe, expect, it } from "vitest";
import type { CompletionContext } from "./contextBuilder";
import { buildCompletionInput, COMPLETION_INSTRUCTIONS, PROMPT_VERSION } from "./promptBuilder";

const context: CompletionContext = {
  uri: "file:///private/work/service.go",
  documentVersion: 3,
  language: "go",
  filename: "service.go",
  prefix: "func lookup(id string) {\n\tuser,",
  suffix: "\n\treturn user\n}",
  cursorLine: 1,
  cursorColumn: 6,
  linePrefix: "\tuser,",
  indentation: "\t",
  insertSpaces: false,
  tabSize: 4
};

describe("promptBuilder", () => {
  it("labels prefix and suffix without including an absolute path", () => {
    const input = buildCompletionInput(context);
    expect(input).toContain(`<GLIDE_BEFORE>\n${context.prefix}\n</GLIDE_BEFORE>`);
    expect(input).toContain(`<GLIDE_AFTER>\n${context.suffix}\n</GLIDE_AFTER>`);
    expect(input).toContain("File: service.go");
    expect(input).not.toContain("/private/work");
    expect(input).toContain(`Prompt-Version: ${PROMPT_VERSION}`);
  });

  it("explicitly requests insertion-only output", () => {
    expect(COMPLETION_INSTRUCTIONS).toContain("exact source text");
    expect(COMPLETION_INSTRUCTIONS).toContain("Do not use Markdown");
  });
});
