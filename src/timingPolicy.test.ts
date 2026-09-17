import { describe, expect, it } from "vitest";
import { replayTypingTraces, SYNTHETIC_TYPING_TRACES } from "./timingPolicy";

describe("automatic timing replay", () => {
  it("compares fixed policies on reproducible traces", () => {
    const results = [75, 175, 300].map((delay) => replayTypingTraces(SYNTHETIC_TYPING_TRACES, delay));
    expect(results.map((row) => row.requests)).toEqual([18, 13, 8]);
    expect(results.map((row) => row.returnedBeforeNextEdit)).toEqual([6, 6, 6]);
    expect(results[0]?.opportunities).toBe(29);
  });

  it("rejects invalid timing inputs", () => {
    expect(() => replayTypingTraces([], -1)).toThrow("Invalid");
  });
});
