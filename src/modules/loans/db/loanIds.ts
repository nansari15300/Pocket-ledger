export function newLoanDocId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

export function sameCompany(row: { companyId?: string }, companyId: string): boolean {
  return String(row.companyId || "") === String(companyId || "");
}
