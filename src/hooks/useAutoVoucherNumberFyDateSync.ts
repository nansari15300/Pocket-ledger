"use client";

import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { syncAutoVoucherNumberToDate } from "@/lib/syncAutoVoucherNumberToDate";

type Params = {
  form: UseFormReturn<any>;
  company: Record<string, unknown> | null | undefined;
  isAutoVoucherEnabled: boolean;
  /** Saved voucher edit — sync FY span on date change, keep serial. */
  editingSavedVoucher: boolean;
  /** New / type-convert — fetch next number when date changes. */
  shouldFetchNextOnDateChange: boolean;
  fetchVoucherNumber: (selectedPrefix?: string) => void | Promise<void>;
  resolvePrefix: () => string;
  numberField?: string;
  dateField?: string;
};

/** Auto voucher no: new → refetch on date; edit → reformat FY segment on date (all voucher forms). */
export function useAutoVoucherNumberFyDateSync(params: Params): void {
  const {
    form,
    company,
    isAutoVoucherEnabled,
    editingSavedVoucher,
    shouldFetchNextOnDateChange,
    fetchVoucherNumber,
    resolvePrefix,
    numberField = "voucherNumber",
    dateField = "date",
  } = params;

  const watchedDate = form.watch(dateField);
  const fetchRef = useRef(fetchVoucherNumber);
  fetchRef.current = fetchVoucherNumber;
  const prefixRef = useRef(resolvePrefix);
  prefixRef.current = resolvePrefix;

  useEffect(() => {
    if (!isAutoVoucherEnabled || !company) return;

    if (shouldFetchNextOnDateChange) {
      void fetchRef.current(prefixRef.current());
      return;
    }

    if (!editingSavedVoucher) return;

    const current = String(form.getValues(numberField) || "").trim();
    if (!current) return;

    const prefix = prefixRef.current();
    const next = syncAutoVoucherNumberToDate({
      companyDoc: company,
      prefix,
      currentVoucherNumber: current,
      voucherDate: watchedDate,
    });
    if (next && next !== current) {
      form.setValue(numberField, next, { shouldDirty: true });
    }
  }, [
    watchedDate,
    isAutoVoucherEnabled,
    company,
    editingSavedVoucher,
    shouldFetchNextOnDateChange,
    form,
    numberField,
  ]);
}
