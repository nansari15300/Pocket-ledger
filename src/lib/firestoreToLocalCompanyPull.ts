"use client";

/**
 * Firestore company subcollections → browser SQLite (`company_docs`) — explicit “sync / download” layer.
 * `useVouchers` prefetch + `onSnapshot` both feed the same mirror via `mirrorCollectionDocsToBrowserDbSilent`.
 * Har change ke saath: yahan se pull = local DB me rows guarantee (decrypt + upsert).
 */

import { collection, getDocs, query } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Company } from "@/hooks/useCompany";
import {
  deleteCompanyDocFromBrowserDb,
  listCompanyDocsFromBrowserDb,
  mirrorCollectionDocsToBrowserDbSilent,
} from "@/lib/localCompanyDocMirror";
import {
  isLocalMirrorMarkedServerBacked,
  stampLocalMirrorBackedByFirestore,
} from "@/lib/localMirrorServerMeta";
import { decryptFirestoreCompanyDocIfNeeded, type ServerBackupCryptoContext } from "@/lib/serverBackupEncryption";

/** Merge options: `storageOption: local` par same doc id pe Firestore purana na jeete (restore / backup). */
export type MergeRemoteLocalDocsOptions = {
  /** True: SQLite row same `id` par remote ko replace kare — extras-only merge se zyada zaroori jab authoritativeCompanyId + Firestore stale ho */
  preferLocalSqliteWhenIdsConflict?: boolean;
};

function sortMergedByField(merged: any[], orderByField: string): any[] {
  const copy = [...merged];
  copy.sort((a: any, b: any) => {
    const dateA = a[orderByField]?.toDate ? a[orderByField].toDate() : new Date(a[orderByField]);
    const dateB = b[orderByField]?.toDate ? b[orderByField].toDate() : new Date(b[orderByField]);
    return dateA.getTime() - dateB.getTime();
  });
  return copy;
}

/**
 * Firestore list me abhi nahi — sirf SQLite + outbox (pending create/update flush se pehle).
 * `onSnapshot` / pull sirf server rows set karte the → cross-copy / naya voucher refresh pe "gayab" dikhta tha.
 *
 * **Server-hard-delete orphans:** SQLite row jisme `__mirrorBackedByFirestore` aur ab server snapshot me wo id nahin —
 * stale “extra” ghost ban jati thi + mirror usko wapas bake karta tha → hard-delete SQLite row (restore impossible).
 */
export async function mergeRemoteSnapshotWithLocalOnlyDocs(
  localCompanyId: string,
  collectionPath: string,
  remoteData: any[],
  orderByField?: string,
  options?: MergeRemoteLocalDocsOptions
): Promise<any[]> {
  try {
    // Har Firestore snapshot row ko mirror marker lagao taaki purge vs pending-local differentiate ho sake.
    const remoteStamped = remoteData.map((r: any) =>
      stampLocalMirrorBackedByFirestore({ ...(typeof r === "object" && r ? r : {}), id: r?.id } as Record<string, unknown>)
    );
    let cached = await listCompanyDocsFromBrowserDb(localCompanyId, collectionPath, { forBackupMerge: true });

    const fsIds = new Set(remoteStamped.map((d: any) => String(d?.id ?? "")));
    const orphanSqliteIds: string[] = [];
    for (const row of cached) {
      const id = String((row as any)?.id ?? "").trim();
      if (!id || (row as any)?.isDeleted === true) continue;
      if (!fsIds.has(id) && isLocalMirrorMarkedServerBacked(row as Record<string, unknown>)) {
        orphanSqliteIds.push(id);
      }
    }
    if (orphanSqliteIds.length) {
      // Online row server se hat chuki → local mirror se DELETE; extras merge ghosts restore na lau.
      // Sequential har id = zyada orphans par lamba critical path — chhota parallel batch SQLite pressure safe rakhta hai.
      const ORPHAN_DELETE_CONCURRENCY = 8;
      for (let i = 0; i < orphanSqliteIds.length; i += ORPHAN_DELETE_CONCURRENCY) {
        const slice = orphanSqliteIds.slice(i, i + ORPHAN_DELETE_CONCURRENCY);
        await Promise.all(
          slice.map((oid) =>
            deleteCompanyDocFromBrowserDb(localCompanyId, collectionPath, oid, { force: true, notify: false })
          )
        );
      }
      cached = await listCompanyDocsFromBrowserDb(localCompanyId, collectionPath, { forBackupMerge: true });
    }

    // Local registry: restore ke baad Firestore purane rows same id rakhe → pehle wala "extras only" merge un rows ko chhod deta tha
    if (options?.preferLocalSqliteWhenIdsConflict && cached.length) {
      const byId = new Map<string, any>();
      for (const r of remoteStamped) {
        const id = String(r?.id ?? "");
        if (id) byId.set(id, r);
      }
      for (const c of cached) {
        const id = String(c?.id ?? "");
        if (!id || c?.isDeleted === true) continue;
        byId.set(id, c);
      }
      const merged = [...byId.values()];
      if (!orderByField) return merged;
      return sortMergedByField(merged, orderByField);
    }

    // Sirf snapshot — poora stamped server list waapas do (purge ke baad local empty).
    if (!cached.length) {
      if (!orderByField) return remoteStamped;
      return sortMergedByField(remoteStamped, orderByField);
    }

    /** Pending local/outbox extras: META false / missing — snapshot me id nahin kyunki abhi flush nahi. */
    const extras = cached.filter((c: any) => {
      if (c?.isDeleted === true) return false;
      const id = String(c?.id ?? "");
      if (!id) return false;
      if (!fsIds.has(id) && isLocalMirrorMarkedServerBacked(c as Record<string, unknown>)) return false;
      return !fsIds.has(id);
    });
    if (!extras.length) {
      if (!orderByField) return remoteStamped;
      return sortMergedByField(remoteStamped, orderByField);
    }
    const merged = [...remoteStamped, ...extras];
    if (!orderByField) return merged;
    return sortMergedByField(merged, orderByField);
  } catch {
    try {
      return remoteData.map((r: any) =>
        stampLocalMirrorBackedByFirestore({ ...(typeof r === "object" && r ? r : {}), id: r?.id } as Record<string, unknown>)
      );
    } catch {
      return remoteData;
    }
  }
}

/** Same list as `useVouchers` listeners — ek hi source taaki sync gap na ho. */
export const COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS = [
  "vouchers",
  "parties",
  "staff",
  "bank_accounts",
  "taxes",
  "expense_accounts",
  "items",
  "item_groups",
  "groups",
  "account_groups",
  "staff_groups",
  "tax_groups",
  "expense_groups",
] as const;

export type CompanyLocalMirrorSubcollection = (typeof COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS)[number];

/**
 * Ek subcollection: Firestore getDocs → decrypt (agar encrypted) → SQLite upsert → decrypted rows return (React state ke liye).
 */
export async function pullCompanySubcollectionFromFirestoreToLocalDb(
  fsCompanyId: string,
  localCompanyId: string,
  collectionPath: string,
  company: Company | null,
  /** vouchers: `date` sort — merge ke baad timeline sahi */
  orderByField?: string
): Promise<any[]> {
  const cryptoCtx: ServerBackupCryptoContext | null = company
    ? { encryptServerBackupSalt: company.encryptServerBackupSalt }
    : null;
  const q = query(collection(firestore, `companies/${fsCompanyId}/${collectionPath}`));
  const snapRemote = await getDocs(q);
  const remoteData = (
    await Promise.all(
      snapRemote.docs.map(async (d) => {
        const raw = { ...d.data(), id: d.id } as Record<string, unknown> & { id: string };
        return decryptFirestoreCompanyDocIfNeeded(raw, cryptoCtx, localCompanyId);
      })
    )
  )
    .filter((x): x is NonNullable<typeof x> => x != null)
    .filter((item: any) => item.isDeleted !== true);
  const preferLocal = String(company?.storageOption || "").toLowerCase() === "local";
  const merged = await mergeRemoteSnapshotWithLocalOnlyDocs(localCompanyId, collectionPath, remoteData, orderByField, {
    preferLocalSqliteWhenIdsConflict: preferLocal,
  });
  /** Purani bugfix: sirf remoteData mirror se offline extras + purge/META SQLite me align nahi ho paate — merged hi bake karo */
  if (merged.length > 0) {
    await mirrorCollectionDocsToBrowserDbSilent(localCompanyId, collectionPath, merged);
  }
  return merged;
}

/** Saari listed subcollections ek baar — manual “download / refresh local cache” ya health check ke liye. */
export async function pullAllCompanySubcollectionsFromFirestoreToLocalDb(
  fsCompanyId: string,
  localCompanyId: string,
  company: Company | null
): Promise<{ path: string; count: number }[]> {
  const out: { path: string; count: number }[] = [];
  for (const path of COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS) {
    try {
      const rows = await pullCompanySubcollectionFromFirestoreToLocalDb(
        fsCompanyId,
        localCompanyId,
        path,
        company,
        path === "vouchers" ? "date" : undefined
      );
      out.push({ path, count: rows.length });
    } catch (e) {
      console.warn("[pullAllCompanySubcollectionsFromFirestoreToLocalDb]", path, e);
      out.push({ path, count: 0 });
    }
  }
  return out;
}

/** Debug / Settings: SQLite mirror me kitni rows hain (sirf tab jab `listCompanyDocsFromBrowserDb` allow kare). */
export async function getLocalMirrorRowCountsBySubcollection(
  localCompanyId: string
): Promise<Partial<Record<CompanyLocalMirrorSubcollection, number>>> {
  const counts: Partial<Record<CompanyLocalMirrorSubcollection, number>> = {};
  for (const path of COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS) {
    const rows = await listCompanyDocsFromBrowserDb(localCompanyId, path);
    counts[path] = rows.length;
  }
  return counts;
}
