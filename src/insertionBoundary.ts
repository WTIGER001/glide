import type { CompletionContext } from "./contextBuilder";

/** A deliberately limited lexical check, not a language parser. */
function scan(source: string, language: string) {
  const stack: { token: string; offset: number }[] = [];
  const closes: { offset: number; opener: number | null }[] = [];
  let state: "code" | "line" | "block" | "single" | "double" | "raw" = "code";
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === "line") { if (ch === "\n") state = "code"; continue; }
    if (state === "block") { if (ch === "*" && next === "/") { state = "code"; i += 1; } continue; }
    if (state !== "code") {
      if (ch === "\\" && (state !== "raw" || language !== "go")) { i += 1; continue; }
      // Nested template interpolation needs a real language parser. Never guess.
      if (state === "raw" && language !== "go" && ch === "$" && next === "{") return null;
      if ((state === "single" && ch === "'") || (state === "double" && ch === '"') || (state === "raw" && ch === "`")) state = "code";
      continue;
    }
    if (ch === "/") {
      if (next === "/") { state = "line"; i += 1; continue; }
      if (next === "*") { state = "block"; i += 1; continue; }
      // Division versus regex literals cannot be resolved by this scanner.
      if (language !== "go" && language !== "json") return null;
    }
    if (ch === "'") { state = "single"; continue; }
    if (ch === '"') { state = "double"; continue; }
    if (ch === "`") { state = "raw"; continue; }
    if (ch !== undefined && "([{".includes(ch)) stack.push({ token: ch, offset: i });
    if (ch !== undefined && ")]}".includes(ch)) {
      const opener = stack.pop();
      if (opener && "([{".indexOf(opener.token) !== ")]}".indexOf(ch)) return null;
      closes.push({ offset: i, opener: opener?.offset ?? null });
    }
  }
  return { state, closes, remainingOpeners: stack.length };
}

/**
 * Keep closers owned by the generated insertion. Trim an echoed closer only
 * when the full prefix is available, the cursor is in code, and the closer
 * belongs to a prefix opener already represented in the existing suffix.
 * Decline uncertain lexical cases instead of cutting valid source.
 */
export function resolveSuffixOverlap(value: string, context: CompletionContext, overlap: number): string | undefined {
  if (overlap === 0) return value;
  const shared = value.slice(-overlap);
  if (!/\S/u.test(shared)) return value;
  if (!/^[\s)\]}]+$/u.test(shared)) {
    // A repeated line/identifier can be intentional. Text similarity alone
    // cannot establish ownership; abstain for substantial suspected echoes.
    return shared.includes("\n") || overlap >= 8 ? undefined : value;
  }
  if (!["go", "typescript", "javascript", "json", "jsonc"].includes(context.language)) return value;
  const normalizedPrefix = context.prefix.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (context.cursorOffset !== context.prefix.length) return overlap >= 2 ? undefined : value;
  const prefix = scan(normalizedPrefix, context.language);
  if (prefix === null || prefix.state !== "code") return overlap >= 2 ? undefined : value;
  const full = scan(normalizedPrefix + value, context.language);
  if (full === null || full.state !== "code") return overlap >= 2 ? undefined : value;
  const begin = normalizedPrefix.length + value.length - overlap;
  const closers = full.closes.filter((close) => close.offset >= begin);
  if (closers.length === 0) return value; // Matching punctuation was inside a literal/comment.
  if (closers.every((close) => close.opener !== null && close.opener >= normalizedPrefix.length)) return value;
  if (closers.every((close) => close.opener !== null && close.opener < normalizedPrefix.length)) {
    const suffix = context.suffix.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const original = scan(normalizedPrefix + value + suffix, context.language);
    const trimmed = scan(normalizedPrefix + value.slice(0, -overlap) + suffix, context.language);
    const balanced = (result: ReturnType<typeof scan>) => result !== null && result.state === "code" && result.remainingOpeners === 0 && result.closes.every((close) => close.opener !== null);
    // A prefix-owned closer can still be required: prefix may contain both an
    // inner and an outer opener, while the suffix closes only the outer one.
    if (balanced(original)) return value;
    if (original !== null && original.closes.some((close) => close.opener === null) && balanced(trimmed)) return value.slice(0, -overlap);
    return undefined;
  }
  return undefined; // Mixed ownership or unmatched delimiters: decline.
}
