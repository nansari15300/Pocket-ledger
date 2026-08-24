
"use client";

import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { Users, Crown, Landmark } from "lucide-react";
import type { AccountGroup } from "@/components/bank-cash/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { masterListOrderKey, useMasterListDisplayRows, useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { TooltipProvider } from "../ui/tooltip";
import { useMemo, useState } from "react";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortEntityGroups } from "@/lib/entityGroupListQuickFilter";
import { motion, AnimatePresence } from "framer-motion";
import { isSystemParentGroup } from "@/lib/system-groups"
import { masterListShellCn, MASTER_LIST_AVATAR_CN, MASTER_LIST_AVATAR_FALLBACK_CN } from "@/lib/masterListChrome";
import { ExpandableGroupListTree } from "@/components/entity/ExpandableGroupListTree";
import {
  GroupListExpandNameRow,
  GroupListMemberRow,
  renderGroupListRowShell,
} from "@/components/entity/GroupListMemberRow";
import {
  toggleGroupListAccordionExpand,
  type GroupListSelectOptions,
} from "@/lib/groupListExpand";
import type { Account } from "@/components/bank-cash/types";
import { bankAccountDisplayName } from "@/lib/bankAccountDisplayName";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { MasterListGroupIcon } from "@/components/entity/MasterListGroupIcon";

export function AccountGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
  groupMembersByGroupId = {},
  selectedGroupMemberFilterId = null,
  pendingApprovalByMemberId = {},
}: {
  groups: AccountGroup[];
  searchTerm: string;
  selectedGroup: AccountGroup | null;
  onSelectGroup: (group: AccountGroup, options?: GroupListSelectOptions) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (group: AccountGroup) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
  groupMembersByGroupId?: Record<string, Account[]>;
  selectedGroupMemberFilterId?: string | null;
  pendingApprovalByMemberId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } = useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const filteredAndSortedGroups = useMemo(() => {
    const base = groups.filter((group) => {
      const isReportOnly = (group as any).isReportOnly === true;
      const isSystemParent =
        (group as any).isSystemReserved === true ||
        isSystemParentGroup("account_groups", (group as any).id);
      if (isReportOnly || isSystemParent) return false;
      return !!group.name;
    });
    return filterAndSortEntityGroups(base, searchTerm, quickFilter);
  }, [groups, searchTerm, quickFilter]);

  const listOrderKey = useMemo(
    () => masterListOrderKey(filteredAndSortedGroups.map((g) => g.id)),
    [filteredAndSortedGroups]
  );

  const { displayRows: displayListRows, displayOrderKey } = useMasterListDisplayRows(
    filteredAndSortedGroups,
    listOrderKey,
    { enabled: isRowAnimationEnabled, holdMs: layoutHoldMs }
  );

  return (
    <TooltipProvider delayDuration={200}>
    <div className={masterListShellCn}>
      <ScrollArea
        listChrome
        className="min-h-0 min-w-0 flex-1"
        onViewportScroll={markListScrolling}
        onViewportTouchMove={markListScrolling}
      >
        <ul className="pl-master-list-ul">
          <AnimatePresence mode={animatePresenceMode}>
            {displayListRows.map((group) => {
              const href = getItemHref?.(group);
              const members = groupMembersByGroupId[group.id] ?? [];
              const isGroupSelectedOnly =
                selectedGroup?.id === group.id && !selectedGroupMemberFilterId;
              const hasSpecial = (group as any).hasSpecial;
              const isBalanceMasked = typeof group.balance !== "number";
              const groupPending = pendingApprovalByGroupId[group.id] ?? 0;

              const renderGroupCard = (expandControl: React.ReactNode | null) => (
                <div className="pl-master-list-row">
                  <div className="pl-master-list-row-leading">
                    <div className="relative flex-shrink-0">
                      <MasterListGroupIcon>
                        {hasSpecial ? <Crown className="h-5 w-5 text-amber-500" /> : <Users className="h-5 w-5" />}
                      </MasterListGroupIcon>
                      {groupPending > 0 && (
                        <span
                          className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                          style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                          aria-label={`${groupPending} pending approval`}
                        >
                          <span style={{ transform: "rotate(-45deg)" }}>{groupPending}</span>
                        </span>
                      )}
                    </div>
                    <GroupListExpandNameRow
                      name={group.name}
                      expandControl={expandControl}
                      pendingCount={groupPending}
                    />
                  </div>
                  <p
                    data-pl-list-balance={
                      isBalanceMasked
                        ? undefined
                        : typeof group.balance === "number" && group.balance >= 0
                          ? "dr"
                          : "cr"
                    }
                    className={cn(
                      "pl-master-list-row-amount-xs ml-1",
                      !isBalanceMasked && masterDetailBalanceToneClass(group.balance)
                    )}
                  >
                    {isBalanceMasked ? "*****" : formatCurrency(group.balance, { showDrCr: true })}
                  </p>
                </div>
              );

              return (
                <motion.li key={group.id} layoutDependency={displayOrderKey} {...rowMotionProps}>
                  <ExpandableGroupListTree
                    members={members}
                    isGroupSelectedOnly={isGroupSelectedOnly}
                    selectedMemberId={
                      selectedGroup?.id === group.id ? selectedGroupMemberFilterId : null
                    }
                    expanded={expandedGroupId === group.id}
                    onExpandedChange={() =>
                      setExpandedGroupId((prev) => toggleGroupListAccordionExpand(prev, group.id))
                    }
                    onSelectGroup={() => onSelectGroup(group, { memberId: null })}
                    onSelectMember={(memberId) => onSelectGroup(group, { memberId })}
                    quickFilter={quickFilter}
                    memberSortName={(member) => bankAccountDisplayName(member)}
                    expandAriaLabel="accounts"
                    animatePresenceMode={animatePresenceMode}
                    rowMotionProps={rowMotionProps}
                    isRowAnimationEnabled={isRowAnimationEnabled}
                    layoutHoldMs={layoutHoldMs}
                    renderGroupRow={({ expandControl }) =>
                      renderGroupListRowShell(
                        isGroupSelectedOnly,
                        () => onSelectGroup(group, { memberId: null }),
                        renderGroupCard(expandControl),
                        href
                      )
                    }
                    renderMemberRow={(member, memberSelected, onClick) => {
                      const memberHasSpecial = (member as any).isSpecial;
                      const memberBalanceMasked = typeof member.balance !== "number";
                      const displayName = bankAccountDisplayName(member);
                      const attachmentPreviewUrl = trimEntityFileUrlForPreview(member.fileUrl);
                      return (
                        <GroupListMemberRow
                          name={displayName}
                          balance={member.balance}
                          isSelected={memberSelected}
                          onClick={onClick}
                          balanceMasked={memberBalanceMasked}
                          pendingCount={pendingApprovalByMemberId[member.id] ?? 0}
                          leading={
                            <EntityFileAttachmentHover
                              fileUrl={attachmentPreviewUrl}
                              triggerClassName="inline-flex shrink-0 rounded-full"
                            >
                              <ResolvedEntityAvatar
                                className={MASTER_LIST_AVATAR_CN}
                                fallbackClassName={MASTER_LIST_AVATAR_FALLBACK_CN}
                                companyId={member.companyId}
                                src={attachmentPreviewUrl ?? undefined}
                                alt={displayName}
                                fallbackSlot={
                                  memberHasSpecial ? (
                                    <Crown className="h-4 w-4 text-amber-500" />
                                  ) : (
                                    <Landmark className="h-4 w-4 text-muted-foreground" />
                                  )
                                }
                              />
                            </EntityFileAttachmentHover>
                          }
                        />
                      );
                    }}
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
          {displayListRows.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No groups found.
            </div>
          )}
        </ul>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
    </div>
    </TooltipProvider>
  );
}

    