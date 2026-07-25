"use client";

import { useEffect, useRef } from "react";
import type { LocalAppServerConfig } from "@/lib/electronLocalServer";
import { isBrowserLoopbackDevHost, isLocalAppServerDevPreview } from "@/lib/localAppServerDevPreview";
import { runDevHostBridgeJob } from "@/lib/devPlHostBridge/handlers";

/**
 * Web/dev host bridge: the side PL sharing server asks this browser tab for
 * IndexedDB/SQLite data. Only the tab that actually owns shareable host-local
 * companies should claim jobs; client/mirrored tabs must leave jobs for host.
 */
export function DevPlHostBridgeWorker() {
  const busyRef = useRef(false);
  const eligibleUntilRef = useRef(0);
  const eligibleRef = useRef(false);

  useEffect(() => {
    if (!isLocalAppServerDevPreview()) return;
    if (typeof window === "undefined") return;
    if (
      !isBrowserLoopbackDevHost() &&
      (window as unknown as { __plIsCanonicalServerBridge?: boolean }).__plIsCanonicalServerBridge !== true
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loadServerConfig = async (): Promise<LocalAppServerConfig | null> => {
      try {
        const res = await fetch("/api/dev-pl-local-server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getConfig" }),
        });
        if (!res.ok) return null;
        return (await res.json()) as LocalAppServerConfig;
      } catch {
        return null;
      }
    };

    const canClaimHostBridgeJob = async () => {
      const now = Date.now();
      if (now < eligibleUntilRef.current) return eligibleRef.current;
      eligibleUntilRef.current = now + 2500;
      eligibleRef.current = false;

      const cfg = await loadServerConfig();
      if (!cfg || (cfg.appRole !== "server" && cfg.appRole !== "both")) return false;

      const shareableRows =
        typeof (window as unknown as { __plListShareableLocalCompanies?: unknown })
          .__plListShareableLocalCompanies === "function"
          ? await (window as unknown as {
              __plListShareableLocalCompanies: () => Promise<Array<{ id?: string }>>;
            }).__plListShareableLocalCompanies()
          : [];
      const shareableIds = new Set(
        shareableRows.map((row) => String(row?.id || "").trim()).filter(Boolean)
      );
      if (!shareableIds.size) return false;

      const configured = cfg.sharedLocalCompanyIds;
      eligibleRef.current = Array.isArray(configured)
        ? configured.some((id) => shareableIds.has(String(id || "").trim()))
        : true;
      return eligibleRef.current;
    };

    const poll = async () => {
      if (cancelled || busyRef.current) return;
      try {
        if (!(await canClaimHostBridgeJob())) return;
        const res = await fetch("/api/dev-pl-host-bridge?action=claim", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          job?: { id?: string; type?: string; payload?: Record<string, unknown> };
        };
        const job = data.job;
        if (!job?.id || !job.type) return;
        busyRef.current = true;
        let result: unknown = null;
        try {
          result = await runDevHostBridgeJob(job.type, job.payload || {});
        } catch (e) {
          result = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
        await fetch("/api/dev-pl-host-bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", jobId: job.id, result }),
        });
      } catch {
        /* ignore transient dev errors */
      } finally {
        busyRef.current = false;
      }
    };

    const tick = () => {
      void poll().finally(() => {
        if (!cancelled) timer = setTimeout(tick, 400);
      });
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
