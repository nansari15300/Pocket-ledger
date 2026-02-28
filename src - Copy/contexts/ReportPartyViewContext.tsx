"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

/** When true, the app header shows Bill wise / Statement toggle (only for party on Group Statement or Accounts Statement). */
type ReportPartyViewContextType = {
  showBillWiseToggle: boolean;
  setShowBillWiseToggle: (show: boolean) => void;
};

const ReportPartyViewContext = createContext<ReportPartyViewContextType | null>(null);

export function ReportPartyViewProvider({ children }: { children: React.ReactNode }) {
  const [showBillWiseToggle, setShowBillWiseToggle] = useState(false);
  const setter = useCallback((show: boolean) => setShowBillWiseToggle(show), []);
  return (
    <ReportPartyViewContext.Provider value={{ showBillWiseToggle, setShowBillWiseToggle: setter }}>
      {children}
    </ReportPartyViewContext.Provider>
  );
}

export function useReportPartyView(): ReportPartyViewContextType {
  const ctx = useContext(ReportPartyViewContext);
  if (!ctx) {
    return {
      showBillWiseToggle: false,
      setShowBillWiseToggle: () => {},
    };
  }
  return ctx;
}
