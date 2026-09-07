import type * as vscode from "vscode";
import type { GlideModel } from "./constants";

const STORAGE_KEY = "glide.localStatistics.v1";

export interface StatisticsSnapshot {
  readonly schemaVersion: 1;
  readonly requestsStarted: number;
  readonly requestsCompleted: number;
  readonly requestsFailed: number;
  readonly requestsCancelled: number;
  readonly requestsTimedOut: number;
  readonly cacheHits: number;
  readonly continuationHits: number;
  readonly inFlightDeduplications: number;
  readonly suggestionsDisplayed: number;
  readonly suggestionsAccepted: number;
  readonly charactersDisplayed: number;
  readonly charactersAccepted: number;
  readonly latencyTotalMs: number;
  readonly latencySamples: number;
  readonly byLanguage: Readonly<Record<string, number>>;
  readonly byModel: Readonly<Record<string, number>>;
}

type MutableStatistics = {
  -readonly [K in keyof StatisticsSnapshot]: StatisticsSnapshot[K] extends Readonly<Record<string, number>>
    ? Record<string, number>
    : StatisticsSnapshot[K];
};

function emptyStatistics(): MutableStatistics {
  return {
    schemaVersion: 1,
    requestsStarted: 0,
    requestsCompleted: 0,
    requestsFailed: 0,
    requestsCancelled: 0,
    requestsTimedOut: 0,
    cacheHits: 0,
    continuationHits: 0,
    inFlightDeduplications: 0,
    suggestionsDisplayed: 0,
    suggestionsAccepted: 0,
    charactersDisplayed: 0,
    charactersAccepted: 0,
    latencyTotalMs: 0,
    latencySamples: 0,
    byLanguage: {},
    byModel: {}
  };
}

function loadStatistics(value: unknown): MutableStatistics {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value) || value.schemaVersion !== 1) {
    return emptyStatistics();
  }
  return { ...emptyStatistics(), ...(value as Partial<MutableStatistics>) };
}

export class LocalStatistics implements vscode.Disposable {
  private data: MutableStatistics;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly state: vscode.Memento) {
    this.data = loadStatistics(state.get<unknown>(STORAGE_KEY));
  }

  public requestStarted(model: GlideModel, language: string): void {
    this.data.requestsStarted += 1;
    this.data.byModel[model] = (this.data.byModel[model] ?? 0) + 1;
    this.data.byLanguage[language] = (this.data.byLanguage[language] ?? 0) + 1;
    this.persist();
  }

  public requestCompleted(latencyMs: number): void {
    this.data.requestsCompleted += 1;
    this.data.latencyTotalMs += Math.max(0, Math.round(latencyMs));
    this.data.latencySamples += 1;
    this.persist();
  }

  public requestFailed(): void {
    this.data.requestsFailed += 1;
    this.persist();
  }

  public requestCancelled(timedOut = false): void {
    this.data.requestsCancelled += 1;
    if (timedOut) {
      this.data.requestsTimedOut += 1;
    }
    this.persist();
  }

  public cacheHit(continuation = false): void {
    if (continuation) {
      this.data.continuationHits += 1;
    } else {
      this.data.cacheHits += 1;
    }
    this.persist();
  }

  public inFlightDeduplicated(): void {
    this.data.inFlightDeduplications += 1;
    this.persist();
  }

  public suggestionDisplayed(characters: number): void {
    this.data.suggestionsDisplayed += 1;
    this.data.charactersDisplayed += Math.max(0, characters);
    this.persist();
  }

  public suggestionAccepted(characters: number): void {
    this.data.suggestionsAccepted += 1;
    this.data.charactersAccepted += Math.max(0, characters);
    this.persist();
  }

  public snapshot(): StatisticsSnapshot {
    return structuredClone(this.data);
  }

  public async reset(): Promise<void> {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    this.data = emptyStatistics();
    await this.state.update(STORAGE_KEY, this.data);
  }

  public format(): string {
    const data = this.snapshot();
    const averageLatency = data.latencySamples === 0 ? "n/a" : `${Math.round(data.latencyTotalMs / data.latencySamples)} ms`;
    return [
      "Glide local statistics",
      "",
      `Requests: ${data.requestsStarted} started, ${data.requestsCompleted} completed, ${data.requestsFailed} failed`,
      `Cancelled: ${data.requestsCancelled} (${data.requestsTimedOut} timed out)`,
      `Cache: ${data.cacheHits} exact hits, ${data.continuationHits} continuation hits, ${data.inFlightDeduplications} in-flight deduplications`,
      `Suggestions: ${data.suggestionsDisplayed} displayed, ${data.suggestionsAccepted} accepted`,
      `Characters: ${data.charactersDisplayed} displayed, ${data.charactersAccepted} accepted`,
      `Average completed-request latency: ${averageLatency}`,
      "",
      "Statistics contain aggregate counts and language/model buckets only. No source text, prompts, completion text, filenames, or repository names are stored."
    ].join("\n");
  }

  private persist(): void {
    if (this.saveTimer !== undefined) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.state.update(STORAGE_KEY, this.snapshot());
    }, 1000);
  }

  public dispose(): void {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    void this.state.update(STORAGE_KEY, this.snapshot());
  }
}
