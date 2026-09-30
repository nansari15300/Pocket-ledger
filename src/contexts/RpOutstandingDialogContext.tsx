"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ReceivablesPayablesSideTab } from "@/components/reports/ReceivablesPayablesMobileSidePills";
import type { RpCategoryFilter } from "@/lib/receivablesPayablesDialogUi";
import { RpOutstandingDialogHost } from "@/components/reports/RpOutstandingDialogHost";

export type RpOutstandingDialogTab = ReceivablesPayablesSideTab | "both";

type RpOutstandingDialogContextValue = {
  open: boolean;
  tab: RpOutstandingDialogTab;
  filter: RpCategoryFilter;
  openOutstandingDialog: (tab?: RpOutstandingDialogTab) => void;
  closeOutstandingDialog: () => void;
  setOutstandingOpen: (open: boolean) => void;
  setOutstandingTab: (tab: RpOutstandingDialogTab) => void;
  setOutstandingFilter: (filter: RpCategoryFilter) => void;
};

const RpOutstandingDialogContext = createContext<RpOutstandingDialogContextValue | null>(null);

export function RpOutstandingDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<RpOutstandingDialogTab>("both");
  const [filter, setFilter] = useState<RpCategoryFilter>("all");

  const openOutstandingDialog = useCallback((nextTab: RpOutstandingDialogTab = "both") => {
    setFilter("all");
    setTab(nextTab);
    setOpen(true);
  }, []);

  const closeOutstandingDialog = useCallback(() => {
    setOpen(false);
    setTab("both");
  }, []);

  const value = useMemo(
    () => ({
      open,
      tab,
      filter,
      openOutstandingDialog,
      closeOutstandingDialog,
      setOutstandingOpen: setOpen,
      setOutstandingTab: setTab,
      setOutstandingFilter: setFilter,
    }),
    [open, tab, filter, openOutstandingDialog, closeOutstandingDialog]
  );

  return (
    <RpOutstandingDialogContext.Provider value={value}>
      {children}
      <RpOutstandingDialogHost />
    </RpOutstandingDialogContext.Provider>
  );
}

export function useRpOutstandingDialog(): RpOutstandingDialogContextValue {
  const ctx = useContext(RpOutstandingDialogContext);
  if (!ctx) {
    throw new Error("useRpOutstandingDialog must be used within RpOutstandingDialogProvider");
  }
  return ctx;
}
