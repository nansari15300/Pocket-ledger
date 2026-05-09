"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { adToBs } from "@/lib/bs-date";
import { generateDueRecurringVouchersOnAppOpen } from "@/lib/recurringVouchers";

const RUNNER_SESSION_KEY_PREFIX = "pl-recurring-runner";

export function RecurringVoucherAutoRunner() {
  const { companyId, company } = useCompany();
  const { user } = useAuth();
  const { can } = usePermissions();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!companyId?.trim() || !company || !user?.uid) return;
    if (!can("create_records")) return;
    if (inFlightRef.current) return;

    const bsNow = adToBs(new Date());
    const periodKey = `${bsNow.y}-${String(bsNow.m).padStart(2, "0")}`;
    const dedupeKey = `${RUNNER_SESSION_KEY_PREFIX}:${companyId}:${user.uid}:${periodKey}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(dedupeKey) === "1") return;

    inFlightRef.current = true;
    void (async () => {
      try {
        // App-open runner: ek session/month me same user-company ke liye single pass run karo.
        await generateDueRecurringVouchersOnAppOpen(companyId, company, {
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
        });
        if (typeof window !== "undefined") sessionStorage.setItem(dedupeKey, "1");
      } catch (error) {
        console.error("[RecurringVoucherAutoRunner] failed", error);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [companyId, company, user?.uid, user?.email, user?.displayName, can]);

  return null;
}
