import type { GlideModel, ReasoningEffort } from "./constants";
import { shouldStopStream } from "./outputProcessor";

export type ResponseStatus = "completed" | "incomplete" | "failed" | "cancelled";

export interface CompletionUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface ResponsesCompletionRequest {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: GlideModel;
  readonly instructions: string;
  readonly input: string;
  readonly reasoningEffort: ReasoningEffort;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly suffix: string;
}

export interface ResponsesCompletionResult {
  readonly status: ResponseStatus;
  readonly text: string;
  readonly usage: CompletionUsage;
  readonly timeToFirstTokenMs?: number;
  readonly earlyStopped: boolean;
}

export class ResponsesApiError extends Error {
  public constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly timedOut = false
  ) {
    super(message);
    this.name = "ResponsesApiError";
  }
}

interface ParsedResponse {
  readonly status: ResponseStatus;
  readonly text: string;
  readonly usage: CompletionUsage;
}

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responseStatus(value: unknown): ResponseStatus {
  return value === "completed" || value === "incomplete" || value === "failed" || value === "cancelled"
    ? value
    : "failed";
}

function parseUsage(value: unknown): CompletionUsage {
  if (!isRecord(value)) {
    return {};
  }
  const result: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
  if (typeof value.input_tokens === "number") {
    result.inputTokens = value.input_tokens;
  }
  if (typeof value.output_tokens === "number") {
    result.outputTokens = value.output_tokens;
  }
  if (typeof value.total_tokens === "number") {
    result.totalTokens = value.total_tokens;
  }
  return result;
}

function outputTextFromItems(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("");
}

export function parseNonStreamingResponse(payload: unknown): ParsedResponse {
  if (!isRecord(payload)) {
    return { status: "failed", text: "", usage: {} };
  }
  const text = typeof payload.output_text === "string" ? payload.output_text : outputTextFromItems(payload.output);
  return { status: responseStatus(payload.status), text, usage: parseUsage(payload.usage) };
}

interface StreamAccumulator {
  text: string;
  doneText: string;
  status: ResponseStatus | undefined;
  usage: CompletionUsage;
  firstTokenAt: number | undefined;
}

function applyStreamPayload(payload: unknown, accumulator: StreamAccumulator, now: () => number): void {
  if (!isRecord(payload) || typeof payload.type !== "string") {
    return;
  }
  if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") {
    if (payload.delta !== "" && accumulator.firstTokenAt === undefined) {
      accumulator.firstTokenAt = now();
    }
    accumulator.text += payload.delta;
    return;
  }
  if (payload.type === "response.output_text.done" && typeof payload.text === "string") {
    accumulator.doneText = payload.text;
    return;
  }
  if (
    payload.type === "response.completed" ||
    payload.type === "response.incomplete" ||
    payload.type === "response.failed"
  ) {
    const response = isRecord(payload.response) ? payload.response : payload;
    accumulator.status = responseStatus(response.status);
    accumulator.usage = parseUsage(response.usage);
    if (accumulator.text === "") {
      accumulator.text = typeof response.output_text === "string" ? response.output_text : outputTextFromItems(response.output);
    }
  }
}

function parseSseBlock(block: string): unknown[] {
  const payloads: unknown[] = [];
  const dataLines = block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) {
    return payloads;
  }
  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    return payloads;
  }
  try {
    payloads.push(JSON.parse(data) as unknown);
  } catch {
    // Malformed or unknown compatible-server frames are ignored. Never expose their content in logs.
  }
  return payloads;
}

async function readStreamingResponse(
  body: ReadableStream<Uint8Array>,
  request: ResponsesCompletionRequest,
  controller: AbortController,
  startedAt: number,
  now: () => number
): Promise<ResponsesCompletionResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const accumulator: StreamAccumulator = { text: "", doneText: "", status: undefined, usage: {}, firstTokenAt: undefined };
  let buffer = "";
  let earlyStopped = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/u);
        if (boundary < 0) {
          break;
        }
        const block = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/u)?.[0] ?? "\n\n";
        buffer = buffer.slice(boundary + separator.length);
        for (const payload of parseSseBlock(block)) {
          applyStreamPayload(payload, accumulator, now);
        }
        if (shouldStopStream(accumulator.text, request.suffix, request.maxOutputTokens)) {
          earlyStopped = true;
          await reader.cancel("safe completion boundary reached");
          controller.abort("safe completion boundary reached");
          break;
        }
      }
      if (earlyStopped) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const text = accumulator.text || accumulator.doneText;
  const status = earlyStopped ? "completed" : (accumulator.status ?? "failed");
  return {
    status,
    text,
    usage: accumulator.usage,
    ...(accumulator.firstTokenAt === undefined ? {} : { timeToFirstTokenMs: accumulator.firstTokenAt - startedAt }),
    earlyStopped
  };
}

export class OpenAIResponsesClient {
  public constructor(
    private readonly fetchImplementation: FetchLike = fetch,
    private readonly now: () => number = () => performance.now()
  ) {}

  public async complete(request: ResponsesCompletionRequest, signal: AbortSignal): Promise<ResponsesCompletionResult> {
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = (): void => controller.abort(signal.reason);
    signal.addEventListener("abort", forwardAbort, { once: true });
    if (signal.aborted) {
      controller.abort(signal.reason);
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort("request timeout");
    }, request.timeoutMs);
    const startedAt = this.now();

    try {
      const response = await this.fetchImplementation(request.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json"
        },
        body: JSON.stringify({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          reasoning: { effort: request.reasoningEffort },
          max_output_tokens: request.maxOutputTokens,
          temperature: 0.2,
          store: false,
          stream: true,
          text: { verbosity: "low" }
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.body !== null) {
          await response.body.cancel().catch(() => undefined);
        }
        throw new ResponsesApiError(`Responses API returned HTTP ${response.status}.`, response.status);
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("text/event-stream") && response.body !== null) {
        return await readStreamingResponse(response.body, request, controller, startedAt, this.now);
      }
      const parsed = parseNonStreamingResponse((await response.json()) as unknown);
      return { ...parsed, earlyStopped: false };
    } catch (error) {
      if (error instanceof ResponsesApiError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new ResponsesApiError(timedOut ? "Responses request timed out." : "Responses request cancelled.", undefined, timedOut);
      }
      throw new ResponsesApiError("Responses request failed.");
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", forwardAbort);
    }
  }
}
