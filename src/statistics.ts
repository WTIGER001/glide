import type * as vscode from "vscode";

const STORAGE_KEY = "glide.localStatistics.v3";
const PREVIOUS_STORAGE_KEY = "glide.localStatistics.v2";
const LATENCY_LIMITS_MS = [50, 100, 250, 500, 1000, 2000, 5000] as const;
const MAX_PENDING_ACCEPTANCES = 256;

export interface LatencyHistogram {
  readonly limitsMs: readonly number[];
  readonly buckets: readonly number[];
}

export interface StatisticsSnapshot {
  readonly schemaVersion: 3;
  readonly completionOpportunities: number;
  readonly automaticOpportunities: number;
  readonly explicitOpportunities: number;
  readonly activeEditingMs: number;
  readonly requestsStarted: number;
  readonly requestsCompleted: number;
  readonly requestsFailed: number;
  readonly requestsCancelled: number;
  readonly requestsTimedOut: number;
  readonly cacheHits: number;
  readonly continuationHits: number;
  readonly inFlightDeduplications: number;
  readonly suggestionsReturned: number;
  readonly suggestionsAccepted: number;
  readonly charactersReturned: number;
  readonly charactersAccepted: number;
  readonly outputRejections: Readonly<Record<string, number>>;
  readonly providerLatency: LatencyHistogram;
  readonly lastEditToReturnLatency: LatencyHistogram;
  readonly firstTextLatency: LatencyHistogram;
  readonly processingLatency: LatencyHistogram;
  readonly cancellationLatency: LatencyHistogram;
  readonly byLanguage: Readonly<Record<string, number>>;
  readonly byModel: Readonly<Record<string, number>>;
}

interface MutableHistogram {
  limitsMs: number[];
  buckets: number[];
}

interface MutableStatistics {
  schemaVersion: 3;
  completionOpportunities: number;
  automaticOpportunities: number;
  explicitOpportunities: number;
  activeEditingMs: number;
  requestsStarted: number;
  requestsCompleted: number;
  requestsFailed: number;
  requestsCancelled: number;
  requestsTimedOut: number;
  cacheHits: number;
  continuationHits: number;
  inFlightDeduplications: number;
  suggestionsReturned: number;
  suggestionsAccepted: number;
  charactersReturned: number;
  charactersAccepted: number;
  outputRejections: Record<string, number>;
  providerLatency: MutableHistogram;
  lastEditToReturnLatency: MutableHistogram;
  firstTextLatency: MutableHistogram;
  processingLatency: MutableHistogram;
  cancellationLatency: MutableHistogram;
  byLanguage: Record<string, number>;
  byModel: Record<string, number>;
}

function emptyHistogram(): MutableHistogram {
  return { limitsMs: [...LATENCY_LIMITS_MS], buckets: Array.from({ length: LATENCY_LIMITS_MS.length + 1 }, () => 0) };
}

function emptyStatistics(): MutableStatistics {
  return {
    schemaVersion: 3,
    completionOpportunities: 0,
    automaticOpportunities: 0,
    explicitOpportunities: 0,
    activeEditingMs: 0,
    requestsStarted: 0,
    requestsCompleted: 0,
    requestsFailed: 0,
    requestsCancelled: 0,
    requestsTimedOut: 0,
    cacheHits: 0,
    continuationHits: 0,
    inFlightDeduplications: 0,
    suggestionsReturned: 0,
    suggestionsAccepted: 0,
    charactersReturned: 0,
    charactersAccepted: 0,
    outputRejections: {},
    providerLatency: emptyHistogram(),
    lastEditToReturnLatency: emptyHistogram(),
    firstTextLatency: emptyHistogram(),
    processingLatency: emptyHistogram(),
    cancellationLatency: emptyHistogram(),
    byLanguage: {},
    byModel: {}
  };
}

function isFiniteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function loadStatistics(value: unknown): MutableStatistics {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value) || ![2, 3].includes(Number(value.schemaVersion))) {
    return emptyStatistics();
  }
  const stored = value as Partial<MutableStatistics>;
  const result = emptyStatistics();
  for (const key of [
    "completionOpportunities",
    "automaticOpportunities",
    "explicitOpportunities",
    "activeEditingMs",
    "requestsStarted",
    "requestsCompleted",
    "requestsFailed",
    "requestsCancelled",
    "requestsTimedOut",
    "cacheHits",
    "continuationHits",
    "inFlightDeduplications",
    "suggestionsReturned",
    "suggestionsAccepted",
    "charactersReturned",
    "charactersAccepted"
  ] as const) {
    if (isFiniteCount(stored[key])) {
      result[key] = Math.floor(stored[key]);
    }
  }
  for (const key of ["outputRejections", "byLanguage", "byModel"] as const) {
    const record = stored[key];
    if (typeof record === "object" && record !== null && !Array.isArray(record)) {
      result[key] = Object.fromEntries(
        Object.entries(record).filter((entry): entry is [string, number] => isFiniteCount(entry[1]))
      );
    }
  }
  for (const key of [
    "providerLatency",
    "lastEditToReturnLatency",
    "firstTextLatency",
    "processingLatency",
    "cancellationLatency"
  ] as const) {
    const histogram = stored[key];
    if (
      histogram !== undefined &&
      Array.isArray(histogram.buckets) &&
      histogram.buckets.length === LATENCY_LIMITS_MS.length + 1 &&
      histogram.buckets.every(isFiniteCount)
    ) {
      result[key].buckets = histogram.buckets.map(Math.floor);
    }
  }
  return result;
}

function observe(histogram: MutableHistogram, milliseconds: number | undefined): void {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return;
  }
  const bucket = histogram.limitsMs.findIndex((limit) => milliseconds <= limit);
  const index = bucket < 0 ? histogram.buckets.length - 1 : bucket;
  histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1;
}

function percentile(histogram: LatencyHistogram, quantile: number): string {
  const total = histogram.buckets.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return "n/a";
  }
  const target = Math.ceil(total * quantile);
  let cumulative = 0;
  for (let index = 0; index < histogram.buckets.length; index += 1) {
    cumulative += histogram.buckets[index] ?? 0;
    if (cumulative >= target) {
      const limit = histogram.limitsMs[index];
      return limit === undefined ? `>${histogram.limitsMs.at(-1) ?? 0} ms` : `≤${limit} ms`;
    }
  }
  return "n/a";
}

export class LocalStatistics implements vscode.Disposable {
  private data: MutableStatistics;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pendingAcceptances = new Map<string, number>();
  private lastActivityAt: number | undefined;

  public constructor(private readonly state: vscode.Memento, private readonly now: () => number = Date.now) {
    this.data = loadStatistics(state.get<unknown>(STORAGE_KEY) ?? state.get<unknown>(PREVIOUS_STORAGE_KEY));
  }

  public opportunity(explicit = false): void {
    const at = this.now();
    if (this.lastActivityAt !== undefined) {
      const elapsed = at - this.lastActivityAt;
      if (elapsed >= 0 && elapsed <= 120_000) this.data.activeEditingMs += elapsed;
    }
    this.lastActivityAt = at;
    this.data.completionOpportunities += 1;
    if (explicit) this.data.explicitOpportunities += 1;
    else this.data.automaticOpportunities += 1;
    this.persist();
  }

  public requestStarted(model: string, language: string): void {
    this.data.requestsStarted += 1;
    this.data.byModel[model] = (this.data.byModel[model] ?? 0) + 1;
    this.data.byLanguage[language] = (this.data.byLanguage[language] ?? 0) + 1;
    this.persist();
  }

  public requestCompleted(providerLatencyMs: number, firstTextMs?: number): void {
    this.data.requestsCompleted += 1;
    observe(this.data.providerLatency, providerLatencyMs);
    observe(this.data.firstTextLatency, firstTextMs);
    this.persist();
  }

  public requestFailed(): void {
    this.data.requestsFailed += 1;
    this.persist();
  }

  public requestCancelled(timedOut = false, latencyMs?: number): void {
    this.data.requestsCancelled += 1;
    if (timedOut) {
      this.data.requestsTimedOut += 1;
    }
    observe(this.data.cancellationLatency, latencyMs);
    this.persist();
  }

  public outputRejected(reason: string): void {
    this.data.outputRejections[reason] = (this.data.outputRejections[reason] ?? 0) + 1;
    this.persist();
  }

  public processingCompleted(milliseconds: number): void {
    observe(this.data.processingLatency, milliseconds);
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

  public suggestionReturned(id: string, characters: number, lastEditToReturnMs: number): void {
    const safeCharacters = Math.max(0, Math.floor(characters));
    this.data.suggestionsReturned += 1;
    this.data.charactersReturned += safeCharacters;
    observe(this.data.lastEditToReturnLatency, lastEditToReturnMs);
    this.pendingAcceptances.set(id, safeCharacters);
    while (this.pendingAcceptances.size > MAX_PENDING_ACCEPTANCES) {
      const oldest = this.pendingAcceptances.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.pendingAcceptances.delete(oldest);
    }
    this.persist();
  }

  public suggestionAccepted(id: string, characters?: number): boolean {
    const returnedCharacters = this.pendingAcceptances.get(id);
    if (returnedCharacters === undefined) {
      return false;
    }
    this.pendingAcceptances.delete(id);
    this.data.suggestionsAccepted += 1;
    this.data.charactersAccepted += Math.min(returnedCharacters, Math.max(0, Math.floor(characters ?? returnedCharacters)));
    this.persist();
    return true;
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
    this.pendingAcceptances.clear();
    await this.state.update(STORAGE_KEY, this.data);
  }

  public format(): string {
    const data = this.snapshot();
    const rejectionSummary =
      Object.entries(data.outputRejections)
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ") || "none";
    return [
      "Glide local statistics",
      "",
      `Opportunities: ${data.completionOpportunities}`,
      `Triggers: ${data.automaticOpportunities} automatic, ${data.explicitOpportunities} explicit`,
      `Provider requests: ${data.requestsStarted} started, ${data.requestsCompleted} completed, ${data.requestsFailed} failed`,
      `Cancelled: ${data.requestsCancelled} (${data.requestsTimedOut} timed out)`,
      `Cache: ${data.cacheHits} exact hits, ${data.continuationHits} continuation hits, ${data.inFlightDeduplications} in-flight deduplications`,
      `Suggestions: ${data.suggestionsReturned} returned by the provider, ${data.suggestionsAccepted} observed acceptances`,
      `Characters: ${data.charactersReturned} returned, ${data.charactersAccepted} accepted`,
      `Accepted characters per active minute: ${data.activeEditingMs > 0 ? (data.charactersAccepted / (data.activeEditingMs / 60_000)).toFixed(1) : "n/a"}`,
      `Output rejections: ${rejectionSummary}`,
      `Provider latency: p50 ${percentile(data.providerLatency, 0.5)}, p95 ${percentile(data.providerLatency, 0.95)}`,
      `Last edit to return: p50 ${percentile(data.lastEditToReturnLatency, 0.5)}, p95 ${percentile(data.lastEditToReturnLatency, 0.95)}`,
      `First text: p50 ${percentile(data.firstTextLatency, 0.5)}, p95 ${percentile(data.firstTextLatency, 0.95)}`,
      "",
      "Returned means the inline provider produced an item; VS Code does not expose a reliable displayed event. Statistics contain aggregate counts and buckets only. No source text, prompts, completion text, filenames, repository names, or durable source hashes are stored."
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
