import { describe, expect, it } from "vitest";
import { truncateHead, truncateTail } from "./contextBuilder";

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
});
