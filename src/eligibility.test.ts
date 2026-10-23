import { describe, expect, it } from "vitest";
import { globMatches, protectedPath } from "./eligibility";

describe("eligibility path protection", () => {
  it.each([
    "/work/.env.local",
    "/work/private.pem",
    "/work/id_rsa.pub",
    "/work/id_ed25519",
    "/work/id_ecdsa_sk",
    "/work/.npmrc",
    "/work/.pypirc",
    "/work/.netrc",
    "/work/.ssh/custom-key",
    "/work/.aws/config",
    "/work/.kube/config",
    "/users/example/.config/glide/apikey",
    "/work/package-lock.json",
    "/work/node_modules/pkg/index.ts",
    "/work/dist/bundle.js",
    "/work/app.min.js"
  ])("protects %s", (filePath) => {
    expect(protectedPath(filePath)).toBe(true);
  });

  it("does not block ordinary source files", () => {
    expect(protectedPath("/work/cmd/server/main.go")).toBe(false);
  });

  it("matches workspace-relative glob patterns", () => {
    expect(globMatches("generated/api/client.go", "generated/**")).toBe(true);
    expect(globMatches("src/demo.test.ts", "src/*.test.ts")).toBe(true);
    expect(globMatches("src/nested/demo.test.ts", "src/*.test.ts")).toBe(false);
    expect(globMatches("demo.test.ts", "**/*.test.ts")).toBe(true);
    expect(globMatches("src/demo.test.ts", "**/*.test.ts")).toBe(true);
  });
});
