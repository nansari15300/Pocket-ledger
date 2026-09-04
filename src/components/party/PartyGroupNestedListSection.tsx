"use client";

import { useCallback, useEffect, useMemo } from "react";
import { Lock, Users } from "lucide-react";
import type { Group } from "@/components/party/types";
import type { Party } from "@/components/party/types";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { useDate } from "@/hooks/useDate";
import { isSystemParentGroup } from "@/lib/system-groups";
import { IC_COMPANY_PARTY_GROUP_ID } from "@/lib/interCompany/icPeerCompanyGroups";
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { MasterGroupNestedListBody } from "@/components/entity/MasterGroupNestedListBody";
import { PARTY_GROUP_LIST_CONFIG } from "@/lib/masterGroupListConfigs";
import { PARTY_SYSTEM_DEBTORS_ID } from "@/lib/partySystemGroups";
import { useMasterGroupListForest } from "@/hooks/useMasterGroupListForest";
import { GroupListMemberRow } from "@/components/entity/GroupListMemberRow";
import { GroupListMemberAvatar } from "@/components/entity/GroupListMemberAvatar";
import { MasterListGroupIcon } from "@/components/entity/MasterListGroupIcon";
import {
  IcCompanyGroupTabListTree,
  type IcCompanyGroupTabSelectOptions,
} from "@/components/party/IcCompanyGroupTabListTree";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import { partyListRowMatchesSearch } from "@/lib/interCompany/partyListRowSearch";
import { icPeerListExpandKey } from "@/lib/groupListExpand";
import { GROUP_LIST_FOCUS_DIM_CLASS } from "@/lib/groupListUi";

function icCompanyGroupSearchMatches(searchTerm: string): boolean {
  return (
    masterEntityTextMatchesSearch("IC Company", searchTerm) ||
    masterEntityTextMatchesSearch("IC Com", searchTerm) ||
    masterEntityTextMatchesSearch("IC Company Accounts", searchTerm) ||
    masterEntityTextMatchesSearch("IC Company Account", searchTerm)
  );
}

export function PartyGroupNestedListSection({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
  pendingApprovalByPartyId = {},
  groupMembersByGroupId = {},
  getItemHref,
  quickFilter,
  selectedGroupMemberFilterId = null,
  focusGroupId = null,
  onFocusGroupIdChange,
  moveAccountsEnabled = false,
  onMoveAccountToGroup,
  canMoveMember,
  onMoveGroupToGroup,
  canMoveGroup,
  allGroupsForMove,
  icCompanyGroup = null,
  icPeerCompanyRows = [],
  selectedIcPeerCompanyId = null,
  selectedIcMemberAccountId = null,
  onSelectIcCompanyGroup,
  expandedIcListNodeId = null,
  onExpandedIcListNodeIdChange,
}: {
  groups: Group[];
  searchTerm: string;
  selectedGroup: Group | null;
  onSelectGroup: (group: Group, options?: GroupListSelectOptions) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  pendingApprovalByPartyId?: Record<string, number>;
  groupMembersByGroupId?: Record<string, Party[]>;
  getItemHref?: (group: Group) => string | undefined;
  quickFilter: EntityListQuickFilter;
  selectedGroupMemberFilterId?: string | null;
  focusGroupId?: string | null;
  onFocusGroupIdChange?: (id: string | null) => void;
  moveAccountsEnabled?: boolean;
  onMoveAccountToGroup?: (party: Party, targetGroupId: string) => void | Promise<void>;
  canMoveMember?: (party: Party) => boolean;
  onMoveGroupToGroup?: (sourceGroupId: string, targetGroupId: string) => void | Promise<void>;
  canMoveGroup?: (group: Group) => boolean;
  allGroupsForMove?: Group[];
  icCompanyGroup?: Group | null;
  icPeerCompanyRows?: Party[];
  selectedIcPeerCompanyId?: string | null;
  selectedIcMemberAccountId?: string | null;
  onSelectIcCompanyGroup?: (options: IcCompanyGroupTabSelectOptions) => void;
  expandedIcListNodeId?: string | null;
  onExpandedIcListNodeIdChange?: (next: string | null) => void;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, isRowAnimationEnabled, layoutHoldMs } =
    useMasterListRowMotion();
  const searchActive = Boolean(searchTerm.trim());

  const filteredIcPeerCompanyRows = useMemo(() => {
    if (!searchActive) return icPeerCompanyRows;
    return icPeerCompanyRows.filter((row) => partyListRowMatchesSearch(row, searchTerm));
  }, [icPeerCompanyRows, searchActive, searchTerm]);

  const showIcCompanyInset = useMemo(() => {
    if (!icCompanyGroup || !onSelectIcCompanyGroup) return false;
    if (!searchActive) return true;
    return (
      icCompanyGroupSearchMatches(searchTerm) ||
      filteredIcPeerCompanyRows.length > 0
    );
  }, [icCompanyGroup, onSelectIcCompanyGroup, searchActive, searchTerm, filteredIcPeerCompanyRows.length]);

  useEffect(() => {
    if (!searchActive || !onExpandedIcListNodeIdChange) return;
    if (filteredIcPeerCompanyRows.length === 1) {
      onExpandedIcListNodeIdChange(icPeerListExpandKey(filteredIcPeerCompanyRows[0]!.id));
      return;
    }
    if (
      filteredIcPeerCompanyRows.length > 0 ||
      icCompanyGroupSearchMatches(searchTerm)
    ) {
      onExpandedIcListNodeIdChange(IC_COMPANY_PARTY_GROUP_ID);
    }
  }, [searchActive, filteredIcPeerCompanyRows, searchTerm, onExpandedIcListNodeIdChange]);

  useEffect(() => {
    if (searchActive || !onExpandedIcListNodeIdChange) return;
    if (!focusGroupId || focusGroupId === IC_COMPANY_PARTY_GROUP_ID) return;
    onExpandedIcListNodeIdChange(null);
  }, [focusGroupId, searchActive, onExpandedIcListNodeIdChange]);

  const visibleGroupFilter = useCallback((group: Group) => {
    if (group.id === IC_COMPANY_PARTY_GROUP_ID) return false;
    const isReportOnly = (group as { isReportOnly?: boolean }).isReportOnly === true;
    const isSystemParent =
      (group as { isSystemReserved?: boolean }).isSystemReserved === true ||
      isSystemParentGroup("groups", group.id);
    if (isReportOnly || isSystemParent) return false;
    return !!group.name;
  }, []);

  const { forest, visibleGroups, displayOrderKey, searchHasVisibleResults } =
    useMasterGroupListForest({
      groups,
      config: PARTY_GROUP_LIST_CONFIG,
      searchTerm,
      quickFilter,
      groupMembersByGroupId,
      visibleGroupFilter,
    });

  const branchInsetById = useMemo(() => {
    if (!showIcCompanyInset || !icCompanyGroup || !onSelectIcCompanyGroup) {
      return undefined;
    }
    return {
      [PARTY_SYSTEM_DEBTORS_ID]: (ctx: { focusGroupId: string | null; searchTerm: string }) => {
        const icDimClass =
          ctx.focusGroupId &&
          ctx.focusGroupId !== IC_COMPANY_PARTY_GROUP_ID &&
          !ctx.searchTerm.trim()
            ? GROUP_LIST_FOCUS_DIM_CLASS
            : undefined;
        return (
          <div className={icDimClass} data-pl-ic-company-row="">
            <IcCompanyGroupTabListTree
              group={icCompanyGroup}
              icPeerCompanyRows={filteredIcPeerCompanyRows}
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
              expandedListNodeId={expandedIcListNodeId}
              onExpandedListNodeIdChange={onExpandedIcListNodeIdChange}
              searchTerm={searchTerm}
              onFocusGroup={() => onFocusGroupIdChange?.(IC_COMPANY_PARTY_GROUP_ID)}
            />
          </div>
        );
      },
    };
  }, [
    showIcCompanyInset,
    icCompanyGroup,
    onSelectIcCompanyGroup,
    filteredIcPeerCompanyRows,
    selectedGroup,
    selectedIcPeerCompanyId,
    selectedIcMemberAccountId,
    quickFilter,
    pendingApprovalByGroupId,
    pendingApprovalByPartyId,
    getItemHref,
    animatePresenceMode,
    rowMotionProps,
    isRowAnimationEnabled,
    layoutHoldMs,
    expandedIcListNodeId,
    onExpandedIcListNodeIdChange,
    searchTerm,
    onFocusGroupIdChange,
  ]);

  if (searchTerm.trim() && !searchHasVisibleResults && !showIcCompanyInset) {
    return (
      <li className="px-2 py-6 text-center text-sm text-muted-foreground">
        No groups or parties found.
      </li>
    );
  }

  return (
    <MasterGroupNestedListBody
      config={PARTY_GROUP_LIST_CONFIG}
      forest={forest}
      allGroups={allGroupsForMove ?? visibleGroups}
      displayOrderKey={displayOrderKey}
      searchTerm={searchTerm}
      selectedGroup={selectedGroup}
      selectedGroupMemberFilterId={selectedGroupMemberFilterId}
      groupMembersByGroupId={groupMembersByGroupId}
      onSelectGroup={onSelectGroup}
      pendingApprovalByGroupId={pendingApprovalByGroupId}
      pendingApprovalByMemberId={pendingApprovalByPartyId}
      getItemHref={getItemHref}
      quickFilter={quickFilter}
      animatePresenceMode={animatePresenceMode}
      rowMotionProps={rowMotionProps}
      isRowAnimationEnabled={isRowAnimationEnabled}
      layoutHoldMs={layoutHoldMs}
      formatCurrency={(amount, options) =>
        formatCurrency(amount, { ...options, noAnimation: true }) as React.ReactNode
      }
      renderGroupLeading={(group) => (
        <MasterListGroupIcon>
          {(group as { isSystemReserved?: boolean }).isSystemReserved ? (
            <Lock className="h-5 w-5" />
          ) : (
            <Users className="h-5 w-5" />
          )}
        </MasterListGroupIcon>
      )}
      renderMemberRow={(member, group, ctx) => (
        <GroupListMemberRow
          key={member.id || `${group.id}-member-${member.name}`}
          name={member.name}
          balance={member.balance}
          isSelected={ctx.isSelected}
          onClick={ctx.onClick}
          isAccountFrozen={member.isFrozen === true}
          pendingCount={ctx.pendingCount}
          highlightQuery={ctx.highlightQuery}
          rowDimClass={ctx.rowDimClass}
          {...ctx.memberMoveProps}
          leading={
            <GroupListMemberAvatar
              name={member.name}
              fileUrl={member.fileUrl}
              companyId={member.companyId}
            />
          }
        />
      )}
      focusGroupId={focusGroupId}
      onFocusGroupIdChange={onFocusGroupIdChange}
      moveAccountsEnabled={moveAccountsEnabled}
      onMoveAccountToGroup={onMoveAccountToGroup}
      canMoveMember={canMoveMember}
      onMoveGroupToGroup={onMoveGroupToGroup}
      canMoveGroup={canMoveGroup}
      branchInsetById={branchInsetById}
    />
  );
}
