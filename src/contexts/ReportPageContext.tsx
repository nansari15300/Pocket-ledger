"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ReportPageContextValue = {
  /** When set, back button should call this instead of router.back() */
  onBackToReportList: (() => void) | null;
  /** Desktop reports hub: left report list panel visible. */
  isDesktopReportListOpen: boolean;
  /** Desktop reports hub: reopen collapsed report list panel. */
  onShowDesktopReportList: (() => void) | null;
  /** Report detail blue ribbon — child report injects checkbox / quick filters. */
  detailRibbonContent: React.ReactNode | null;
  setDetailRibbonContent: (content: React.ReactNode | null) => void;
};

const ReportPageContext = createContext<ReportPageContextValue>({
  onBackToReportList: null,
  isDesktopReportListOpen: true,
  onShowDesktopReportList: null,
  detailRibbonContent: null,
  setDetailRibbonContent: () => {},
});

export function ReportPageProvider({
  children,
  onBackToReportList,
  isDesktopReportListOpen = true,
  onShowDesktopReportList = null,
}: {
  children: React.ReactNode;
  onBackToReportList: (() => void) | null;
  isDesktopReportListOpen?: boolean;
  onShowDesktopReportList?: (() => void) | null;
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
      isDesktopReportListOpen,
      onShowDesktopReportList,
      detailRibbonContent,
      setDetailRibbonContent,
    }),
    [
      onBackToReportList,
      isDesktopReportListOpen,
      onShowDesktopReportList,
      detailRibbonContent,
      setDetailRibbonContent,
    ]
  );

  return (
    <ReportPageContext.Provider value={value}>{children}</ReportPageContext.Provider>
  );
}

export const useReportPage = () => useContext(ReportPageContext);
