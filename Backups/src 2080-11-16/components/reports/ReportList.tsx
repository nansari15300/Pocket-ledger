
"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Report } from "./report-data";
import { FileText } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

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
  return (
     <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
            {reports.map((report) => {
                const isSelected = selectedReport?.id === report.id;
                const cardContent = (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium truncate">{report.name}</p>
                  </div>
                );
                return (
                    <li key={report.id}>
                        {report.href ? (
                          <Link href={report.href}>
                            <Card
                              className={cn(
                                "p-1.5 cursor-pointer border",
                                "hover:border-primary/50"
                              )}
                            >
                              {cardContent}
                            </Card>
                          </Link>
                        ) : (
                          <Card
                            className={cn(
                              "p-1.5 cursor-pointer border",
                              isSelected
                                ? "border-primary bg-secondary"
                                : "hover:border-primary/50"
                            )}
                            onClick={() => onSelectReport(report)}
                          >
                            {cardContent}
                          </Card>
                        )}
                    </li>
                )
            })}
             {reports.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground p-8">
                    No reports found.
                </div>
            )}
        </ul>
      </ScrollArea>
  );
}
