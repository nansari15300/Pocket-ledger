"use client";

import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";

type ReceivablesPayablesMobileSidePillsProps = {
  tab: "receivables" | "payables" | "both";
  receivablesCount: number;
  payablesCount: number;
  onSelect: (tab: "receivables" | "payables") => void;
};

const pillBtn = cn(
  "data-pl-rp-side-pill pl-chrome-btn-drop w-auto shrink-0 rounded-full border border-solid leading-none whitespace-nowrap transition-colors",
  chromeProPillCn,
  LEDGER_HEADER_PILL_CN
);

const pillInactiveBorder = "!border-[1px] !border-blue-300";
const pillActiveBorder = "!border-[1px] !border-green-600";

/** Mobile R/P dialog — blue border; selected tab = 1px green border (globals `[data-pl-rp-dialog-shell]`). */
export function ReceivablesPayablesMobileSidePills({
  tab,
  receivablesCount,
  payablesCount,
  onSelect,
}: ReceivablesPayablesMobileSidePillsProps) {
  const receivablesActive = tab === "receivables" || tab === "both";
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect("receivables")}
        data-pl-rp-side-pill-active={receivablesActive ? "" : undefined}
        className={cn(pillBtn, receivablesActive ? pillActiveBorder : pillInactiveBorder)}
      >
        Receivables ({receivablesCount})
      </button>
      <button
        type="button"
        onClick={() => onSelect("payables")}
        data-pl-rp-side-pill-active={tab === "payables" ? "" : undefined}
        className={cn(pillBtn, tab === "payables" ? pillActiveBorder : pillInactiveBorder)}
      >
        Payables ({payablesCount})
      </button>
    </div>
  );
}
