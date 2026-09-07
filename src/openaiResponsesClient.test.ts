import { describe, expect, it, vi } from "vitest";
import {
  OpenAIResponsesClient,
  ResponsesApiError,
  parseNonStreamingResponse,
  type ResponsesCompletionRequest
} from "./openaiResponsesClient";

function request(overrides: Partial<ResponsesCompletionRequest> = {}): ResponsesCompletionRequest {
  return {
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "test-key",
    authentication: "bearer",
    model: "gpt-5.6-luna",
    instructions: "Return only code.",
    input: "<GLIDE_BEFORE>x</GLIDE_BEFORE>",
    reasoningEffort: "none",
    maxOutputTokens: 96,
    timeoutMs: 1000,
    suffix: "\n}",
    ...overrides
  };
}

function sseResponse(blocks: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = blocks.map((block) => `data: ${JSON.stringify(block)}\n\n`).join("");
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      }
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

describe("OpenAIResponsesClient", () => {
  it("extracts non-streaming output without assuming output[0]", () => {
    expect(
      parseNonStreamingResponse({
        status: "completed",
        output: [
          { type: "reasoning", content: [] },
          { type: "message", content: [{ type: "output_text", text: "value" }] }
        ],
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 }
      })
    ).toEqual({ status: "completed", text: "value", usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } });
  });

  it("sends the privacy and latency controls and accumulates a private stream", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (typeof init?.body !== "string") {
        throw new Error("Expected a JSON string request body.");
      }
      sentBody = JSON.parse(init.body) as Record<string, unknown>;
      return Promise.resolve(sseResponse([
        { type: "response.output_text.delta", delta: "intln(\"hi\")" },
        {
          type: "response.completed",
          response: { status: "completed", usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } }
        }
      ]));
    }) as typeof fetch;
    const client = new OpenAIResponsesClient(fetchMock, () => 100);
    const result = await client.complete(request({ suffix: "" }), new AbortController().signal);
    expect(result.status).toBe("completed");
    expect(result.text).toBe("intln(\"hi\")");
    expect(result.usage.totalTokens).toBe(25);
    expect(sentBody).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      stream: true,
      max_output_tokens: 96,
      reasoning: { effort: "none" },
      text: { verbosity: "low" }
    });
    expect(sentBody).not.toHaveProperty("tools");
    expect(sentBody).not.toHaveProperty("metadata");
  });

  it("uses Azure's api-key header when configured", async () => {
    let sentHeaders: Headers | undefined;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      sentHeaders = new Headers(init?.headers);
      return Promise.resolve(sseResponse([{ type: "response.completed", response: { status: "completed" } }]));
    }) as typeof fetch;
    await new OpenAIResponsesClient(fetchMock).complete(request({ authentication: "api-key" }), new AbortController().signal);
    expect(sentHeaders?.get("api-key")).toBe("test-key");
    expect(sentHeaders?.get("authorization")).toBeNull();
  });

  it("stops upstream once generated text overlaps the suffix", async () => {
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(sseResponse([
        { type: "response.output_text.delta", delta: "value\n}" },
        { type: "response.output_text.delta", delta: "trailing" }
      ]))
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request(), new AbortController().signal);
    expect(result).toMatchObject({ status: "completed", text: "value\n}", earlyStopped: true });
  });

  it("classifies HTTP failures without reading response content into the error", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("SECRET RESPONSE", { status: 401 }))) as typeof fetch;
    const client = new OpenAIResponsesClient(fetchMock);
    await expect(client.complete(request(), new AbortController().signal)).rejects.toMatchObject({
      name: "ResponsesApiError",
      statusCode: 401,
      message: "Responses API returned HTTP 401."
    });
  });

  it("maps caller cancellation to normal control flow", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        })
    ) as typeof fetch;
    const controller = new AbortController();
    const pending = new OpenAIResponsesClient(fetchMock).complete(request(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ResponsesApiError);
    await expect(pending).rejects.toMatchObject({ timedOut: false });
  });
});
