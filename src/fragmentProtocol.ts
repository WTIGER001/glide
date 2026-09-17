import type { CompletionContext } from "./contextBuilder";

export interface FragmentDerivation {
  readonly fragment: string;
  readonly insertion: string | undefined;
  readonly applied: boolean;
}

/**
 * Return the already-typed identifier or quoted scalar immediately before the
 * cursor. The result is advisory prompt context; it never expands the editor
 * replacement range.
 */
export function currentTypedFragment(context: Pick<CompletionContext, "linePrefix">): string {
  const line = context.linePrefix;
  const identifier = /[\p{L}_$][\p{L}\p{N}_$]*$/u.exec(line)?.[0];
  const quote = /(?:^|[^\\])(["'`])([^"'`\r\n\\]*)$/u.exec(line);
  const quoted = quote?.[2];
  if (quoted !== undefined && (identifier === undefined || quoted.length >= identifier.length)) return quoted;
  return identifier ?? "";
}

/**
 * Convert a model-returned full fragment into insertion-only text. A mismatch
 * is rejected: Glide never replaces or edits the already-typed prefix.
 */
export function deriveFragmentInsertion(raw: string, context: Pick<CompletionContext, "linePrefix">): FragmentDerivation {
  const fragment = currentTypedFragment(context);
  if (fragment === "") return { fragment, insertion: raw, applied: false };
  if (!raw.startsWith(fragment)) return { fragment, insertion: undefined, applied: true };
  const insertion = raw.slice(fragment.length);
  return { fragment, insertion: insertion === "" ? undefined : insertion, applied: true };
}
