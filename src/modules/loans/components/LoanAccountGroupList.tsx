"use client";

import type { Staff, StaffGroup } from "@/components/staff/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMemo, useState } from "react";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { motion } from "framer-motion";
import { Users, ChevronDown } from "lucide-react";
import { LoanLiabilityEntityIcon } from "@/components/entity/LoanLiabilityEntityIcon";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { masterListShellCn, MASTER_LIST_AVATAR_CN, MASTER_LIST_AVATAR_FALLBACK_CN } from "@/lib/masterListChrome";
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import { GROUP_LIST_CHILD_INDENT_CLASS, toggleGroupListAccordionExpand } from "@/lib/groupListExpand";
import { ExpandableGroupListTree } from "@/components/entity/ExpandableGroupListTree";
import {
  GroupListExpandNameRow,
  GroupListMemberRow,
  renderGroupListRowShell,
} from "@/components/entity/GroupListMemberRow";
import { MasterListGroupIcon } from "@/components/entity/MasterListGroupIcon";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { LOAN_LIABILITY_GROUP_ID } from "../constants/loanConstants";
import { resolveLoanAccountAvatarUrl } from "../utils/resolveLoanAccountAvatarUrl";
import type { Loan } from "../types/loanTypes";
import { findLoanForAccount } from "../db/loanQueries";

const LOAN_SYS_EXPAND_PREFIX = "loan-sys:";
const LOAN_USR_EXPAND_PREFIX = "loan-usr:";

function loanSysExpandKey() {
  return `${LOAN_SYS_EXPAND_PREFIX}${LOAN_LIABILITY_GROUP_ID}`;
}

function loanUsrExpandKey(groupId: string) {
  return `${LOAN_USR_EXPAND_PREFIX}${groupId}`;
}

function parseLoanUsrExpandKey(key: string | null): string | null {
  if (!key?.startsWith(LOAN_USR_EXPAND_PREFIX)) return null;
  const id = key.slice(LOAN_USR_EXPAND_PREFIX.length);
  return id || null;
}

export function LoanAccountGroupList({
  systemGroup,
  childGroups,
  groupMembersByGroupId,
  loans = [],
  bankAccounts = [],
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
  selectedGroupMemberFilterId = null,
  pendingApprovalByMemberId = {},
}: {
  systemGroup: StaffGroup;
  childGroups: StaffGroup[];
  groupMembersByGroupId: Record<string, Staff[]>;
  loans?: Loan[];
  bankAccounts?: Array<{ id: string; fileUrl?: string | null; avatarUrl?: string | null }>;
  searchTerm: string;
  selectedGroup: StaffGroup | null;
  onSelectGroup: (group: StaffGroup, options?: GroupListSelectOptions) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
  selectedGroupMemberFilterId?: string | null;
  pendingApprovalByMemberId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } =
    useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(loanSysExpandKey());

  const filteredChildGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return childGroups;
    return childGroups.filter((group) => {
      const nameMatch = String(group.name || "").toLowerCase().includes(q);
      if (nameMatch) return true;
      const members = groupMembersByGroupId[group.id] || [];
      return members.some((m) => String(m.name || "").toLowerCase().includes(q));
    });
  }, [childGroups, groupMembersByGroupId, searchTerm]);

  const systemExpanded = expandedNodeId === loanSysExpandKey() || expandedNodeId?.startsWith(LOAN_USR_EXPAND_PREFIX) === true;
  const expandedUserGroupId = parseLoanUsrExpandKey(expandedNodeId);

  const isSystemSelectedOnly =
    selectedGroup?.id === systemGroup.id && !selectedGroupMemberFilterId;

  const systemBalance = Number(systemGroup.balance) || 0;
  const systemPending = pendingApprovalByGroupId[systemGroup.id] ?? 0;

  const renderBalance = (balance: number, masked = false) => (
    <p
      data-pl-list-balance={balance >= 0 ? "dr" : "cr"}
      className={cn(
        "pl-master-list-row-amount-xs ml-1",
        !masked && masterDetailBalanceToneClass(balance)
      )}
    >
      {masked ? "*****" : formatCurrency(balance, { showDrCr: true })}
    </p>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div className={masterListShellCn}>
        <ScrollArea
          listChrome
          className="min-h-0 min-w-0 flex-1"
          onViewportScroll={markListScrolling}
          onViewportTouchMove={markListScrolling}
        >
          <ul className="pl-master-list-ul">
            <motion.li {...rowMotionProps}>
              <div data-pl-group-expand-group="">
                {renderGroupListRowShell(
                  isSystemSelectedOnly,
                  () => onSelectGroup(systemGroup, { memberId: null }),
                  <div className="pl-master-list-row">
                    <div className="pl-master-list-row-leading">
                      <div className="relative flex-shrink-0">
                        <MasterListGroupIcon>
                          <Users className="h-5 w-5" />
                        </MasterListGroupIcon>
                      </div>
                      <GroupListExpandNameRow
                        name={systemGroup.name}
                        expandControl={
                          filteredChildGroups.length > 0 ? (
                            <button
                              type="button"
                              aria-expanded={systemExpanded}
                              aria-label={systemExpanded ? "Collapse groups" : "Expand groups"}
                              className="mt-0.5 shrink-0 self-start rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setExpandedNodeId((prev) =>
                                  prev === loanSysExpandKey() || prev?.startsWith(LOAN_USR_EXPAND_PREFIX)
                                    ? null
                                    : loanSysExpandKey()
                                );
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <ChevronDown
                                className={cn("h-3.5 w-3.5 transition-transform", !systemExpanded && "-rotate-90")}
                              />
                            </button>
                          ) : null
                        }
                        pendingCount={systemPending}
                      />
                    </div>
                    {renderBalance(systemBalance)}
                  </div>
                )}

                {systemExpanded ? (
                  <div className={cn("flex flex-col gap-1 pt-1", GROUP_LIST_CHILD_INDENT_CLASS)}>
                    {filteredChildGroups.map((group) => {
                      const members = groupMembersByGroupId[group.id] ?? [];
                      const isGroupSelectedOnly =
                        selectedGroup?.id === group.id && !selectedGroupMemberFilterId;
                      const groupPending = pendingApprovalByGroupId[group.id] ?? 0;
                      const groupBalance = Number(group.balance) || 0;

                      const renderUserGroupCard = (expandControl: React.ReactNode | null) => (
                        <div className="pl-master-list-row">
                          <div className="pl-master-list-row-leading">
                            <div className="relative flex-shrink-0">
                              <MasterListGroupIcon>
                                <Users className="h-5 w-5" />
                              </MasterListGroupIcon>
                            </div>
                            <GroupListExpandNameRow
                              name={group.name}
                              expandControl={expandControl}
                              pendingCount={groupPending}
                            />
                          </div>
                          {renderBalance(groupBalance)}
                        </div>
                      );

                      return (
                        <ExpandableGroupListTree
                          key={group.id}
                          members={members}
                          isGroupSelectedOnly={isGroupSelectedOnly}
                          selectedMemberId={
                            selectedGroup?.id === group.id ? selectedGroupMemberFilterId : null
                          }
                          expanded={expandedUserGroupId === group.id}
                          onExpandedChange={() =>
                            setExpandedNodeId((prev) => {
                              const nextUsr = toggleGroupListAccordionExpand(expandedUserGroupId, group.id);
                              return nextUsr ? loanUsrExpandKey(nextUsr) : loanSysExpandKey();
                            })
                          }
                          onSelectGroup={() => onSelectGroup(group, { memberId: null })}
                          onSelectMember={(memberId) => onSelectGroup(group, { memberId })}
                          quickFilter={quickFilter}
                          expandAriaLabel="loan accounts"
                          animatePresenceMode={animatePresenceMode}
                          rowMotionProps={rowMotionProps}
                          isRowAnimationEnabled={isRowAnimationEnabled}
                          layoutHoldMs={layoutHoldMs}
                          renderGroupRow={({ expandControl }) =>
                            renderGroupListRowShell(
                              isGroupSelectedOnly,
                              () => onSelectGroup(group, { memberId: null }),
                              renderUserGroupCard(expandControl)
                            )
                          }
                          renderMemberRow={(member, memberSelected, onClick) => {
                            const linkedLoan = findLoanForAccount(loans, member.id);
                            const attachmentPreviewUrl = resolveLoanAccountAvatarUrl(
                              member,
                              linkedLoan,
                              bankAccounts
                            );
                            const avatarCompanyId =
                              String(member.companyId || linkedLoan?.companyId || "").trim() || undefined;
                            return (
                              <div className={GROUP_LIST_CHILD_INDENT_CLASS}>
                                <GroupListMemberRow
                                  name={member.name}
                                  balance={member.balance}
                                  isSelected={memberSelected}
                                  onClick={onClick}
                                  pendingCount={pendingApprovalByMemberId[member.id] ?? 0}
                                  leading={
                                    <EntityFileAttachmentHover
                                      fileUrl={attachmentPreviewUrl}
                                      triggerClassName="inline-flex shrink-0 rounded-full"
                                    >
                                      <ResolvedEntityAvatar
                                        className={MASTER_LIST_AVATAR_CN}
                                        fallbackClassName={MASTER_LIST_AVATAR_FALLBACK_CN}
                                        companyId={avatarCompanyId}
                                        src={attachmentPreviewUrl ?? undefined}
                                        alt={member.name}
                                        fallbackSlot={<LoanLiabilityEntityIcon size="avatar" />}
                                      />
                                    </EntityFileAttachmentHover>
                                  }
                                />
                              </div>
                            );
                          }}
                        />
                      );
                    })}
                    {filteredChildGroups.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">No groups found.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </motion.li>
          </ul>
        </ScrollArea>
        {!hideQuickFilterBar ? (
          <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
        ) : null}
      </motion.div>
    </TooltipProvider>
  );
}
