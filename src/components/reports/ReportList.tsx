
"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Report } from "./report-data";
import { FileText, Users, ReceiptText, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MasterListRow } from "@/components/ui/master-list-row";

interface ReportListProps {
  reports: Report[];
  onSelectReport: (report: Report) => void;
  selectedReport?: Report | null;
}

export function ReportList({
  reports,
  onSelectReport,
  selectedReport,
}: ReportListProps) {
  // Report-specific icon mapping keeps Party/Bill/Income P&L entries visually distinct in list.
  const getReportIcon = (reportId: string) => {
    if (reportId === "profitandloss") return TrendingUp;
    if (reportId === "profitandloss-party-wise") return Users;
    if (reportId === "profitandloss-bill-wise") return ReceiptText;
    return FileText;
  };
  const CATEGORY_ORDER: Report["category"][] = [
    "Financial",
    "Party",
    "Staff",
    "Bank/Cash",
    "Sales/Purchase",
    "Payments",
    "Inventory",
    "Accounting",
    "Tax/GST",
  ];

  // Category grouping: easier scan for Party/Staff/Bank etc in long report menus.
  const groupedReports = CATEGORY_ORDER.map((category) => ({
    category,
    items: reports.filter((report) => report.category === category),
  })).filter((group) => group.items.length > 0);

  return (
     <ScrollArea listChrome className="flex-1 min-h-0">
        <ul className="p-2 space-y-2">
            {groupedReports.map((group) => (
              <li key={group.category} className="space-y-1">
                <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.category}
                </p>
                {group.items.map((report) => {
                const isSelected = selectedReport?.id === report.id;
                const ReportIcon = getReportIcon(report.id);
                const cardContent = (
                  <div className="flex items-center gap-2">
                    {/* Keep fallback icon behavior while enabling requested custom report icons. */}
                    <ReportIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium truncate">{report.name}</p>
                  </div>
                );
                return (
                    <div key={report.id}>
                        {report.href ? (
                          <Link href={report.href}>
                            <MasterListRow className="hover:border-orange-300/80 hover:bg-orange-50/30">
                              {cardContent}
                            </MasterListRow>
                          </Link>
                        ) : (
                          <MasterListRow
                            className={cn(
                              !isSelected && "hover:border-orange-300/80 hover:bg-orange-50/30"
                            )}
                            onClick={() => onSelectReport(report)}
                          >
                            {cardContent}
                          </MasterListRow>
                        )}
                    </div>
                )
            })}
              </li>
            ))}
             {reports.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground p-8">
                    No reports found.
                </div>
            )}
        </ul>
      </ScrollArea>
  );
}
