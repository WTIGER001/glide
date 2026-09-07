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
});
