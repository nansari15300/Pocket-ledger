"use client";

import React, { createContext, useContext, useState } from "react";

type ReportListContextValue = {
  reportListOpen: boolean;
  setReportListOpen: (open: boolean) => void;
};

const ReportListContext = createContext<ReportListContextValue>({
  reportListOpen: false,
  setReportListOpen: () => {},
});

export function ReportListProvider({ children }: { children: React.ReactNode }) {
  const [reportListOpen, setReportListOpen] = useState(false);
  return (
    <ReportListContext.Provider value={{ reportListOpen, setReportListOpen }}>
      {children}
    </ReportListContext.Provider>
  );
}

export const useReportList = () => useContext(ReportListContext);
