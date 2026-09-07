import { describe, expect, it } from "vitest";
import { CompletionCache, digestCacheIdentity, type CacheIdentity, type ContinuationIdentity } from "./completionCache";

function identity(overrides: Partial<CacheIdentity> = {}): CacheIdentity {
  return {
    endpoint: "https://api.openai.com/v1/responses",
    model: "gpt-5.6-luna",
    promptVersion: "completion-v1",
    language: "go",
    filename: "main.go",
    prefix: "func ma",
    suffix: "\n}",
    maxCompletionTokens: 96,
    reasoningEffort: "none",
    ...overrides
  };
}

describe("CompletionCache", () => {
  it("creates stable, collision-safe digest keys", () => {
    expect(digestCacheIdentity(identity())).toHaveLength(64);
    expect(digestCacheIdentity(identity())).toBe(digestCacheIdentity(identity()));
    expect(digestCacheIdentity(identity({ prefix: "ab", suffix: "c" }))).not.toBe(
      digestCacheIdentity(identity({ prefix: "a", suffix: "bc" }))
    );
  });

  it("evicts the least recently used entry", () => {
    const cache = new CompletionCache(2);
    cache.set("a", "A");
    cache.set("b", "B");
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("A");
    expect(cache.get("c")).toBe("C");
  });

  it("reuses the untyped tail of the last suggestion", () => {
    const cache = new CompletionCache(2);
    const previous: ContinuationIdentity = { ...identity(), uri: "file:///main.go" };
    cache.rememberContinuation(previous, "in() {\n}");
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}in` })).toBe("() {\n}");
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}ix` })).toBeUndefined();
  });

  it("clears result and continuation state", () => {
    const cache = new CompletionCache(2);
    const previous: ContinuationIdentity = { ...identity(), uri: "file:///main.go" };
    cache.set("a", "A");
    cache.rememberContinuation(previous, "in()");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}in` })).toBeUndefined();
  });
});
