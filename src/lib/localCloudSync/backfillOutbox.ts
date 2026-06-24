"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { COLLECTIONS_TO_BACKUP } from "@/lib/companyBackupCore";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { inferCloudSyncActionFromPayload } from "@/lib/localCloudSync/conflict";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { enqueueLocalCloudSyncOp } from "@/lib/localCloudSync/queue";

/** Recycle Bin / tombstone rows Drive par mat bhejo. */
function isAliveDoc(row: Record<string, unknown>): boolean {
  return row.isDeleted !== true;
}

/**
 * Cloud sync ON se pehle likhe gaye SQLite rows outbox me nahi hote — Force sync par khali rehta hai.
 * Ek baar saari alive rows enqueue karo taaki `data/ops/op_*.json` Drive par banein.
 * Pehle `lastLocalOpSeq === 0` check tha — ek bhi naya save hone par purana data kabhi upload nahi hota tha.
 */
export async function backfillLocalDocsToCloudSyncOutbox(companyId: string): Promise<number> {
  const cid = String(companyId || "").trim();
  if (!cid) return 0;
  if (!(await shouldUseLocalCloudSync(cid))) return 0;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return 0;
  // Pehle hi backfill ho chuka — dubara poora ledger enqueue mat karo.
  if ((reg as { cloudSyncHistoricalBackfillDone?: boolean }).cloudSyncHistoricalBackfillDone === true) {
    return 0;
  }

  let enqueued = 0;
  for (const collection of COLLECTIONS_TO_BACKUP) {
    const rows = await listCompanyDocsFromBrowserDb(cid, collection, { forBackupMerge: true });
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      if (!isAliveDoc(row)) continue;
      const rowId = String(row.id ?? "").trim();
      if (!rowId) continue;
      await enqueueLocalCloudSyncOp({
        companyId: cid,
        table: collection,
        action: inferCloudSyncActionFromPayload(row, "update"),
        rowId,
        payload: row,
        updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
      });
      enqueued += 1;
    }
  }

  // Chahe rows 0 hon (khali company) — flag set karo taaki har Force sync par scan na ho.
  await upsertLocalCompany({
    ...reg,
    cloudSyncHistoricalBackfillDone: true,
    updatedAt: Date.now(),
  });

  if (enqueued > 0) {
    logLocalCloudSync("backfill enqueued", { companyId: cid, enqueued });
  }
  return enqueued;
}
