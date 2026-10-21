"use client";

import type React from "react";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { mlc } from "@/lib/mobileListChrome";
import { cn } from "@/lib/utils";

/** Master list jaisa: white fill, blue border, 30px — report register + reports index list. */
export const REPORT_LIST_SEARCH_INPUT_CN =
  "h-[30px] min-h-[30px] max-h-[30px] bg-white dark:bg-white";

type Props = {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Search ke baad (e.g. pink unapproved badge) - master list search row jaisa. */
  trailing?: React.ReactNode;
};

export function ReportRegisterListSearchRow({ placeholder, value, onChange, className, trailing }: Props) {
  return (
    <div className={cn(mlc.searchRow, className)}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder={placeholder}
          listChrome
          listChromeSearch
          className={REPORT_LIST_SEARCH_INPUT_CN}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      {trailing}
    </div>
  );
}
