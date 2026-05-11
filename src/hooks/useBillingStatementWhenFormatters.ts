"use client";

import { useCallback } from "react";
import { format as formatDateFns } from "date-fns";
import { useDate } from "@/hooks/useDate";

/**
 * Billing statement / PDF rows: global `dateSystem` (AD/BS/Both) + `HH:mm` — same rules on
 * `/billing/statement` and Billing & Plans footer Print (single source of truth).
 */
export function useBillingStatementWhenFormatters() {
  const { dateSystem, formatDate, formatDateBS } = useDate();

  const toValidDate = (ms: number | null): Date | null => {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatWhenSingleLine = useCallback(
    (ms: number | null): string => {
      const d = toValidDate(ms);
      if (!d) return "—";
      const clock = formatDateFns(d, "HH:mm");
      if (dateSystem === "AD") return `${formatDate(d)} ${clock}`;
      if (dateSystem === "BS") return `${formatDateBS(d)} ${clock}`;
      return `${formatDateBS(d)} ${clock}\n${formatDate(d)} ${clock}`;
    },
    [dateSystem, formatDate, formatDateBS]
  );

  const formatPlanExpirySummary = useCallback(
    (ms: number | null): string => {
      const d = toValidDate(ms);
      if (!d) return "—";
      const clock = formatDateFns(d, "HH:mm");
      if (dateSystem === "AD") return `${formatDate(d)} ${clock}`;
      if (dateSystem === "BS") return `${formatDateBS(d)} ${clock}`;
      return `${formatDateBS(d)} ${clock}\n${formatDate(d)} ${clock}`;
    },
    [dateSystem, formatDate, formatDateBS]
  );

  return { dateSystem, formatDate, formatDateBS, formatWhenSingleLine, formatPlanExpirySummary };
}
