import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const experiment = process.argv.includes("--experiment");
const entry = experiment ? "experimentCli" : "cli";
await build({ entryPoints: [`src/benchmark/${entry}.ts`], outfile: `dist/benchmark/${entry}.cjs`, bundle: true,
  platform: "node", target: "node24", format: "cjs", packages: "external" });
const child = spawnSync(process.execPath, [`dist/benchmark/${entry}.cjs`, ...process.argv.slice(2).filter(arg => arg !== "--experiment")], { stdio: "inherit" });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
