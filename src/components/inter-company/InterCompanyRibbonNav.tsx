"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Users } from "lucide-react";

export type InterCompanyRibbonTab = "voucher" | "join";

const ITEMS: {
  id: InterCompanyRibbonTab;
  title: string;
  icon: typeof ArrowLeftRight;
}[] = [
  { id: "voucher", title: "Voucher", icon: ArrowLeftRight },
  { id: "join", title: "Inter Com System", icon: Users },
];

/** localStorage — ribbon collapsed preference (icons-only sidebar) */
const RIBBON_COLLAPSED_STORAGE_KEY = "interCompanyRibbonCollapsed";

/** Last save popup pay-mode — next save pe default tick */
export const IC_PAY_MODE_STORAGE_KEY = "interCompanyLastPayMode";

export type InterCompanyPayModeChoice = "account_to_account" | "company_to_company";

type Props = {
  active: InterCompanyRibbonTab;
  onChange: (tab: InterCompanyRibbonTab) => void;
  /** Inter Com System — pending join requests for this company */
  pendingSystemJoinCount?: number;
  /** Edit: account fields differ from last saved — show under Voucher */
  changeDetected?: boolean;
  onChangeDetectedClick?: () => void;
};

/** Left ribbon — Voucher / Inter Com System; collapse par sirf icon */
export function InterCompanyRibbonNav({
  active,
  onChange,
  pendingSystemJoinCount = 0,
  changeDetected = false,
  onChangeDetectedClick,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(RIBBON_COLLAPSED_STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      /* private mode */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RIBBON_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <nav
      className={cn(
        "app-chrome-sidebar-ribbon pl-dashboard-ribbon-sky flex h-full min-h-0 shrink-0 flex-col gap-1 self-stretch rounded-lg border border-black shadow-sm dark:border-black",
        collapsed ? "w-[3.25rem] p-1.5" : "w-full min-w-[11.5rem] p-2"
      )}
      aria-label="Inter company sections"
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn(
          "flex w-full items-center rounded-md border border-black text-muted-foreground transition-colors hover:bg-muted/30",
          collapsed ? "justify-center px-0 py-2" : "gap-2 px-3 py-1.5 text-left text-xs"
        )}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Show sidebar labels" : "Hide sidebar labels"}
        title={collapsed ? "Show labels" : "Hide labels"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <>
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Hide</span>
          </>
        )}
      </button>

      {ITEMS.map(({ id, title, icon: Icon }) => {
        const isActive = active === id;
        const badge = id === "join" && pendingSystemJoinCount > 0 ? pendingSystemJoinCount : null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={collapsed ? title : undefined}
            aria-label={collapsed ? title : undefined}
            className={cn(
              "relative flex w-full items-center rounded-md border text-sm transition-colors",
              collapsed ? "justify-center px-0 py-2.5" : "gap-2 px-3 py-2 text-left",
              isActive
                ? "border-black bg-secondary font-medium shadow-sm"
                : "border-black hover:bg-muted/30"
            )}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" />
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {badge != null ? (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </>
            ) : badge != null ? (
              <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {badge > 9 ? "9+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}

      {changeDetected ? (
        <button
          type="button"
          onClick={() => onChangeDetectedClick?.()}
          className={cn(
            "mt-auto rounded-md border border-blue-700/50 bg-blue-100 px-2 py-1.5 text-left text-[10px] font-semibold leading-snug text-blue-950 transition-colors hover:bg-blue-200/80 dark:border-blue-500/40 dark:bg-blue-900/50 dark:text-blue-50 dark:hover:bg-blue-900/70",
            collapsed && "px-1 text-center text-[9px]"
          )}
          title="Compare and apply peer changes"
          aria-label="Change Detected — compare and apply"
        >
          {collapsed ? "Δ" : "Change Detected"}
        </button>
      ) : null}
    </nav>
  );
}
