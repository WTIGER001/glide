import path from "node:path";
import * as vscode from "vscode";
import type { GlideConfiguration } from "./configuration";

export type IneligibleReason =
  | "disabled"
  | "missing-key"
  | "invalid-endpoint"
  | "untrusted-workspace"
  | "unsupported-uri"
  | "protected-file"
  | "excluded-file"
  | "selection"
  | "completed-closer"
  | "empty-context"
  | "long-line";

export interface EligibilityInput {
  readonly document: vscode.TextDocument;
  readonly position: vscode.Position;
  readonly selection: vscode.Selection | undefined;
  readonly workspaceTrusted: boolean;
  readonly hasApiKey: boolean;
  readonly configuration: GlideConfiguration;
  readonly workspaceFolderPath: string | undefined;
}

const PROTECTED_BASENAMES = [
  /^\.env(?:\..+)?$/iu,
  /^id_rsa.*$/iu,
  /^credentials.*$/iu,
  /^secrets.*$/iu,
  /^package-lock\.json$/iu
];
const PROTECTED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".lock", ".map"]);
const PROTECTED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build"]);

export function protectedPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  const lowerBasename = basename.toLowerCase();
  const segments = normalized.toLowerCase().split("/");
  return (
    PROTECTED_BASENAMES.some((pattern) => pattern.test(basename)) ||
    PROTECTED_EXTENSIONS.has(path.posix.extname(lowerBasename)) ||
    segments.some((segment) => PROTECTED_DIRECTORIES.has(segment)) ||
    /\.min\.(?:js|css)$/iu.test(lowerBasename)
  );
}

export function globMatches(candidate: string, pattern: string): boolean {
  const normalizedCandidate = candidate.replaceAll("\\", "/");
  const normalizedPattern = pattern.trim().replaceAll("\\", "/");
  if (normalizedPattern === "") {
    return false;
  }
  let source = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*") {
      if (normalizedPattern[index + 1] === "*") {
        if (normalizedPattern[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character?.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&") ?? "";
    }
  }
  return new RegExp(`^(?:${source})$`, "iu").test(normalizedCandidate);
}

export function checkEligibility(input: EligibilityInput): IneligibleReason | undefined {
  const { configuration, document, position } = input;
  if (!configuration.enabled) {
    return "disabled";
  }
  if (!input.hasApiKey) {
    return "missing-key";
  }
  if (configuration.endpoint === undefined) {
    return "invalid-endpoint";
  }
  if (!input.workspaceTrusted) {
    return "untrusted-workspace";
  }
  if (document.uri.scheme !== "file") {
    return "unsupported-uri";
  }
  if (!configuration.allowSensitiveFiles && protectedPath(document.fileName)) {
    return "protected-file";
  }

  const relativePath = input.workspaceFolderPath
    ? path.relative(input.workspaceFolderPath, document.fileName).replaceAll("\\", "/")
    : path.basename(document.fileName);
  if (configuration.excludePatterns.some((pattern) => globMatches(relativePath, pattern))) {
    return "excluded-file";
  }
  if (input.selection !== undefined && !input.selection.isEmpty) {
    return "selection";
  }

  const line = document.lineAt(position.line).text;
  const beforeCursor = line.slice(0, position.character);
  if (/[)\]};]$/u.test(beforeCursor)) {
    return "completed-closer";
  }
  if (line.length > 20_000) {
    return "long-line";
  }
  const documentOffset = document.offsetAt(position);
  const localStart = document.positionAt(Math.max(0, documentOffset - 500));
  const localPrefix = document.getText(new vscode.Range(localStart, position));
  if (!/\S/u.test(localPrefix)) {
    return "empty-context";
  }
  return undefined;
}
