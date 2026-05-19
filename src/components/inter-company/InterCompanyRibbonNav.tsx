"use client";

import { cn } from "@/lib/utils";
import { ArrowLeftRight, Mail, RotateCcw, Users } from "lucide-react";

export type InterCompanyRibbonTab = "voucher" | "invite" | "join" | "revert_requests";

const ITEMS: {
  id: InterCompanyRibbonTab;
  title: string;
  icon: typeof ArrowLeftRight;
}[] = [
  { id: "voucher", title: "Voucher", icon: ArrowLeftRight },
  { id: "revert_requests", title: "Revert request", icon: RotateCcw },
  { id: "invite", title: "Invite", icon: Mail },
  { id: "join", title: "Join", icon: Users },
];

type Props = {
  active: InterCompanyRibbonTab;
  onChange: (tab: InterCompanyRibbonTab) => void;
  /** Target company — pending reverse inbox count */
  pendingRevertCount?: number;
};

/** Left ribbon — settings page jaisa nav rows. */
export function InterCompanyRibbonNav({ active, onChange, pendingRevertCount = 0 }: Props) {
  return (
    <nav
      className="app-chrome-sidebar-ribbon pl-dashboard-ribbon-sky flex min-h-0 w-full flex-col gap-1 rounded-lg border border-black p-2 shadow-sm dark:border-black"
      aria-label="Inter company sections"
    >
      {ITEMS.map(({ id, title, icon: Icon }) => {
        const isActive = active === id;
        const badge =
          id === "revert_requests" && pendingRevertCount > 0 ? pendingRevertCount : null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              isActive
                ? "border-black bg-secondary font-medium shadow-sm"
                : "border-black hover:bg-muted/30"
            )}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {badge != null ? (
              <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
