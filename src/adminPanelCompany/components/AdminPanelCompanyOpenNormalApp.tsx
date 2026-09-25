"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { backfillAdminPanelSubscriptionMirrors } from "@/lib/adminPanelCompany/backfillSubscriptionMirrors";
import { selectAdminPanelCompanyInApp } from "@/lib/adminPanelCompany/ensureAdminPanelCompany";
import { syncAdminPanelLedgerSnapshotToSqlite } from "@/lib/adminPanelCompany/syncLedgerSnapshotToSqlite";

/** Admin → Company: normal dashboard UI + admin panel company id. */
export function AdminPanelCompanyOpenNormalApp() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { setCompanyId } = useCompany();

  useEffect(() => {
    if (loading) return;
    if (!user?.uid) {
      router.replace("/admin");
      return;
    }
    void (async () => {
      await selectAdminPanelCompanyInApp(user.uid, user.email, setCompanyId);
      await backfillAdminPanelSubscriptionMirrors();
      await syncAdminPanelLedgerSnapshotToSqlite();
      router.replace("/dashboard");
    })();
  }, [loading, router, setCompanyId, user?.email, user?.uid]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Opening Pocket Ledger company…
    </div>
  );
}
