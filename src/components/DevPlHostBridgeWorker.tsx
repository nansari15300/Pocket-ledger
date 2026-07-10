"use client";

import { useEffect, useRef } from "react";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { runDevHostBridgeJob } from "@/lib/devPlHostBridge/handlers";

/**
 * Web/dev host: PL sharing server (port 3001) Node process ko browser SQLite bridge deta hai.
 * Server PC par yeh tab khula rehna chahiye jab remote clients connect karein.
 */
export function DevPlHostBridgeWorker() {
  const busyRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;
    // Server PC loopback tab — bridge host IndexedDB to port 3001 sharing server.
    if (!isLocalAppServerHost()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled || busyRef.current) return;
      try {
        const res = await fetch("/api/dev-pl-host-bridge?action=claim", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { job?: { id?: string; type?: string; payload?: Record<string, unknown> } };
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
