import path from "node:path";
import * as vscode from "vscode";

export interface CompletionContext {
  readonly uri: string;
  readonly documentVersion: number;
  readonly language: string;
  readonly filename: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly cursorLine: number;
  readonly cursorColumn: number;
  readonly linePrefix: string;
  readonly indentation: string;
  readonly insertSpaces: boolean;
  readonly tabSize: number;
}

export interface ContextLimits {
  readonly maxPrefixChars: number;
  readonly maxSuffixChars: number;
}

export function truncateTail(value: string, limit: number): string {
  if (limit <= 0) {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  let start = value.length - limit;
  if (start > 0 && value[start] === "\n" && value[start - 1] === "\r") {
    start += 1;
  }
  const code = value.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) {
    start += 1;
  }
  return value.slice(start);
}

export function truncateHead(value: string, limit: number): string {
  if (limit <= 0) {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  let end = limit;
  if (value[end - 1] === "\r" && value[end] === "\n") {
    end -= 1;
  }
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function buildCompletionContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  editorOptions: vscode.TextEditorOptions,
  limits: ContextLimits
): CompletionContext {
  const offset = document.offsetAt(position);
  const prefixStart = document.positionAt(Math.max(0, offset - limits.maxPrefixChars - 2));
  const suffixEnd = document.positionAt(Math.min(document.getText().length, offset + limits.maxSuffixChars + 2));
  const rawPrefix = document.getText(new vscode.Range(prefixStart, position));
  const rawSuffix = document.getText(new vscode.Range(position, suffixEnd));
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  const indentation = linePrefix.match(/^\s*/u)?.[0] ?? "";

  return {
    uri: document.uri.toString(),
    documentVersion: document.version,
    language: document.languageId,
    filename: path.basename(document.fileName),
    prefix: truncateTail(rawPrefix, limits.maxPrefixChars),
    suffix: truncateHead(rawSuffix, limits.maxSuffixChars),
    cursorLine: position.line,
    cursorColumn: position.character,
    linePrefix,
    indentation,
    insertSpaces: editorOptions.insertSpaces !== false,
    tabSize: typeof editorOptions.tabSize === "number" ? Math.max(1, editorOptions.tabSize) : 4
  };
}
