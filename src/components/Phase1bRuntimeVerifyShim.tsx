"use client";

import { useEffect } from "react";
import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { flushPendingBrowserDbSave } from "@/lib/localSqlite";
import { addLocalServerGate, writeActiveGateId, listGates, deleteGate } from "@/lib/gates/gateStore";
import { defaultBuiltinGateId } from "@/lib/gates/gateClientKind";
import { applyPlServerAccessContextPayload, clearPlServerAccessContext } from "@/lib/plServerAccessContext";

declare global {
  interface Window {
    __plPhase1bVerifySeedCompany?: (company: Record<string, unknown>) => Promise<{ ok: boolean }>;
    __plPhase1bVerifyUpsertVoucher?: (
      companyId: string,
      voucherId: string,
      data: Record<string, unknown>
    ) => Promise<{ ok: boolean }>;
    __plPhase1bVerifyFlushDb?: () => Promise<{ ok: boolean }>;
    __plPhase1bVerifyGetVoucher?: (
      companyId: string,
      voucherId: string
    ) => Promise<Record<string, unknown> | null>;
    __plPhase1bVerifyInstallLanClientGate?: (
      serverUrl: string,
      accessToken: string,
      companyId: string
    ) => Promise<{ ok: boolean; gateId?: string }>;
    __plPhase1bVerifyClearLanClientGate?: () => Promise<{ ok: boolean }>;
    __plPhase1bVerifySkipHostBridgeForNextUpsert?: boolean;
    __plPhase1bVerifySkipPendingDeleteOnReplaySuccess?: boolean;
    __plPhase1bVerifyCountPendingAuthoritativeWrites?: () => Promise<number>;
    __plPhase1bVerifyDrainPendingAuthoritativeQueue?: () => Promise<{ drained: number }>;
    __plPhase1bVerifyColdStartPendingReplay?: () => Promise<{ drained: number }>;
    __plPhase1bVerifyGetPendingAuthoritativeState?: (
      companyId: string,
      docId: string
    ) => Promise<string | null>;
    __plPhase1bVerifySetPendingAuthoritativeRetryCount?: (
      companyId: string,
      docId: string,
      retryCount: number
    ) => Promise<{ ok: boolean; retryCount?: number }>;
    __plPhase1bVerifyClearAllPendingAuthoritativeWrites?: () => Promise<{ removed: number }>;
    __plPhase1bVerifySimulateLanClientAuthoritativeRoute?: boolean;
    __plPhase1bVerifySeedPlServerSharedClientCompany?: (
      companyId: string,
      name: string
    ) => Promise<{ ok: boolean }>;
    __plPhase1bVerifyPullPlServerSharedCompanyLive?: (
      companyId: string
    ) => Promise<{ ok: boolean; fullPull: boolean }>;
  }
}

/** Runtime verify harness — bundled imports for Electron executeJavaScript callers. */
export function Phase1bRuntimeVerifyShim() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.__plPhase1bVerifySeedCompany = async (company) => {
      await upsertLocalCompany(company as Parameters<typeof upsertLocalCompany>[0]);
      await flushPendingBrowserDbSave();
      return { ok: true };
    };

    window.__plPhase1bVerifyUpsertVoucher = async (companyId, voucherId, data) => {
      await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, data);
      return { ok: true };
    };

    window.__plPhase1bVerifyFlushDb = async () => {
      await flushPendingBrowserDbSave();
      return { ok: true };
    };

    window.__plPhase1bVerifyGetVoucher = async (companyId, voucherId) => {
      const { getCompanyDocFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const row = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
      return row && typeof row === "object" ? row : null;
    };

    window.__plPhase1bVerifyInstallLanClientGate = async (serverUrl, accessToken, companyId) => {
      const gate = addLocalServerGate({
        label: "Phase1B Verify LAN Client",
        serverUrl,
        accessToken,
      });
      writeActiveGateId(gate.id);
      applyPlServerAccessContextPayload(
        {
          allowedCompanyIds: [companyId],
          companies: [
            {
              id: companyId,
              name: "Phase1B Runtime Verify",
              storageOption: "local",
              ownerEmail: null,
            },
          ],
        },
        gate.id
      );
      return { ok: true, gateId: gate.id };
    };

    window.__plPhase1bVerifyClearLanClientGate = async () => {
      for (const gate of listGates()) {
        if (gate.type === "local_server" && gate.label === "Phase1B Verify LAN Client") {
          deleteGate(gate.id);
        }
      }
      writeActiveGateId(defaultBuiltinGateId());
      clearPlServerAccessContext();
      return { ok: true };
    };

    window.__plPhase1bVerifyCountPendingAuthoritativeWrites = async () => {
      const { countPendingAuthoritativeCompanyDocWrites } = await import(
        "@/lib/plServerAuthoritativePendingQueue"
      );
      return countPendingAuthoritativeCompanyDocWrites();
    };

    window.__plPhase1bVerifyDrainPendingAuthoritativeQueue = async () => {
      const { drainPlServerAuthoritativePendingQueue } = await import("@/lib/plServerAuthoritativeReplay");
      const result = await drainPlServerAuthoritativePendingQueue("verify");
      return { drained: result.drained, permanentFailures: result.permanentFailures };
    };

    window.__plPhase1bVerifyColdStartPendingReplay = async () => {
      const { coldStartPlServerAuthoritativeReplayManager } = await import("@/lib/plServerAuthoritativeReplay");
      const result = await coldStartPlServerAuthoritativeReplayManager();
      return { drained: result.drained };
    };

    window.__plPhase1bVerifyGetPendingAuthoritativeState = async (companyId, docId) => {
      const { getPendingAuthoritativeWriteByCoalesceKey } = await import(
        "@/lib/plServerAuthoritativePendingQueue"
      );
      const row = await getPendingAuthoritativeWriteByCoalesceKey(companyId, "vouchers", docId);
      return row?.state ?? null;
    };

    window.__plPhase1bVerifySetPendingAuthoritativeRetryCount = async (companyId, docId, retryCount) => {
      const { getPendingAuthoritativeWriteByCoalesceKey, markPendingAuthoritativeWriteState } =
        await import("@/lib/plServerAuthoritativePendingQueue");
      const row = await getPendingAuthoritativeWriteByCoalesceKey(companyId, "vouchers", docId);
      if (!row) return { ok: false };
      await markPendingAuthoritativeWriteState(row, row.state, { retryCount });
      return { ok: true, retryCount };
    };

    window.__plPhase1bVerifyClearAllPendingAuthoritativeWrites = async () => {
      const { clearAllPendingAuthoritativeCompanyDocWrites } = await import(
        "@/lib/plServerAuthoritativePendingQueue"
      );
      const removed = await clearAllPendingAuthoritativeCompanyDocWrites();
      return { removed };
    };

    window.__plPhase1bVerifySeedPlServerSharedClientCompany = async (companyId, name) => {
      await upsertLocalCompany({
        id: companyId,
        name,
        ownerId: "",
        storageOption: "local",
        syncPolicy: "offline",
        syncedFromCloud: false,
        isOwned: false,
        plServerShared: true,
      });
      await flushPendingBrowserDbSave();
      return { ok: true };
    };

    window.__plPhase1bVerifyPullPlServerSharedCompanyLive = async (companyId) => {
      const { syncPlServerSharedCompanyLive } = await import("@/lib/plServerClientDeltaSync");
      return syncPlServerSharedCompanyLive(companyId);
    };

    return () => {
      delete window.__plPhase1bVerifySeedCompany;
      delete window.__plPhase1bVerifyUpsertVoucher;
      delete window.__plPhase1bVerifyFlushDb;
      delete window.__plPhase1bVerifyGetVoucher;
      delete window.__plPhase1bVerifyInstallLanClientGate;
      delete window.__plPhase1bVerifyClearLanClientGate;
      delete window.__plPhase1bVerifySkipHostBridgeForNextUpsert;
      delete window.__plPhase1bVerifySkipPendingDeleteOnReplaySuccess;
      delete window.__plPhase1bVerifyCountPendingAuthoritativeWrites;
      delete window.__plPhase1bVerifyDrainPendingAuthoritativeQueue;
      delete window.__plPhase1bVerifyColdStartPendingReplay;
      delete window.__plPhase1bVerifyGetPendingAuthoritativeState;
      delete window.__plPhase1bVerifySetPendingAuthoritativeRetryCount;
      delete window.__plPhase1bVerifyClearAllPendingAuthoritativeWrites;
      delete window.__plPhase1bVerifySimulateLanClientAuthoritativeRoute;
      delete window.__plPhase1bVerifySeedPlServerSharedClientCompany;
      delete window.__plPhase1bVerifyPullPlServerSharedCompanyLive;
    };
  }, []);

  return null;
}
