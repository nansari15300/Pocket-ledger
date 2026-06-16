"use client";

import { getLocalCompanyById } from "@/lib/localCompanyStore";

/** Device/registry company id → Firestore `companies/{id}` (voucher + pending attachment sync must match). */
export async function resolveAuthoritativeFirestoreCompanyId(companyId: string): Promise<string> {
  const raw = String(companyId || "").trim();
  if (!raw) return raw;
  try {
    const reg = await getLocalCompanyById(raw, { includeDeleted: true });
    const cid = String((reg as Record<string, unknown> | null)?.authoritativeCompanyId ?? "").trim();
    return cid || raw;
  } catch {
    return raw;
  }
}
