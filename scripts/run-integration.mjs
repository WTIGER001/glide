import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await runTests({
  version: "1.82.0",
  extensionDevelopmentPath: repositoryRoot,
  extensionTestsPath: path.join(repositoryRoot, "dist", "test", "index.js"),
  launchArgs: ["--disable-extensions"]
});
