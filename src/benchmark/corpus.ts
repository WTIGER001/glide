import { createHash } from "node:crypto";
import type { CompletionCase, Family, Language } from "./types";
import { goFamilies } from "./fixtures/go";
import { typescriptFamilies } from "./fixtures/typescript";
import { pythonFamilies } from "./fixtures/python";
import { yamlFamilies } from "./fixtures/yaml";
import { jsonFamilies } from "./fixtures/json";

export const LEGACY_CORPUS_VERSION = "glide-synthetic-v1";
export const CORPUS_VERSION = "glide-synthetic-v2";
const baseFamilies: readonly Family[] = [...goFamilies, ...typescriptFamilies, ...pythonFamilies, ...yamlFamilies, ...jsonFamilies];
const V2_FAMILIES = new Set(["go-contract-sort", "go-far-helper", "ts-contract-clamp", "ts-far-helper", "py-contract-enumerate", "py-far-helper", "yaml-contract-retries", "yaml-far-anchor", "json-contract-timeout"]);
export const legacyFamilies: readonly Family[] = baseFamilies.filter((family) => !V2_FAMILIES.has(family.id));
// V1 placed json-crlf's typed cursor after "[\r", between a CRLF pair. Keep
// the original family available for historical capture replay, while V2 moves
// the cursor to the first representable position after the newline.
export const families: readonly Family[] = baseFamilies.map((family) =>
  family.id === "json-crlf" ? { ...family, typed: 3 } : family
);

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function expandFamily(family: Family): CompletionCase[] {
  const match = /^(.*?)⟦([\s\S]*?)⟧([\s\S]*)$/su.exec(family.template);
  if (match === null || family.template.split("⟦").length !== 2 || family.template.split("⟧").length !== 2) {
    throw new Error(`Invalid marked source: ${family.id}`);
  }
  const prefix = match[1] ?? "";
  const answer = match[2] ?? "";
  const suffix = match[3] ?? "";
  if (!Number.isInteger(family.typed) || family.typed < 1 || family.typed >= answer.length) {
    throw new Error(`Invalid second cursor: ${family.id}`);
  }
  return [0, family.typed].map((typed, index) => {
    const before = prefix + answer.slice(0, typed);
    const linePrefix = before.split("\n").at(-1) ?? "";
    const extension: Record<Language, string> = { go: "go", typescript: "ts", python: "py", yaml: "yaml", json: "json" };
    const expected = family.abstain === undefined ? answer.slice(typed) : null;
    return {
      id: `${family.id}-${index === 0 ? "hole" : "typed"}`,
      family: family.id,
      split: family.split,
      category: family.category,
      mode: expected === null ? "abstain" : expected.includes("\n") ? "block" : "short",
      origin: index === 0 ? "removed-span" : "typing-continuation",
      context: {
        uri: `file:///synthetic/${family.id}/fixture.${extension[family.language]}`,
        filename: `fixture.${extension[family.language]}`,
        documentVersion: index + 1,
        language: family.language,
        prefix: before,
        suffix,
        cursorOffset: before.length,
        cursorLine: before.split("\n").length - 1,
        cursorColumn: linePrefix.length,
        linePrefix,
        indentation: linePrefix.match(/^[\t ]*/u)?.[0] ?? "",
        insertSpaces: family.language !== "go",
        tabSize: ["typescript", "yaml", "json"].includes(family.language) ? 2 : 4
      },
      expected,
      alternatives: (family.alternatives ?? []).filter((value) => value.startsWith(answer.slice(0, typed))).map((value) => value.slice(typed)),
      abstentionReason: family.abstain ?? null,
      evaluation: family.abstain !== undefined ? "abstention" : family.evaluation ?? "reconstruction",
      properties: ["insertion-only", "prefix-unchanged", "suffix-unchanged", "no-prose", "no-extra-context"],
      provenance: { kind: "original-synthetic", license: "MIT", source: `src/benchmark/fixtures/${family.language}.ts#${family.id}` }
    };
  });
}

export const corpus = families.flatMap(expandFamily);
export const legacyCorpus = legacyFamilies.flatMap(expandFamily);

export interface CursorPosition {
  readonly line: number;
  readonly column: number;
}

export function cursorPositionAt(text: string, offset: number): CursorPosition | undefined {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return undefined;
  if (offset > 0 && offset < text.length) {
    const previous = text.charCodeAt(offset - 1);
    const next = text.charCodeAt(offset);
    if ((previous === 0x0d && next === 0x0a) ||
        (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)) return undefined;
  }
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x0d && text.charCodeAt(index + 1) === 0x0a) {
      index += 1;
      line += 1;
      lineStart = index + 1;
    } else if (code === 0x0a || code === 0x0d) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart };
}

export function cursorOffsetAt(text: string, position: CursorPosition): number | undefined {
  if (!Number.isInteger(position.line) || !Number.isInteger(position.column) || position.line < 0 || position.column < 0) return undefined;
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const atEnd = index === text.length;
    const code = atEnd ? -1 : text.charCodeAt(index);
    if (atEnd || code === 0x0a || code === 0x0d) {
      if (line === position.line) {
        const lineEnd = index;
        const offset = lineStart + position.column;
        return offset <= lineEnd ? offset : undefined;
      }
      if (code === 0x0d && text.charCodeAt(index + 1) === 0x0a) index += 1;
      line += 1;
      lineStart = index + 1;
    }
  }
  return undefined;
}

export function validateCorpus(cases: readonly CompletionCase[] = corpus): void {
  const ids = new Set<string>();
  const splitByFamily = new Map<string, string>();
  for (const entry of cases) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate fixture: ${entry.id}`);
    }
    ids.add(entry.id);
    const split = splitByFamily.get(entry.family);
    if (split !== undefined && split !== entry.split) {
      throw new Error(`Family crosses split: ${entry.family}`);
    }
    splitByFamily.set(entry.family, entry.split);
    if (entry.context.prefix.includes("⟦") || entry.context.suffix.includes("⟧")) {
      throw new Error(`Leaked marker: ${entry.id}`);
    }
    if (entry.expected !== null && entry.expected.trim() === "") {
      throw new Error(`Completion must contain source: ${entry.id}`);
    }
    const source = entry.context.prefix + entry.context.suffix;
    const cursor = cursorPositionAt(source, entry.context.cursorOffset);
    if (cursor === undefined || cursor.line !== entry.context.cursorLine || cursor.column !== entry.context.cursorColumn ||
        cursorOffsetAt(source, cursor) !== entry.context.cursorOffset || !entry.context.prefix.isWellFormed() || !entry.context.suffix.isWellFormed()) {
      throw new Error(`Unrepresentable cursor: ${entry.id}`);
    }
  }
}

export const corpusHash = hash(JSON.stringify(families));
export const legacyCorpusHash = hash(JSON.stringify(legacyFamilies));

export function corpusForHash(value: string): { version: string; cases: readonly CompletionCase[]; hash: string } | undefined {
  if (value === corpusHash) return { version: CORPUS_VERSION, cases: corpus, hash: corpusHash };
  if (value === legacyCorpusHash) return { version: LEGACY_CORPUS_VERSION, cases: legacyCorpus, hash: legacyCorpusHash };
  return undefined;
}
