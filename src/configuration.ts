import * as vscode from "vscode";
import {
  CONFIG_SECTION,
  REASONING_EFFORTS,
  SUPPORTED_MODELS,
  type GlideModel,
  type ReasoningEffort
} from "./constants";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";

export interface GlideConfiguration {
  readonly enabled: boolean;
  readonly endpoint: string | undefined;
  readonly model: GlideModel;
  readonly debounceMs: number;
  readonly maxPrefixChars: number;
  readonly maxSuffixChars: number;
  readonly maxCompletionTokens: number;
  readonly reasoningEffort: ReasoningEffort;
  readonly requestTimeoutMs: number;
  readonly excludePatterns: readonly string[];
  readonly allowSensitiveFiles: boolean;
  readonly cacheCapacity: number;
  readonly diagnosticLogging: boolean;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeEndpoint(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const candidate = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return undefined;
  }

  const localhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(localhost && parsed.protocol === "http:")) {
    return undefined;
  }

  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (parsed.pathname.endsWith("/v1")) {
    parsed.pathname += "/responses";
  }
  if (parsed.pathname === "") {
    parsed.pathname = "/v1/responses";
  }
  return parsed.toString().replace(/\/$/, "");
}

export function readConfiguration(resource?: vscode.Uri): GlideConfiguration {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, resource);
  const rawPatterns = config.get<unknown>("excludePatterns", []);
  const excludePatterns = Array.isArray(rawPatterns)
    ? rawPatterns.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];

  return {
    enabled: config.get<boolean>("enabled", true),
    endpoint: normalizeEndpoint(config.get<unknown>("endpoint", DEFAULT_ENDPOINT)),
    model: enumValue(config.get<unknown>("model"), SUPPORTED_MODELS, "gpt-5.6-luna"),
    debounceMs: boundedInteger(config.get<unknown>("debounceMs"), 175, 75, 1000),
    maxPrefixChars: boundedInteger(config.get<unknown>("maxPrefixChars"), 24_000, 1000, 100_000),
    maxSuffixChars: boundedInteger(config.get<unknown>("maxSuffixChars"), 6000, 0, 50_000),
    maxCompletionTokens: boundedInteger(config.get<unknown>("maxCompletionTokens"), 96, 16, 256),
    reasoningEffort: enumValue(config.get<unknown>("reasoningEffort"), REASONING_EFFORTS, "none"),
    requestTimeoutMs: boundedInteger(config.get<unknown>("requestTimeoutMs"), 8000, 1000, 30_000),
    excludePatterns,
    allowSensitiveFiles: config.get<boolean>("allowSensitiveFiles", false),
    cacheCapacity: boundedInteger(config.get<unknown>("cacheCapacity"), 64, 1, 512),
    diagnosticLogging: config.get<boolean>("diagnosticLogging", false)
  };
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update("enabled", enabled, vscode.ConfigurationTarget.Global);
}
