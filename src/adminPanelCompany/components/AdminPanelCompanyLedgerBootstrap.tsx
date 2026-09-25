"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  isAdminPanelCompanyLedgerMode,
  isAdminPanelCompanyLocalId,
} from "@/lib/adminPanelCompany/ledgerMode";
import {
  ensureAdminPanelCompanyCloud,
  selectAdminPanelCompanyInApp,
} from "@/lib/adminPanelCompany/ensureAdminPanelCompany";
import { backfillAdminPanelSubscriptionMirrors } from "@/lib/adminPanelCompany/backfillSubscriptionMirrors";
import { syncAdminPanelLedgerSnapshotToSqlite } from "@/lib/adminPanelCompany/syncLedgerSnapshotToSqlite";
import { toast } from "sonner";

/**
 * When SuperAdmin opens Admin Panel Company, reuse normal dashboard chrome with this company id.
 */
export function AdminPanelCompanyLedgerBootstrap() {
  const { user } = useAuth();
  const { companyId, setCompanyId } = useCompany();
  const syncOnce = useRef(false);

  useEffect(() => {
    if (!isAdminPanelCompanyLedgerMode()) return;
    if (!user?.uid) return;

    void (async () => {
      try {
        await ensureAdminPanelCompanyCloud();
      } catch (e) {
        toast.warning(
          e instanceof Error ? e.message : "Cloud company not ready — using local mirror only"
        );
      }
      if (!isAdminPanelCompanyLocalId(companyId)) {
        await selectAdminPanelCompanyInApp(user.uid, user.email, setCompanyId);
      }
      if (syncOnce.current) return;
      syncOnce.current = true;
      try {
        await backfillAdminPanelSubscriptionMirrors();
        await syncAdminPanelLedgerSnapshotToSqlite();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not sync Admin Panel Company ledger");
      }
    })();
  }, [companyId, setCompanyId, user?.email, user?.uid]);

  useEffect(() => {
    const onMode = () => {
      syncOnce.current = false;
    };
    window.addEventListener("pl-admin-panel-company-mode", onMode);
    return () => window.removeEventListener("pl-admin-panel-company-mode", onMode);
  }, []);

  return null;
}
