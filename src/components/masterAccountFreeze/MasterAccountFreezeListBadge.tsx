import { cn } from "@/lib/utils";
import { MASTER_ACCOUNT_FREEZE_LIST_LABEL } from "@/lib/masterAccountFreeze/labels";

type MasterAccountFreezeListBadgeProps = {
  className?: string;
};

/** List row — plain text only (no box), ~10% smaller than prior badge. */
export function MasterAccountFreezeListBadge({ className }: MasterAccountFreezeListBadgeProps) {
  return (
    <span
      className={cn(
        "block max-w-full truncate text-[9px] font-medium leading-tight text-slate-600 dark:text-slate-400",
        className
      )}
    >
      {MASTER_ACCOUNT_FREEZE_LIST_LABEL}
    </span>
  );
}
