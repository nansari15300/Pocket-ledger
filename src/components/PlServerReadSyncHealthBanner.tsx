"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import {
  getPlServerReadSyncHealth,
  PL_SERVER_READ_SYNC_HEALTH_EVENT,
  type PlServerReadSyncHealthSnapshot,
} from "@/lib/plServerReadSyncHealth";

function formatRelativeTime(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const deltaSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (deltaSec < 8) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function formatHostUrl(snap: PlServerReadSyncHealthSnapshot): string | null {
  const url = String(snap.lastAttemptServerUrl || "").trim();
  return url || null;
}

function bannerLabel(snap: PlServerReadSyncHealthSnapshot): string | null {
  const hostUrl = formatHostUrl(snap);
  const hostHint = hostUrl ? ` (${hostUrl})` : "";
  if (snap.protocolMismatch) {
    return "Server sync blocked — app version mismatch with Host. Update Pocket Ledger on all PCs.";
  }
  switch (snap.state) {
    case "offline":
      return "Offline — voucher data may be outdated until you reconnect.";
    case "sharing_unavailable":
      return `Cannot reach Host sharing${hostHint} — keep Pocket Ledger open on the server PC with sharing on.`;
    case "reconnecting":
      return hostUrl
        ? `Reconnecting to Host at ${hostUrl} — refreshing voucher data…`
        : "Reconnecting to Host — refreshing voucher data…";
    case "pull_failed":
      if (snap.lastError === "host_mirror_empty_or_unreachable") {
        return `Host at ${hostUrl || "server"} has no ledger data for this company — open it on the server PC browser with sharing ON.`;
      }
      return snap.consecutiveFailures > 1
        ? `Could not refresh from Host${hostHint} (${snap.consecutiveFailures} attempts) — check LAN and sharing.`
        : hostUrl
          ? `Could not refresh latest data from Host at ${hostUrl} — will retry automatically.`
          : "Could not refresh latest data from Host — will retry automatically.";
    case "synced":
      if (snap.lastError === "offline_cached_view") {
        return "Offline — showing saved data. Edits resume when Host is reachable.";
      }
      return null;
    default:
      return null;
  }
}

/** Read-path operator visibility — live pull health only (not pending write queue). */
export function PlServerReadSyncHealthBanner() {
  const { companyId, company } = useCompany();
  const [snap, setSnap] = useState<PlServerReadSyncHealthSnapshot | null>(null);

  const refresh = useCallback(() => {
    const id = String(companyId || "").trim();
    if (!id) {
      setSnap(null);
      return;
    }
    setSnap(getPlServerReadSyncHealth(id));
  }, [companyId]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(PL_SERVER_READ_SYNC_HEALTH_EVENT, onChange);
    return () => window.removeEventListener(PL_SERVER_READ_SYNC_HEALTH_EVENT, onChange);
  }, [refresh]);

  const id = String(companyId || "").trim();
  const isServerRow =
    company?.plServerShared === true || (company != null && isServerGateCompany(company));
  if (!id || !isServerRow || !snap) return null;

  const label = bannerLabel(snap);
  if (!label) return null;

  const lastOk = formatRelativeTime(snap.lastSuccessAtMs);

  return (
    <div className="border-b border-sky-200 bg-sky-50 px-3 py-1.5 text-center text-xs text-sky-950">
      {label}
      {lastOk ? ` Last successful sync: ${lastOk}.` : null}
    </div>
  );
}
