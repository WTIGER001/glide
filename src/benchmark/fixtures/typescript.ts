import type { Family } from "../types";

function ts(id: string, split: Family["split"], category: string, template: string, typed: number, checks: string, alternatives?: readonly string[]): Family {
  return { id: `ts-${id}`, language: "typescript", split, category, template, typed, checks, ...(alternatives === undefined ? {} : { alternatives }) };
}
const farPadding = Array.from({ length: 180 }, (_, index) => `// unrelated padding line ${index.toString().padStart(3, "0")} keeps the declaration outside a small adjacent window.`).join("\n");

export const typescriptFamilies: readonly Family[] = [
  { ...ts("contract-clamp", "development", "intent-contract", "/** Clamp n to the inclusive [lo, hi] interval. */\nfunction subject(n: number, lo: number, hi: number): number {\n  return ⟦Math.min(hi, Math.max(lo, n))⟧;\n}\n", 4,
    'if (subject(-1, 0, 5) !== 0 || subject(9, 0, 5) !== 5 || subject(3, 0, 5) !== 3) throw new Error("clamp");'), evaluation: "contract" },
  { ...ts("far-helper", "development", "same-file-context", `function helper(n: number): number { return n * 2; }\n\n${farPadding}\n\n/** Return helper(n) plus one. */\nfunction subject(n: number): number {\n  return ⟦helper(n) + 1⟧;\n}\n`, 3,
    'if (subject(3) !== 7 || subject(0) !== 1) throw new Error("far helper");'), evaluation: "contract" },
  ts("map", "development", "arrow-expression", "function subject(xs: number[]): number[] {\n  return xs.map(n => ⟦n * 2⟧);\n}\n", 2,
    'if (JSON.stringify(subject([1,-2])) !== "[2,-4]") throw new Error("map");', ["2 * n"]),
  ts("optional", "development", "optional-chain", "function subject(user?: { name?: string }): string {\n  return ⟦user?.name ?? \"anonymous\"⟧;\n}\n", 3,
    'if (subject() !== "anonymous" || subject({name:""}) !== "" || subject({name:"Ada"}) !== "Ada") throw new Error("optional");'),
  ts("reduce", "holdout", "accumulator", "function subject(xs: number[]): number {\n  return xs.reduce((sum, n) => ⟦sum + n⟧, 0);\n}\n", 3,
    'if (subject([])!==0 || subject([2,-1,4])!==5) throw new Error("reduce");'),
  ts("await", "development", "significant-space", "async function fetchCount(): Promise<number> { return 8; }\nasync function subject(): Promise<number> {\n  const n = ⟦await ⟧fetchCount();\n  return n + 1;\n}\n", 2,
    'subject().then(n => { if (n !== 9) throw new Error("await"); });'),
  ts("template", "development", "template-literal", "function subject(name: string): string {\n  return `Hello, ⟦${name}⟧!`;\n}\n", 2,
    'if (subject("Ada")!=="Hello, Ada!") throw new Error("template");'),
  ts("union", "holdout", "same-file-type", 'type Result = { ok: true; value: number } | { ok: false; message: string };\nfunction subject(r: Result): number {\n  ⟦if (!r.ok) { return 0; }⟧\n  return r.value;\n}\n', 3,
    'if (subject({ok:false,message:"bad"})!==0 || subject({ok:true,value:7})!==7) throw new Error("union");'),
  ts("copy", "development", "object-spread", "function subject(user: { name: string; active: boolean }) {\n  return { ⟦...user, active: true⟧ };\n}\n", 3,
    'const u={name:"Ada",active:false}; const v=subject(u); if(u.active || !v.active || v.name!=="Ada") throw new Error("copy");'),
  ts("nested", "development", "auto-closer", "function inner(): number { return 4; }\nfunction outer(n: number): number { return n * 3; }\nfunction subject(): number {\n  return outer(⟦inner()⟧);\n}\n", 2,
    'if(subject()!==12) throw new Error("nested");'),
  ts("guard", "holdout", "short-block", "function subject(value: unknown): string {\n  ⟦if (typeof value !== \"string\") {\n    return \"\";\n  }⟧\n  return value.trim();\n}\n", 3,
    'if(subject(4)!=="" || subject(" x ")!=="x") throw new Error("guard");'),
  ts("unicode", "development", "unicode", "function subject(): string {\n  return \"⟦café🌍⟧\";\n}\n", 2,
    'if(subject()!=="café🌍") throw new Error("unicode");'),
  ts("tuple", "development", "destructuring", "function subject(pair: [string, number]): string {\n  const [⟦name, count⟧] = pair;\n  return name.repeat(count);\n}\n", 2,
    'if(subject(["a",3])!=="aaa") throw new Error("tuple");'),
  { ...ts("unknown-sdk", "holdout", "unknown-dependency", "// The generated SDK declarations are unavailable.\ndeclare const sdk: UnknownSDK;\nsdk.⟦PerformAction⟧", 2, ""), abstain: "Unknown SDK method; choosing an invented method is not supported by local context." }
];
