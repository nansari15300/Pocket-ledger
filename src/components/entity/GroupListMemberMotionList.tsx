"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { masterListOrderKey, useMasterListDisplayRows } from "@/hooks/useMasterListRowMotion";

type GroupListMemberMotionListProps<T extends { id?: string }> = {
  members: readonly T[];
  animatePresenceMode: "sync" | "wait" | "popLayout";
  rowMotionProps: Record<string, unknown>;
  isRowAnimationEnabled: boolean;
  layoutHoldMs: number;
  getMemberKey?: (member: T, index: number) => string;
  renderMember: (member: T, index: number) => React.ReactNode;
};

/** Nested group account rows — same FLIP/sort animation as top-level group rows. */
export function GroupListMemberMotionList<T extends { id?: string }>({
  members,
  animatePresenceMode,
  rowMotionProps,
  isRowAnimationEnabled,
  layoutHoldMs,
  getMemberKey,
  renderMember,
}: GroupListMemberMotionListProps<T>) {
  const memberOrderKey = useMemo(
    () => masterListOrderKey(members.map((member) => member.id)),
    [members]
  );

  const { displayRows: displayMembers, displayOrderKey: memberDisplayOrderKey } =
    useMasterListDisplayRows(members as T[], memberOrderKey, {
      enabled: isRowAnimationEnabled,
      holdMs: layoutHoldMs,
    });

  return (
    <AnimatePresence mode={animatePresenceMode}>
      {displayMembers.map((member, index) => (
        <motion.div
          key={getMemberKey?.(member, index) ?? member.id ?? `member-${index}`}
          layoutDependency={memberDisplayOrderKey}
          {...rowMotionProps}
        >
          {renderMember(member, index)}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
