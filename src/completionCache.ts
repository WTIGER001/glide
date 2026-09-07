import { createHash } from "node:crypto";

export interface CacheIdentity {
  readonly endpoint: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly language: string;
  readonly filename: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly maxCompletionTokens: number;
  readonly reasoningEffort: string;
}

export interface ContinuationIdentity extends CacheIdentity {
  readonly uri: string;
}

interface ContinuationEntry {
  readonly identity: ContinuationIdentity;
  readonly completion: string;
}

export function digestCacheIdentity(identity: CacheIdentity): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        identity.endpoint,
        identity.model,
        identity.promptVersion,
        identity.language,
        identity.filename,
        identity.prefix,
        identity.suffix,
        identity.maxCompletionTokens,
        identity.reasoningEffort
      ])
    )
    .digest("hex");
}

export class CompletionCache {
  private readonly values = new Map<string, string>();
  private continuation: ContinuationEntry | undefined;

  public constructor(private capacity: number) {
    this.setCapacity(capacity);
  }

  public setCapacity(capacity: number): void {
    this.capacity = Math.max(1, Math.floor(capacity));
    while (this.values.size > this.capacity) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.values.delete(oldest);
    }
  }

  public get(key: string): string | undefined {
    const value = this.values.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  public set(key: string, value: string): void {
    this.values.delete(key);
    this.values.set(key, value);
    this.setCapacity(this.capacity);
  }

  public rememberContinuation(identity: ContinuationIdentity, completion: string): void {
    this.continuation = { identity, completion };
  }

  public getContinuation(next: ContinuationIdentity): string | undefined {
    const previous = this.continuation;
    if (previous === undefined) {
      return undefined;
    }
    const prior = previous.identity;
    if (
      prior.uri !== next.uri ||
      prior.endpoint !== next.endpoint ||
      prior.model !== next.model ||
      prior.promptVersion !== next.promptVersion ||
      prior.language !== next.language ||
      prior.filename !== next.filename ||
      prior.suffix !== next.suffix ||
      prior.maxCompletionTokens !== next.maxCompletionTokens ||
      prior.reasoningEffort !== next.reasoningEffort ||
      next.prefix.length < prior.prefix.length ||
      !next.prefix.startsWith(prior.prefix)
    ) {
      return undefined;
    }
    const typed = next.prefix.slice(prior.prefix.length);
    if (typed === "" || !previous.completion.startsWith(typed)) {
      return undefined;
    }
    const remaining = previous.completion.slice(typed.length);
    return remaining === "" ? undefined : remaining;
  }

  public clear(): void {
    this.values.clear();
    this.continuation = undefined;
  }

  public get size(): number {
    return this.values.size;
  }
}
