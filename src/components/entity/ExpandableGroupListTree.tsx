"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { GroupListMemberMotionList } from "@/components/entity/GroupListMemberMotionList";

import type { GroupListSelectOptions, GroupListSortableMember } from "@/lib/groupListExpand";
import { GROUP_LIST_CHILD_INDENT_CLASS, filterGroupListMembersByQuickFilter, sortGroupListMembers } from "@/lib/groupListExpand";

type ExpandableGroupListTreeProps<T extends GroupListSortableMember & { id: string }> = {
  members: T[];
  /** Group row selected with no member filter. */
  isGroupSelectedOnly: boolean;
  selectedMemberId: string | null;
  onSelectGroup: () => void;
  onSelectMember: (memberId: string) => void;
  quickFilter: EntityListQuickFilter;
  memberSortName?: (member: T) => string;
  renderGroupRow: (params: { expandControl: React.ReactNode | null }) => React.ReactNode;
  renderMemberRow: (member: T, isSelected: boolean, onClick: () => void) => React.ReactNode;
  animatePresenceMode: "sync" | "wait" | "popLayout";
  rowMotionProps: Record<string, unknown>;
  isRowAnimationEnabled: boolean;
  layoutHoldMs: number;
  expandAriaLabel?: string;
  /** Controlled expand — use with list-level accordion state. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function ExpandableGroupListTree<T extends GroupListSortableMember & { id: string }>({
  members,
  isGroupSelectedOnly: _isGroupSelectedOnly,
  selectedMemberId,
  onSelectGroup: _onSelectGroup,
  onSelectMember,
  quickFilter,
  memberSortName,
  renderGroupRow,
  renderMemberRow,
  animatePresenceMode,
  rowMotionProps,
  isRowAnimationEnabled,
  layoutHoldMs,
  expandAriaLabel = "members",
  expanded: expandedProp,
  onExpandedChange,
}: ExpandableGroupListTreeProps<T>) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = onExpandedChange != null;
  const expanded = isControlled ? Boolean(expandedProp) : internalExpanded;
  const hasMembers = members.length > 0;

  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    if (isControlled) {
      onExpandedChange?.(next);
    } else {
      setInternalExpanded(next);
    }
  }, [expanded, isControlled, onExpandedChange]);

  const sortedMembers = useMemo(() => {
    const filtered = filterGroupListMembersByQuickFilter(members, quickFilter);
    return sortGroupListMembers(filtered, quickFilter, memberSortName);
  }, [members, quickFilter, memberSortName]);

  const expandControl = hasMembers ? (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${expandAriaLabel}` : `Expand ${expandAriaLabel}`}
      className="mt-0.5 shrink-0 self-start rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleExpanded();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChevronDown
        className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")}
      />
    </button>
  ) : null;

  if (!hasMembers) {
    return <>{renderGroupRow({ expandControl: null })}</>;
  }

  const groupRow = renderGroupRow({ expandControl });
  const childList = expanded ? (
    <div className={cn("flex flex-col gap-1 pt-1", GROUP_LIST_CHILD_INDENT_CLASS)}>
      <GroupListMemberMotionList
        members={sortedMembers}
        animatePresenceMode={animatePresenceMode}
        rowMotionProps={rowMotionProps}
        isRowAnimationEnabled={isRowAnimationEnabled}
        layoutHoldMs={layoutHoldMs}
        renderMember={(member, _index) => {
          const isMemberSelected = selectedMemberId === member.id;
          return renderMemberRow(member, isMemberSelected, () => onSelectMember(member.id));
        }}
      />
    </div>
  ) : null;

  if (expanded) {
    return (
      <div data-pl-group-expand-group="">
        {groupRow}
        {childList}
      </div>
    );
  }

  return <>{groupRow}</>;
}
