"use client";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { demoteCompanyToLocal } from "@/lib/companyDemote";
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import { listLocalCompanies, removeLocalCompanyById } from "@/lib/localCompanyStore";
import { plDbgCompanyRecovery } from "@/lib/plDebugCompanyRecovery";

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
  /** Owner online row: permission_denied pe demote — network error pe kuch nahi. */
  demotedIds: string[];
};

/**
 * Company registry ghosts / shared revoke — **`useCompany`** auth mount par periodic `reconcileOnlineMirrorsWithServer`.
 *
 * | Row category | Firestore read | Exists | Missing doc | Catch `permission-denied` | Catch `unavailable` etc. |
 * |--------------|----------------|--------|------------|---------------------------|--------------------------|
 * | Owner + `storageOption: local` pure | _(skip)_ | — | — | — | — |
 * | Drive shared join (`driveSharedJoin`) + local | _(skip)_ | — | — | — | — |
 * | Shared (non-owner) Firestore online | `companies/{id}` | Keep row | **`removeLocalCompanyById`** (ghost) | **Remove** — access revoked | **No-op** (offline; avoid false purge) |
 * | Owner + online mirror | `getDoc` same | Keep | **Remove** — server company hard-deleted | **`demoteCompanyToLocal`** — rules handover/revoke | **No-op** — network flaky |
 *
 * **`removedIds`**: SQLite hard-delete (shared ghost ya owner phantom).
 * **`demotedIds`**: owner-only online row jo demote hue (data preserve, local bucket).
 *
 * Offline-first note: **`unhandled` errors ≠ missing** — silently ignore taaki airplane mode par poori company ud na jaye.
 */
export async function reconcileOnlineMirrorsWithServer(user: {
  uid: string;
  email: string | null;
}): Promise<ReconcileOnlineMirrorsResult> {
  // Airplane / no route: Firestore reads misleading ho sakti hain — registry cleanup sirf tab jab network label online ho (navigator jhoot bol sakta hai lekin APK flight mode me zyatar safe skip).
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { changed: false, removedIds: [], demotedIds: [] };
  }

  const rows = await listLocalCompanies();
  const removedIds: string[] = [];
  const demotedIds: string[] = [];
  let changed = false;

  for (const row of rows) {
    const id = row.id;
    const isOwner = isCurrentUserOwnerOfCompanyRow(row, user);
    const storageLocal = String(row.storageOption || "local").toLowerCase() === "local";
    const isDriveSharedJoin = (row as { driveSharedJoin?: unknown }).driveSharedJoin === true;

    // Owner ki sirf device-local company — Firestore par doc expect nahi
    if (isOwner && storageLocal) {
      continue;
    }

    // Google Drive shared join — sirf Drive folder + SQLite; Firestore `companies/{id}` nahi
    if (isDriveSharedJoin && storageLocal) {
      continue;
    }

    if (!isOwner) {
      // Shared list: server par doc nahi / access nahi → local DB + UI se hatao (galat category me local mark hone par bhi)
      try {
        const snap = await getDoc(doc(firestore, "companies", id));
        if (snap.exists()) continue;
        await removeLocalCompanyById(id, { firebaseUid: user.uid });
        removedIds.push(id);
        changed = true;
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "permission-denied" || code === "PERMISSION_DENIED") {
          await removeLocalCompanyById(id, { firebaseUid: user.uid });
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
      // Doc delete ho chuka hai (Console / admin) → purani demote sirf bucket badalti thi — user ko “local move” glitch; full SQLite wipe
      await removeLocalCompanyById(id, { firebaseUid: user.uid });
      removedIds.push(id);
      changed = true;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "permission-denied" || code === "PERMISSION_DENIED") {
        // Missing doc `getDoc` throw nahi karta — ye deny = doc hai lekin rules me `ownerId` / share match nahi.
        // Chhota retry: auth token race pe galat demote kam ho.
        await new Promise((r) => setTimeout(r, 700));
        try {
          const snapRetry = await getDoc(doc(firestore, "companies", id));
          if (snapRetry.exists()) continue;
          await removeLocalCompanyById(id, { firebaseUid: user.uid });
          removedIds.push(id);
          changed = true;
        } catch (e2: unknown) {
          const c2 = (e2 as { code?: string })?.code;
          if (c2 === "permission-denied" || c2 === "PERMISSION_DENIED") {
            const did = await demoteCompanyToLocal(id, "permission_denied");
            if (did) {
              changed = true;
              demotedIds.push(id);
            }
          }
        }
      }
    }
  }

  plDbgCompanyRecovery("sync1:reconcileOnlineMirrors:done", {
    registryRowsSeen: rows.length,
    removedIds: [...removedIds],
    demotedIds: [...demotedIds],
    changed,
  });

  return { changed, removedIds, demotedIds };
}
