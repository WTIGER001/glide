import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node24",
  outfile: "dist/extension.js",
  sourcemap: true,
  sourcesContent: false,
  logLevel: "info"
};

if (process.argv.includes("--watch")) {
  const buildContext = await context(options);
  await buildContext.watch();
} else {
  await build(options);
}
