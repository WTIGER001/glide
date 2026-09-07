import { describe, expect, it } from "vitest";
import { normalizeEndpoint } from "./configuration";

describe("normalizeEndpoint", () => {
  it("accepts HTTPS Responses URLs and strips query material", () => {
    expect(normalizeEndpoint("https://api.openai.com/v1/responses?secret=nope#fragment")).toBe(
      "https://api.openai.com/v1/responses"
    );
  });

  it("expands an API root to the Responses endpoint", () => {
    expect(normalizeEndpoint("https://example.test/v1/")).toBe("https://example.test/v1/responses");
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
