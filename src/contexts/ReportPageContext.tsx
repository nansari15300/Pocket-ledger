"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ReportPageContextValue = {
  /** When set, back button should call this instead of router.back() */
  onBackToReportList: (() => void) | null;
  /** Report detail blue ribbon — child report injects checkbox / quick filters. */
  detailRibbonContent: React.ReactNode | null;
  setDetailRibbonContent: (content: React.ReactNode | null) => void;
};

const ReportPageContext = createContext<ReportPageContextValue>({
  onBackToReportList: null,
  detailRibbonContent: null,
  setDetailRibbonContent: () => {},
});

export function ReportPageProvider({
  children,
  onBackToReportList,
}: {
  children: React.ReactNode;
  onBackToReportList: (() => void) | null;
}) {
  const [detailRibbonContent, setDetailRibbonContentState] = useState<React.ReactNode | null>(
    null
  );
  const setDetailRibbonContent = useCallback((content: React.ReactNode | null) => {
    setDetailRibbonContentState(content);
  }, []);

  const value = useMemo(
    () => ({
      onBackToReportList,
      detailRibbonContent,
      setDetailRibbonContent,
    }),
    [onBackToReportList, detailRibbonContent, setDetailRibbonContent]
  );

  return (
    <ReportPageContext.Provider value={value}>{children}</ReportPageContext.Provider>
  );
}

export const useReportPage = () => useContext(ReportPageContext);
