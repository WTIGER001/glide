import type { Family } from "../types";

function yaml(id: string, split: Family["split"], category: string, template: string, typed: number, expected: unknown, alternatives?: readonly string[]): Family {
  return { id: `yaml-${id}`, language: "yaml", split, category, template, typed, checks: JSON.stringify(expected), ...(alternatives === undefined ? {} : { alternatives }) };
}
const farPadding = Array.from({ length: 180 }, (_, index) => `# unrelated padding line ${index.toString().padStart(3, "0")} keeps the anchor outside a small adjacent window.`).join("\n");

export const yamlFamilies: readonly Family[] = [
  { ...yaml("contract-retries", "development", "intent-contract", "# Retry exactly five times before failing.\nworker:\n  ⟦retries: 5⟧\n", 4, { worker: { retries: 5 } }), evaluation: "contract" },
  { ...yaml("far-anchor", "development", "same-file-context", `defaults: &defaults\n  retries: 5\n\n${farPadding}\n\n# Reuse the defaults mapping for worker.\nworker: ⟦*defaults⟧\n`, 3, { defaults: { retries: 5 }, worker: { retries: 5 } }), evaluation: "contract" },
  yaml("boolean", "development", "partial-value", "# Enable this service.\nenabled: ⟦true⟧\n", 2, { enabled: true }),
  yaml("nested", "development", "indentation", "# Use port 8080 on localhost.\nserver:\n  ⟦host: localhost\n  port: 8080⟧\n", 3, { server: { host: "localhost", port: 8080 } }),
  yaml("sequence", "holdout", "array", "# Run lint then test.\nsteps:\n  ⟦- lint\n  - test⟧\n", 3, { steps: ["lint", "test"] }),
  yaml("quoted", "development", "quoted-scalar", "# Literal label including colon and hash.\nlabel: ⟦'build: #1'⟧\n", 2, { label: "build: #1" }, ['"build: #1"']),
  yaml("block", "development", "block-scalar", "# Script prints ready on its second line.\nscript: |\n  ⟦set -eu\n  echo ready⟧\n", 3, { script: "set -eu\necho ready\n" }),
  yaml("flow", "holdout", "auto-closer", "# Expose ports 80 and 443.\nports: [⟦80, 443⟧]\n", 2, { ports: [80, 443] }),
  yaml("alias", "development", "same-file-reference", "defaults: &defaults\n  retries: 3\nworker: ⟦*defaults⟧\n", 3, { defaults: { retries: 3 }, worker: { retries: 3 } }),
  yaml("unicode", "development", "unicode", "label: '⟦café🌍⟧'\n", 2, { label: "café🌍" }),
  yaml("folded", "holdout", "folded-scalar", "description: >-\n  ⟦hello\n  world⟧\n", 2, { description: "hello world" }),
  yaml("crlf", "development", "crlf", "# Retry three times.\r\nworker:\r\n  ⟦retries: 3⟧\r\n", 3, { worker: { retries: 3 } }),
  { ...yaml("unknown-enum", "development", "abstention", "# Private plugin modes are not documented here.\nmode: ⟦custom_mode⟧\n", 2, null), abstain: "Unknown private enum; no safe value established." },
  { ...yaml("unknown-field", "holdout", "unknown-dependency", "# Plugin schema is unavailable.\nplugin:\n  ⟦privateOption⟧: true\n", 2, null), abstain: "Unknown configuration field; abstain rather than invent." }
];
