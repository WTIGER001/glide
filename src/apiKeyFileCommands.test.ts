import { beforeEach, expect, it, vi } from "vitest";
import type { SecretStore } from "./secretStore";
import { ApiKeyFileError } from "./secretStore";
import { registerApiKeyFileCommands } from "./apiKeyFileCommands";

const ui = vi.hoisted(() => ({
  commands: new Map<string, () => Promise<void>>(),
  showOpenDialog: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  executeCommand: vi.fn()
}));

vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ scheme: "file", fsPath }) },
  window: ui,
  commands: {
    executeCommand: ui.executeCommand,
    registerCommand: (name: string, callback: () => Promise<void>) => {
      ui.commands.set(name, callback);
      return { dispose: () => ui.commands.delete(name) };
    }
  }
}));

const select = vi.fn();
const clear = vi.fn();
const beforeChange = vi.fn();
const afterChange = vi.fn();
const hasSavedApiKey = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  ui.commands.clear();
  registerApiKeyFileCommands({
    getApiKeyFilePath: () => "/private/current-key",
    hasSavedApiKey,
    selectApiKeyFile: select,
    clearApiKeyFile: clear
  } as unknown as SecretStore, beforeChange, afterChange);
});

it("cancels the picker without changing credentials or activity", async () => {
  ui.showOpenDialog.mockResolvedValue(undefined);
  await ui.commands.get("glide.selectApiKeyFile")?.();
  expect(select).not.toHaveBeenCalled();
  expect(beforeChange).not.toHaveBeenCalled();
  expect(afterChange).not.toHaveBeenCalled();
});

it("loads the chosen file and invalidates request state around the change", async () => {
  ui.showOpenDialog.mockResolvedValue([{ scheme: "file", fsPath: "/private/new-key" }]);
  select.mockImplementation(() => {
    expect(beforeChange).toHaveBeenCalledOnce();
    return Promise.resolve();
  });
  await ui.commands.get("glide.selectApiKeyFile")?.();
  expect(select).toHaveBeenCalledWith("/private/new-key");
  expect(afterChange).toHaveBeenCalledWith(true);
  expect(ui.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ canSelectFolders: false, canSelectMany: false }));
  expect(ui.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("No reload is needed"));
});

it("offers to remove an overriding saved key only after a successful selection", async () => {
  ui.showOpenDialog.mockResolvedValue([{ scheme: "file", fsPath: "/private/new-key" }]);
  hasSavedApiKey.mockReturnValue(true);
  ui.showInformationMessage.mockResolvedValue("Remove Saved API Key");
  await ui.commands.get("glide.selectApiKeyFile")?.();
  expect(ui.executeCommand).toHaveBeenCalledWith("glide.removeApiKey");
});

it.each([new ApiKeyFileError("Use private file permissions."), new Error("/private/secret-location")])(
  "reports safe validation/storage errors without changing the active selection",
  async (error) => {
    ui.showOpenDialog.mockResolvedValue([{ scheme: "file", fsPath: "/private/new-key" }]);
    select.mockRejectedValue(error);
    await ui.commands.get("glide.selectApiKeyFile")?.();
    expect(afterChange).toHaveBeenCalledWith(false);
    expect(ui.showInformationMessage).not.toHaveBeenCalled();
    expect(ui.showErrorMessage).toHaveBeenCalledOnce();
    expect(JSON.stringify(ui.showErrorMessage.mock.calls)).not.toContain("/private/");
  }
);

it("rejects non-file resources without trying to load their contents", async () => {
  ui.showOpenDialog.mockResolvedValue([{ scheme: "https", fsPath: "/key" }]);
  await ui.commands.get("glide.selectApiKeyFile")?.();
  expect(select).not.toHaveBeenCalled();
  expect(beforeChange).not.toHaveBeenCalled();
  expect(ui.showErrorMessage).toHaveBeenCalledOnce();
});

it("clears the remembered selection and refreshes the credential state", async () => {
  await ui.commands.get("glide.clearApiKeyFile")?.();
  expect(clear).toHaveBeenCalledOnce();
  expect(beforeChange).toHaveBeenCalledOnce();
  expect(afterChange).toHaveBeenCalledWith(true);
  expect(ui.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("No file was deleted"));
});
