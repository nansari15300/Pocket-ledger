"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { readBankSpendWiseView, writeBankSpendWiseView } from "@/lib/ledgerViewModeStorage";

/** Bank/cash ledger: Statement vs Spend wise — persists across refresh per company. */
export function useBankSpendWiseView() {
  const { companyId } = useCompany();
  const [spendWiseView, setSpendWiseViewState] = useState(() => readBankSpendWiseView(companyId));

  useEffect(() => {
    setSpendWiseViewState(readBankSpendWiseView(companyId));
  }, [companyId]);

  const setSpendWiseView = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setSpendWiseViewState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        writeBankSpendWiseView(companyId, next);
        return next;
      });
    },
    [companyId]
  );

  const toggleSpendWiseView = useCallback(() => {
    setSpendWiseView((prev) => !prev);
  }, [setSpendWiseView]);

  return { spendWiseView, setSpendWiseView, toggleSpendWiseView };
}
