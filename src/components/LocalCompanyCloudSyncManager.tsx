"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import {
  pullCompanyRegistryManifestFromDrive,
  readCloudSyncConfigFromCompany,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { purgeAllLocalCompaniesMissingOnDrive } from "@/lib/localCloudSync/driveCompanyFolderLifecycle";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";
import { CLOUD_SYNC_POKE_EVENT, MIN_CLOUD_SYNC_TICK_MS } from "@/lib/localCloudSync/types";
import { CLOUD_SYNC_POKE_DEBOUNCE_MS } from "@/lib/firebaseBillingOptimization";
import { hasRealFirebaseAuthSession, waitForFirebaseAuthReady } from "@/lib/firebaseAuthForApi";

/** Har MIN tick: enabled companies — har company ka apna interval (live/sec/min presets). */
export function LocalCompanyCloudSyncManager() {
  const { company, clearCompanyId, reloadLocalCompanyRegistry } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const runningRef = useRef(false);
  const pokeDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Company-wise last run — alag interval respect karne ke liye.
  const lastRunByCompanyRef = useRef<Map<string, number>>(new Map());
  const lastDrivePurgeAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const runCycleForCompany = async (companyId: string) => {
      if (!companyId || runningRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      await waitForFirebaseAuthReady();
      if (!hasRealFirebaseAuthSession()) return;
      if (!(await shouldUseLocalCloudSync(companyId))) return;
      runningRef.current = true;
      try {
        lastRunByCompanyRef.current.set(companyId, Date.now());
        await runLocalCloudSyncCycle(companyId, { force: true });
      } catch (e) {
        logLocalCloudSync("poke sync error", e);
      } finally {
        runningRef.current = false;
      }
    };

    const onPoke = (ev: Event) => {
      const cid = String((ev as CustomEvent<{ companyId?: string }>).detail?.companyId || "").trim();
      if (!cid) return;
      const pending = pokeDebounceRef.current.get(cid);
      if (pending) clearTimeout(pending);
      const timer = setTimeout(() => {
        pokeDebounceRef.current.delete(cid);
        void runCycleForCompany(cid);
      }, CLOUD_SYNC_POKE_DEBOUNCE_MS);
      pokeDebounceRef.current.set(cid, timer);
    };
    window.addEventListener(CLOUD_SYNC_POKE_EVENT, onPoke);

    const tick = async () => {
      if (runningRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      // Local unlock synthetic user par Drive API mat chalao — Firebase session ka wait.
      await waitForFirebaseAuthReady();
      if (!hasRealFirebaseAuthSession()) return;
      runningRef.current = true;
      try {
        const now = Date.now();
        // ~60 sec: Drive ka main folder gayab ho to local company hatao, sync se recreate mat karne do.
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
                description: `"${row.companyName}" is no longer on Google Drive and was removed from this device.`,
              });
            }
          }
        }

        // Pehle sab cloud-sync companies ka manifest pull — bin delete doosre device par (selector/recycle).
        const allRows = await listLocalCompanies({ includeDeleted: true });
        for (const c of allRows) {
          if (!(await shouldUseLocalCloudSync(c.id))) continue;
          try {
            await pullCompanyRegistryManifestFromDrive(c.id);
          } catch (e) {
            logLocalCloudSync("registry manifest pull failed", { companyId: c.id, err: e });
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
    return () => {
      window.removeEventListener(CLOUD_SYNC_POKE_EVENT, onPoke);
      for (const timer of pokeDebounceRef.current.values()) clearTimeout(timer);
      pokeDebounceRef.current.clear();
      window.clearInterval(id);
    };
  }, [company?.id, clearCompanyId, reloadLocalCompanyRegistry, toast, user?.uid]);

  return null;
}
