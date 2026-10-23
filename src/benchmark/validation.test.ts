import { describe, expect, it } from "vitest";
import { oracleValidationFailures } from "./validation";

const passing = {
  references: [{ passed: true }],
  changedReferences: [],
  regressions: [{ id: "boundary", passed: true }],
  syntax: [{ caseId: "example", raw: { valid: true }, processed: { valid: true } }]
};

describe("strict offline validation", () => {
  it("allows equivalent formatting changes with passing behavior and syntax", () => {
    expect(oracleValidationFailures({ ...passing, changedReferences: [{ passed: true }] })).toEqual([]);
  });

  it("rejects processor regressions and transformed-reference failures", () => {
    expect(oracleValidationFailures({ ...passing, changedReferences: [{ passed: false }], regressions: [{ id: "boundary", passed: false }] }))
      .toEqual(["Transformed reference failures: 1.", "Boundary regression: boundary."]);
  });

  it.each([false, null])("rejects invalid or unavailable syntax (%s)", (valid) => {
    expect(oracleValidationFailures({ ...passing, syntax: [{ caseId: "example", raw: { valid: true }, processed: { valid } }] }))
      .toEqual(["Invalid or unavailable syntax check: example."]);
  });

  it("fails closed if required checks were omitted", () => {
    expect(oracleValidationFailures({ references: null, changedReferences: null, regressions: [], syntax: null })).toHaveLength(4);
  });
});
