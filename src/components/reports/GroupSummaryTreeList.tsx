"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Briefcase,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  Landmark,
  Lock,
  Package,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterListRow } from "@/components/ui/master-list-row";
import { MasterListGroupIcon } from "@/components/entity/MasterListGroupIcon";
import { masterListShellCn, masterListScrollBodyCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { masterListOrderKey, useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import type { IcCompanyGroupTabSelectOptions } from "@/components/party/IcCompanyGroupTabListTree";

export type GroupSummaryTreeNode = {
  id: string;
  name: string;
  balance: number;
  debit?: number;
  credit?: number;
  level: number;
  children?: GroupSummaryTreeNode[];
  isEntityRow?: boolean;
  isVirtualExpenseParent?: boolean;
  isSystemGroup?: boolean;
  isIcEntity?: boolean;
  isIcPeerRow?: boolean;
  isIcMemberRow?: boolean;
  isAccountRow?: boolean;
  icPeerCompanyId?: string;
  icMemberAccountId?: string;
  accountId?: string;
  accountType?: "party" | "staff" | "tax" | "expense" | "bank";
  groupId?: string;
  groupType?: string;
};

/** Har expand level par child cards 7px left se step-in (party group nested jaisa). */
const GROUP_SUMMARY_CHILD_INDENT_CLASS = "pl-[7px]";

function entityIcon(id: string) {
  if (id === "entity-party") return <Users className="h-4 w-4" />;
  if (id === "entity-bank") return <CreditCard className="h-4 w-4" />;
  if (id === "entity-staff") return <Building2 className="h-4 w-4" />;
  if (id === "entity-tax") return <Receipt className="h-4 w-4" />;
  if (id === "entity-expense") return <FileText className="h-4 w-4" />;
  if (id === "entity-item") return <Package className="h-4 w-4" />;
  if (id === "entity-ic-company") return <Users className="h-4 w-4" />;
  return <Landmark className="h-4 w-4" />;
}

function accountIcon(accountType?: GroupSummaryTreeNode["accountType"]) {
  switch (accountType) {
    case "party":
      return <Users className="h-4 w-4" />;
    case "staff":
      return <Briefcase className="h-4 w-4" />;
    case "tax":
      return <Receipt className="h-4 w-4" />;
    case "expense":
      return <TrendingUp className="h-4 w-4" />;
    case "bank":
      return <Landmark className="h-4 w-4" />;
    default:
      return <Users className="h-4 w-4" />;
  }
}

function collectExpandIdsForSearch(items: GroupSummaryTreeNode[], out = new Set<string>()): Set<string> {
  for (const item of items) {
    if (item.children?.length) {
      out.add(item.id);
      collectExpandIdsForSearch(item.children, out);
    }
  }
  return out;
}

function flattenVisibleTreeNodeIds(
  nodes: GroupSummaryTreeNode[],
  expandedIds: Set<string>,
  out: string[] = []
): string[] {
  for (const node of nodes) {
    out.push(node.id);
    if (expandedIds.has(node.id) && node.children?.length) {
      flattenVisibleTreeNodeIds(node.children, expandedIds, out);
    }
  }
  return out;
}

type GroupSummaryTreeListProps = {
  items: GroupSummaryTreeNode[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectAccount?: (accountId: string) => void;
  onSelectIcCompany?: (options: IcCompanyGroupTabSelectOptions) => void;
  selectedGroupId: string | null;
  selectedAccountId?: string | null;
  selectedIcPeerCompanyId?: string | null;
  selectedIcMemberAccountId?: string | null;
  searchTerm?: string;
};

export function GroupSummaryTreeList({
  items,
  expandedIds,
  onToggleExpand,
  onSelectGroup,
  onSelectAccount,
  onSelectIcCompany,
  selectedGroupId,
  selectedAccountId = null,
  selectedIcPeerCompanyId = null,
  selectedIcMemberAccountId = null,
  searchTerm = "",
}: GroupSummaryTreeListProps) {
  const { formatCurrency } = useDate();
  const searchActive = Boolean(searchTerm.trim());

  const effectiveExpandedIds = useMemo(() => {
    if (!searchActive) return expandedIds;
    const next = new Set(expandedIds);
    collectExpandIdsForSearch(items, next);
    return next;
  }, [searchActive, expandedIds, items]);

  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();

  const displayOrderKey = useMemo(
    () => masterListOrderKey(flattenVisibleTreeNodeIds(items, effectiveExpandedIds)),
    [items, effectiveExpandedIds]
  );

  const renderNode = (node: GroupSummaryTreeNode): React.ReactNode => {
    const childGroups = node.children?.filter((c) => !c.isAccountRow) ?? [];
    const childAccounts = node.children?.filter((c) => c.isAccountRow) ?? [];
    const hasChildren = childGroups.length > 0 || childAccounts.length > 0;
    const hasExpandableChildren = childGroups.length > 0;
    const isExpanded = effectiveExpandedIds.has(node.id);
    const isEntityRow = node.isEntityRow === true;
    const isVirtualExpenseParent = node.isVirtualExpenseParent === true;
    const isAccountRow = node.isAccountRow === true;
    const isSelectable =
      isAccountRow ||
      (!isEntityRow &&
        !isVirtualExpenseParent &&
        Boolean(node.groupId || node.isIcPeerRow || node.isIcMemberRow));

    const isSelected = isAccountRow
      ? selectedAccountId === node.accountId
      : node.isIcEntity
        ? selectedGroupId === node.groupId && !selectedIcPeerCompanyId && !selectedIcMemberAccountId
        : node.isIcMemberRow
          ? selectedIcMemberAccountId === node.icMemberAccountId
          : node.isIcPeerRow
            ? selectedIcPeerCompanyId === node.icPeerCompanyId && !selectedIcMemberAccountId
            : isSelectable && selectedGroupId === node.groupId;

    const displayBalance =
      node.isSystemGroup && hasExpandableChildren && isExpanded
        ? null
        : node.isSystemGroup && hasExpandableChildren
          ? childGroups.reduce((sum, child) => sum + (child.balance || 0), 0)
          : node.balance;

    const handleRowClick = () => {
      if (isAccountRow && node.accountId) {
        onSelectAccount?.(node.accountId);
        return;
      }
      if (node.isIcEntity && onSelectIcCompany) {
        onSelectIcCompany({});
        return;
      }
      if (isEntityRow || isVirtualExpenseParent) {
        if (hasChildren) onToggleExpand(node.id);
        return;
      }
      if (node.isIcMemberRow && onSelectIcCompany) {
        onSelectIcCompany({
          peerCompanyId: node.icPeerCompanyId ?? null,
          memberAccountId: node.icMemberAccountId ?? null,
        });
        return;
      }
      if (node.isIcPeerRow && onSelectIcCompany) {
        onSelectIcCompany({
          peerCompanyId: node.icPeerCompanyId ?? null,
          memberAccountId: null,
        });
        return;
      }
      if (node.groupId) {
        onSelectGroup(node.groupId);
      }
    };

    const handleExpandClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(node.id);
    };

    const rowIcon =
      isAccountRow
        ? accountIcon(node.accountType)
        : isEntityRow || node.isIcEntity
          ? entityIcon(node.id)
          : node.isSystemGroup
            ? <Lock className="h-4 w-4" />
            : <Users className="h-4 w-4" />;

    return (
      <motion.li
        key={node.id}
        layoutDependency={displayOrderKey}
        className="w-full list-none"
        {...rowMotionProps}
      >
        <MasterListRow
          selected={isSelected}
          className={cn(
            "cursor-pointer",
            masterListRowUnselectedCn(isSelected),
            (isEntityRow || isVirtualExpenseParent || node.isIcEntity) && "font-semibold",
            isAccountRow && "font-normal"
          )}
          data-pl-ic-company-row={node.isIcEntity || node.isIcPeerRow || node.isIcMemberRow ? "" : undefined}
          onClick={handleRowClick}
        >
          <div className="pl-master-list-row">
            <div className="pl-master-list-row-leading min-w-0 flex-1">
              <MasterListGroupIcon>{rowIcon}</MasterListGroupIcon>
              <span
                className={cn(
                  masterListNameTriggerCn,
                  "min-w-0 flex-1 truncate text-sm",
                  !isAccountRow && "font-semibold"
                )}
              >
                {node.name}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {hasChildren && !isAccountRow ? (
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted/60"
                  onClick={handleExpandClick}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ) : null}
              {displayBalance === null ? (
                <span className="pl-master-list-row-amount-xs ml-1 rounded px-1 text-muted-foreground/60">-</span>
              ) : (
                <p
                  className={cn(
                    "pl-master-list-row-amount-xs ml-1 rounded px-1",
                    displayBalance >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {formatCurrency(displayBalance, { showDrCr: true })}
                </p>
              )}
            </div>
          </div>
        </MasterListRow>
        {hasChildren && isExpanded ? (
          <ul className={cn("pl-master-list-ul space-y-1", GROUP_SUMMARY_CHILD_INDENT_CLASS)}>
            {childGroups.map((child) => renderNode(child))}
            {childAccounts.map((child) => renderNode(child))}
          </ul>
        ) : null}
      </motion.li>
    );
  };

  return (
    <div className={masterListShellCn} data-theme-list="account-list" data-pl-group-summary-tree="">
      <ScrollArea
        listChrome
        className="min-h-0 min-w-0 w-full flex-1"
        onViewportScroll={markListScrolling}
        onViewportTouchMove={markListScrolling}
      >
        <div className={masterListScrollBodyCn}>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No groups found.</div>
          ) : (
            <ul className="pl-master-list-ul space-y-1">
              <AnimatePresence mode={animatePresenceMode}>
                {items.map((item) => renderNode(item))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
