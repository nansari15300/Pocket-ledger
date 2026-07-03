"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { getLocalAuthToken } from "@/lib/localApiClient";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerMirrorGate";
import { mirrorPlServerSharedCompanyById } from "@/lib/plServerClientCompanyMirror";
import { isCompanyAllowedOnActiveServerGate } from "@/lib/plServerRemoteCompanyLogin";
import { getActiveGate } from "@/lib/gates/gateStore";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";

const SESSION_PULL_KEY = "pl-server-ledger-pulled";

function sessionPullKey(companyId: string): string {
  return `${SESSION_PULL_KEY}:${companyId}`;
}

/** Open server-gate company par ek baar full ledger P2P mirror — repeat loop mat chalao. */
export function PlServerGateLedgerBootstrap() {
  const { companyId, company } = useCompany();
  const runningRef = useRef(false);

  useEffect(() => {
    const id = String(companyId || "").trim();
    if (!id) return;
    const gate = getActiveGate();
    if (gate.type !== "local_server" || !gate.serverUrl) return;
    if (!getLocalAuthToken(id) && !isCompanyAllowedOnActiveServerGate(id)) return;
    const isServerRow =
      isServerGateCompany(company) ||
      company?.plServerShared === true ||
      isCompanyAllowedOnActiveServerGate(id);
    if (!isServerRow) return;

    let cancelled = false;
    void (async () => {
      if (runningRef.current) return;
      try {
        try {
          if (sessionStorage.getItem(sessionPullKey(id)) === "1") {
            const vouchers = await listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true });
            if (vouchers.length > 0) return;
            sessionStorage.removeItem(sessionPullKey(id));
          }
        } catch {
          /* ignore */
        }
        if (!(await plServerCompanyLedgerNeedsFullPull(id))) {
          try {
            sessionStorage.setItem(sessionPullKey(id), "1");
          } catch {
            /* ignore */
          }
          return;
        }
        runningRef.current = true;
        await mirrorPlServerSharedCompanyById(id, { pullFullLedger: true });
        if (!cancelled) {
          try {
            sessionStorage.setItem(sessionPullKey(id), "1");
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        console.warn("[PlServerGateLedgerBootstrap] mirror failed", e);
      } finally {
        runningRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return null;
}
