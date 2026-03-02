
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ReportList } from "@/components/reports/ReportList";
import { reports, type Report } from "@/components/reports/report-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Search, PanelRight } from "lucide-react";
import { ReportDetails } from "@/components/reports/ReportDetails";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { usePageMemory } from "@/hooks/usePageMemory";
import { useReportList } from "@/contexts/ReportListContext";
import { ReportPageProvider } from "@/contexts/ReportPageContext";
import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { useCompany } from "@/hooks/useCompany";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function ReportsPage() {
  return (
    <PermissionRouteGuard permission="export_data">
      <ReportsPageContent />
    </PermissionRouteGuard>
  );
}

function ReportsPageContent() {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setIsOpen } = useSidebar();
  const { company } = useCompany();

  // Auto-minimize app sidebar when any voucher report is selected (Sale, Purchase, Payment In, etc.)
  const voucherReportIds = ["sale", "purchase", "payment-in", "payment-out", "add-salary", "contra", "journal", "notes", "anusuchi-13"];
  useEffect(() => {
    if (pathname?.startsWith("/reports") && selectedReport?.id && voucherReportIds.includes(selectedReport.id)) {
      setIsOpen(false);
    }
  }, [pathname, selectedReport?.id, setIsOpen]);

  const reportsForCompany = useMemo(() => {
    if (company?.country !== undefined) {
      return reports.filter(
        (r) => !r.countryOnly || r.countryOnly === company.country
      );
    }
    return reports.filter((r) => !r.countryOnly);
  }, [company?.country]);

  // Restore selection from URL on load/refresh (so refresh keeps you on the details page)
  const hasRestoredFromUrl = React.useRef(false);
  useEffect(() => {
    if (loading || reportsForCompany.length === 0 || hasRestoredFromUrl.current) return;
    const reportIdFromUrl = searchParams.get("report");
    if (reportIdFromUrl) {
      const found = reportsForCompany.find((r) => r.id === reportIdFromUrl);
      if (found) {
        hasRestoredFromUrl.current = true;
        setSelectedReportWithUrl(found);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hasRestoredFromUrl ref prevents re-restore
  }, [loading, reportsForCompany, searchParams]);

  // Sync selection to URL when it changes (enables refresh to persist)
  const setSelectedReportWithUrl = useCallback(
    (report: Report | null) => {
      setSelectedReport(report);
      const params = new URLSearchParams(searchParams.toString());
      if (report) {
        params.set("report", report.id);
      } else {
        params.delete("report");
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, searchParams, router]
  );

  // This hook now manages selection memory and auto-selection (disable auto-select on mobile - show list full page first)
  // urlSelectedId: when URL has report param, use it so refresh keeps you on the same page (Day Book, Account Summary, etc.)
  usePageMemory<Report>(
    "reportsPageState",
    "list",
    () => {},
    selectedReport,
    setSelectedReportWithUrl,
    reportsForCompany,
    loading,
    isMobile,
    searchParams.get("report")
  );

  const { reportListOpen, setReportListOpen } = useReportList();

  useEffect(() => {
    setLoading(false); 
  }, []);

  const filteredReports = useMemo(() => {
    if (!searchTerm) return reportsForCompany;
    return reportsForCompany.filter(
      (report) =>
        report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, reportsForCompany]);

  if (loading) {
      return <LoadingSpinner />
  }

  const listView = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
         <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search reports..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>
      <ReportList 
        reports={filteredReports}
        onSelectReport={(r) => {
          setSelectedReportWithUrl(r);
          setReportListOpen(false);
        }}
        selectedReport={selectedReport}
      />
    </div>
  );

  const detailView = (
    selectedReport ? (
      <ReportDetails report={selectedReport} />
    ) : (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a report to view details
      </div>
    )
  );

  // Mobile: list full page when no selection; details full page with report list as right-side Sheet when selected
  if (isMobile) {
    return (
      <>
        {!selectedReport ? (
          // List full page
          <div className="h-full w-full overflow-hidden bg-background flex flex-col">
            <div className="p-4 border-b flex-shrink-0">
              <h1 className="text-xl font-bold font-headline">Reports</h1>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {listView}
            </div>
          </div>
        ) : (
          // Details full page (no duplicate header - report component has its own header)
          <ReportPageProvider onBackToReportList={() => setSelectedReportWithUrl(null)}>
            <div className="h-full w-full overflow-hidden bg-background flex flex-col">
              <div className="flex-1 min-h-0 overflow-hidden">{detailView}</div>
            </div>
          </ReportPageProvider>
        )}
        {/* Report list Sheet - slides from right (like app sidebar) */}
        <Sheet open={reportListOpen} onOpenChange={setReportListOpen}>
          <SheetContent side="right" className="w-72 p-0 sm:max-w-[280px]">
            <SheetHeader className="p-4 pb-2">
              <SheetTitle>Reports</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto">
                <ReportList
                  reports={filteredReports}
                  onSelectReport={(r) => {
                    setSelectedReportWithUrl(r);
                    setReportListOpen(false);
                  }}
                  selectedReport={selectedReport}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <ResponsiveMasterDetail
      title="Reports"
      balance=""
      listView={listView}
      detailView={detailView}
      isMobile={isMobile}
    />
  );
}
