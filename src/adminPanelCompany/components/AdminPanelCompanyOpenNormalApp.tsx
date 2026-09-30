"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  const [status, setStatus] = useState("Opening Pocket Ledger company…");

  useEffect(() => {
    if (loading) return;
    if (!user?.uid) {
      router.replace("/admin");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ready = await selectAdminPanelCompanyInApp(user.uid, user.email, setCompanyId);
        if (cancelled) return;
        if (!ready.cloudOk && ready.cloudError) {
          toast.warning(ready.cloudError + " — opening local Admin Panel Company.");
        }
        setStatus("Syncing ledger…");
        try {
          await backfillAdminPanelSubscriptionMirrors();
          await syncAdminPanelLedgerSnapshotToSqlite();
        } catch (e) {
          if (!cancelled) {
            toast.warning(
              e instanceof Error ? e.message : "Cloud ledger sync skipped — using local data"
            );
          }
        }
        if (!cancelled) router.replace("/dashboard");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not open Admin Panel Company";
        toast.error(msg);
        setStatus(msg);
        router.replace("/admin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, router, setCompanyId, user?.email, user?.uid]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      {status}
    </div>
  );
}
