import type { CompletionContext } from "../contextBuilder";

export type Language = "go" | "typescript" | "python" | "yaml" | "json";
export type Split = "development" | "holdout";

/** Evaluator-only data. Never serialize a Family or CompletionCase into a prompt. */
export interface Family {
  readonly id: string;
  readonly language: Language;
  readonly split: Split;
  readonly category: string;
  /** One ⟦answer⟧ span. The span markers are never model input. */
  readonly template: string;
  /** Second cursor state consumes this many UTF-16 units of the authored answer. */
  readonly typed: number;
  readonly alternatives?: readonly string[];
  /** Evaluator-only assertions; for YAML/JSON, a JSON-encoded expected parsed value. */
  readonly checks: string;
  readonly abstain?: string;
  /** Whether visible context constrains behavior, or the case is primarily a reconstruction stress test. */
  readonly evaluation?: "contract" | "reconstruction" | "abstention";
}

export interface CompletionCase {
  readonly id: string;
  readonly family: string;
  readonly split: Split;
  readonly category: string;
  readonly mode: "short" | "block" | "abstain";
  readonly origin: "removed-span" | "typing-continuation";
  readonly context: CompletionContext;
  readonly expected: string | null;
  readonly alternatives: readonly string[];
  readonly abstentionReason: string | null;
  readonly evaluation: "contract" | "reconstruction" | "abstention";
  readonly properties: readonly string[];
  readonly provenance: { readonly kind: "original-synthetic"; readonly license: "MIT"; readonly source: string };
}

export interface Processor {
  processCompletion(raw: string, context: CompletionContext, policy: { maxCompletionTokens: number }): string | undefined;
  shouldStopStream(text: string, suffix: string, maxCompletionTokens: number): boolean;
}

export interface Capture {
  readonly caseId: string;
  readonly repetition: number;
  readonly status: "completed" | "incomplete" | "failed" | "cancelled" | "error";
  /** Text observed by the production client; may be truncated by its early stop. */
  readonly raw: string;
  readonly earlyStopped: boolean;
  readonly elapsedMs: number | null;
  readonly firstTextMs: number | null;
  readonly error: string | null;
  readonly usage: { readonly inputTokens?: number; readonly cachedInputTokens?: number; readonly cacheWriteInputTokens?: number; readonly outputTokens?: number; readonly reasoningOutputTokens?: number; readonly totalTokens?: number };
}
