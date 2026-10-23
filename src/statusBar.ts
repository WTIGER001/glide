import * as vscode from "vscode";
import { modelLabel } from "./constants";
import type { SecretStore } from "./secretStore";
import { readConfiguration } from "./configuration";

export class GlideStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  private requesting = false;
  private error: false | "transport" | "authentication" = false;

  public constructor(private readonly secrets: SecretStore) {
    this.item.name = "Glide inline completion";
    this.item.show();
    this.refresh();
  }

  public setRequesting(requesting: boolean): void {
    this.requesting = requesting;
    this.refresh();
  }

  public setError(error: boolean | "authentication"): void {
    this.error = error === true ? "transport" : error;
    this.refresh();
  }

  public refresh(): void {
    const configuration = readConfiguration();
    if (!configuration.enabled) {
      this.item.text = "$(circle-slash) Glide: Off";
      this.item.tooltip = "Glide inline completion is disabled. Click to enable.";
      this.item.command = "glide.enable";
      return;
    }
    if (!this.secrets.hasApiKey() || configuration.endpoint === undefined || (this.error && !this.requesting)) {
      this.item.text = "$(warning) Glide: !";
      this.item.tooltip =
        configuration.endpoint === undefined
          ? "Glide's endpoint is invalid. HTTPS is required except for localhost."
          : this.error === "authentication"
            ? "Glide authentication failed. Automatic requests are paused. Click to set the API key, or run Glide: Test Connection to retry."
            : this.secrets.hasApiKey()
              ? "Glide could not reach the configured Responses endpoint. Click to open diagnostics."
              : "Glide needs an API key or access token. Click to set one.";
      this.item.command = !this.secrets.hasApiKey() || this.error === "authentication" ? "glide.setApiKey" : "glide.openDiagnosticLog";
      return;
    }
    const label = modelLabel(configuration.model);
    this.item.text = this.requesting ? `$(loading~spin) Glide: ${label}` : `$(sparkle) Glide: ${label}`;
    this.item.tooltip = this.requesting
      ? `Requesting completion from ${label}… Click to disable.`
      : `Glide is ready with ${label}. Click to disable.`;
    this.item.command = "glide.disable";
  }

  public dispose(): void {
    this.item.dispose();
  }
}
