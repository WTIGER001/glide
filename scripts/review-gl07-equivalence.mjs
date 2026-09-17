// Supplemental representation comparison only; never executes captured programs.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import ts from "typescript";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/review-gl07-equivalence.mjs REVIEW_JSON NEW_OUTPUT_JSON");
const source = readFileSync(input, "utf8");
const review = JSON.parse(source);
await build({ entryPoints: ["src/benchmark/corpus.ts"], outfile: "dist/benchmark/corpus-review.cjs", bundle: true, platform: "node", format: "cjs", packages: "external" });
const { corpus, corpusHash } = createRequire(import.meta.url)("../dist/benchmark/corpus-review.cjs");
if (review.originalManifest?.corpusHash !== corpusHash) throw new Error("Wrong corpus.");
const cache = new Map();
function normalize(language, text) {
  const key = JSON.stringify([language, text]);
  if (cache.has(key)) return cache.get(key);
  let result = null;
  try {
    if (language === "go") result = execFileSync("gofmt", [], { input: text, encoding: "utf8", timeout: 5000, maxBuffer: 100000, stdio: ["pipe", "pipe", "pipe"] });
    if (language === "python") result = execFileSync("python3", ["-I", "-c", "import ast,sys; print(ast.dump(ast.parse(sys.stdin.read()), include_attributes=False))"], { input: text, encoding: "utf8", timeout: 5000, maxBuffer: 100000, stdio: ["pipe", "pipe", "pipe"] });
    if (language === "typescript") {
      const compiled = ts.transpileModule(text, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
      if (!compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) result = compiled.outputText;
    }
  } catch { /* Invalid syntax or unavailable parser remains unverified. */ }
  cache.set(key, result);
  return result;
}
const decisions = review.reviewQueue.map(row => {
  const entry = corpus.find(entry => entry.id === row.caseId);
  if (!entry || entry.expected === null) throw new Error("Unknown completion case.");
  const candidate = normalize(entry.context.language, row.reconstructed);
  const matches = candidate !== null && [entry.expected, ...entry.alternatives].some(insertion => candidate === normalize(entry.context.language, entry.context.prefix + insertion + entry.context.suffix));
  return { caseId: row.caseId, armId: row.armId, repetition: row.repetition, decision: matches ? "representation-equivalent-to-reference" : "unverified",
    method: entry.context.language === "go" ? "gofmt equality" : entry.context.language === "python" ? "Python AST equality" : entry.context.language === "typescript" ? "TypeScript emitted-JS equality; types unchecked" : "data equality already included in primary scoring" };
});
const report = { sourceReviewHash: createHash("sha256").update(source).digest("hex"), scriptHash: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
  note: "Supplemental post-hoc representation checks, not changes to the frozen primary score. No captured program was executed. Unmatched behavior remains unverified.", decisions,
  byArm: Object.fromEntries([...new Set(decisions.map(row => row.armId))].map(id => [id, { reviewed: decisions.filter(row => row.armId === id).length, representationMatches: decisions.filter(row => row.armId === id && row.decision === "representation-equivalent-to-reference").length }])) };
writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(report.byArm));
