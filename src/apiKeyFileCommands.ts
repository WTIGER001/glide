import * as vscode from "vscode";
import { ApiKeyFileError, type SecretStore } from "./secretStore";

export function registerApiKeyFileCommands(
  secrets: SecretStore,
  beforeChange: () => void,
  afterChange: (changed: boolean) => void
): vscode.Disposable[] {
  const changeFile = async (change: () => Promise<void>, message: string): Promise<void> => {
    beforeChange();
    let changed = false;
    try {
      await change();
      changed = true;
    } catch (error) {
      // Filesystem and storage errors can include private paths; only show our fixed messages.
      void vscode.window.showErrorMessage(error instanceof ApiKeyFileError
        ? error.message : "Glide could not save the API-key file selection. Your previous selection is unchanged.");
      return;
    } finally {
      afterChange(changed);
    }
    if (secrets.hasSavedApiKey()) {
      const action = await vscode.window.showInformationMessage(
        `${message} A saved API key takes priority. Remove it to use the file.`, "Remove Saved API Key"
      );
      if (action === "Remove Saved API Key") await vscode.commands.executeCommand("glide.removeApiKey");
    } else {
      void vscode.window.showInformationMessage(message);
    }
  };

  return [
    vscode.commands.registerCommand("glide.selectApiKeyFile", async () => {
      const files = await vscode.window.showOpenDialog({
        title: "Glide: Select API Key File",
        openLabel: "Select API Key File",
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(secrets.getApiKeyFilePath())
      });
      const file = files?.[0];
      if (file === undefined) return;
      if (file.scheme !== "file") {
        void vscode.window.showErrorMessage("Choose a local API-key file on the extension host.");
        return;
      }
      await changeFile(() => secrets.selectApiKeyFile(file.fsPath), "Glide loaded the selected API-key file. No reload is needed.");
    }),
    vscode.commands.registerCommand("glide.clearApiKeyFile", async () => {
      await changeFile(() => secrets.clearApiKeyFile(), "Glide restored the default API-key file location. No file was deleted.");
    })
  ];
}
