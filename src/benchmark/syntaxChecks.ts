import { execFileSync } from "node:child_process";
import * as ts from "typescript";
import { checkData } from "./dataChecks";
import type { Language } from "./types";

export interface SyntaxResult { readonly valid: boolean | null; readonly parser: string; readonly detail: string }

/** Parsing only: do not import, compile, or execute captured code. */
export function checkSyntax(language: Language, source: string): SyntaxResult {
  const data = checkData(language, source, "null");
  if (data) return { valid: data.syntaxValid, parser: language === "json" ? "JSON.parse" : "yaml-1.2-core", detail: "data syntax only" };
  if (language === "typescript") {
    const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    return { valid: !(result.diagnostics ?? []).some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error), parser: `typescript-${ts.version}`, detail: "syntactic diagnostics; no type or behavior claim" };
  }
  const command = language === "go" ? "gofmt" : "python3";
  const args = language === "go" ? [] : ["-I", "-c", "import ast,sys; ast.parse(sys.stdin.read())"];
  try {
    execFileSync(command, args, { input: source, timeout: 5000, maxBuffer: 128 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { valid: true, parser: command, detail: "syntax only; imports unresolved and behavior unchecked" };
  } catch (error) {
    const status = error !== null && typeof error === "object" && "status" in error ? error.status : null;
    return { valid: typeof status === "number" && status > 0 ? false : null, parser: command,
      detail: typeof status === "number" && status > 0 ? "parser rejected source" : "parser unavailable, timed out, or exceeded output limit" };
  }
}
