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

    return () => {
      delete window.__plPhase1bVerifySeedCompany;
      delete window.__plPhase1bVerifyUpsertVoucher;
      delete window.__plPhase1bVerifyFlushDb;
      delete window.__plPhase1bVerifyGetVoucher;
      delete window.__plPhase1bVerifyInstallLanClientGate;
      delete window.__plPhase1bVerifyClearLanClientGate;
      delete window.__plPhase1bVerifySkipHostBridgeForNextUpsert;
    };
  }, []);

  return null;
}
