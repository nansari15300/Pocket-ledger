"use client";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { demoteCompanyToLocal } from "@/lib/companyDemote";
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import { listLocalCompanies, removeLocalCompanyById } from "@/lib/localCompanyStore";

/** Current user company ka owner hai ya nahi (shared vs My companies split). */
export function isCurrentUserOwnerOfCompanyRow(
  row: Pick<LocalCompanyDoc, "ownerId" | "ownerEmail">,
  user: { uid: string; email: string | null }
): boolean {
  const uid = (user.uid || "").trim();
  const oid = String(row.ownerId || "").trim();
  if (oid && uid && oid === uid) return true;
  const oe = String(row.ownerEmail || "")
    .toLowerCase()
    .trim();
  const ue = String(user.email || "")
    .toLowerCase()
    .trim();
  return !!oe && !!ue && oe === ue;
}

export type ReconcileOnlineMirrorsResult = {
  changed: boolean;
  /** Shared / non-owner rows purged from SQLite (hard delete / no access). */
  removedIds: string[];
  /** Owner online row demoted to local (doc missing / permission). */
  demotedIds: string[];
};

/**
 * Har local company row ko server se cross-check:
 * - **Shared (non-owner)**: Firestore me `companies/{id}` hona chahiye — nahi to stale mirror (storage local/firebase kuch bhi) SQLite se delete.
 * - **Owner + pure local** (`storageOption: local`): server doc zaroori nahi — skip.
 * - **Owner + online** (firebase/drive): doc gayab → local bucket me demote.
 */
export async function reconcileOnlineMirrorsWithServer(user: {
  uid: string;
  email: string | null;
}): Promise<ReconcileOnlineMirrorsResult> {
  const rows = await listLocalCompanies();
  const removedIds: string[] = [];
  const demotedIds: string[] = [];
  let changed = false;

  for (const row of rows) {
    const id = row.id;
    const isOwner = isCurrentUserOwnerOfCompanyRow(row, user);
    const storageLocal = String(row.storageOption || "local").toLowerCase() === "local";

    // Owner ki sirf device-local company — Firestore par doc expect nahi
    if (isOwner && storageLocal) {
      continue;
    }

    if (!isOwner) {
      // Shared list: server par doc nahi / access nahi → local DB + UI se hatao (galat category me local mark hone par bhi)
      try {
        const snap = await getDoc(doc(firestore, "companies", id));
        if (snap.exists()) continue;
        await removeLocalCompanyById(id);
        removedIds.push(id);
        changed = true;
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "permission-denied" || code === "PERMISSION_DENIED") {
          await removeLocalCompanyById(id);
          removedIds.push(id);
          changed = true;
        }
        // unavailable: network — row mat todo
      }
      continue;
    }

    // Owner + online-category row
    try {
      const snap = await getDoc(doc(firestore, "companies", id));
      if (snap.exists()) continue;
      const did = await demoteCompanyToLocal(id, "server_missing");
      if (did) {
        changed = true;
        demotedIds.push(id);
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "permission-denied" || code === "PERMISSION_DENIED") {
        const did = await demoteCompanyToLocal(id, "permission_denied");
        if (did) {
          changed = true;
          demotedIds.push(id);
        }
      }
    }
  }

  return { changed, removedIds, demotedIds };
}
