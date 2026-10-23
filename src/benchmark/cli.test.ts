import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("makes the strict CLI fail for a broken processor while experimental reporting stays permissive", async () => {
  const directory = mkdtempSync(join(tmpdir(), "glide-gate-test-"));
  try {
    const outfile = join(directory, "cli.cjs");
    await build({
      entryPoints: ["src/benchmark/cli.ts"], outfile, bundle: true, platform: "node", format: "cjs", packages: "external", logLevel: "silent",
      plugins: [{ name: "simulate-processor-regression", setup(builder) {
        builder.onLoad({ filter: /[/\\]src[/\\]outputProcessor\.ts$/ }, (args) => ({
          loader: "ts",
          contents: readFileSync(args.path, "utf8").replace("return /\\S/u.test(value) ? value : undefined;", 'return /\\S/u.test(value) ? "BROKEN???" : undefined;')
        }));
      } }]
    });
    for (const strict of [false, true]) {
      const reportPath = join(directory, `${strict}.json`);
      const child = spawnSync(process.execPath, [outfile, "--cases", "json-multiline-hole", "--functional", "--syntax", "--out", reportPath,
        ...(strict ? ["--strict"] : [])], {
        encoding: "utf8", timeout: 10_000, env: { ...process.env, NODE_PATH: resolve("node_modules") }
      });
      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(strict ? 1 : 0);
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
        validationFailures: string[]; changedReferences: Array<{ passed: boolean }>; syntax: Array<{ processed: { valid: boolean } }>;
      };
      expect(report.changedReferences.some((row) => !row.passed)).toBe(true);
      expect(report.syntax.some((row) => !row.processed.valid)).toBe(true);
      expect(report.validationFailures.length > 0).toBe(strict);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
