"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getCachedPlServerReachability,
  plServerUrlFromCompany,
  watchPlServerReachability,
  PL_SERVER_REACHABILITY_CHANGED_EVENT,
  type PlServerReachability,
} from "@/lib/plServerReachability";
import { isServerGateCompany } from "@/lib/companyStorageKind";

/** Green/red status dot for PL Server company (online/offline). */
export function PlServerOnlineStatusDot({
  company,
  className,
  titlePrefix = "PL Server",
}: {
  company: unknown;
  className?: string;
  titlePrefix?: string;
}) {
  const serverUrl = plServerUrlFromCompany(company);
  const companyId =
    company && typeof company === "object"
      ? String((company as { id?: string }).id || "").trim() || null
      : null;
  const show = Boolean(serverUrl && isServerGateCompany(company as any));
  const [status, setStatus] = useState<PlServerReachability>(() => {
    if (!show) return "unknown";
    return getCachedPlServerReachability(serverUrl)?.status ?? "unknown";
  });

  useEffect(() => {
    if (!show || !serverUrl) {
      setStatus("unknown");
      return;
    }
    setStatus(getCachedPlServerReachability(serverUrl)?.status ?? "unknown");
    const stop = watchPlServerReachability(serverUrl, companyId);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ serverUrl?: string; status?: PlServerReachability }>).detail;
      if (!detail || detail.serverUrl !== serverUrl) return;
      if (detail.status) setStatus(detail.status);
    };
    window.addEventListener(PL_SERVER_REACHABILITY_CHANGED_EVENT, onChange);
    return () => {
      stop();
      window.removeEventListener(PL_SERVER_REACHABILITY_CHANGED_EVENT, onChange);
    };
  }, [show, serverUrl, companyId]);

  if (!show) return null;

  const online = status === "online";
  const offline = status === "offline";
  const label = online ? "Online" : offline ? "Offline" : "Checking…";

  return (
    <span
      className={cn(
        "inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white",
        online && "bg-emerald-500",
        offline && "bg-red-500",
        !online && !offline && "bg-slate-300",
        className
      )}
      title={`${titlePrefix}: ${label}`}
      aria-label={`${titlePrefix} ${label}`}
      data-pl-server-status={status}
    />
  );
}
