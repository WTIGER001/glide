import * as vscode from "vscode";
import { CompletionCache } from "./completionCache";
import { CompletionCoordinator } from "./completionCoordinator";
import { readConfiguration, setEnabled } from "./configuration";
import { ACCEPTANCE_COMMAND } from "./constants";
import { DiagnosticLogger } from "./logger";
import { OpenAIResponsesClient, ResponsesApiError } from "./openaiResponsesClient";
import { COMPLETION_INSTRUCTIONS } from "./promptBuilder";
import { SecretStore } from "./secretStore";
import { LocalStatistics } from "./statistics";
import { GlideStatusBar } from "./statusBar";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Glide");
  const statisticsOutput = vscode.window.createOutputChannel("Glide Statistics");
  const secrets = new SecretStore(context.secrets);
  await secrets.initialize();
  const logger = new DiagnosticLogger(output, () => readConfiguration().diagnosticLogging);
  const statistics = new LocalStatistics(context.globalState);
  const initialConfiguration = readConfiguration();
  const cache = new CompletionCache(initialConfiguration.cacheCapacity);
  const client = new OpenAIResponsesClient();
  const status = new GlideStatusBar(secrets);
  let authenticationNoticeShown = false;
  let transportError = false;

  const coordinator = new CompletionCoordinator({
    secrets,
    cache,
    statistics,
    logger,
    client,
    setRequesting: (requesting) => status.setRequesting(requesting),
    onAuthenticationError: () => {
      status.setError(true);
      if (authenticationNoticeShown) {
        return;
      }
      authenticationNoticeShown = true;
      void vscode.window.showWarningMessage("Glide could not authenticate with the Responses endpoint.", "Set API Key").then(
        async (choice) => {
          if (choice === "Set API Key") {
            await vscode.commands.executeCommand("glide.setApiKey");
          }
        }
      );
    },
    onTransportError: () => {
      transportError = true;
      status.setError(true);
    },
    onTransportSuccess: () => {
      transportError = false;
      status.setError(false);
    }
  });

  const register = (command: string, callback: (...args: never[]) => unknown): vscode.Disposable =>
    vscode.commands.registerCommand(command, callback);

  context.subscriptions.push(
    output,
    statisticsOutput,
    statistics,
    status,
    coordinator,
    vscode.languages.registerInlineCompletionItemProvider({ scheme: "file" }, coordinator),
    vscode.workspace.onDidChangeTextDocument(() => coordinator.cancel("document-change")),
    vscode.window.onDidChangeTextEditorSelection(() => coordinator.cancel("selection-change")),
    vscode.window.onDidChangeActiveTextEditor(() => coordinator.cancel("editor-change")),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("glide")) {
        return;
      }
      coordinator.cancel("configuration-change");
      cache.clear();
      cache.setCapacity(readConfiguration().cacheCapacity);
      transportError = false;
      status.setError(false);
      status.refresh();
    }),
    register("glide.enable", async () => {
      await setEnabled(true);
      status.refresh();
    }),
    register("glide.disable", async () => {
      coordinator.cancel("disabled");
      await setEnabled(false);
      status.refresh();
    }),
    register("glide.toggle", async () => {
      const enabled = readConfiguration().enabled;
      if (enabled) {
        coordinator.cancel("disabled");
      }
      await setEnabled(!enabled);
      status.refresh();
    }),
    register("glide.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Glide: Set API Key",
        prompt: "The credential is stored in VS Code SecretStorage and is never written to settings or logs.",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() === "" ? "Enter an API key or access token." : undefined)
      });
      if (key === undefined) {
        return;
      }
      await secrets.setApiKey(key);
      authenticationNoticeShown = false;
      transportError = false;
      status.setError(false);
      cache.clear();
      status.refresh();
      void vscode.window.showInformationMessage("Glide stored the API key securely.");
    }),
    register("glide.removeApiKey", async () => {
      coordinator.cancel("key-removed");
      await secrets.removeApiKey();
      cache.clear();
      status.refresh();
      void vscode.window.showInformationMessage("Glide removed the saved credential.");
    }),
    register("glide.clearCache", () => {
      cache.clear();
      void vscode.window.showInformationMessage("Glide cleared its in-memory completion cache.");
    }),
    register("glide.openDiagnosticLog", () => logger.show()),
    register("glide.showStats", () => {
      statisticsOutput.clear();
      statisticsOutput.appendLine(statistics.format());
      statisticsOutput.show(true);
    }),
    register("glide.resetStats", async () => {
      await statistics.reset();
      void vscode.window.showInformationMessage("Glide reset its local aggregate statistics.");
    }),
    register(ACCEPTANCE_COMMAND, (characters: number) => {
      statistics.suggestionAccepted(typeof characters === "number" ? characters : 0);
    }),
    register("glide.testConnection", async () => {
      const configuration = readConfiguration();
      const apiKey = secrets.getApiKey();
      if (apiKey === undefined) {
        await vscode.commands.executeCommand("glide.setApiKey");
        return;
      }
      if (configuration.endpoint === undefined) {
        status.setError(true);
        logger.importantError("connection-test.invalid-endpoint", { category: "configuration" });
        void vscode.window.showWarningMessage("Glide's Responses endpoint is invalid. Use HTTPS, or HTTP only for localhost.");
        return;
      }
      const controller = new AbortController();
      status.setRequesting(true);
      try {
        const result = await client.complete(
          {
            endpoint: configuration.endpoint,
            apiKey,
            authentication: configuration.authentication,
            model: configuration.model,
            instructions: `${COMPLETION_INSTRUCTIONS}\nFor this connection test only, return exactly OK.`,
            input: "Connection test. Return exactly OK.",
            reasoningEffort: "none",
            maxOutputTokens: 16,
            timeoutMs: configuration.requestTimeoutMs,
            suffix: ""
          },
          controller.signal
        );
        if (result.status === "completed" && result.text.trim() === "OK") {
          transportError = false;
          status.setError(false);
          void vscode.window.showInformationMessage(`Glide connected successfully using ${configuration.model}.`);
        } else {
          throw new ResponsesApiError("The connection test returned an unexpected response.");
        }
      } catch (error) {
        transportError = true;
        status.setError(true);
        const statusCode = error instanceof ResponsesApiError ? error.statusCode : undefined;
        logger.importantError(
          statusCode === 401 || statusCode === 403 ? "connection-test.authentication-failed" : "connection-test.failed",
          {
            status: statusCode,
            category: "connection-test",
            endpoint: configuration.endpoint,
            authentication: configuration.authentication,
            model: configuration.model
          }
        );
        void vscode.window.showWarningMessage(
          statusCode === 401 || statusCode === 403
            ? "Glide could not authenticate. Check the API key and endpoint."
            : "Glide could not complete the connection test. Open the diagnostic log for metadata-only details."
        );
      } finally {
        status.setRequesting(false);
      }
    })
  );

  logger.event("extension.activated", {
    enabled: initialConfiguration.enabled,
    model: initialConfiguration.model,
    configured: secrets.hasApiKey(),
    priorTransportError: transportError
  });
}

export function deactivate(): void {
  // VS Code disposes all registered resources from the extension context.
}
