"use client";

import React, { createContext, useContext } from "react";

type ReportPageContextValue = {
  /** When set, back button should call this instead of router.back() */
  onBackToReportList: (() => void) | null;
};

const ReportPageContext = createContext<ReportPageContextValue>({
  onBackToReportList: null,
});

export function ReportPageProvider({
  children,
  onBackToReportList,
}: {
  children: React.ReactNode;
  onBackToReportList: (() => void) | null;
}) {
  return (
    <ReportPageContext.Provider value={{ onBackToReportList }}>
      {children}
    </ReportPageContext.Provider>
  );
}

export const useReportPage = () => useContext(ReportPageContext);
