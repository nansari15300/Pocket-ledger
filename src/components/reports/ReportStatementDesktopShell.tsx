"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { ReportShowListButton } from "@/components/reports/ReportShowListButton";
import { mlc } from "@/lib/mobileListChrome";
import { cn } from "@/lib/utils";
import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import type { MasterDetailListRouteKey } from "@/lib/masterDetailListPath";
import {
  ReportStatementSummaryCardsGrid,
  type ReportStatementSummaryCardData,
} from "@/components/reports/ReportStatementSummaryCards";

export type ReportStatementDesktopShellProps = {
  listChromeRouteKey: MasterDetailListRouteKey;
  pageTitle: string;
  listTab: string;
  entityTabValue: string;
  groupTabValue: string;
  entityTabLabel: string;
  groupTabLabel?: string;
  onListTabChange: (tab: string) => void;
  listSearchTerm: string;
  onListSearchChange: (value: string) => void;
  entitySearchPlaceholder: string;
  groupSearchPlaceholder: string;
  entitySectionLabel: React.ReactNode;
  groupSectionLabel: React.ReactNode;
  entityQuickFilter: EntityListQuickFilter;
  groupQuickFilter: EntityListQuickFilter;
  onEntityQuickFilterChange: (filter: EntityListQuickFilter) => void;
  onGroupQuickFilterChange: (filter: EntityListQuickFilter) => void;
  summaryCards: ReportStatementSummaryCardData[];
  showSummary: boolean;
  entityList: React.ReactNode;
  groupList: React.ReactNode;
  detailView: React.ReactNode;
  footer?: React.ReactNode;
};

/** Party Statement PC layout — tabs + master list + ledger detail (shared by all entity reports). */
export function ReportStatementDesktopShell({
  listChromeRouteKey,
  pageTitle,
  listTab,
  entityTabValue,
  groupTabValue,
  entityTabLabel,
  groupTabLabel = "Groups",
  onListTabChange,
  listSearchTerm,
  onListSearchChange,
  entitySearchPlaceholder,
  groupSearchPlaceholder,
  entitySectionLabel,
  groupSectionLabel,
  entityQuickFilter,
  groupQuickFilter,
  onEntityQuickFilterChange,
  onGroupQuickFilterChange,
  summaryCards,
  showSummary,
  entityList,
  groupList,
  detailView,
  footer,
}: ReportStatementDesktopShellProps) {
  const reportListTabs = (
    <Tabs
      value={listTab}
      onValueChange={(value) => onListTabChange(value === groupTabValue ? groupTabValue : entityTabValue)}
      className="w-full"
    >
      <TabsList listChrome>
        <TabsTrigger listChrome value={entityTabValue} className="flex-1">
          {entityTabLabel}
        </TabsTrigger>
        <TabsTrigger listChrome value={groupTabValue} className="flex-1">
          {groupTabLabel}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const reportSearchRow = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder={listTab === groupTabValue ? groupSearchPlaceholder : entitySearchPlaceholder}
          listChrome
          listChromeSearch
          value={listSearchTerm}
          onChange={(e) => onListSearchChange(e.target.value)}
          autoComplete="off"
        />
      </div>
    </div>
  );

  const reportSectionLabel = listTab === groupTabValue ? groupSectionLabel : entitySectionLabel;

  /** Search row jaisa vertical inset — cards/tabs dono par same band chrome. */
  const reportListBandChrome = cn(mlc.searchRow, "box-border !gap-0");
  const reportSummaryBandChrome = cn(mlc.searchRow, "box-border !gap-0 !px-3");

  const reportListTopSummary = showSummary ? (
    <div className={reportSummaryBandChrome}>
      <ReportStatementSummaryCardsGrid cards={summaryCards} />
    </div>
  ) : null;

  const reportListTabsRow = <div className={reportListBandChrome}>{reportListTabs}</div>;

  const reportListView = (
    <MasterListViewShell
      isMobile={false}
      searchRow={reportSearchRow}
      sectionLabel={reportSectionLabel}
      quickFilter={listTab === groupTabValue ? groupQuickFilter : entityQuickFilter}
      onQuickFilterChange={listTab === groupTabValue ? onGroupQuickFilterChange : onEntityQuickFilterChange}
    >
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden",
            listTab !== entityTabValue && "pointer-events-none hidden"
          )}
          aria-hidden={listTab !== entityTabValue}
        >
          {entityList}
        </div>
        <div
          className={cn(
            "absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden",
            listTab !== groupTabValue && "pointer-events-none hidden"
          )}
          aria-hidden={listTab !== groupTabValue}
        >
          {groupList}
        </div>
      </div>
    </MasterListViewShell>
  );

  return (
    <>
      <ResponsiveMasterDetail
        listChromeRouteKey={listChromeRouteKey}
        title={pageTitle}
        balance={null}
        listHeaderLeading={<ReportShowListButton />}
        tabsRowClassName="!min-h-0 !border-b-0 !p-0"
        tabs={
          <div className="flex min-w-0 flex-col">
            {reportListTopSummary}
            {reportListTabsRow}
          </div>
        }
        listView={reportListView}
        detailView={detailView}
        isMobile={false}
      />
      {footer}
    </>
  );
}
