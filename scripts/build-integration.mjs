import { build } from "esbuild";

await build({
  entryPoints: ["src/integration/index.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  outdir: "dist/test",
  outbase: "src/integration",
  sourcemap: false,
  logLevel: "info"
});
