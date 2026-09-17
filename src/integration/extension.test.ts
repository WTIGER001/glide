import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";

export async function testActivationAndCommands(): Promise<void> {
  const extension = vscode.extensions.getExtension("wtiger001.glide");
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

export async function testNativeInlineCompletionAndAcceptance(): Promise<void> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(body);
      const text = body.includes("cancel_pending") ? "()" : body.includes("func esca") ? "pe()" : "in() {\n\treturn nil\n}";
      const send = () => {
        if (response.destroyed) return;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n` +
            'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":20,"output_tokens":8,"total_tokens":28}}}\n\n'
        );
      };
      if (body.includes("cancel_pending")) setTimeout(send, 500);
      else send();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string", "fixture server should have a TCP address");

  const directory = await mkdtemp(path.join(tmpdir(), "glide-integration-"));
  const filePath = path.join(directory, "main.go");
  const configuration = vscode.workspace.getConfiguration("glide");
  const previousBaseUrl = configuration.inspect<string>("baseUrl")?.globalValue;
  const previousDebounce = configuration.inspect<number>("debounceMs")?.globalValue;
  const previousKey = process.env.OPENAI_API_KEY;
  try {
    // The test host must never prefer a credential retained by an earlier run.
    await vscode.commands.executeCommand("glide.removeApiKey");
    process.env.OPENAI_API_KEY = "synthetic-integration-key";
    await configuration.update("baseUrl", `http://127.0.0.1:${address.port}`, vscode.ConfigurationTarget.Global);
    await configuration.update("debounceMs", 75, vscode.ConfigurationTarget.Global);
    await writeFile(filePath, "func ma", "utf8");
    const document = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, document.getText().length);
    editor.selection = new vscode.Selection(position, position);

    await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    const deadline = Date.now() + 2000;
    while (requests.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(requests.length, 1, "the fixture should observe one provider request");
    await new Promise((resolve) => setTimeout(resolve, 50));
    await vscode.commands.executeCommand("editor.action.inlineSuggest.commit");
    assert.equal(document.getText(), "func main() {\n\treturn nil\n}");

    await vscode.commands.executeCommand("glide.disable");
    const disabledPath = path.join(directory, "disabled.go");
    await writeFile(disabledPath, "func ma", "utf8");
    const disabledDocument = await vscode.workspace.openTextDocument(disabledPath);
    const disabledEditor = await vscode.window.showTextDocument(disabledDocument);
    disabledEditor.selection = new vscode.Selection(new vscode.Position(0, 7), new vscode.Position(0, 7));
    await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(requests.length, 1, "disabled Glide must not request a completion");
    await vscode.commands.executeCommand("glide.enable");

    const protectedPath = path.join(directory, ".env.local");
    await writeFile(protectedPath, "OPENAI_API_KEY=synthetic", "utf8");
    const protectedDocument = await vscode.workspace.openTextDocument(protectedPath);
    const protectedEditor = await vscode.window.showTextDocument(protectedDocument);
    const protectedPosition = new vscode.Position(0, protectedDocument.getText().length);
    protectedEditor.selection = new vscode.Selection(protectedPosition, protectedPosition);
    await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(requests.length, 1, "protected files must not reach the endpoint");

    const escapePath = path.join(directory, "escape.go");
    await writeFile(escapePath, "func esca", "utf8");
    const escapeDocument = await vscode.workspace.openTextDocument(escapePath);
    const escapeEditor = await vscode.window.showTextDocument(escapeDocument);
    const escapePosition = new vscode.Position(0, escapeDocument.getText().length);
    escapeEditor.selection = new vscode.Selection(escapePosition, escapePosition);
    await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    const escapeDeadline = Date.now() + 2000;
    while (requests.length < 2 && Date.now() < escapeDeadline) await new Promise((resolve) => setTimeout(resolve, 25));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await vscode.commands.executeCommand("editor.action.inlineSuggest.hide");
    await vscode.commands.executeCommand("editor.action.inlineSuggest.commit");
    assert.equal(escapeDocument.getText(), "func esca", "Escape/hide must leave the document unchanged");

    const cancelPath = path.join(directory, "cancel.go");
    await writeFile(cancelPath, "func cancel_pending", "utf8");
    const cancelDocument = await vscode.workspace.openTextDocument(cancelPath);
    const cancelEditor = await vscode.window.showTextDocument(cancelDocument);
    const cancelPosition = new vscode.Position(0, cancelDocument.getText().length);
    cancelEditor.selection = new vscode.Selection(cancelPosition, cancelPosition);
    await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    const cancelDeadline = Date.now() + 2000;
    while (requests.length < 3 && Date.now() < cancelDeadline) await new Promise((resolve) => setTimeout(resolve, 25));
    await cancelEditor.edit((builder) => builder.insert(cancelPosition, "X"));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await vscode.commands.executeCommand("editor.action.inlineSuggest.commit");
    assert.equal(cancelDocument.getText(), "func cancel_pendingX", "a response invalidated by editing must not display or insert");
  } finally {
    await configuration.update("baseUrl", previousBaseUrl, vscode.ConfigurationTarget.Global);
    await configuration.update("debounceMs", previousDebounce, vscode.ConfigurationTarget.Global);
    if (previousKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousKey;
    }
    server.close();
    await once(server, "close");
    await rm(directory, { recursive: true, force: true });
  }
}
