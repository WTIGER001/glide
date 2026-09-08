import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function testActivationAndCommands(): Promise<void> {
  const extension = vscode.extensions.getExtension("wtiger001.glide-code-completion");
  assert.ok(extension, "the Glide extension should be installed in the test host");
  await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "glide.enable",
    "glide.disable",
    "glide.toggle",
    "glide.setBaseUrl",
    "glide.setApiKey",
    "glide.testConnection",
    "glide.showStats",
    "glide.clearCache"
  ]) {
    assert.ok(commands.includes(command), `${command} should be registered`);
  }
}

export function testConfigurationDefaults(): void {
  const configuration = vscode.workspace.getConfiguration("glide");
  assert.equal(configuration.get("model"), "gpt-5.6-luna");
  assert.equal(configuration.get("baseUrl"), "https://api.openai.com/v1");
  assert.equal(configuration.get("enabled"), true);
}
