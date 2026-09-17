import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  // VS Code 1.82 embeds Node 16.14. Development tooling uses Node 24, but the
  // bundled extension must remain parseable by the minimum supported host.
  target: "node16.14",
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
