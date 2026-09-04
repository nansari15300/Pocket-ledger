"use client";

import React from "react";
import { Move } from "lucide-react";
import {
  GROUP_LIST_ACCOUNT_MOVE_HOLD_HINT,
  type GroupListAccountMoveHint,
} from "@/hooks/useGroupListAccountMove";

const HINT_TEXT: Record<Exclude<GroupListAccountMoveHint, null>, string> = {
  "hover-hold": GROUP_LIST_ACCOUNT_MOVE_HOLD_HINT,
  "drop-here": "Leave mouse button to move here.",
  cancel: "To cancel move mouse to another area.",
};

export function GroupListAccountMoveOverlay({
  visible,
  hint,
  cursor,
}: {
  visible: boolean;
  hint: GroupListAccountMoveHint;
  cursor: { x: number; y: number };
}) {
  if (!visible || !hint || hint === "hover-hold") return null;

  return (
    <>
      <div
        className="pointer-events-none fixed z-[10050] flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-md"
        style={{ left: cursor.x, top: cursor.y }}
        aria-hidden
      >
        <Move className="h-4 w-4" />
      </div>
      <div
        className="pointer-events-none fixed z-[10051] max-w-[240px] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
        style={{ left: cursor.x + 16, top: cursor.y + 16 }}
        role="status"
      >
        {HINT_TEXT[hint]}
      </div>
    </>
  );
}
