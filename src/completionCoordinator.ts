import * as vscode from "vscode";
import { readConfiguration, type GlideConfiguration } from "./configuration";
import { buildCompletionContext, type CompletionContext } from "./contextBuilder";
import { ACCEPTANCE_COMMAND, PROMPT_VERSION } from "./constants";
import { digestCacheIdentity } from "./completionCache";
import type {
  CompletionCache,
  CacheIdentity,
  ContinuationIdentity
} from "./completionCache";
import { checkEligibility } from "./eligibility";
import type { DiagnosticLogger } from "./logger";
import { ResponsesApiError } from "./openaiResponsesClient";
import type { OpenAIResponsesClient } from "./openaiResponsesClient";
import { processCompletion } from "./outputProcessor";
import { buildCompletionInput, COMPLETION_INSTRUCTIONS } from "./promptBuilder";
import type { SecretStore } from "./secretStore";
import type { LocalStatistics } from "./statistics";

type CompletionItems = vscode.InlineCompletionItem[] | undefined;

interface Anchor {
  readonly uri: string;
  readonly version: number;
  readonly line: number;
  readonly character: number;
}

interface ActiveOperation {
  readonly generation: number;
  readonly anchor: Anchor;
  readonly subscribers: Map<symbol, vscode.Disposable>;
  cancelled: boolean;
  promise: Promise<CompletionItems>;
  timer: ReturnType<typeof setTimeout> | undefined;
  resolveDelay: ((active: boolean) => void) | undefined;
  requestController: AbortController | undefined;
}

export interface CompletionCoordinatorDependencies {
  readonly secrets: SecretStore;
  readonly cache: CompletionCache;
  readonly statistics: LocalStatistics;
  readonly logger: DiagnosticLogger;
  readonly client: OpenAIResponsesClient;
  readonly setRequesting: (requesting: boolean) => void;
  readonly onAuthenticationError: () => void;
  readonly onTransportError: () => void;
  readonly onTransportSuccess: () => void;
}

export class CompletionCoordinator implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private generation = 0;
  private active: ActiveOperation | undefined;
  private cooldownUntil = 0;
  private transientFailures = 0;

  public constructor(private readonly dependencies: CompletionCoordinatorDependencies) {}

  public provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<CompletionItems> {
    if (token.isCancellationRequested) {
      this.cancel("editor");
      return Promise.resolve(undefined);
    }
    const anchor: Anchor = {
      uri: document.uri.toString(),
      version: document.version,
      line: position.line,
      character: position.character
    };
    if (this.active !== undefined && sameAnchor(this.active.anchor, anchor) && !this.active.cancelled) {
      this.subscribe(this.active, token);
      this.dependencies.statistics.inFlightDeduplicated();
      return this.active.promise;
    }

    this.cancel("superseded");
    const operation: ActiveOperation = {
      generation: ++this.generation,
      anchor,
      subscribers: new Map(),
      cancelled: false,
      promise: Promise.resolve(undefined),
      timer: undefined,
      resolveDelay: undefined,
      requestController: undefined
    };
    this.active = operation;
    this.subscribe(operation, token);
    operation.promise = this.run(operation, document, position).finally(() => {
      for (const disposable of operation.subscribers.values()) {
        disposable.dispose();
      }
      operation.subscribers.clear();
      if (this.active === operation) {
        this.active = undefined;
      }
    });
    return operation.promise;
  }

  public cancel(reason = "cancelled"): void {
    const operation = this.active;
    if (operation === undefined || operation.cancelled) {
      return;
    }
    operation.cancelled = true;
    this.generation += 1;
    if (operation.timer !== undefined) {
      clearTimeout(operation.timer);
      operation.timer = undefined;
    }
    operation.resolveDelay?.(false);
    operation.resolveDelay = undefined;
    operation.requestController?.abort(reason);
    this.dependencies.logger.event("completion.cancelled", { reason });
  }

  public dispose(): void {
    this.cancel("deactivate");
  }

  private subscribe(operation: ActiveOperation, token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) {
      return;
    }
    const id = Symbol("subscriber");
    const disposable = token.onCancellationRequested(() => {
      operation.subscribers.get(id)?.dispose();
      operation.subscribers.delete(id);
      if (operation.subscribers.size === 0 && this.active === operation) {
        this.cancel("editor");
      }
    });
    operation.subscribers.set(id, disposable);
  }

  private async run(
    operation: ActiveOperation,
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<CompletionItems> {
    const initialConfiguration = readConfiguration(document.uri);
    const initialReason = this.eligibilityReason(document, position, initialConfiguration);
    if (initialReason !== undefined) {
      this.dependencies.logger.event("completion.suppressed", { reason: initialReason });
      return undefined;
    }
    if (!(await this.delay(operation, initialConfiguration.debounceMs)) || !this.isCurrent(operation, document)) {
      return undefined;
    }

    const configuration = readConfiguration(document.uri);
    const reason = this.eligibilityReason(document, position, configuration);
    if (reason !== undefined || !this.isCurrent(operation, document)) {
      return undefined;
    }
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined || editor.document.uri.toString() !== operation.anchor.uri) {
      return undefined;
    }
    const completionContext = buildCompletionContext(document, position, editor.options, configuration);
    const identity = this.cacheIdentity(completionContext, configuration);
    const continuationIdentity: ContinuationIdentity = { ...identity, uri: completionContext.uri };
    const key = digestCacheIdentity(identity);
    const exact = this.dependencies.cache.get(key);
    if (exact !== undefined) {
      this.dependencies.statistics.cacheHit();
      return this.itemIfCurrent(operation, document, position, completionContext, exact);
    }
    const continuation = this.dependencies.cache.getContinuation(continuationIdentity);
    if (continuation !== undefined) {
      this.dependencies.statistics.cacheHit(true);
      return this.itemIfCurrent(operation, document, position, completionContext, continuation);
    }
    if (Date.now() < this.cooldownUntil) {
      return undefined;
    }

    const apiKey = this.dependencies.secrets.getApiKey();
    if (apiKey === undefined || configuration.endpoint === undefined) {
      return undefined;
    }
    const controller = new AbortController();
    operation.requestController = controller;
    this.dependencies.setRequesting(true);
    this.dependencies.statistics.requestStarted(configuration.model, completionContext.language);
    const startedAt = performance.now();
    try {
      const result = await this.dependencies.client.complete(
        {
          endpoint: configuration.endpoint,
          apiKey,
          authentication: configuration.authentication,
          model: configuration.model,
          instructions: COMPLETION_INSTRUCTIONS,
          input: buildCompletionInput(completionContext),
          reasoningEffort: configuration.reasoningEffort,
          maxOutputTokens: configuration.maxCompletionTokens,
          timeoutMs: configuration.requestTimeoutMs,
          suffix: completionContext.suffix
        },
        controller.signal
      );
      if (!this.isCurrent(operation, document)) {
        this.dependencies.statistics.requestCancelled();
        return undefined;
      }
      if (result.status !== "completed") {
        this.dependencies.statistics.requestFailed();
        return undefined;
      }
      this.transientFailures = 0;
      this.dependencies.onTransportSuccess();
      this.dependencies.statistics.requestCompleted(performance.now() - startedAt);
      const completion = processCompletion(result.text, completionContext, {
        maxCompletionTokens: configuration.maxCompletionTokens
      });
      if (completion === undefined || !this.isCurrent(operation, document)) {
        return undefined;
      }
      this.dependencies.cache.set(key, completion);
      this.dependencies.cache.rememberContinuation(continuationIdentity, completion);
      this.dependencies.logger.event("completion.ready", {
        generation: operation.generation,
        language: completionContext.language,
        model: configuration.model,
        latencyMs: Math.round(performance.now() - startedAt),
        earlyStopped: result.earlyStopped,
        outputCharacters: completion.length,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        firstTokenMs: result.timeToFirstTokenMs
      });
      return this.itemIfCurrent(operation, document, position, completionContext, completion);
    } catch (error) {
      this.handleError(error);
      return undefined;
    } finally {
      operation.requestController = undefined;
      this.dependencies.setRequesting(false);
    }
  }

  private eligibilityReason(
    document: vscode.TextDocument,
    position: vscode.Position,
    configuration: GlideConfiguration
  ): ReturnType<typeof checkEligibility> {
    const editor = vscode.window.activeTextEditor;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    return checkEligibility({
      document,
      position,
      selection: editor?.document.uri.toString() === document.uri.toString() ? editor.selection : undefined,
      workspaceTrusted: vscode.workspace.isTrusted,
      hasApiKey: this.dependencies.secrets.hasApiKey(),
      configuration,
      workspaceFolderPath: folder?.uri.fsPath
    });
  }

  private delay(operation: ActiveOperation, milliseconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (operation.cancelled) {
        resolve(false);
        return;
      }
      operation.resolveDelay = resolve;
      operation.timer = setTimeout(() => {
        operation.timer = undefined;
        operation.resolveDelay = undefined;
        resolve(!operation.cancelled);
      }, milliseconds);
    });
  }

  private isCurrent(operation: ActiveOperation, document: vscode.TextDocument): boolean {
    if (
      operation.cancelled ||
      this.active !== operation ||
      operation.generation !== this.generation ||
      document.version !== operation.anchor.version ||
      document.uri.toString() !== operation.anchor.uri
    ) {
      return false;
    }
    const editor = vscode.window.activeTextEditor;
    return (
      editor !== undefined &&
      editor.document.uri.toString() === operation.anchor.uri &&
      editor.selection.active.line === operation.anchor.line &&
      editor.selection.active.character === operation.anchor.character
    );
  }

  private cacheIdentity(context: CompletionContext, configuration: GlideConfiguration): CacheIdentity {
    if (configuration.endpoint === undefined) {
      throw new Error("Cannot cache a completion without a valid endpoint.");
    }
    return {
      endpoint: configuration.endpoint,
      model: configuration.model,
      promptVersion: PROMPT_VERSION,
      language: context.language,
      filename: context.filename,
      prefix: context.prefix,
      suffix: context.suffix,
      maxCompletionTokens: configuration.maxCompletionTokens,
      reasoningEffort: configuration.reasoningEffort
    };
  }

  private itemIfCurrent(
    operation: ActiveOperation,
    document: vscode.TextDocument,
    position: vscode.Position,
    context: CompletionContext,
    completion: string
  ): CompletionItems {
    if (!this.isCurrent(operation, document)) {
      return undefined;
    }
    const item = new vscode.InlineCompletionItem(completion, new vscode.Range(position, position), {
      title: "Record Glide completion acceptance",
      command: ACCEPTANCE_COMMAND,
      arguments: [completion.length, context.language]
    });
    this.dependencies.statistics.suggestionDisplayed(completion.length);
    return [item];
  }

  private handleError(error: unknown): void {
    if (error instanceof ResponsesApiError) {
      if (error.timedOut) {
        this.dependencies.statistics.requestCancelled(true);
        this.dependencies.logger.event("completion.timeout");
        return;
      }
      if (error.message.includes("cancelled")) {
        this.dependencies.statistics.requestCancelled();
        return;
      }
      this.dependencies.statistics.requestFailed();
      if (error.statusCode === 401 || error.statusCode === 403) {
        this.dependencies.onAuthenticationError();
      } else if (error.statusCode === 429) {
        this.cooldownUntil = Date.now() + 2000;
      } else if (error.statusCode !== undefined && error.statusCode >= 500) {
        this.transientFailures += 1;
        this.cooldownUntil = Date.now() + Math.min(8000, 500 * 2 ** this.transientFailures);
      }
      this.dependencies.logger.event("completion.failed", { status: error.statusCode, category: "responses-api" });
      this.dependencies.onTransportError();
      return;
    }
    this.dependencies.statistics.requestFailed();
    this.dependencies.logger.event("completion.failed", { category: "unexpected" });
    this.dependencies.onTransportError();
  }
}

function sameAnchor(left: Anchor, right: Anchor): boolean {
  return (
    left.uri === right.uri &&
    left.version === right.version &&
    left.line === right.line &&
    left.character === right.character
  );
}
