interface Check { readonly passed: boolean }
interface SyntaxCheck {
  readonly caseId: string;
  readonly raw: { readonly valid: boolean | null };
  readonly processed: { readonly valid: boolean | null };
}

/** Strict offline-oracle gate; experimental/live output remains a measured result. */
export function oracleValidationFailures(results: {
  readonly references: readonly Check[] | null;
  readonly changedReferences: readonly Check[] | null;
  readonly regressions: readonly (Check & { readonly id: string })[];
  readonly syntax: readonly SyntaxCheck[] | null;
}): string[] {
  const failures: string[] = [];
  if (!results.references?.length) failures.push("Missing reference checks.");
  if (results.changedReferences === null) failures.push("Missing transformed-reference checks.");
  if (!results.syntax?.length) failures.push("Missing syntax checks.");
  if (results.regressions.length === 0) failures.push("Missing boundary regressions.");
  for (const [name, checks] of [["Reference", results.references], ["Transformed reference", results.changedReferences]] as const) {
    const count = checks?.filter((check) => !check.passed).length ?? 0;
    if (count > 0) failures.push(`${name} failures: ${count}.`);
  }
  for (const check of results.regressions) {
    if (!check.passed) failures.push(`Boundary regression: ${check.id}.`);
  }
  for (const check of results.syntax ?? []) {
    if (check.raw.valid !== true || check.processed.valid !== true) {
      failures.push(`Invalid or unavailable syntax check: ${check.caseId}.`);
    }
  }
  return failures;
}
