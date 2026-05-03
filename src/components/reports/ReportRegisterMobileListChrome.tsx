"use client";

/**
 * Mobile register lists (Sale / Purchase / Payment / Contra / …):
 * Party statement jaisa sticky top — muted title row, center "All Time" line, summary card, search.
 */
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportRegisterMobileListChromeSummary = {
  label: string;
  amountText: string;
  amountClassName: string;
};

export type ReportRegisterMobileListChromeProps = {
  title: string;
  /** Center line under title; register list defaults to "All Time" (no range on list view). */
  subtitle?: string;
  actionSlot?: ReactNode;
  summary: ReportRegisterMobileListChromeSummary;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  listSectionTitle: string;
  children: ReactNode;
};

export function ReportRegisterMobileListChrome({
  title,
  subtitle = "All Time",
  actionSlot,
  summary,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  listSectionTitle,
  children,
}: ReportRegisterMobileListChromeProps) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <header className="sticky top-0 z-10 flex-shrink-0 flex flex-col gap-2 p-3 border-b bg-white">
        <h1 className="text-base font-bold text-muted-foreground">{title}</h1>
        <div className="flex justify-center">
          <span className="text-xs font-medium text-muted-foreground">{subtitle}</span>
        </div>
        {actionSlot ? <div className="flex flex-col gap-2">{actionSlot}</div> : null}
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">{summary.label}</p>
          <p className={cn("text-xl font-bold", summary.amountClassName)}>{summary.amountText}</p>
        </Card>
      </header>
      <div className="p-3 border-b flex-shrink-0 bg-white">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-9"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="px-3 pt-2 pb-1 border-b flex-shrink-0 bg-white">
        <h3 className="text-sm font-semibold">{listSectionTitle}</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
