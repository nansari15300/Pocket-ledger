
"use client";

import React, { Suspense, useState, useMemo, useEffect, useCallback, startTransition } from "react";
import dynamic from "next/dynamic";
import { ReportList } from "@/components/reports/ReportList";
import { reports, type Report } from "@/components/reports/report-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Search, PanelRight } from "lucide-react";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { usePageMemory } from "@/hooks/usePageMemory";
import { useReportList } from "@/contexts/ReportListContext";
import { ReportPageProvider } from "@/contexts/ReportPageContext";
import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { useCompany } from "@/hooks/useCompany";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEdgeSwipeTrigger } from "@/hooks/useMobileEdgeSwipe";
import { pathnameForModalRouterReplace } from "@/lib/modalUrlSync";
import { appNavHref } from "@/lib/appNavHref";
import { LEDGER_HEADER_RIBBON_WRAP_CN } from "@/lib/ledgerHeaderChrome";
import { useReportPage } from "@/contexts/ReportPageContext";
import { ResizeWidthHandle, useResizablePixelWidth } from "@/components/layout/ResizablePaneWidth";

const ReportDetails = dynamic(
  () => import("@/components/reports/ReportDetails").then((m) => m.ReportDetails),
  {
    ssr: false,
    loading: () => <LoadingSpinner />,
  }
);

/** Path + query same ho to `router.replace` mat chalao — static/Electron par dobara RSC fetch + "200ms refresh" feel. */
function reportListUrlMatchesWindow(targetPathAndQuery: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const next = new URL(targetPathAndQuery, window.location.origin);
    const cur = new URL(window.location.href);
    const norm = (p: string) => (p.replace(/\/+$/, "") || "/").toLowerCase();
    if (norm(next.pathname) !== norm(cur.pathname)) return false;
    const nq = new URLSearchParams(next.search);
    const cq = new URLSearchParams(cur.search);
    if ([...nq.keys()].length !== [...cq.keys()].length) return false;
    for (const k of nq.keys()) {
      if (nq.get(k) !== cq.get(k)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function ReportsPage() {
  return (
    <PermissionRouteGuard permission="export_data">
      {/* Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility. */}
      <Suspense fallback={<LoadingSpinner />}>
        <ReportsPageContent />
      </Suspense>
    </PermissionRouteGuard>
  );
}

function ReportsPageDetailRibbon() {
  const { detailRibbonContent } = useReportPage();
  if (!detailRibbonContent) return null;
  return <div className="min-w-0 flex-1">{detailRibbonContent}</div>;
}

function ReportsPageContent() {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDesktopReportListOpen, setIsDesktopReportListOpen] = useState(true);
  const isMobile = useIsMobile();
  const [loading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setIsOpen } = useSidebar();
  const { company } = useCompany();

  // Auto-collapse app sidebar whenever user is on reports page.
  useEffect(() => {
    if (pathname?.startsWith("/reports")) {
      startTransition(() => setIsOpen(false));
    }
  }, [pathname, setIsOpen]);

  const reportsForCompany = useMemo(() => {
    if (company?.country !== undefined) {
      return reports.filter(
        (r) => !r.countryOnly || r.countryOnly === company.country
      );
    }
    return reports.filter((r) => !r.countryOnly);
  }, [company?.country]);

  /** Purana bookmark `?report=accounts-statement` → Bank Statement (list me Account Summary hata diya). */
  const normalizeReportSearchParam = useCallback((id: string | null) => {
    if (!id) return null;
    if (id === "accounts-statement") return "bank-statement";
    return id;
  }, []);

  // Restore selection from URL on load/refresh (so refresh keeps you on the details page)
  const hasRestoredFromUrl = React.useRef(false);
  useEffect(() => {
    if (loading || reportsForCompany.length === 0 || hasRestoredFromUrl.current) return;
    const reportIdFromUrl = normalizeReportSearchParam(searchParams.get("report"));
    if (reportIdFromUrl) {
      const found = reportsForCompany.find((r) => r.id === reportIdFromUrl);
      if (found) {
        hasRestoredFromUrl.current = true;
        // URL pehle se dashboard deep-link se sahi hai — `setSelectedReportWithUrl` = extra `router.replace` + SW churn (EXE refresh).
        setSelectedReport(found);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hasRestoredFromUrl ref prevents re-restore
  }, [loading, reportsForCompany, searchParams, normalizeReportSearchParam]);

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
      const basePath = pathnameForModalRouterReplace(pathname || "");
      const nextRaw = q ? `${basePath}?${q}` : basePath;
      const nextHref = appNavHref(nextRaw);
      if (typeof window !== "undefined" && reportListUrlMatchesWindow(nextHref)) {
        return;
      }
      router.replace(nextHref, { scroll: false });
    },
    [pathname, searchParams, router]
  );

  // This hook now manages selection memory and auto-selection (disable auto-select on mobile - show list full page first)
  // urlSelectedId: refresh par URL precedence; legacy `accounts-statement` ko bank-statement map (`normalizeReportSearchParam`)
  usePageMemory<Report>(
    "reportsPageState",
    "list",
    () => {},
    selectedReport,
    setSelectedReportWithUrl,
    reportsForCompany,
    loading,
    isMobile,
    normalizeReportSearchParam(searchParams.get("report"))
  );

  const { reportListOpen, setReportListOpen } = useReportList();
  const { widthPx: reportListWidthPx, beginResize: beginReportListResize } = useResizablePixelWidth({
    storageKey: "pl-reports-list-width-px",
    defaultPx: 320,
    minPx: Math.round(256 * 0.7),
    maxPx: Math.round(256 * 1.3),
  });

  const openReportListSheet = useCallback(() => setReportListOpen(true), [setReportListOpen]);
  /** Mobile report detail: daen kinara se swipe left → list Sheet (header icon jaisa) */
  const reportListEdgeSwipe = useEdgeSwipeTrigger(
    Boolean(isMobile && selectedReport),
    "right",
    openReportListSheet
  );

  const filteredReports = useMemo(() => {
    if (!searchTerm) return reportsForCompany;
    return reportsForCompany.filter(
      (report) =>
        report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, reportsForCompany]);

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
      /* key={id}: dubara render par purana search/filter state recycle na ho — SPA me report swap same component-type */
      <ReportDetails key={selectedReport.id} report={selectedReport} />
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
            <div className="flex-shrink-0 border-b px-2 py-1">
              <h1 className="text-sm font-bold font-headline">Reports</h1>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {listView}
            </div>
          </div>
        ) : (
          // Details full page (no duplicate header - report component has its own header)
          <ReportPageProvider onBackToReportList={() => setSelectedReportWithUrl(null)}>
            <div
              className="h-full w-full overflow-hidden bg-background flex flex-col"
              onTouchStart={reportListEdgeSwipe.onTouchStart}
              onTouchEnd={reportListEdgeSwipe.onTouchEnd}
            >
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
    <ReportPageProvider onBackToReportList={() => setSelectedReportWithUrl(null)}>
      <div
        className="grid h-full overflow-hidden"
        style={{
          gridTemplateColumns: isDesktopReportListOpen
            ? `${reportListWidthPx}px minmax(0, 1fr)`
            : "0 minmax(0, 1fr)",
        }}
      >
        {/* Desktop report list behaves like collapsible app sidebar. */}
        <div
          className={cn(
            "border-r overflow-hidden transition-all duration-300",
            isDesktopReportListOpen ? "opacity-100" : "w-0 opacity-0"
          )}
          style={{ width: isDesktopReportListOpen ? reportListWidthPx : 0 }}
        >
          <div className="relative h-full min-w-0">
            <ResizeWidthHandle onPointerDown={beginReportListResize} title="Resize reports list" />
            <div className="p-4 border-b flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold font-headline">Reports</h1>
              {/* Dedicated hide control for report list panel. */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsDesktopReportListOpen(false)}
                title="Hide report list"
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100%-65px)] min-w-0">{listView}</div>
          </div>
        </div>
        <div className="min-w-0 flex flex-col overflow-hidden">
          <div
            className={cn(
              "flex shrink-0 gap-2",
              selectedReport?.ledgerDetailTopRibbon
                ? cn(LEDGER_HEADER_RIBBON_WRAP_CN, "items-center py-1")
                : "items-center border-b p-2"
            )}
          >
            {/* Sidebar-like show control for report list panel. */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsDesktopReportListOpen((prev) => !prev)}
              className="h-10 w-10 shrink-0 rounded-full"
              title={isDesktopReportListOpen ? "Hide report list" : "Show report list"}
              aria-label={isDesktopReportListOpen ? "Hide report list" : "Show report list"}
            >
              <PanelRight className="h-4 w-4" />
            </Button>
            <ReportsPageDetailRibbon />
            {!selectedReport?.ledgerDetailTopRibbon ? (
              <span className="truncate text-sm text-muted-foreground">
                {selectedReport ? selectedReport.name : "Select a report"}
              </span>
            ) : null}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">{detailView}</div>
        </div>
      </div>
    </ReportPageProvider>
  );
}
