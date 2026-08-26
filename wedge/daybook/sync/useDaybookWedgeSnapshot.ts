"use client";

import { useEffect, useMemo, useState } from "react";
import { startOfDay, subDays } from "date-fns";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { useTransactions } from "@/hooks/use-transactions";
import { useDate } from "@/hooks/useDate";
import type { DaybookWedgeSnapshot } from "@wedge/daybook/types/daybookWedgeRow";
import { effectiveWedgeDateSystem } from "@wedge/shared/isNepalCalendarCompany";
import {
  buildDaybookWedgeSnapshotFromProcessed,
  DAYBOOK_WEDGE_SYNC_DAY_COUNT,
  formatDayLabelForSystem,
} from "@wedge/daybook/sync/buildDaybookSnapshot";

type UseDaybookWedgeSnapshotOpts = {
  /** Dev preview only — overrides app date system when set. */
  dateSystemOverride?: "AD" | "BS" | "Both";
};

/** Same snapshot builder the native widget receives (DaybookWedgeSyncManager). */
export function useDaybookWedgeSnapshot(
  opts?: UseDaybookWedgeSnapshotOpts
): DaybookWedgeSnapshot | null {
  const { company, companyId, allCompaniesRegistry } = useCompany();
  const { vouchers, processedAccounts: accounts } = useVouchers();
  const { formatCurrencyForPrint, formatDate, formatDateBS, dateSystem } = useDate();
  const [companySwitchTick, setCompanySwitchTick] = useState(0);

  const rangeFrom = useMemo(
    () => subDays(startOfDay(new Date()), DAYBOOK_WEDGE_SYNC_DAY_COUNT - 1),
    []
  );
  const rangeTo = useMemo(() => startOfDay(new Date()), []);

  const { daybookTransactions } = useTransactions(
    { id: "daybook", items: [] },
    "daybook",
    { from: rangeFrom, to: rangeTo },
    undefined,
    accounts,
    vouchers
  );

  const companies = useMemo(
    () =>
      (allCompaniesRegistry || []).map((c) => ({
        id: String(c.id),
        name: String(c.name || "Company"),
      })),
    [allCompaniesRegistry]
  );

  useEffect(() => {
    const onCompanySwitched = () => setCompanySwitchTick((t) => t + 1);
    window.addEventListener("pl-company-switched", onCompanySwitched);
    return () => window.removeEventListener("pl-company-switched", onCompanySwitched);
  }, []);

  return useMemo(() => {
    if (!companyId || !company) return null;
    const preferred = opts?.dateSystemOverride ?? dateSystem;
    const ds = effectiveWedgeDateSystem(company, preferred);
    return buildDaybookWedgeSnapshotFromProcessed({
      companyId,
      companyName: company.name || "Company",
      company,
      companies: companies.length ? companies : [{ id: companyId, name: company.name || "Company" }],
      dateSystem: ds,
      accounts: accounts ?? [],
      vouchers,
      processedTransactions: daybookTransactions || [],
      formatCurrency: formatCurrencyForPrint,
      formatDate,
      formatDateBS,
      formatDayLabel: (day) => formatDayLabelForSystem(day, ds, formatDate, formatDateBS),
    });
  }, [
    accounts,
    company,
    company?.id,
    company?.name,
    companies,
    companyId,
    companySwitchTick,
    dateSystem,
    daybookTransactions,
    formatCurrencyForPrint,
    formatDate,
    formatDateBS,
    opts?.dateSystemOverride,
    vouchers,
  ]);
}
