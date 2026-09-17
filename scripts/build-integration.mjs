import { build } from "esbuild";

await build({
  entryPoints: ["src/integration/index.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node16.14",
  outdir: "dist/test",
  outbase: "src/integration",
  sourcemap: false,
  logLevel: "info"
});
