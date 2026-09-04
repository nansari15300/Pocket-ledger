"use client";

import { cn } from "@/lib/utils";
import { ArrowLeftRight, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export type InterCompanyRibbonTab = "voucher" | "join";

const ITEMS: {
  id: InterCompanyRibbonTab;
  title: string;
  icon: typeof ArrowLeftRight;
}[] = [
  { id: "voucher", title: "Voucher", icon: ArrowLeftRight },
  { id: "join", title: "Inter Com System", icon: Users },
];

/** Last save popup pay-mode — next save pe default tick */
export const IC_PAY_MODE_STORAGE_KEY = "interCompanyLastPayMode";

/** Simple view — company / account rows me kam fields */
export const IC_SIMPLE_VIEW_STORAGE_KEY = "interCompanySimpleView";

export type InterCompanyPayModeChoice = "account_to_account" | "company_to_company";

type Props = {
  active: InterCompanyRibbonTab;
  onChange: (tab: InterCompanyRibbonTab) => void;
  /** Inter Com System — pending join requests for this company */
  pendingSystemJoinCount?: number;
  /** Edit: account fields differ from last saved — show under Voucher */
  changeDetected?: boolean;
  onChangeDetectedClick?: () => void;
  /** Voucher tab — simple view toggle (default on) */
  simpleView?: boolean;
  onSimpleViewChange?: (enabled: boolean) => void;
};

/** Top tabs — Voucher / Inter Com System; Simple view tick (voucher tab) */
export function InterCompanyRibbonNav({
  active,
  onChange,
  pendingSystemJoinCount = 0,
  changeDetected = false,
  onChangeDetectedClick,
  simpleView = true,
  onSimpleViewChange,
}: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-black/15 pb-2 dark:border-white/15"
      aria-label="Inter company sections"
    >
      <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {ITEMS.map(({ id, title, icon: Icon }) => {
          const isActive = active === id;
          const badge = id === "join" && pendingSystemJoinCount > 0 ? pendingSystemJoinCount : null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "border-black bg-secondary font-medium shadow-sm dark:border-white/30"
                  : "border-black/40 hover:bg-muted/30 dark:border-white/20"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              <span className="truncate">{title}</span>
              {badge != null ? (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </button>
          );
        })}

        {changeDetected ? (
          <button
            type="button"
            onClick={() => onChangeDetectedClick?.()}
            className="ml-1 rounded-md border border-blue-700/50 bg-blue-100 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-blue-950 transition-colors hover:bg-blue-200/80 dark:border-blue-500/40 dark:bg-blue-900/50 dark:text-blue-50 dark:hover:bg-blue-900/70"
            title="Compare and apply peer changes"
            aria-label="Change Detected — compare and apply"
          >
            Change Detected
          </button>
        ) : null}
      </nav>

      {active === "voucher" && onSimpleViewChange ? (
        <label
          htmlFor="ic-simple-view"
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-black/40 bg-background px-2.5 py-1.5 text-xs font-medium dark:border-white/20"
        >
          <Checkbox
            id="ic-simple-view"
            checked={simpleView}
            onCheckedChange={(v) => onSimpleViewChange(v === true)}
          />
          <span>Simple view</span>
        </label>
      ) : null}
    </div>
  );
}
