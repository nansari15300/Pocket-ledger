"use client";

import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";

/**
 * Local company id kabhi `generateCompanyId` se `slug_shortId` hota hai (e.g. 82-83_4de81f37),
 * host share list me sirf `82-83` / `slug_otherId` — exact match fail → mirror_rows_empty.
 */
export function matchPlServerSharedCompanyForLocalId(
  localCompanyId: string,
  shared: ReadonlyArray<PlServerSharedCompanySummary>
): PlServerSharedCompanySummary | null {
  const id = String(localCompanyId || "").trim();
  if (!id || !shared.length) return null;

  const exact = shared.find((r) => String(r.id || "").trim() === id);
  if (exact) return exact;

  const lastUnderscore = id.lastIndexOf("_");
  const slug = lastUnderscore > 0 ? id.slice(0, lastUnderscore) : "";

  if (slug) {
    const byExactSlugId = shared.find((r) => String(r.id || "").trim() === slug);
    if (byExactSlugId) return byExactSlugId;

    const bySlugName = shared.find((r) => {
      const name = String(r.name || "").trim();
      return name === slug || name === id;
    });
    if (bySlugName) return bySlugName;

    const bySameSlugPrefix = shared.find((r) => {
      const hid = String(r.id || "").trim();
      return hid.startsWith(`${slug}_`);
    });
    if (bySameSlugPrefix) return bySameSlugPrefix;
  }

  const byName = shared.find((r) => String(r.name || "").trim() === id);
  return byName || null;
}

/** Gate filter / list recovery — local id vs host canonical id / fuzzy share match. */
export function companyRowMatchesSelectionId(
  row: { id?: string; plServerHostCompanyId?: string } | null | undefined,
  selectionId: string
): boolean {
  const sel = String(selectionId || "").trim();
  if (!sel || !row) return false;
  const id = String(row.id || "").trim();
  const hostId = String(row.plServerHostCompanyId || "").trim();
  if (id === sel || hostId === sel) return true;
  if (id && matchPlServerSharedCompanyForLocalId(sel, [{ id, name: id, storageOption: "local" }])) return true;
  if (hostId && matchPlServerSharedCompanyForLocalId(sel, [{ id: hostId, name: hostId, storageOption: "local" }])) {
    return true;
  }
  return false;
}

/** HTTP / Host APIs ke liye — local SQLite id se host company id. */
export async function resolvePlServerHostCompanyId(localCompanyId: string): Promise<string> {
  const id = String(localCompanyId || "").trim();
  if (!id) return "";

  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    const linked = String((row as { plServerHostCompanyId?: string } | null)?.plServerHostCompanyId || "").trim();
    if (linked) return linked;
  } catch {
    /* continue */
  }

  try {
    const { getPlServerSharedCompanies, refreshPlServerAccessContext } = await import(
      "@/lib/plServerAccessContext"
    );
    let shared = getPlServerSharedCompanies();
    if (!shared.length) {
      await refreshPlServerAccessContext();
      shared = getPlServerSharedCompanies();
    }
    const hit = matchPlServerSharedCompanyForLocalId(id, shared);
    if (hit?.id) return String(hit.id).trim();
  } catch {
    /* continue */
  }

  return id;
}
