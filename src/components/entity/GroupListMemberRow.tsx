"use client";

import React from "react";
import Link from "next/link";
import { MasterListRow } from "@/components/ui/master-list-row";
import { MasterListNameTooltip } from "@/components/entity/MasterListNameTooltip";
import { MasterAccountFreezeListBadge } from "@/components/masterAccountFreeze/MasterAccountFreezeListBadge";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { masterListRowUnselectedCn } from "@/lib/masterListChrome";
import {
  groupListChildMemberNameTriggerCn,
  masterListNameTriggerStrongCn,
} from "@/lib/listSelectionChrome";
import { useDate } from "@/hooks/useDate";

type GroupListMemberRowProps = {
  name: string;
  balance: number | undefined;
  isSelected: boolean;
  onClick: () => void;
  leading: React.ReactNode;
  pendingCount?: number;
  balanceMasked?: boolean;
  nameTriggerClassName?: string;
  amountClassName?: string;
  rowDataAttrs?: Record<string, string>;
  isAccountFrozen?: boolean;
};

export function GroupListMemberRow({
  name,
  balance,
  isSelected,
  onClick,
  leading,
  pendingCount = 0,
  balanceMasked = false,
  nameTriggerClassName = groupListChildMemberNameTriggerCn,
  amountClassName = "pl-master-list-row-amount-xs ml-1",
  rowDataAttrs,
  isAccountFrozen = false,
}: GroupListMemberRowProps) {
  const { formatCurrency } = useDate();
  const isBalanceMasked = balanceMasked || typeof balance !== "number";
  const cardClassName = masterListRowUnselectedCn(isSelected);

  return (
    <MasterListRow selected={isSelected} className={cardClassName} onClick={onClick} {...rowDataAttrs}>
      <div className="pl-master-list-row">
        <div className="pl-master-list-row-leading">
          <div className="relative flex-shrink-0">
            {leading}
            {pendingCount > 0 && (
              <span
                className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center bg-pink-500 text-[10px] font-bold text-white origin-center"
                style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                aria-label={`${pendingCount} pending approval`}
              >
                <span style={{ transform: "rotate(-45deg)" }}>{pendingCount}</span>
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <MasterListNameTooltip
              measureKey={name}
              triggerClassName={nameTriggerClassName}
              tooltipContent={
                <>
                  <p>{name}</p>
                  {pendingCount > 0 ? (
                    <p className="text-xs text-muted-foreground">{pendingCount} pending approval</p>
                  ) : null}
                </>
              }
            >
              {name}
            </MasterListNameTooltip>
            {isAccountFrozen ? <MasterAccountFreezeListBadge className="mt-0.5" /> : null}
          </div>
        </div>
        <p
          data-pl-list-balance={
            isBalanceMasked
              ? undefined
              : typeof balance === "number" && balance >= 0
                ? "dr"
                : "cr"
          }
          className={cn(
            amountClassName,
            !isBalanceMasked && masterDetailBalanceToneClass(balance ?? 0)
          )}
        >
          {isBalanceMasked ? "*****" : formatCurrency(balance ?? 0, { showDrCr: true })}
        </p>
      </div>
    </MasterListRow>
  );
}

type GroupListExpandNameRowProps = {
  name: string;
  expandControl: React.ReactNode | null;
  pendingCount?: number;
  nameTriggerClassName?: string;
  tooltipExtra?: React.ReactNode;
};

export function GroupListExpandNameRow({
  name,
  expandControl,
  pendingCount = 0,
  nameTriggerClassName = masterListNameTriggerStrongCn,
  tooltipExtra,
}: GroupListExpandNameRowProps) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-0.5 overflow-hidden">
      <MasterListNameTooltip
        measureKey={name}
        triggerClassName={nameTriggerClassName}
        className={expandControl ? "min-w-0 flex-1" : undefined}
        tooltipContent={
          <>
            <p>{name}</p>
            {pendingCount > 0 ? (
              <p className="text-xs text-muted-foreground">{pendingCount} pending approval</p>
            ) : null}
            {tooltipExtra}
          </>
        }
      >
        {name}
      </MasterListNameTooltip>
      {expandControl}
    </div>
  );
}

export function renderGroupListRowShell(
  isSelected: boolean,
  onClick: () => void,
  content: React.ReactNode,
  href?: string,
  rowDataAttrs?: Record<string, string>
) {
  const rowClassName = masterListRowUnselectedCn(isSelected);
  if (href) {
    return (
      <Link
        prefetch={false}
        href={href}
        onClick={onClick}
        className="block min-w-0 max-w-full overflow-hidden"
      >
        <MasterListRow selected={isSelected} className={rowClassName} {...rowDataAttrs}>
          {content}
        </MasterListRow>
      </Link>
    );
  }
  return (
    <MasterListRow selected={isSelected} className={rowClassName} onClick={onClick} {...rowDataAttrs}>
      {content}
    </MasterListRow>
  );
}
