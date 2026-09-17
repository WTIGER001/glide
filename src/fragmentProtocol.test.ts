import { describe, expect, it } from "vitest";
import { currentTypedFragment, deriveFragmentInsertion } from "./fragmentProtocol";

describe("full-fragment completion protocol", () => {
  it("derives insertion text only after an exact typed-prefix match", () => {
    expect(deriveFragmentInsertion("sorted", { linePrefix: "    return sor" })).toEqual({ fragment: "sor", insertion: "ted", applied: true });
    expect(deriveFragmentInsertion("enumerate", { linePrefix: "for i, x in enum" })).toEqual({ fragment: "enum", insertion: "erate", applied: true });
    expect(deriveFragmentInsertion("await fetchCount()", { linePrefix: "await" })).toEqual({ fragment: "await", insertion: " fetchCount()", applied: true });
  });

  it("rejects mismatches and never asks the editor to replace typed source", () => {
    expect(deriveFragmentInsertion("sorted", { linePrefix: "return enum" }).insertion).toBeUndefined();
    expect(deriveFragmentInsertion("", { linePrefix: "return sor" }).insertion).toBeUndefined();
  });

  it("recognizes quoted values and leaves non-fragment positions unchanged", () => {
    expect(currentTypedFragment({ linePrefix: '  "mode": "CUS' })).toBe("CUS");
    expect(deriveFragmentInsertion("CUSTOM", { linePrefix: '  "mode": "CUS' }).insertion).toBe("TOM");
    expect(deriveFragmentInsertion("if ok {", { linePrefix: "\t" })).toEqual({ fragment: "", insertion: "if ok {", applied: false });
  });
});
