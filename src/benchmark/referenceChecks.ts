import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Family } from "./types";
import { checkData } from "./dataChecks";

/** Execute only repository-authored references, never captured model output. */
export function checkReferences(families: readonly Family[]) {
  const directory = mkdtempSync(join(tmpdir(), "glide-references-"));
  const results: { family: string; variant: number; passed: boolean; detail: string }[] = [];
  try {
    for (const family of families) {
      if (family.abstain !== undefined) continue;
      const answer = /⟦([\s\S]*?)⟧/u.exec(family.template)?.[1];
      if (answer === undefined) throw new Error(`Missing reference: ${family.id}`);
      for (const [variant, insertion] of [answer, ...(family.alternatives ?? [])].entries()) {
        const program = family.template.replace(/⟦[\s\S]*?⟧/u, () => insertion);
        const data = checkData(family.language, program, family.checks);
        if (data !== null) {
          results.push({ family: family.id, variant, passed: data.syntaxValid && data.valueMatches, detail: JSON.stringify(data) });
          continue;
        }
        const source = program + "\n" + family.checks + "\n";
        const file = join(directory, family.language === "go" ? "main.go" : family.language === "python" ? "main.py" : "main.ts");
        writeFileSync(file, source);
        const options = { cwd: directory, timeout: 30_000, maxBuffer: 64 * 1024, encoding: "utf8" as const };
        try {
          if (family.language === "go") {
            execFileSync("go", ["run", file], { ...options, env: { ...process.env, GOTOOLCHAIN: "local", GOPROXY: "off", GOWORK: "off", GO111MODULE: "off", CGO_ENABLED: "0" } });
          } else if (family.language === "python") {
            execFileSync("python3", ["-I", file], options);
          } else {
            execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "--ignoreConfig", "--strict", "--skipLibCheck", "--types", "node", "--typeRoots", resolve("node_modules/@types"), "--target", "es2022", "--module", "commonjs", file], options);
            execFileSync(process.execPath, [join(directory, "main.js")], options);
          }
          results.push({ family: family.id, variant, passed: true, detail: "compiled/interpreted and assertions passed" });
        } catch (error) {
          // Only these trusted synthetic programs run here. Bounded compiler diagnostics are useful.
          results.push({ family: family.id, variant, passed: false, detail: error instanceof Error ? error.message.slice(0, 2000) : "Reference check failed" });
        }
      }
    }
    return results;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
