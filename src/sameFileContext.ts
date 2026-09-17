import type * as vscode from "vscode";
import type { CompletionContext } from "./contextBuilder";

export interface SameFileContextProvider {
  collect(document: vscode.TextDocument, position: vscode.Position, adjacent: CompletionContext, signal: AbortSignal): Promise<string>;
}

const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const DECLARATION = /^\s*(?:export\s+)?(?:type|interface|class|struct|func|function|def|const|let|var)\s+(?:\([^)]*\)\s*)?([\p{L}_$][\p{L}\p{N}_$]*)/u;
const IMPORT = /^\s*(?:import\b|from\s+\S+\s+import\b|package\b|using\b|#include\b)/u;
const YAML_ANCHOR = /^\s*([\p{L}_][\p{L}\p{N}_-]*):\s*&[\p{L}_][\p{L}\p{N}_-]*/u;
const KEYWORDS = new Set(["return", "func", "function", "def", "class", "type", "interface", "const", "let", "var", "true", "false", "null", "nil"]);

export function selectSameFileContext(source: string, adjacent: Pick<CompletionContext, "prefix" | "suffix" | "linePrefix">, maxChars = 2000): string {
  if (maxChars <= 0 || source.length === 0 || source.length > 500_000) return "";
  const nearby = new Set((adjacent.linePrefix.match(IDENTIFIER) ?? []).filter((word) => !KEYWORDS.has(word)));
  const adjacentText = adjacent.prefix + adjacent.suffix;
  const candidates: Array<{ text: string; score: number; offset: number }> = [];
  let offset = 0;
  for (const line of source.split(/(?<=\n)/u)) {
    const text = line.trimEnd();
    const declaration = DECLARATION.exec(text);
    const imported = IMPORT.test(text);
    const yamlAnchor = YAML_ANCHOR.exec(text);
    if (declaration !== null || imported || yamlAnchor !== null) {
      const name = declaration?.[1] ?? yamlAnchor?.[1] ?? "";
      const score = imported ? 3 : nearby.has(name) ? 5 : 1;
      if (text.trim() !== "" && !adjacentText.includes(text.trim())) candidates.push({ text, score, offset });
    }
    offset += line.length;
  }
  const selected: string[] = [];
  let used = 0;
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.offset - b.offset)) {
    const addition = `${candidate.text}\n`;
    if (used + addition.length > maxChars) continue;
    selected.push(candidate.text);
    used += addition.length;
  }
  return selected.join("\n");
}

export class BoundedSameFileContextProvider implements SameFileContextProvider {
  private active = 0;

  public constructor(private readonly deadlineMs = 25, private readonly maxConcurrent = 2, private readonly maxChars = 2000) {}

  public async collect(document: vscode.TextDocument, _position: vscode.Position, adjacent: CompletionContext, signal: AbortSignal): Promise<string> {
    if (signal.aborted || this.active >= this.maxConcurrent) return "";
    this.active += 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = Promise.resolve().then(() => signal.aborted ? "" : selectSameFileContext(document.getText(), adjacent, this.maxChars));
      const deadline = new Promise<string>((resolve) => { timer = setTimeout(() => resolve(""), this.deadlineMs); });
      return await Promise.race([work, deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      this.active -= 1;
    }
  }
}
