"use client";

import { cn } from "@/lib/utils";
import { mdc } from "@/lib/mobileDetailChrome";
import { GROUP_LIST_CHILD_INDENT_CLASS } from "@/lib/groupListExpand";

/** Mobile master-detail header — group / middle / member stack (PC GroupDetailNestedNameHeader parity). */
export function MobileMasterDetailNestedName({
  groupName,
  middleName,
  memberName,
  toneClassName,
  className,
}: {
  groupName: string;
  middleName?: string | null;
  memberName?: string | null;
  /** Applied to the current (bottom) name when nested. */
  toneClassName?: string;
  className?: string;
}) {
  const namePath = [groupName];
  if (middleName) namePath.push(middleName);
  if (memberName) namePath.push(memberName);

  if (namePath.length === 1) {
    return (
      <span
        className={cn(mdc.masterSelectionName, toneClassName ?? "text-muted-foreground", className)}
        title={groupName}
      >
        {groupName}
      </span>
    );
  }

  const ancestors = namePath.slice(0, -1);
  const currentName = namePath[namePath.length - 1]!;

  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-0 leading-tight", className)}>
      {ancestors.map((name, index) => (
        <span
          key={`${name}-${index}`}
          className={cn(
            "min-w-0 truncate text-[11px] font-medium leading-tight text-muted-foreground",
            ancestors.length > 1 && index === 0 ? "text-[10px]" : "text-[11px]",
            index > 0 && GROUP_LIST_CHILD_INDENT_CLASS
          )}
          title={name}
        >
          {name}
        </span>
      ))}
      <span
        className={cn(
          GROUP_LIST_CHILD_INDENT_CLASS,
          ancestors.length > 1 && "pl-[20px]",
          "min-w-0 truncate text-xs font-semibold leading-tight",
          toneClassName ?? "text-foreground"
        )}
        title={currentName}
      >
        {currentName}
      </span>
    </div>
  );
}
