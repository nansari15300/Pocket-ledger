"use client";
import { STAFF_ENTITY_LABEL, STAFF_ENTITY_TYPE_KEY, STAFF_ENTITY_SEARCH_PLACEHOLDER, STAFF_ENTITY_ADD_BUTTON, staffEntityDisplayLabel } from "@/lib/staffEntityDisplayName";

import { cn } from "@/lib/utils";
import { Users, Lock, Building2, CreditCard, Receipt, Package, FileText, ChevronRight, ChevronDown } from "lucide-react";
import type { Group } from "@/components/party/types";
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
import { masterListShellCn, masterListScrollBodyCn, masterListCategoryLabelCn } from "@/lib/masterListChrome";
import { groupListChildMemberNameTriggerCn, masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { getAllSystemGroupNames } from "@/lib/system-group-names";
import { IC_COMPANY_PARTY_GROUP_ID } from "@/lib/interCompany/icPeerCompanyGroups";
import {
  IcCompanyGroupTabListTree,
  type IcCompanyGroupTabSelectOptions,
} from "@/components/party/IcCompanyGroupTabListTree";
import type { Party } from "@/components/party/types";
import { ExpandableGroupListTree } from "@/components/entity/ExpandableGroupListTree";
import {
  GroupListExpandNameRow,
  GroupListMemberRow,
  renderGroupListRowShell,
} from "@/components/entity/GroupListMemberRow";
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import { toggleGroupListAccordionExpand } from "@/lib/groupListExpand";
import { GroupListMemberAvatar } from "@/components/entity/GroupListMemberAvatar";
import { MasterListGroupIcon } from "@/components/entity/MasterListGroupIcon";

type GroupWithType = Group & { groupType?: 'party' | 'tax' | 'staff' | 'account' | 'expense' | 'item' };

interface CategorySection {
  name: string;
  icon: React.ReactNode;
  groups: GroupWithType[];
}

export function PartyGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  collapsible = true,
  pendingApprovalByGroupId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
  /** Mobile party page: category headers footer me — scroll me sirf cards */
  hideCategoryHeaders = false,
  icPeerCompanyRows = [],
  selectedIcPeerCompanyId = null,
  selectedIcMemberAccountId = null,
  onSelectIcCompanyGroup,
  pendingApprovalByPartyId = {},
  groupMembersByGroupId = {},
  selectedGroupMemberFilterId = null,
}: {
  groups: Group[];
  searchTerm: string;
  selectedGroup: Group | null;
  onSelectGroup: (group: Group, options?: GroupListSelectOptions) => void;
  /** When false (e.g. party page), categories are always expanded with no chevron. When true (e.g. report), expand/collapse is shown. */
  collapsible?: boolean;
  /** Pending approval count per group id (only passed when approve notifications on list). */
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – ensures details page opens reliably */
  getItemHref?: (group: Group) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
  hideCategoryHeaders?: boolean;
  /** Groups tab — IC Company 3-level tree (level 2 peer companies). */
  icPeerCompanyRows?: Party[];
  selectedIcPeerCompanyId?: string | null;
  selectedIcMemberAccountId?: string | null;
  onSelectIcCompanyGroup?: (options: IcCompanyGroupTabSelectOptions) => void;
  pendingApprovalByPartyId?: Record<string, number>;
  /** Groups tab — party members per group for expand tree. */
  groupMembersByGroupId?: Record<string, Party[]>;
  selectedGroupMemberFilterId?: string | null;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } =
    useMasterListRowMotion();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['party group']));
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const [expandedListNodeId, setExpandedListNodeId] = useState<string | null>(null);

  const categories: CategorySection[] = useMemo(() => {
    const sortedFlat = filterAndSortEntityGroups(groups || [], searchTerm, quickFilter);

    const partyGroups: GroupWithType[] = [];
    const taxGroups: GroupWithType[] = [];
    const staffGroups: GroupWithType[] = [];
    const accountGroups: GroupWithType[] = [];
    const expenseGroups: GroupWithType[] = [];
    const itemGroups: GroupWithType[] = [];

    sortedFlat.forEach((group) => {
      const groupType = (group as GroupWithType).groupType || "party";
      switch (groupType) {
        case "tax":
          taxGroups.push(group as GroupWithType);
          break;
        case "staff":
          staffGroups.push(group as GroupWithType);
          break;
        case "account":
          accountGroups.push(group as GroupWithType);
          break;
        case "expense":
          expenseGroups.push(group as GroupWithType);
          break;
        case "item":
          itemGroups.push(group as GroupWithType);
          break;
        default:
          partyGroups.push(group as GroupWithType);
      }
    });

    return [
      { name: "Party group", icon: <Users className="h-4 w-4" />, groups: partyGroups },
      { name: "Tax", icon: <Receipt className="h-4 w-4" />, groups: taxGroups },
      { name: STAFF_ENTITY_LABEL, icon: <Building2 className="h-4 w-4" />, groups: staffGroups },
      { name: "Bank & Cash", icon: <CreditCard className="h-4 w-4" />, groups: accountGroups },
      { name: "Income & Expense", icon: <FileText className="h-4 w-4" />, groups: expenseGroups },
      { name: "Item", icon: <Package className="h-4 w-4" />, groups: itemGroups },
    ].filter((cat) => cat.groups.length > 0);
  }, [groups, searchTerm, quickFilter]);

  const listOrderKey = useMemo(
    () => masterListOrderKey(categories.flatMap((c) => c.groups.map((g) => g.id))),
    [categories]
  );
  const { displayRows: displayCategories, displayOrderKey } = useMasterListDisplayRows(
    categories,
    listOrderKey,
    { enabled: isRowAnimationEnabled, holdMs: layoutHoldMs }
  );

  const toggleCategory = (categoryName: string) => {
    const key = categoryName.toLowerCase();
    setExpandedCategories(prev => {
      if (prev.has(key)) {
        const next = new Set(prev);
        next.delete(key);
        return next;
      }
      return new Set([key]);
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className={masterListShellCn} data-theme-list="account-list" data-pl-party-group-list="">
        <ScrollArea
          listChrome
          className="min-h-0 min-w-0 w-full flex-1"
          onViewportScroll={markListScrolling}
          onViewportTouchMove={markListScrolling}
        >
          <div className={masterListScrollBodyCn}>
          {displayCategories.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No groups found.</div>
          ) : null}
          {displayCategories.map((category) => {
              const categoryKey = category.name.toLowerCase();
              const isExpanded = collapsible ? expandedCategories.has(categoryKey) : true;
              const hasGroups = category.groups.length > 0;
              
              return (
                <div key={categoryKey}>
                  {!hideCategoryHeaders ? (
                  <div
                    className={cn(
                      masterListCategoryLabelCn,
                      collapsible && "cursor-pointer hover:bg-muted/50 rounded-none"
                    )}
                    onClick={() => collapsible && toggleCategory(categoryKey)}
                  >
                    {collapsible ? (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )
                    ) : null}
                    <div className="h-4 w-4 flex items-center justify-center text-muted-foreground shrink-0">
                      {category.icon}
                    </div>
                    <span>{category.name} ({category.groups.length})</span>
                  </div>
                  ) : null}

                  {/* Groups under category - full width like party list */}
                  {(hideCategoryHeaders || isExpanded) && hasGroups && (
                    <ul className="pl-master-list-ul w-full">
                      <AnimatePresence mode={animatePresenceMode}>
                      {category.groups.map((group) => {
                        const isSystem = (group as any).isSystemReserved;
                        const isIcCompanyGroup = group.id === IC_COMPANY_PARTY_GROUP_ID;
                        const icGroupRowProps = isIcCompanyGroup
                          ? ({ "data-pl-ic-company-row": "" } as const)
                          : {};
                        if (isIcCompanyGroup && onSelectIcCompanyGroup) {
                          return (
                            <motion.li key={group.id} className="w-full" layoutDependency={displayOrderKey} {...rowMotionProps}>
                              <IcCompanyGroupTabListTree
                                group={group}
                                icPeerCompanyRows={icPeerCompanyRows}
                                selectedGroup={selectedGroup}
                                selectedIcPeerCompanyId={selectedIcPeerCompanyId}
                                selectedIcMemberAccountId={selectedIcMemberAccountId}
                                onSelect={onSelectIcCompanyGroup}
                                quickFilter={quickFilter}
                                pendingApprovalByGroupId={pendingApprovalByGroupId}
                                pendingApprovalByPartyId={pendingApprovalByPartyId}
                                getItemHref={getItemHref}
                                animatePresenceMode={animatePresenceMode}
                                rowMotionProps={rowMotionProps}
                                isRowAnimationEnabled={isRowAnimationEnabled}
                                layoutHoldMs={layoutHoldMs}
                                expandedListNodeId={expandedListNodeId}
                                onExpandedListNodeIdChange={setExpandedListNodeId}
                              />
                            </motion.li>
                          );
                        }
                        return (
                          <motion.li key={group.id} className="w-full" layoutDependency={displayOrderKey} {...rowMotionProps}>
                            {(() => {
                              const href = getItemHref?.(group);
                              const members = groupMembersByGroupId[group.id] ?? [];
                              const isGroupSelectedOnly =
                                selectedGroup?.id === group.id && !selectedGroupMemberFilterId;
                              const groupPending = pendingApprovalByGroupId[group.id] ?? 0;

                              const renderGroupCard = (expandControl: React.ReactNode | null) => (
                                <div className="pl-master-list-row">
                                  <div className="pl-master-list-row-leading">
                                    <div className="relative flex-shrink-0">
                                      <MasterListGroupIcon>
                                        {isSystem ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                                      </MasterListGroupIcon>
                                      {groupPending > 0 && (
                                        <span
                                          className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center bg-pink-500 text-[10px] font-bold text-white origin-center"
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
                                      nameTriggerClassName={cn(masterListNameTriggerCn, "min-w-0 flex-1 text-sm font-semibold")}
                                    />
                                  </div>
                                  <p
                                    className={cn(
                                      "pl-master-list-row-amount-xs ml-1 rounded px-1",
                                      group.balance >= 0 ? "text-green-600" : "text-red-600"
                                    )}
                                  >
                                    {formatCurrency(group.balance, { showDrCr: true })}
                                  </p>
                                </div>
                              );

                              return (
                                <ExpandableGroupListTree
                                  members={members}
                                  isGroupSelectedOnly={isGroupSelectedOnly}
                                  selectedMemberId={
                                    selectedGroup?.id === group.id ? selectedGroupMemberFilterId : null
                                  }
                                  expanded={expandedListNodeId === group.id}
                                  onExpandedChange={() =>
                                    setExpandedListNodeId((prev) =>
                                      toggleGroupListAccordionExpand(prev, group.id)
                                    )
                                  }
                                  onSelectGroup={() => onSelectGroup(group, { memberId: null })}
                                  onSelectMember={(memberId) => onSelectGroup(group, { memberId })}
                                  quickFilter={quickFilter}
                                  expandAriaLabel="parties"
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
                                  renderMemberRow={(member, memberSelected, onClick) => (
                                    <GroupListMemberRow
                                      name={member.name}
                                      balance={member.balance}
                                      isSelected={memberSelected}
                                      onClick={onClick}
                                      isAccountFrozen={member.isFrozen === true}
                                      pendingCount={pendingApprovalByPartyId[member.id] ?? 0}
                                      amountClassName="pl-master-list-row-amount-xs ml-1 rounded px-1"
                                      leading={
                                        <GroupListMemberAvatar
                                          name={member.name}
                                          fileUrl={member.fileUrl}
                                          companyId={member.companyId}
                                        />
                                      }
                                    />
                                  )}
                                />
                              );
                            })()}
                          </motion.li>
                        );
                      })}
                      </AnimatePresence>
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
      </div>
    </TooltipProvider>
  );
}
