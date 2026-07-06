"use client";

import { useEffect } from "react";
import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { flushPendingBrowserDbSave } from "@/lib/localSqlite";

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

    return () => {
      delete window.__plPhase1bVerifySeedCompany;
      delete window.__plPhase1bVerifyUpsertVoucher;
      delete window.__plPhase1bVerifyFlushDb;
      delete window.__plPhase1bVerifyGetVoucher;
    };
  }, []);

  return null;
}
