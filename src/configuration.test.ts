import { afterEach, describe, expect, it } from "vitest";
import { normalizeEndpoint, readConfiguration } from "./configuration";
import { setMockConfiguration } from "./test/vscodeMock";

afterEach(() => {
  setMockConfiguration({});
});

describe("normalizeEndpoint", () => {
  it("accepts HTTPS Responses URLs and strips query material", () => {
    expect(normalizeEndpoint("https://api.openai.com/v1/responses?secret=nope#fragment")).toBe(
      "https://api.openai.com/v1/responses"
    );
  });

  it("expands an API root to the Responses endpoint", () => {
    expect(normalizeEndpoint("https://example.test/v1/")).toBe("https://example.test/v1/responses");
  });

  it("expands an AI Foundry project base URL to its OpenAI Responses endpoint", () => {
    expect(normalizeEndpoint("https://resource.services.ai.azure.com/api/projects/my-project/")).toBe(
      "https://resource.services.ai.azure.com/api/projects/my-project/openai/v1/responses"
    );
  });

  it("accepts an Azure OpenAI v1 base URL", () => {
    expect(normalizeEndpoint("https://resource.openai.azure.com/openai/v1/")).toBe(
      "https://resource.openai.azure.com/openai/v1/responses"
    );
  });

  it("uses the configured base URL in preference to the legacy endpoint", () => {
    setMockConfiguration({
      baseUrl: "https://resource.services.ai.azure.com/api/projects/my-project",
      endpoint: "https://legacy.example/v1/responses"
    });
    expect(readConfiguration().endpoint).toBe(
      "https://resource.services.ai.azure.com/api/projects/my-project/openai/v1/responses"
    );
  });

  it("continues to use an explicitly configured legacy endpoint", () => {
    setMockConfiguration({ endpoint: "https://legacy.example/v1/responses" });
    expect(readConfiguration().endpoint).toBe("https://legacy.example/v1/responses");
  });

  it("sends a configured deployment name instead of the preset model", () => {
    setMockConfiguration({ model: "gpt-5.6-luna", modelOverride: "team-gpt-5-6-deployment" });
    expect(readConfiguration().model).toBe("team-gpt-5-6-deployment");
  });

  it("allows plaintext HTTP only for loopback development", () => {
    expect(normalizeEndpoint("http://localhost:4000/v1/responses")).toBe("http://localhost:4000/v1/responses");
    expect(normalizeEndpoint("http://example.test/v1/responses")).toBeUndefined();
  });

  it("fails closed for malformed and empty values", () => {
    expect(normalizeEndpoint("not a URL")).toBeUndefined();
    expect(normalizeEndpoint("https://user:secret@example.test/v1/responses")).toBeUndefined();
    expect(normalizeEndpoint(42)).toBeUndefined();
    expect(normalizeEndpoint("")).toBeUndefined();
  });
});
