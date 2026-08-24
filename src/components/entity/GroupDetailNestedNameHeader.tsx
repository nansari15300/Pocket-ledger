"use client";

import { cn } from "@/lib/utils";
import { LEDGER_HEADER_TITLE_CN } from "@/lib/ledgerHeaderChrome";
import { GROUP_LIST_CHILD_INDENT_CLASS } from "@/lib/groupListExpand";

export function GroupDetailNestedNameHeader({
  groupName,
  middleName,
  memberName,
}: {
  groupName: string;
  middleName?: string | null;
  memberName?: string | null;
}) {
  const namePath = [groupName];
  if (middleName) namePath.push(middleName);
  if (memberName) namePath.push(memberName);

  if (namePath.length === 1) {
    return (
      <h2 className={LEDGER_HEADER_TITLE_CN} title={groupName}>
        {groupName}
      </h2>
    );
  }

  const ancestors = namePath.slice(0, -1);
  const currentName = namePath[namePath.length - 1]!;

  return (
    <div className="flex min-w-0 flex-col items-start gap-0 leading-tight">
      {ancestors.map((name, index) => (
        <h2
          key={`${name}-${index}`}
          className={cn(
            LEDGER_HEADER_TITLE_CN,
            "font-medium leading-tight text-muted-foreground",
            ancestors.length > 1 && index < ancestors.length - 1 ? "text-xs" : "text-sm",
            index > 0 && GROUP_LIST_CHILD_INDENT_CLASS
          )}
          title={name}
        >
          {name}
        </h2>
      ))}
      <p
        className={cn(
          GROUP_LIST_CHILD_INDENT_CLASS,
          ancestors.length > 1 && "pl-[20px]",
          "w-full truncate text-base font-semibold leading-tight text-foreground"
        )}
        title={currentName}
      >
        {currentName}
      </p>
    </div>
  );
}
