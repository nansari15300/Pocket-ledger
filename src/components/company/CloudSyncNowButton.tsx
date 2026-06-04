"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  variant?: "ghost" | "outline" | "secondary" | "chromePill";
  size?: "sm" | "default" | "icon";
};

/** Header / toolbar — manual Drive sync (local cloud-sync companies only). */
export function CloudSyncNowButton({ className, variant = "outline", size = "sm" }: Props) {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cid = String(companyId || "").trim();
      if (!cid) {
        if (!cancelled) setVisible(false);
        return;
      }
      const ok = await shouldUseLocalCloudSync(cid);
      if (!cancelled) setVisible(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const syncNow = async () => {
    const cid = String(companyId || "").trim();
    if (!cid || busy) return;
    if (!(await shouldUseLocalCloudSync(cid))) return;
    setBusy(true);
    try {
      const res = await runLocalCloudSyncCycle(cid, { force: true });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Sync failed", description: res.error || "Try again." });
        return;
      }
      toast({
        title: "Sync complete",
        description: `Uploaded ${res.uploaded}, downloaded ${res.downloaded}.`,
      });
    } finally {
      setBusy(false);
    }
  };

  if (!visible || !companyId) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("h-9 gap-1.5", size === "icon" && "w-9 px-0", className)}
      data-theme-header="cloud-sync"
      disabled={busy}
      onClick={() => void syncNow()}
      title="Sync now with Google Drive"
    >
      <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
      {size !== "icon" ? <span className="hidden lg:inline">Sync</span> : null}
    </Button>
  );
}
