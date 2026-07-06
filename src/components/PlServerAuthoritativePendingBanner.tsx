"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { listPendingAuthoritativeCompanyDocWrites } from "@/lib/plServerAuthoritativePendingQueue";
import { PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED } from "@/lib/plServerAuthoritativePendingTypes";
import type { PendingAuthoritativeCompanyDocWrite } from "@/lib/plServerAuthoritativePendingTypes";

export function useAuthoritativePendingWrites(companyId?: string | null) {
  const [rows, setRows] = useState<PendingAuthoritativeCompanyDocWrite[]>([]);

  const refresh = useCallback(async () => {
    const all = await listPendingAuthoritativeCompanyDocWrites();
    const id = String(companyId || "").trim();
    setRows(id ? all.filter((r) => r.companyId === id) : all);
  }, [companyId]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED, onChange);
    return () => window.removeEventListener(PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED, onChange);
  }, [refresh]);

  return { rows, refresh, pendingCount: rows.length };
}

/** Queue-only pending indicator — not inferred from SQLite or mirror sync. */
export function PlServerAuthoritativePendingBanner() {
  const { companyId } = useCompany();
  const { rows } = useAuthoritativePendingWrites(companyId);

  if (!companyId || rows.length === 0) return null;

  const sending = rows.some((r) => r.state === "sending");
  const failed = rows.some((r) => r.state === "failed_permanent");
  const retrying = rows.some((r) => r.state === "retry_scheduled");

  let label = `${rows.length} change(s) waiting to sync with Host`;
  if (sending) label = "Syncing to Host…";
  else if (failed) label = "Some changes could not sync — check gate access";
  else if (retrying) label = "Host unavailable — retrying sync…";

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-950">
      {label}
    </div>
  );
}
