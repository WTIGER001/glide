import { describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { buildCompletionContext, truncateHead, truncateTail } from "./contextBuilder";

describe("context truncation", () => {
  it("keeps the context nearest the cursor", () => {
    expect(truncateTail("abcdefgh", 4)).toBe("efgh");
    expect(truncateHead("abcdefgh", 4)).toBe("abcd");
  });

  it("does not split UTF-16 surrogate pairs", () => {
    const value = `a😀b`;
    expect(truncateTail(value, 2)).toBe("b");
    expect(truncateHead(value, 2)).toBe("a");
    expect(truncateTail(value, 3).isWellFormed()).toBe(true);
    expect(truncateHead(value, 3).isWellFormed()).toBe(true);
  });

  it("does not split CRLF", () => {
    expect(truncateTail("a\r\nb", 2)).toBe("b");
    expect(truncateHead("a\r\nb", 2)).toBe("a");
  });

  it("extracts bounded ranges without reading an entire large document", () => {
    const text = "x".repeat(1_000_000);
    const cursorOffset = 500_000;
    const fullReads: boolean[] = [];
    const document = {
      uri: { toString: () => "file:///work/large.go" },
      version: 1,
      languageId: "go",
      fileName: "/work/large.go",
      offsetAt: (position: vscode.Position) => position.character,
      positionAt: (offset: number) => new vscode.Position(0, Math.max(0, Math.min(text.length, offset))),
      getText: (range?: vscode.Range) => {
        fullReads.push(range === undefined);
        return range === undefined ? text : text.slice(range.start.character, range.end.character);
      },
      lineAt: () => ({ text: "x".repeat(cursorOffset) })
    } as unknown as vscode.TextDocument;

    const context = buildCompletionContext(
      document,
      new vscode.Position(0, cursorOffset),
      { insertSpaces: false, tabSize: 4 },
      { maxPrefixChars: 1000, maxSuffixChars: 500 }
    );
    expect(context.prefix).toHaveLength(1000);
    expect(context.suffix).toHaveLength(500);
    expect(fullReads).toEqual([false, false]);
  });
});
