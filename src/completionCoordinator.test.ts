import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { CompletionCache } from "./completionCache";
import { CompletionCoordinator, type CompletionCoordinatorDependencies } from "./completionCoordinator";
import { ResponsesApiError, type OpenAIResponsesClient, type ResponsesCompletionResult } from "./openaiResponsesClient";
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

function cancellableToken(): { token: vscode.CancellationToken; cancel(): void } {
  let cancelled = false;
  const callbacks = new Set<() => void>();
  const cancellationToken = {
    get isCancellationRequested() {
      return cancelled;
    },
    onCancellationRequested: (callback: () => void) => {
      callbacks.add(callback);
      return new vscode.Disposable(() => callbacks.delete(callback));
    }
  } as unknown as vscode.CancellationToken;
  return {
    token: cancellationToken,
    cancel: () => {
      cancelled = true;
      for (const callback of [...callbacks]) {
        callback();
      }
    }
  };
}

function result(text: string): ResponsesCompletionResult {
  return { status: "completed", text, usage: {}, earlyStopped: false };
}

function dependencies(complete: OpenAIResponsesClient["complete"]): CompletionCoordinatorDependencies {
  return {
    secrets: { hasApiKey: () => true, getApiKey: () => "test-key", isCredentialFile: () => Promise.resolve(false) } as unknown as CompletionCoordinatorDependencies["secrets"],
    cache: new CompletionCache(64),
    statistics: {
      opportunity: vi.fn(),
      inFlightDeduplicated: vi.fn(),
      cacheHit: vi.fn(),
      requestStarted: vi.fn(),
      requestCompleted: vi.fn(),
      requestFailed: vi.fn(),
      requestCancelled: vi.fn(),
      outputRejected: vi.fn(),
      processingCompleted: vi.fn(),
      suggestionReturned: vi.fn()
    } as unknown as CompletionCoordinatorDependencies["statistics"],
    logger: { event: vi.fn(), importantError: vi.fn() } as unknown as CompletionCoordinatorDependencies["logger"],
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

  it("bypasses automatic debounce and completed-closer suppression for explicit invocation", async () => {
    const complete = vi.fn(() => Promise.resolve(result("\nnext()")));
    const coordinator = new CompletionCoordinator(dependencies(complete));
    const document = documentOf("call()");
    const position = new vscode.Position(0, 6);
    activateEditor(document, position);

    const automatic = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument, position,
      { triggerKind: 0, selectedCompletionInfo: undefined }, token()
    );
    expect(await automatic).toBeUndefined();
    const explicit = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument, position,
      { triggerKind: 1, selectedCompletionInfo: undefined }, token()
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(complete).toHaveBeenCalledTimes(1);
    expect((await explicit)?.[0]?.insertText).toBe("\nnext()");
  });

  it("adds bounded same-file context only when enabled", async () => {
    setMockConfiguration({ debounceMs: 75, sameFileContext: true });
    const complete = vi.fn(() => Promise.resolve(result("in()")));
    const deps = dependencies(complete);
    const collect = vi.fn(() => Promise.resolve("func helper() int"));
    const coordinator = new CompletionCoordinator({ ...deps, sameFileContextProvider: { collect } });
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);
    const pending = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument, position,
      { triggerKind: 0, selectedCompletionInfo: undefined }, token()
    );
    await vi.advanceTimersByTimeAsync(75);
    expect((await pending)?.[0]?.insertText).toBe("in()");
    expect(collect).toHaveBeenCalledTimes(1);
    const request = (complete.mock.calls as unknown as Array<Array<{ input: string }>>)[0]?.[0];
    expect(request?.input).toContain("<GLIDE_RELATED_SAME_FILE>\nfunc helper() int");
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

  it("returns an exact cache hit without waiting for debounce", async () => {
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
    await vi.advanceTimersByTimeAsync(75);
    expect((await first)?.[0]?.insertText).toBe("in()");

    const cached = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    expect((await cached)?.[0]?.insertText).toBe("in()");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("ignores changes to unrelated documents", async () => {
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

    coordinator.cancelDocument({ toString: () => "file:///work/other.go" } as vscode.Uri);
    expect(requestSignal?.aborted).toBe(false);
    resolveRequest?.(result("in()"));
    expect((await pending)?.[0]?.insertText).toBe("in()");
  });

  it("keeps shared work alive until every subscriber cancels", async () => {
    const complete = vi.fn(() => Promise.resolve(result("in()")));
    const coordinator = new CompletionCoordinator(dependencies(complete));
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);
    const firstToken = cancellableToken();
    const secondToken = cancellableToken();

    const first = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      firstToken.token
    );
    const second = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      secondToken.token
    );
    firstToken.cancel();
    await vi.advanceTimersByTimeAsync(75);

    expect(complete).toHaveBeenCalledTimes(1);
    expect((await first)?.[0]?.insertText).toBe("in()");
    expect((await second)?.[0]?.insertText).toBe("in()");
  });

  it("cancels shared work when every subscriber cancels", async () => {
    const complete = vi.fn(() => Promise.resolve(result("in()")));
    const coordinator = new CompletionCoordinator(dependencies(complete));
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);
    const firstToken = cancellableToken();
    const secondToken = cancellableToken();
    const first = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      firstToken.token
    );
    const second = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      secondToken.token
    );
    firstToken.cancel();
    secondToken.cancel();
    await vi.advanceTimersByTimeAsync(75);

    expect(complete).not.toHaveBeenCalled();
    expect(await first).toBeUndefined();
    expect(await second).toBeUndefined();
  });

  it("does not let an old operation clear the requesting state of newer work", async () => {
    const calls: Array<{
      signal: AbortSignal;
      resolve(value: ResponsesCompletionResult): void;
      reject(error: unknown): void;
    }> = [];
    const complete = vi.fn((_request, signal: AbortSignal) =>
      new Promise<ResponsesCompletionResult>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
        signal.addEventListener("abort", () => reject(new ResponsesApiError("Responses request cancelled.")), {
          once: true
        });
      })
    );
    const deps = dependencies(complete);
    const coordinator = new CompletionCoordinator(deps);
    const firstDocument = documentOf("func ma");
    const firstPosition = new vscode.Position(0, 7);
    activateEditor(firstDocument, firstPosition);
    const first = coordinator.provideInlineCompletionItems(
      firstDocument as unknown as vscode.TextDocument,
      firstPosition,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    await vi.advanceTimersByTimeAsync(75);
    expect(calls).toHaveLength(1);

    const secondDocument = documentOf("func mai");
    secondDocument.version = 2;
    const secondPosition = new vscode.Position(0, 8);
    activateEditor(secondDocument, secondPosition);
    const second = coordinator.provideInlineCompletionItems(
      secondDocument as unknown as vscode.TextDocument,
      secondPosition,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    await vi.advanceTimersByTimeAsync(75);
    expect(calls).toHaveLength(2);

    const setRequesting = deps.setRequesting as ReturnType<typeof vi.fn>;
    expect(setRequesting.mock.calls).toEqual([[true], [false], [true]]);
    calls[1]?.resolve(result("n()"));
    await second;
    expect(setRequesting.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(await first).toBeUndefined();
  });

  it("does not join an active request with an already-cancelled subscriber", async () => {
    const complete = vi.fn(() => Promise.resolve(result("in()")));
    const coordinator = new CompletionCoordinator(dependencies(complete));
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);
    const active = coordinator.provideInlineCompletionItems(
      document as unknown as vscode.TextDocument,
      position,
      { triggerKind: 0, selectedCompletionInfo: undefined },
      token()
    );
    const cancelled = cancellableToken();
    cancelled.cancel();
    expect(
      await coordinator.provideInlineCompletionItems(
        document as unknown as vscode.TextDocument,
        position,
        { triggerKind: 0, selectedCompletionInfo: undefined },
        cancelled.token
      )
    ).toBeUndefined();
    await vi.advanceTimersByTimeAsync(75);
    expect((await active)?.[0]?.insertText).toBe("in()");
  });

  it("aborts active work and clears cached results on disposal", async () => {
    let signal: AbortSignal | undefined;
    const complete = vi.fn(
      (_request, requestSignal: AbortSignal) =>
        new Promise<ResponsesCompletionResult>((_resolve, reject) => {
          signal = requestSignal;
          requestSignal.addEventListener(
            "abort",
            () => reject(new ResponsesApiError("Responses request cancelled.")),
            { once: true }
          );
        })
    );
    const deps = dependencies(complete);
    deps.cache.set("existing", "value");
    const coordinator = new CompletionCoordinator(deps);
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
    coordinator.dispose();
    expect(signal?.aborted).toBe(true);
    expect(deps.cache.size).toBe(0);
    expect(await pending).toBeUndefined();
  });

  it("blocks the configured credential target before reading context, even with sensitive-file opt-in", async () => {
    setMockConfiguration({ allowSensitiveFiles: true });
    const complete = vi.fn(() => Promise.resolve(result("in()")));
    const deps = dependencies(complete);
    deps.secrets.isCredentialFile = () => Promise.resolve(true);
    const coordinator = new CompletionCoordinator(deps);
    const document = documentOf("synthetic-credential");
    const readText = vi.spyOn(document, "getText");
    const position = new vscode.Position(0, 20);
    activateEditor(document, position);
    expect(await coordinator.provideInlineCompletionItems(document as unknown as vscode.TextDocument, position,
      { triggerKind: 1, selectedCompletionInfo: undefined }, token())).toBeUndefined();
    expect(readText).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("clears the spinner immediately when a pending request is replaced by a suppressed trigger", async () => {
    let finish: ((value: ResponsesCompletionResult) => void) | undefined;
    const deps = dependencies(() => new Promise((resolve) => { finish = resolve; }));
    const coordinator = new CompletionCoordinator(deps);
    const firstDocument = documentOf("func ma");
    const firstPosition = new vscode.Position(0, 7);
    activateEditor(firstDocument, firstPosition);
    const first = coordinator.provideInlineCompletionItems(firstDocument as unknown as vscode.TextDocument, firstPosition,
      { triggerKind: 0, selectedCompletionInfo: undefined }, token());
    await vi.advanceTimersByTimeAsync(75);
    expect(deps.setRequesting).toHaveBeenLastCalledWith(true);
    const secondDocument = documentOf("call()");
    const secondPosition = new vscode.Position(0, 6);
    activateEditor(secondDocument, secondPosition);
    const second = coordinator.provideInlineCompletionItems(secondDocument as unknown as vscode.TextDocument, secondPosition,
      { triggerKind: 0, selectedCompletionInfo: undefined }, token());
    expect(deps.setRequesting).toHaveBeenLastCalledWith(false);
    expect(await second).toBeUndefined();
    finish?.(result("in()"));
    expect(await first).toBeUndefined();
    expect(deps.setRequesting).toHaveBeenCalledTimes(2);
  });

  async function invoke(coordinator: CompletionCoordinator, text = "func ma", explicit = false) {
    const document = documentOf(text);
    const position = new vscode.Position(0, text.length);
    activateEditor(document, position);
    const pending = coordinator.provideInlineCompletionItems(document as unknown as vscode.TextDocument, position,
      { triggerKind: explicit ? 1 : 0, selectedCompletionInfo: undefined }, token());
    await vi.advanceTimersByTimeAsync(75);
    return pending;
  }

  it.each([401, 403])("pauses automatic requests after HTTP %s and resumes after a successful explicit retry", async (status) => {
    const complete = vi.fn<OpenAIResponsesClient["complete"]>()
      .mockRejectedValueOnce(new ResponsesApiError("Authentication failed.", status))
      .mockResolvedValue(result("in()"));
    const deps = dependencies(complete);
    const coordinator = new CompletionCoordinator(deps);
    expect(await invoke(coordinator)).toBeUndefined();
    expect(await invoke(coordinator)).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(deps.onAuthenticationError).toHaveBeenCalledTimes(1);
    expect(deps.setRequesting).toHaveBeenLastCalledWith(false);
    expect((await invoke(coordinator, "func ma", true))?.[0]?.insertText).toBe("in()");
    await invoke(coordinator, "func other");
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it("resumes after configuration/key reset or a successful connection test", async () => {
    const complete = vi.fn<OpenAIResponsesClient["complete"]>()
      .mockRejectedValueOnce(new ResponsesApiError("Authentication failed.", 401))
      .mockResolvedValue(result("in()"));
    const coordinator = new CompletionCoordinator(dependencies(complete));
    await invoke(coordinator);
    coordinator.resetTransportState();
    expect((await invoke(coordinator))?.[0]?.insertText).toBe("in()");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("ignores late authentication failures after cancellation and configuration reset", async () => {
    let reject: ((error: unknown) => void) | undefined;
    const complete = vi.fn<OpenAIResponsesClient["complete"]>()
      .mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }))
      .mockResolvedValue(result("in()"));
    const deps = dependencies(complete);
    const coordinator = new CompletionCoordinator(deps);
    const document = documentOf("func ma");
    const position = new vscode.Position(0, 7);
    activateEditor(document, position);
    const pending = coordinator.provideInlineCompletionItems(document as unknown as vscode.TextDocument, position,
      { triggerKind: 0, selectedCompletionInfo: undefined }, token());
    await vi.advanceTimersByTimeAsync(75);
    coordinator.cancel("configuration-change");
    coordinator.resetTransportState();
    reject?.(new ResponsesApiError("Authentication failed.", 401));
    expect(await pending).toBeUndefined();
    expect(deps.onAuthenticationError).not.toHaveBeenCalled();
    expect((await invoke(coordinator))?.[0]?.insertText).toBe("in()");
  });

  it.each([false, true])("backs off after transport failures (timeout=%s)", async (timeout) => {
    const complete = vi.fn<OpenAIResponsesClient["complete"]>()
      .mockRejectedValueOnce(new ResponsesApiError("Request failed.", undefined, timeout))
      .mockResolvedValue(result("in()"));
    const deps = dependencies(complete);
    const coordinator = new CompletionCoordinator(deps);
    await invoke(coordinator);
    await invoke(coordinator);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(deps.onTransportError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await invoke(coordinator))?.[0]?.insertText).toBe("in()");
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
