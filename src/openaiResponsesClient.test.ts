import { describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
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

function rawSseResponse(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      }
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a TCP test server.");
  }
  return address.port;
}

async function close(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
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
        usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 6, cache_write_tokens: 4 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 1 }, total_tokens: 12 }
      })
    ).toEqual({ status: "completed", text: "value", usage: { inputTokens: 10, cachedInputTokens: 6, cacheWriteInputTokens: 4, outputTokens: 2, reasoningOutputTokens: 1, totalTokens: 12 } });
  });

  it("sends the privacy and latency controls and accumulates a private stream", async () => {
    let sentBody: Record<string, unknown> | undefined;
    let sentRedirect: RequestRedirect | undefined;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (typeof init?.body !== "string") {
        throw new Error("Expected a JSON string request body.");
      }
      sentBody = JSON.parse(init.body) as Record<string, unknown>;
      sentRedirect = init.redirect;
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
    expect(sentRedirect).toBe("error");
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

  it("never forwards either credential form or source context across redirects", async () => {
    const received: Array<{ authorization?: string; apiKey?: string; body: string }> = [];
    const destination = createServer((incoming, response) => {
      let body = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk: string) => {
        body += chunk;
      });
      incoming.on("end", () => {
        received.push({
          ...(incoming.headers.authorization === undefined ? {} : { authorization: incoming.headers.authorization }),
          ...(incoming.headers["api-key"] === undefined ? {} : { apiKey: String(incoming.headers["api-key"]) }),
          body
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "completed", output_text: "bad" }));
      });
    });
    const destinationPort = await listen(destination);
    let redirectStatus = 307;
    const source = createServer((_incoming, response) => {
      response.writeHead(redirectStatus, { location: `http://127.0.0.1:${destinationPort}/stolen` });
      response.end();
    });
    const sourcePort = await listen(source);

    try {
      for (const status of [301, 302, 303, 307, 308]) {
        redirectStatus = status;
        for (const authentication of ["bearer", "api-key"] as const) {
          await expect(
            new OpenAIResponsesClient().complete(
              request({
                endpoint: `http://127.0.0.1:${sourcePort}/responses`,
                authentication,
                apiKey: "synthetic-secret",
                input: "synthetic-source"
              }),
              new AbortController().signal
            )
          ).rejects.toMatchObject({
            name: "ResponsesApiError",
            message: "Responses endpoint redirected. Configure the final endpoint URL."
          });
        }
      }
      expect(received).toEqual([]);
    } finally {
      await Promise.all([close(source), close(destination)]);
    }
  });

  it("does not manufacture a completed response from a suffix match", async () => {
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(sseResponse([
        { type: "response.output_text.delta", delta: "value\n}" },
        { type: "response.output_text.delta", delta: "trailing" }
      ]))
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request(), new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", text: "value\n}trailing", earlyStopped: false });
  });

  it.each([1, 2, 7, 1024])("waits for terminal status across nested braces with %i-byte chunks", async (size) => {
    const blocks = [
      { type: "response.output_text.delta", delta: 'if (ok) {\n run("世界");\n}' },
      { type: "response.output_text.delta", delta: "\nnext();" },
      { type: "response.incomplete", response: { status: "incomplete", usage: { output_tokens: 96 } } }
    ];
    const bytes = new TextEncoder().encode(blocks.map((block) => `data: ${JSON.stringify(block)}\r\n\r\n`).join(""));
    const chunks = Array.from({ length: Math.ceil(bytes.length / size) }, (_, i) => bytes.slice(i * size, (i + 1) * size));
    const result = await new OpenAIResponsesClient(vi.fn(() => Promise.resolve(rawSseResponse(chunks)))).complete(request(), new AbortController().signal);
    expect(result).toMatchObject({ status: "incomplete", text: 'if (ok) {\n run("世界");\n}\nnext();', earlyStopped: false, usage: { outputTokens: 96 } });
  });

  it("does not stop on a whitespace-only suffix overlap", async () => {
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(sseResponse([
        { type: "response.output_text.delta", delta: "if err != nil {\n\t" },
        { type: "response.output_text.delta", delta: "return err\n}" },
        { type: "response.completed", response: { status: "completed" } }
      ]))
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(
      request({ suffix: "\n\treturn result\n}" }),
      new AbortController().signal
    );
    expect(result).toMatchObject({
      status: "completed",
      text: "if err != nil {\n\treturn err\n}",
      earlyStopped: false
    });
  });

  it("parses CRLF frames and multibyte text split across byte chunks", async () => {
    const bytes = new TextEncoder().encode(
      'data: {"type":"response.output_text.delta","delta":"世界"}\r\n\r\n' +
        'data: {"type":"response.completed","response":{"status":"completed"}}\r\n\r\n'
    );
    const worldStart = bytes.findIndex((byte) => byte >= 0x80);
    const chunks = [bytes.slice(0, worldStart + 1), bytes.slice(worldStart + 1, worldStart + 4), bytes.slice(worldStart + 4)];
    const fetchMock = vi.fn(() => Promise.resolve(rawSseResponse(chunks))) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request({ suffix: "" }), new AbortController().signal);
    expect(result).toMatchObject({ status: "completed", text: "世界", earlyStopped: false });
  });

  it("rejects an incomplete stream even when it contains candidate text", async () => {
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(sseResponse([{ type: "response.output_text.delta", delta: "looksValid()" }]))
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request({ suffix: "" }), new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", text: "looksValid()", earlyStopped: false });
  });

  it("parses a final SSE frame without a blank-line terminator", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(
        rawSseResponse([
          encoder.encode('data: {"type":"response.output_text.delta","delta":"ok"}\n\n'),
          encoder.encode('data: {"type":"response.completed","response":{"status":"completed"}}')
        ])
      )
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request({ suffix: "" }), new AbortController().signal);
    expect(result).toMatchObject({ status: "completed", text: "ok" });
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

  it("distinguishes request timeout from caller cancellation", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        })
    ) as typeof fetch;
    const pending = new OpenAIResponsesClient(fetchMock).complete(
      request({ timeoutMs: 1000 }),
      new AbortController().signal
    );
    const rejection = expect(pending).rejects.toMatchObject({
      timedOut: true,
      message: "Responses request timed out."
    });
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    vi.useRealTimers();
  });

  it("uses a completed JSON response without issuing a silent retry", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "completed", output_text: "value" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request(), new AbortController().signal);
    expect(result).toMatchObject({ status: "completed", text: "value", earlyStopped: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed SSE data without treating it as candidate text", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        rawSseResponse([
          encoder.encode("data: {not-json}\n\n"),
          encoder.encode('data: {"type":"response.completed","response":{"status":"completed"}}\n\n')
        ])
      )
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request({ suffix: "" }), new AbortController().signal);
    expect(result).toMatchObject({ status: "completed", text: "", earlyStopped: false });
  });

  it("closes a real loopback request when the caller cancels", async () => {
    let observeRequest: (() => void) | undefined;
    let observeClose: (() => void) | undefined;
    const requestObserved = new Promise<void>((resolve) => {
      observeRequest = resolve;
    });
    const connectionClosed = new Promise<void>((resolve) => {
      observeClose = resolve;
    });
    const server = createServer((_incoming, response) => {
      observeRequest?.();
      response.on("close", () => observeClose?.());
    });
    const port = await listen(server);
    const controller = new AbortController();
    const pending = new OpenAIResponsesClient().complete(
      request({ endpoint: `http://127.0.0.1:${port}/responses`, timeoutMs: 2000 }),
      controller.signal
    );
    await requestObserved;
    controller.abort("test cancellation");
    await expect(pending).rejects.toMatchObject({ timedOut: false, message: "Responses request cancelled." });
    await connectionClosed;
    await close(server);
  });

  it("does not convert a failed stream event into a successful completion", async () => {
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(
        sseResponse([
          { type: "response.output_text.delta", delta: "candidate()" },
          { type: "response.failed", response: { status: "failed" } }
        ])
      )
    ) as typeof fetch;
    const result = await new OpenAIResponsesClient(fetchMock).complete(request({ suffix: "" }), new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", text: "candidate()", earlyStopped: false });
  });
});
