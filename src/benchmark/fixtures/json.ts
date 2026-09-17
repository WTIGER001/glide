import type { Family } from "../types";

function json(id: string, split: Family["split"], category: string, template: string, typed: number, expected: unknown, alternatives?: readonly string[]): Family {
  return { id: `json-${id}`, language: "json", split, category, template, typed, checks: JSON.stringify(expected), ...(alternatives === undefined ? {} : { alternatives }) };
}

export const jsonFamilies: readonly Family[] = [
  { ...json("contract-timeout", "development", "intent-contract", '{"description":"Timeout in milliseconds; use 1500.","timeoutMs":⟦1500⟧}', 2, { description: "Timeout in milliseconds; use 1500.", timeoutMs: 1500 }), evaluation: "contract" },
  json("boolean", "development", "partial-value", '{"enabled": ⟦true⟧}', 2, { enabled: true }),
  json("nested", "development", "auto-closer", '{"server": ⟦{"port": 8080}⟧}', 2, { server: { port: 8080 } }),
  json("array", "holdout", "array", '{"ports": [⟦8080, 9090⟧]}', 3, { ports: [8080, 9090] }),
  json("escape", "development", "escaped-string", '{"label": "⟦say \\"hi\\"⟧"}', 2, { label: 'say "hi"' }),
  json("null", "development", "partial-value", '{"next": ⟦null⟧}', 2, { next: null }),
  json("number", "holdout", "number", '{"scale": ⟦1.25e2⟧}', 2, { scale: 125 }, ["125.0"]),
  json("multiline", "development", "nested-block", '{\n  "task": ⟦{\n    "name": "build",\n    "enabled": true\n  }⟧\n}', 2, { task: { name: "build", enabled: true } }),
  json("unicode", "development", "unicode", '{"name": "⟦café🌍⟧"}', 2, { name: "café🌍" }),
  json("member", "holdout", "mid-line", '{"width": 10, ⟦"height": 20⟧, "unit": "px"}', 3, { width: 10, height: 20, unit: "px" }),
  json("crlf", "development", "crlf", '{\r\n  "items": ⟦[\r\n    1,\r\n    2\r\n  ]⟧\r\n}', 2, { items: [1, 2] }),
  { ...json("unknown-enum", "development", "abstention", '{"mode": "⟦CUSTOM_MODE⟧"}', 2, null), abstain: "No schema or evidence for a private enum value; conservative abstention policy." },
  { ...json("unknown-field", "holdout", "unknown-dependency", '{"plugin": {"⟦PrivateOption⟧": true}}', 2, null), abstain: "No plugin schema supplied; do not invent a field name." }
];
