import { describe, expect, it } from "vitest";
import { selectSameFileContext } from "./sameFileContext";

describe("same-file context selection", () => {
  it("selects imports and relevant declarations while removing adjacent duplicates", () => {
    const source = [
      'import "strings"',
      "type User struct { Name string }",
      "func normalizeName(value string) string { return strings.TrimSpace(value) }",
      "func unrelated() {}",
      "func subject(user User) string {",
      "  return normalizeName(user.Name)",
      "}"
    ].join("\n");
    const result = selectSameFileContext(source, {
      prefix: "func subject(user User) string {\n  return normalize",
      suffix: "Name(user.Name)\n}",
      linePrefix: "  return normalize"
    });
    expect(result).toContain('import "strings"');
    expect(result).toContain("type User");
    expect(result).toContain("func normalizeName");
    expect(result).not.toContain("func subject");
  });

  it("obeys its character and source-size bounds", () => {
    expect(selectSameFileContext("const x = 1\n", { prefix: "", suffix: "", linePrefix: "x" }, 5)).toBe("");
    expect(selectSameFileContext("x".repeat(500_001), { prefix: "", suffix: "", linePrefix: "" })).toBe("");
  });
});
