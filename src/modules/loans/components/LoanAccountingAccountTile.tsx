"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SyncedPillPair } from "@/components/ui/synced-pill-pair";
import { useDate } from "@/hooks/useDate";
import { useBankLedgerDrCrPerspective } from "@/hooks/useBankLedgerDrCrPerspective";
import usePermissions from "@/hooks/usePermissions";
import { useVouchers } from "@/hooks/useVouchers";
import { flipLedgerSignedBalance } from "@/lib/bankLedgerDrCrPerspective";
import { getLoanFormIntro } from "../constants/loanFormIntros";
import { LoanHelpInfo } from "./LoanHelpInfo";
import { LoanAccountingAccountEdit, type LoanAccountingEditKind } from "./LoanAccountingAccountEdit";
import { loanAccountingEntityMenuLabel, loanAccountingEntityTypeBracket } from "@/lib/sidebarEntityMenuLabels";
import { LoanAccountingGroupPicker } from "./LoanAccountingGroupPicker";
import { isLoanLiabilityStaff } from "../utils/loanLiabilityStaff";

/** Shared pill chrome for Account name combobox + Group readout. */
export const LOAN_ACCOUNTING_PILL_CLASS =
  "h-9 w-full min-w-0 rounded-full border border-blue-300/90 bg-blue-50/95 px-3 text-sm text-blue-950 shadow-sm dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100";

export const LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS = cn(
  LOAN_ACCOUNTING_PILL_CLASS,
  "justify-between font-normal hover:bg-blue-100/90 dark:hover:bg-blue-900/45"
);

export function LoanAccountingAccountTile({
  entityLabel = "",
  entityHint: _entityHint,
  accountLabel,
  accountIntroKey,
  accountOptionIntroKey,
  accountControl,
  accountDisplayName = "",
  editKind,
  editAccountId,
  editDisabled,
  groupId,
  groupPickerDisabled = false,
  groupFallbackLabel = "—",
  groupDraftId,
  onGroupDraftChange,
  footer,
  className,
}: {
  entityLabel?: string;
  entityHint?: string;
  accountLabel: string;
  accountIntroKey: string;
  accountOptionIntroKey?: string | null;
  accountControl: React.ReactNode;
  accountDisplayName?: string;
  editKind?: LoanAccountingEditKind;
  editAccountId?: string;
  editDisabled?: boolean;
  groupId?: string | null;
  groupPickerDisabled?: boolean;
  groupFallbackLabel?: string;
  groupDraftId?: string | null;
  onGroupDraftChange?: (groupId: string | null) => void;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { formatCurrencyForPrint } = useDate();
  const { perspective: bankDrCrPerspective } = useBankLedgerDrCrPerspective();
  const { can } = usePermissions();
  const { processedExpenseAccounts, processedAccounts, processedStaff } = useVouchers();

  const optionKey =
    accountOptionIntroKey && getLoanFormIntro(accountOptionIntroKey) ? accountOptionIntroKey : null;

  const entityBracketVariant = useMemo(() => {
    const id = String(editAccountId || "").trim();
    if (editKind === "bank") {
      if (!id) return "bank" as const;
      const row = (processedAccounts || []).find((a) => a.id === id) as { accountType?: string } | undefined;
      return String(row?.accountType || "").toLowerCase() === "cash" ? ("cash" as const) : ("bank" as const);
    }
    if (editKind === "staff") {
      if (!id) return "loan" as const;
      const row = (processedStaff || []).find((s) => s.id === id);
      return isLoanLiabilityStaff(row) ? ("loan" as const) : ("staff" as const);
    }
    if (editKind === "expense") {
      if (!id) return "expense" as const;
      const row = (processedExpenseAccounts || []).find((e) => e.id === id) as { type?: string } | undefined;
      return String(row?.type || "").toLowerCase() === "income" ? ("income" as const) : ("expense" as const);
    }
    return undefined;
  }, [editKind, editAccountId, processedAccounts, processedStaff, processedExpenseAccounts]);

  const resolvedEntityLabel =
    entityLabel?.trim() || (editKind ? loanAccountingEntityMenuLabel(editKind) : "Entity");
  const entityTypeBracket = editKind ? loanAccountingEntityTypeBracket(editKind, entityBracketVariant) : null;

  const closingBalance = useMemo(() => {
    const id = String(editAccountId || "").trim();
    if (!id || !editKind) return null;

    if (editKind === "bank") {
      const account = (processedAccounts || []).find((a) => a.id === id) as
        | { balance?: number; isSpecial?: boolean }
        | undefined;
      if (!account) return null;
      if (account.isSpecial && !can("view_special_account_balance")) return null;
      return flipLedgerSignedBalance(Number(account.balance) || 0, bankDrCrPerspective);
    }
    if (editKind === "staff") {
      const row = (processedStaff || []).find((s) => s.id === id) as { balance?: number } | undefined;
      return row ? Number(row.balance) || 0 : null;
    }
    const row = (processedExpenseAccounts || []).find((e) => e.id === id) as { balance?: number } | undefined;
    return row ? Number(row.balance) || 0 : null;
  }, [
    editAccountId,
    editKind,
    processedAccounts,
    processedStaff,
    processedExpenseAccounts,
    bankDrCrPerspective,
    can,
  ]);

  const closingBalanceLabel =
    closingBalance == null
      ? null
      : formatCurrencyForPrint(closingBalance, {
          showDrCr: true,
          noAnimation: true,
          context: "list",
        });

  const accountPillClassName = cn(
    "relative min-h-9 min-w-0",
    editKind && optionKey
      ? "[&_button>span:first-of-type]:pr-[4.25rem]"
      : editKind || optionKey
        ? "[&_button>span:first-of-type]:pr-10"
        : undefined
  );

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-amber-200/90 bg-white/70 p-3 shadow-sm",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-amber-100/90 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">Entity</span>
        <span className="text-sm font-medium text-foreground">
          {resolvedEntityLabel}
          {entityTypeBracket ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              ({entityTypeBracket})
            </span>
          ) : null}
        </span>
      </div>

      <SyncedPillPair
        leftHeader={
          <div className="flex min-h-[1.125rem] min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Label className="shrink-0 text-xs">{accountLabel}</Label>
            <LoanHelpInfo introKey={accountIntroKey} />
            {closingBalanceLabel ? (
              <span
                className={cn(
                  "truncate text-[11px] font-medium tabular-nums",
                  (closingBalance ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                )}
                title={`Closing balance: ${closingBalanceLabel}`}
              >
                {closingBalanceLabel}
              </span>
            ) : null}
          </div>
        }
        rightHeader={
          <div className="flex min-h-[1.125rem] items-center">
            <Label className="text-xs">Group</Label>
          </div>
        }
        leftPillClassName={accountPillClassName}
        leftPill={
          <div title={accountDisplayName || undefined}>
            {accountControl}
            {editKind || optionKey ? (
              <div className="pointer-events-none absolute right-8 top-1/2 z-10 flex -translate-y-1/2 items-center gap-[5px]">
                {editKind ? (
                  <div className="pointer-events-auto">
                    <LoanAccountingAccountEdit
                      kind={editKind}
                      accountId={editAccountId}
                      disabled={editDisabled}
                    />
                  </div>
                ) : null}
                {optionKey ? (
                  <div className="pointer-events-auto">
                    <LoanHelpInfo introKey={optionKey} compact />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        rightPill={
          editKind ? (
            <LoanAccountingGroupPicker
              kind={editKind}
              accountId={editAccountId}
              groupId={groupId}
              disabled={groupPickerDisabled}
              fallbackLabel={groupFallbackLabel}
              draftGroupId={groupDraftId}
              onDraftGroupChange={onGroupDraftChange}
            />
          ) : (
            <div className={cn(LOAN_ACCOUNTING_PILL_CLASS, "flex items-center")} title={groupFallbackLabel}>
              <span className="min-w-0 truncate">{groupFallbackLabel}</span>
            </div>
          )
        }
      />

      {footer ? <div className="border-t border-amber-100/90 pt-3">{footer}</div> : null}
    </div>
  );
}
