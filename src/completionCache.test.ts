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
    relatedContext: "",
    maxCompletionTokens: 96,
    reasoningEffort: "none",
    insertSpaces: false,
    tabSize: 4,
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
    const previous: ContinuationIdentity = { ...identity(), uri: "file:///main.go", cursorOffset: 7 };
    cache.rememberContinuation(previous, "in() {\n}");
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}in`, cursorOffset: 9 })).toBe("() {\n}");
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}ix`, cursorOffset: 9 })).toBeUndefined();
  });

  it("reuses a continuation after the bounded prefix window slides", () => {
    const cache = new CompletionCache(2);
    const previous: ContinuationIdentity = {
      ...identity({ prefix: "0123456789" }),
      uri: "file:///main.go",
      cursorOffset: 10
    };
    cache.rememberContinuation(previous, "abc()");
    expect(cache.getContinuation({ ...previous, prefix: "23456789ab", cursorOffset: 12 })).toBe("c()");
  });

  it("supports a paste only when it exactly matches the suggested prefix", () => {
    const cache = new CompletionCache(2);
    const previous: ContinuationIdentity = { ...identity(), uri: "file:///main.go", cursorOffset: 7 };
    cache.rememberContinuation(previous, "in() {");
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}in()`, cursorOffset: 11 })).toBe(" {");
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}into`, cursorOffset: 11 })).toBeUndefined();
  });

  it("invalidates continuation on undo, suffix, file, formatting, or policy changes", () => {
    const cache = new CompletionCache(2);
    const previous: ContinuationIdentity = { ...identity(), uri: "file:///main.go", cursorOffset: 7 };
    cache.rememberContinuation(previous, "in()");
    const typed = { ...previous, prefix: `${previous.prefix}i`, cursorOffset: 8 };
    expect(cache.getContinuation({ ...typed, cursorOffset: 6 })).toBeUndefined();
    expect(cache.getContinuation({ ...typed, suffix: "changed" })).toBeUndefined();
    expect(cache.getContinuation({ ...typed, uri: "file:///other.go" })).toBeUndefined();
    expect(cache.getContinuation({ ...typed, insertSpaces: true })).toBeUndefined();
    expect(cache.getContinuation({ ...typed, tabSize: 8 })).toBeUndefined();
    expect(cache.getContinuation({ ...typed, reasoningEffort: "low" })).toBeUndefined();
  });

  it("keeps cached lookup p95 below the provisional 50 ms target", () => {
    const cache = new CompletionCache(2);
    cache.set("key", "value");
    const samples: number[] = [];
    for (let index = 0; index < 1000; index += 1) {
      const startedAt = performance.now();
      expect(cache.get("key")).toBe("value");
      samples.push(performance.now() - startedAt);
    }
    samples.sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(50);
  });

  it("clears result and continuation state", () => {
    const cache = new CompletionCache(2);
    const previous: ContinuationIdentity = { ...identity(), uri: "file:///main.go", cursorOffset: 7 };
    cache.set("a", "A");
    cache.rememberContinuation(previous, "in()");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.getContinuation({ ...previous, prefix: `${previous.prefix}in` })).toBeUndefined();
  });
});
