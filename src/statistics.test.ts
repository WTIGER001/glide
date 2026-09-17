import { describe, expect, it, vi } from "vitest";
import { LocalStatistics } from "./statistics";

function memento(initial?: unknown) {
  return {
    get: () => initial,
    update: vi.fn(() => Promise.resolve())
  };
}

describe("LocalStatistics", () => {
  it("labels provider returns honestly and deduplicates acceptances", () => {
    vi.useFakeTimers();
    let now = 0;
    const statistics = new LocalStatistics(memento() as never, () => now);
    statistics.opportunity();
    now = 30_000;
    statistics.opportunity(true);
    statistics.suggestionReturned("suggestion-1", 12, 40);
    expect(statistics.suggestionAccepted("suggestion-1", 12)).toBe(true);
    expect(statistics.suggestionAccepted("suggestion-1", 12)).toBe(false);

    expect(statistics.snapshot()).toMatchObject({
      completionOpportunities: 2,
      automaticOpportunities: 1,
      explicitOpportunities: 1,
      activeEditingMs: 30_000,
      suggestionsReturned: 1,
      suggestionsAccepted: 1,
      charactersReturned: 12,
      charactersAccepted: 12
    });
    expect(statistics.format()).toContain("returned by the provider");
    expect(statistics.format()).not.toContain("Suggestions: 1 displayed");
    statistics.dispose();
    vi.useRealTimers();
  });

  it("records bounded latency buckets and rejection reasons without source data", () => {
    vi.useFakeTimers();
    const statistics = new LocalStatistics(memento() as never);
    statistics.requestStarted("gpt-5.6-luna", "go");
    statistics.requestCompleted(640, 90);
    statistics.processingCompleted(2);
    statistics.outputRejected("policy");
    statistics.requestCancelled(true, 8100);
    const snapshot = statistics.snapshot();

    expect(snapshot.providerLatency.buckets.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(snapshot.firstTextLatency.buckets.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(snapshot.processingLatency.buckets.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(snapshot.cancellationLatency.buckets.at(-1)).toBe(1);
    expect(snapshot.outputRejections).toEqual({ policy: 1 });
    expect(JSON.stringify(snapshot)).not.toContain("source");
    statistics.dispose();
    vi.useRealTimers();
  });

  it("discards invalid or obsolete stored schemas", () => {
    const statistics = new LocalStatistics(memento({ schemaVersion: 1, suggestionsDisplayed: 999 }) as never);
    expect(statistics.snapshot().schemaVersion).toBe(3);
    expect(statistics.snapshot().suggestionsReturned).toBe(0);
  });

  it("migrates schema v2 aggregate counters without inventing trigger data", () => {
    const statistics = new LocalStatistics(memento({ schemaVersion: 2, completionOpportunities: 7, suggestionsAccepted: 2, charactersAccepted: 11 }) as never);
    expect(statistics.snapshot()).toMatchObject({ schemaVersion: 3, completionOpportunities: 7, suggestionsAccepted: 2, charactersAccepted: 11,
      automaticOpportunities: 0, explicitOpportunities: 0, activeEditingMs: 0 });
  });
});
