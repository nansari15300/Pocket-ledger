"use client";

import {
  listCompanyDocsFromBrowserDb,
  listVoucherSummaryProjectionFromBrowserDb,
} from "@/lib/localCompanyDocMirror";

export type PlServerLedgerBackfillStatus = {
  needsFullPull: boolean;
  localVoucherCount: number;
  localPartyCount: number;
  serverVoucherCount: number | null;
  reason:
    | "missing_id"
    | "local_empty"
    | "parties_empty"
    | "behind_server"
    | "local_ready"
    | "check_failed";
};

async function getLocalLedgerCounts(companyId: string): Promise<{
  vouchers: number;
  parties: number;
}> {
  const [parties, vouchers] = await Promise.all([
    listCompanyDocsFromBrowserDb(companyId, "parties", { forBackupMerge: true }),
    // Count from the compact projection; parsing every voucher JSON blocks cold-start UI.
    listVoucherSummaryProjectionFromBrowserDb(companyId, { forBackupMerge: true }),
  ]);
  return { vouchers: vouchers.length, parties: parties.length };
}

async function getServerVoucherCount(companyId: string): Promise<number | null> {
  try {
    const { resolvePlServerDeltaTransport } = await import("@/lib/plServerClientDeltaSync");
    const transport = resolvePlServerDeltaTransport(companyId);
    if (!transport || (!transport.gateAllowed && !transport.unlockedLocally)) return null;

    const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
    const hostCompanyId = (await resolvePlServerHostCompanyId(companyId)) || companyId;
    const { fetchPlDeltaHealth } = await import("@/lib/plMirrorProtocol");
    const health = await fetchPlDeltaHealth(
      transport.baseUrl,
      transport.accessToken || "",
      hostCompanyId
    );
    if (!health?.ok || typeof health.voucherCount !== "number") return null;
    return Math.max(0, Math.floor(health.voucherCount));
  } catch {
    return null;
  }
}

/** Server-gate company: local SQLite server se peeche ho to full pull/backfill chahiye. */
export async function plServerCompanyLedgerBackfillStatus(companyId: string): Promise<PlServerLedgerBackfillStatus> {
  const id = String(companyId || "").trim();
  if (!id) {
    return {
      needsFullPull: false,
      localVoucherCount: 0,
      localPartyCount: 0,
      serverVoucherCount: null,
      reason: "missing_id",
    };
  }
  try {
    const local = await getLocalLedgerCounts(id);
    if (local.vouchers === 0) {
      return {
        needsFullPull: true,
        localVoucherCount: local.vouchers,
        localPartyCount: local.parties,
        serverVoucherCount: null,
        reason: "local_empty",
      };
    }
    if (local.parties === 0) {
      return {
        needsFullPull: true,
        localVoucherCount: local.vouchers,
        localPartyCount: local.parties,
        serverVoucherCount: null,
        reason: "parties_empty",
      };
    }

    const serverVoucherCount = await getServerVoucherCount(id);
    if (serverVoucherCount != null && local.vouchers < serverVoucherCount) {
      return {
        needsFullPull: true,
        localVoucherCount: local.vouchers,
        localPartyCount: local.parties,
        serverVoucherCount,
        reason: "behind_server",
      };
    }

    return {
      needsFullPull: false,
      localVoucherCount: local.vouchers,
      localPartyCount: local.parties,
      serverVoucherCount,
      reason: "local_ready",
    };
  } catch {
    return {
      needsFullPull: true,
      localVoucherCount: 0,
      localPartyCount: 0,
      serverVoucherCount: null,
      reason: "check_failed",
    };
  }
}

export async function plServerCompanyLedgerNeedsFullPull(companyId: string): Promise<boolean> {
  return (await plServerCompanyLedgerBackfillStatus(companyId)).needsFullPull;
}
