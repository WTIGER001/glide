import { describe, expect, it, vi } from "vitest";
import { DiagnosticLogger } from "./logger";

describe("DiagnosticLogger", () => {
  it("always writes sanitized important errors and rate-limits repeats", () => {
    const appendLine = vi.fn();
    let now = 100;
    const logger = new DiagnosticLogger({ appendLine } as never, () => false, () => now);

    const metadata = {
      status: 401,
      endpoint: "https://resource.services.ai.azure.com/api/projects/team/openai/v1/responses",
      authentication: "api-key",
      model: "team-deployment",
      apiKey: "must-not-appear"
    };
    logger.importantError("completion.authentication-failed", metadata);
    logger.importantError("completion.authentication-failed", metadata);
    now += 30_000;
    logger.importantError("completion.authentication-failed", metadata);

    expect(appendLine).toHaveBeenCalledTimes(2);
    expect(appendLine).toHaveBeenLastCalledWith(expect.stringContaining('"status":401'));
    expect(appendLine).toHaveBeenLastCalledWith(expect.stringContaining('"authentication":"api-key"'));
    expect(appendLine).toHaveBeenLastCalledWith(expect.stringContaining('"model":"team-deployment"'));
    expect(appendLine).toHaveBeenLastCalledWith(
      expect.stringContaining("https://resource.services.ai.azure.com/api/projects/team/openai/v1/responses")
    );
    expect(appendLine).not.toHaveBeenCalledWith(expect.stringContaining("must-not-appear"));
  });

  it("keeps routine diagnostics opt-in", () => {
    const appendLine = vi.fn();
    const logger = new DiagnosticLogger({ appendLine } as never, () => false);
    logger.event("completion.ready", { status: 200 });
    expect(appendLine).not.toHaveBeenCalled();
  });

  it("allows only explicitly safe numeric token and timing diagnostics", () => {
    const appendLine = vi.fn();
    const logger = new DiagnosticLogger({ appendLine } as never, () => true);
    logger.event("completion.ready", {
      inputTokens: 20,
      outputTokens: 4,
      firstTokenMs: 120,
      promptTokensRaw: 99,
      completionText: "secret"
    });
    const line = String(appendLine.mock.calls[0]?.[0]);
    expect(line).toContain('"inputTokens":20');
    expect(line).toContain('"outputTokens":4');
    expect(line).toContain('"firstTokenMs":120');
    expect(line).not.toContain("promptTokensRaw");
    expect(line).not.toContain("secret");
  });
});
