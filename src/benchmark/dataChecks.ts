import { isDeepStrictEqual } from "node:util";
import { parseDocument } from "yaml";
import type { Language } from "./types";

/** Parse data only; never execute model output or instantiate custom YAML tags. */
export function checkData(language: Language, source: string, expected: string) {
  if (language !== "yaml" && language !== "json") return null;
  try {
    let parsed: unknown;
    if (language === "json") {
      parsed = JSON.parse(source) as unknown;
    } else {
      const document = parseDocument(source, { version: "1.2", schema: "core", uniqueKeys: true, customTags: [], strict: true });
      if (document.errors.length > 0 || document.warnings.length > 0) return { syntaxValid: false, valueMatches: false };
      parsed = document.toJS({ maxAliasCount: 50 }) as unknown;
    }
    return { syntaxValid: true, valueMatches: isDeepStrictEqual(parsed, JSON.parse(expected) as unknown) };
  } catch {
    return { syntaxValid: false, valueMatches: false };
  }
}
