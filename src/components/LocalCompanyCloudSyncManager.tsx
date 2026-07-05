"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import { readCloudSyncConfigFromCompany, shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { purgeAllLocalCompaniesMissingOnDrive } from "@/lib/localCloudSync/driveCompanyFolderLifecycle";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";
import { MIN_CLOUD_SYNC_TICK_MS } from "@/lib/localCloudSync/types";
import { hasRealFirebaseAuthSession, waitForFirebaseAuthReady } from "@/lib/firebaseAuthForApi";

/** Har MIN tick: enabled companies — har company ka apna interval (2–60 sec). */
export function LocalCompanyCloudSyncManager() {
  const { company, clearCompanyId, reloadLocalCompanyRegistry } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const runningRef = useRef(false);
  // Company-wise last run — alag interval respect karne ke liye.
  const lastRunByCompanyRef = useRef<Map<string, number>>(new Map());
  const lastDrivePurgeAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = async () => {
      if (runningRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      // Local unlock synthetic user par Drive API mat chalao — Firebase session ka wait.
      await waitForFirebaseAuthReady();
      if (!hasRealFirebaseAuthSession()) return;
      runningRef.current = true;
      try {
        const now = Date.now();
        // ~60 sec: Drive sync ON par folder gayab companies device se hatao.
        if (now - lastDrivePurgeAtRef.current >= 60_000) {
          lastDrivePurgeAtRef.current = now;
          const purged = await purgeAllLocalCompaniesMissingOnDrive(user?.uid ?? null);
          if (purged.length > 0) {
            reloadLocalCompanyRegistry();
            if (company?.id && purged.some((p) => p.companyId === company.id)) {
              clearCompanyId();
            }
            for (const row of purged) {
              toast({
                title: "Company removed",
                description: `"${row.companyName}" Google Drive par nahi mili (sync ON) — is device se hata di.`,
              });
            }
          }
        }

        const companies = await listLocalCompanies();
        for (const c of companies) {
          if (!(await shouldUseLocalCloudSync(c.id))) continue;
          const cfg = readCloudSyncConfigFromCompany(c);
          const intervalMs = cfg.cloudSyncIntervalSec * 1000;
          const lastRun = lastRunByCompanyRef.current.get(c.id) ?? 0;
          if (now - lastRun < intervalMs) continue;
          lastRunByCompanyRef.current.set(c.id, now);
          await runLocalCloudSyncCycle(c.id);
        }
      } catch (e) {
        logLocalCloudSync("background tick error", e);
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), MIN_CLOUD_SYNC_TICK_MS);
    return () => window.clearInterval(id);
  }, [company?.id, clearCompanyId, reloadLocalCompanyRegistry, toast, user?.uid]);

  return null;
}
