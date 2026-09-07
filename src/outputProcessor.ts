import type { CompletionContext } from "./contextBuilder";

export interface OutputPolicy {
  readonly maxCompletionTokens: number;
  readonly maxLines?: number;
}

const LEAKAGE_PATTERN = /(?:<\/?GLIDE_(?:BEFORE|AFTER)>|<GLIDE_CURSOR\s*\/?>|Prompt-Version:|^(?:assistant|system|user)\s*:|\btool_call\b)/imu;
const PROSE_PREFIX = /^\s*(?:here(?:'s| is)|sure[,!: ]|the completion|explanation\s*:|i (?:would|suggest|can)|this code)/iu;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export function longestSuffixPrefixOverlap(left: string, right: string, minimum = 1): number {
  const maximum = Math.min(left.length, right.length);
  for (let length = maximum; length >= minimum; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) {
      return length;
    }
  }
  return 0;
}

function unwrapCodeFence(value: string): string | undefined {
  const match = value.match(/^\s*```[^\n\r]*\r?\n([\s\S]*?)\r?\n```\s*$/u);
  if (match === null) {
    return value.includes("```") ? undefined : value;
  }
  return match[1] ?? "";
}

function stripEchoedPrefix(value: string, context: CompletionContext): string {
  const wholePrefixOverlap = longestSuffixPrefixOverlap(context.prefix, value, 8);
  if (wholePrefixOverlap > 0) {
    return value.slice(wholePrefixOverlap);
  }
  const lineOverlap = longestSuffixPrefixOverlap(context.linePrefix, value, 1);
  if (lineOverlap === context.linePrefix.length || lineOverlap >= 3) {
    return value.slice(lineOverlap);
  }
  return value;
}

function normalizeIndentation(value: string, context: CompletionContext): string {
  const lines = value.split("\n");
  if (lines.length < 2) {
    return value;
  }
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") {
      continue;
    }
    const leading = line.match(/^[\t ]*/u)?.[0] ?? "";
    let columns = 0;
    for (const character of leading) {
      columns += character === "\t" ? context.tabSize - (columns % context.tabSize) : 1;
    }
    const normalized = context.insertSpaces
      ? " ".repeat(columns)
      : "\t".repeat(Math.floor(columns / context.tabSize)) + " ".repeat(columns % context.tabSize);
    lines[index] = normalized + line.slice(leading.length);
  }
  return lines.join("\n");
}

function containsRunawayRepetition(value: string): boolean {
  const meaningful = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = 2; index < meaningful.length; index += 1) {
    if (meaningful[index] === meaningful[index - 1] && meaningful[index] === meaningful[index - 2]) {
      return true;
    }
  }
  if (value.length >= 48 && value.length % 2 === 0) {
    const half = value.length / 2;
    return value.slice(0, half) === value.slice(half);
  }
  return false;
}

export function processCompletion(
  raw: string,
  context: CompletionContext,
  policy: OutputPolicy
): string | undefined {
  if (!/\S/u.test(raw) || CONTROL_CHARACTER.test(raw)) {
    return undefined;
  }
  const unwrapped = unwrapCodeFence(raw);
  if (unwrapped === undefined) {
    return undefined;
  }
  let value = unwrapped.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (LEAKAGE_PATTERN.test(value) || PROSE_PREFIX.test(value)) {
    return undefined;
  }

  value = stripEchoedPrefix(value, context);
  const suffixOverlap = longestSuffixPrefixOverlap(value, context.suffix);
  if (suffixOverlap > 0) {
    value = value.slice(0, -suffixOverlap);
  }
  value = value.replace(/[\t ]+$/gmu, "").replace(/\n{3,}$/u, "\n\n");
  if (!/\S/u.test(value)) {
    return undefined;
  }

  const maxCharacters = Math.min(4096, policy.maxCompletionTokens * 8);
  const maxLines = policy.maxLines ?? 20;
  if (value.length > maxCharacters || value.split("\n").length > maxLines || containsRunawayRepetition(value)) {
    return undefined;
  }
  value = normalizeIndentation(value, context);
  return /\S/u.test(value) ? value : undefined;
}

export function shouldStopStream(text: string, suffix: string, maxCompletionTokens: number): boolean {
  if (text.length >= Math.min(8192, maxCompletionTokens * 12)) {
    return true;
  }
  const overlap = longestSuffixPrefixOverlap(text, suffix);
  return overlap >= Math.min(8, Math.max(2, suffix.split("\n", 1)[0]?.length ?? 2));
}
