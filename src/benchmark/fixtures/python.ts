import type { Family } from "../types";

function py(id: string, split: Family["split"], category: string, template: string, typed: number, checks: string, alternatives?: readonly string[]): Family {
  return { id: `py-${id}`, language: "python", split, category, template, typed, checks, ...(alternatives === undefined ? {} : { alternatives }) };
}
const farPadding = Array.from({ length: 180 }, (_, index) => `# unrelated padding line ${index.toString().padStart(3, "0")} keeps the declaration outside a small adjacent window.`).join("\n");

export const pythonFamilies: readonly Family[] = [
  { ...py("contract-enumerate", "development", "intent-contract", 'def subject(xs):\n    """Return (index, value) pairs for every item in xs."""\n    return ⟦list(enumerate(xs))⟧\n', 4,
    'assert subject(["a", "b"]) == [(0, "a"), (1, "b")]'), evaluation: "contract" },
  { ...py("far-helper", "development", "same-file-context", `def helper(n):\n    return n * 2\n\n${farPadding}\n\ndef subject(n):\n    """Return helper(n) plus one."""\n    return ⟦helper(n) + 1⟧\n`, 3,
    'assert subject(3) == 7\nassert subject(0) == 1'), evaluation: "contract" },
  py("sorted", "development", "partial-identifier", "def subject(xs):\n    return ⟦sorted(xs)⟧\n", 3,
    'assert subject([3,1,2]) == [1,2,3]\nassert subject([]) == []'),
  py("comprehension", "development", "mid-line", "def subject(xs):\n    return [⟦n * n⟧ for n in xs if n >= 0]\n", 2,
    'assert subject([-2,0,3]) == [0,9]', ["n ** 2"]),
  py("exception", "holdout", "error-handling", "def subject(s):\n    try:\n        return int(s)\n    ⟦except ValueError:\n        return None⟧\n", 3,
    'assert subject("12") == 12\nassert subject("bad") is None'),
  py("enumerate", "development", "loop", "def subject(xs):\n    out = {}\n    for index, value in ⟦enumerate(xs)⟧:\n        out[value] = index\n    return out\n", 4,
    'assert subject(["a","b"]) == {"a":0,"b":1}'),
  py("dict", "development", "default-value", "def subject(data, key):\n    return data.⟦get(key, 0)⟧\n", 2,
    'assert subject({}, "x") == 0\nassert subject({"x":7}, "x") == 7'),
  py("guard", "holdout", "indentation", "def subject(xs):\n    ⟦if not xs:\n        return None⟧\n    return xs[0]\n", 3,
    'assert subject([]) is None\nassert subject([0,3]) == 0'),
  py("fstring", "development", "string-interpolation", "def subject(name):\n    return f\"Hello, ⟦{name}⟧!\"\n", 2,
    'assert subject("Ada") == "Hello, Ada!"'),
  py("slice", "development", "negative-index", "def subject(xs):\n    return xs[⟦::-1⟧]\n", 2,
    'assert subject([1,2,3]) == [3,2,1]\nassert subject([]) == []'),
  py("zip", "holdout", "nested-call", "def subject(keys, values):\n    return dict(⟦zip(keys, values)⟧)\n", 2,
    'assert subject(["a","b"],[1,2]) == {"a":1,"b":2}'),
  py("type", "development", "same-file-type", "class Entry:\n    def __init__(self, value):\n        self.value = value\n\ndef subject(entry):\n    return entry.⟦value⟧\n", 2,
    'assert subject(Entry(8)) == 8'),
  py("tabs", "development", "whitespace", "def subject(n):\n    # Return zero for negative inputs.\n    ⟦if n < 0:\n        return 0⟧\n    return n\n", 3,
    'assert subject(-2) == 0\nassert subject(3) == 3'),
  { ...py("unknown-module", "holdout", "abstention", "# This private plugin API has no available declarations.\nimport private_plugin\nprivate_plugin.⟦resolve_member⟧", 2, ""), abstain: "Unavailable private API; conservative abstention is the authored policy." }
];
