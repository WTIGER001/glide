import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runTests } from "@vscode/test-electron";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Never load a developer's real credential file into the test extension host.
const testDirectory = await mkdtemp(path.join(tmpdir(), "glide-test-host-"));
try {
  const configDirectory = path.join(testDirectory, "config");
  const keyDirectory = path.join(configDirectory, "glide");
  const keyTarget = path.join(testDirectory, "managed-credential");
  await mkdir(keyDirectory, { recursive: true });
  await writeFile(keyTarget, "synthetic-integration-key\n", { mode: 0o600 });
  await symlink(keyTarget, path.join(keyDirectory, "apikey"));
  await runTests({
    version: process.env.GLIDE_VSCODE_VERSION || "1.82.0",
    // Release validation can point this at an extracted VSIX extension directory.
    extensionDevelopmentPath: process.env.GLIDE_TEST_EXTENSION_PATH || repositoryRoot,
    extensionTestsPath: path.join(repositoryRoot, "dist", "test", "index.js"),
    extensionTestsEnv: {
      XDG_CONFIG_HOME: configDirectory,
      OPENAI_API_KEY: "synthetic-integration-key",
      GLIDE_TEST_KEY_TARGET: keyTarget
    },
    launchArgs: ["--disable-extensions", "--user-data-dir", path.join(testDirectory, "profile")]
  });
} finally {
  await rm(testDirectory, { recursive: true, force: true });
}
