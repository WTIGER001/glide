import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { CompletionCache } from "./completionCache";
import { CompletionCoordinator, type CompletionCoordinatorDependencies } from "./completionCoordinator";
import type { OpenAIResponsesClient, ResponsesCompletionResult } from "./openaiResponsesClient";
import { setMockConfiguration, window as mockWindow } from "./test/vscodeMock";

interface MutableDocument {
  version: number;
  readonly uri: { scheme: string; fsPath: string; toString(): string };
  readonly fileName: string;
  readonly languageId: string;
  getText(range?: vscode.Range): string;
  offsetAt(position: vscode.Position): number;
  positionAt(offset: number): vscode.Position;
  lineAt(line: number): { text: string };
}

function documentOf(text: string): MutableDocument {
  const uri = { scheme: "file", fsPath: "/work/main.go", toString: () => "file:///work/main.go" };
  return {
    version: 1,
    uri,
    fileName: "/work/main.go",
    languageId: "go",
    getText: (range?: vscode.Range) =>
      range === undefined ? text : text.slice(range.start.character, range.end.character),
    offsetAt: (position) => position.character,
    positionAt: (offset) => new vscode.Position(0, Math.max(0, Math.min(text.length, offset))),
    lineAt: () => ({ text })
  };
}

function token(): vscode.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => new vscode.Disposable(() => undefined)
  };
}

function result(text: string): ResponsesCompletionResult {
  return { status: "completed", text, usage: {}, earlyStopped: false };
}

function dependencies(complete: OpenAIResponsesClient["complete"]): CompletionCoordinatorDependencies {
  return {
    secrets: { hasApiKey: () => true, getApiKey: () => "test-key" } as CompletionCoordinatorDependencies["secrets"],
    cache: new CompletionCache(64),
    statistics: {
      inFlightDeduplicated: vi.fn(),
      cacheHit: vi.fn(),
      requestStarted: vi.fn(),
      requestCompleted: vi.fn(),
      requestFailed: vi.fn(),
      requestCancelled: vi.fn(),
      suggestionDisplayed: vi.fn()
    } as unknown as CompletionCoordinatorDependencies["statistics"],
    logger: { event: vi.fn() } as unknown as CompletionCoordinatorDependencies["logger"],
    client: { complete } as OpenAIResponsesClient,
    setRequesting: vi.fn(),
    onAuthenticationError: vi.fn(),
    onTransportError: vi.fn(),
    onTransportSuccess: vi.fn()
  };
}

function activateEditor(document: MutableDocument, position: vscode.Position): void {
  mockWindow.activeTextEditor = {
    document,
    selection: { isEmpty: true, active: position },
    options: { insertSpaces: false, tabSize: 4 }
  };
}

describe("CompletionCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setMockConfiguration({ debounceMs: 75 });
  });

  it("deduplicates identical provider invocations and displays one processed item", async () => {
    const complete = vi.fn(() => Promise.resolve(result("in()")));
    const deps = dependencies(complete);
    const coordinator = new CompletionCoordinator(deps);
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);

    const first = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    const duplicate = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    await vi.advanceTimersByTimeAsync(75);

    expect(await first).toEqual(await duplicate);
    expect(complete).toHaveBeenCalledTimes(1);
    const statisticsSpies = deps.statistics as unknown as { inFlightDeduplicated: ReturnType<typeof vi.fn> };
    expect(statisticsSpies.inFlightDeduplicated).toHaveBeenCalledTimes(1);
    expect((await first)?.[0]?.insertText).toBe("in()");
  });

  it("aborts and discards a response after the document becomes stale", async () => {
    let resolveRequest: ((value: ResponsesCompletionResult) => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    const complete = vi.fn((_request, signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<ResponsesCompletionResult>((resolve) => {
        resolveRequest = resolve;
      });
    });
    const coordinator = new CompletionCoordinator(dependencies(complete));
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);
    const pending = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    await vi.advanceTimersByTimeAsync(75);
    expect(complete).toHaveBeenCalledTimes(1);

    document.version += 1;
    coordinator.cancel("document-change");
    expect(requestSignal?.aborted).toBe(true);
    resolveRequest?.(result("in()"));
    expect(await pending).toBeUndefined();
  });
});
