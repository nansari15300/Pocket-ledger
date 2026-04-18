"use client";

/**
 * Firestore company subcollections → browser SQLite (`company_docs`) — explicit “sync / download” layer.
 * `useVouchers` prefetch + `onSnapshot` both feed the same mirror via `mirrorCollectionDocsToBrowserDbSilent`.
 * Har change ke saath: yahan se pull = local DB me rows guarantee (decrypt + upsert).
 */

import { collection, getDocs, query } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Company } from "@/hooks/useCompany";
import { listCompanyDocsFromBrowserDb, mirrorCollectionDocsToBrowserDbSilent } from "@/lib/localCompanyDocMirror";
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
 */
export async function mergeRemoteSnapshotWithLocalOnlyDocs(
  localCompanyId: string,
  collectionPath: string,
  remoteData: any[],
  orderByField?: string,
  options?: MergeRemoteLocalDocsOptions
): Promise<any[]> {
  try {
    // `forBackupMerge`: global `dataSourceMode` "cloud" par bhi SQLite se rows lo — upload ke baad merge
    const cached = await listCompanyDocsFromBrowserDb(localCompanyId, collectionPath, { forBackupMerge: true });

    // Local registry: restore ke baad Firestore purane rows same id rakhe → pehle wala "extras only" merge un rows ko chhod deta tha
    if (options?.preferLocalSqliteWhenIdsConflict && cached.length) {
      const byId = new Map<string, any>();
      for (const r of remoteData) {
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

    if (!cached.length) return remoteData;
    const fsIds = new Set(remoteData.map((d: any) => String(d?.id ?? "")));
    const extras = cached.filter((c: any) => {
      if (c?.isDeleted === true) return false;
      const id = String(c?.id ?? "");
      if (!id) return false;
      return !fsIds.has(id);
    });
    if (!extras.length) return remoteData;
    const merged = [...remoteData, ...extras];
    if (!orderByField) return merged;
    return sortMergedByField(merged, orderByField);
  } catch {
    return remoteData;
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
  // Local company: raw Firestore mirror SQLite ko restore par overwrite karta tha — merged UI truth mirror karo
  if (preferLocal) {
    if (merged.length > 0) {
      await mirrorCollectionDocsToBrowserDbSilent(localCompanyId, collectionPath, merged);
    }
  } else if (remoteData.length > 0) {
    await mirrorCollectionDocsToBrowserDbSilent(localCompanyId, collectionPath, remoteData);
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
