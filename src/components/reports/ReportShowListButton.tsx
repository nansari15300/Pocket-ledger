"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportPage } from "@/contexts/ReportPageContext";

/** Desktop reports hub: reopen collapsed left report list panel. */
export function ReportShowListButton() {
  const { isDesktopReportListOpen, onShowDesktopReportList } = useReportPage();

  if (isDesktopReportListOpen || !onShowDesktopReportList) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-7 w-7 shrink-0 rounded-full border-blue-300/90 bg-blue-100 text-blue-900 shadow-sm hover:bg-blue-200 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-900/50"
      onClick={onShowDesktopReportList}
      title="Show report list"
      aria-label="Show report list"
    >
      <PanelLeft className="h-3.5 w-3.5" />
    </Button>
  );
}
