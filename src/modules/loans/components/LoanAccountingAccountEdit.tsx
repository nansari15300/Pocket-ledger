"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Pencil } from "lucide-react";
import { EditAccountDialog } from "@/components/bank-cash/EditAccountDialog";
import type { Account } from "@/components/bank-cash/types";
import { EditExpenseAccountDialog } from "@/components/expenses/EditExpenseAccountDialog";
import type { ExpenseAccount } from "@/components/expenses/types";
import { EditStaffDialog } from "@/components/staff/EditStaffDialog";
import type { Staff } from "@/components/staff/types";
import { useVouchers } from "@/hooks/useVouchers";
import { LEDGER_INLINE_EDIT_PEN_CN } from "@/lib/ledgerHeaderChrome";
import { cn } from "@/lib/utils";

export type LoanAccountingEditKind = "bank" | "staff" | "expense";

function hasLedgerActivity(row: { debit?: number; credit?: number } | null | undefined): boolean {
  return Number(row?.debit || 0) > 0 || Number(row?.credit || 0) > 0;
}

export function LoanAccountingAccountEdit({
  kind,
  accountId,
  disabled,
  className,
}: {
  kind: LoanAccountingEditKind;
  accountId?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const expenseTriggerRef = useRef<HTMLButtonElement>(null);
  const {
    processedAccounts,
    processedStaff,
    processedExpenseAccounts,
    processedStaffGroups,
    patchMasterEntity,
  } = useVouchers();

  const id = String(accountId || "").trim();
  const canEdit = !disabled && !!id;

  const bankAccount = useMemo(
    () =>
      kind === "bank"
        ? ((processedAccounts || []).find((a) => a.id === id) as Account | undefined)
        : undefined,
    [kind, id, processedAccounts]
  );
  const staffAccount = useMemo(
    () =>
      kind === "staff" ? ((processedStaff || []).find((s) => s.id === id) as Staff | undefined) : undefined,
    [kind, id, processedStaff]
  );
  const expenseAccount = useMemo(
    () =>
      kind === "expense"
        ? ((processedExpenseAccounts || []).find((e) => e.id === id) as ExpenseAccount | undefined)
        : undefined,
    [kind, id, processedExpenseAccounts]
  );

  const resolved = kind === "bank" ? bankAccount : kind === "staff" ? staffAccount : expenseAccount;

  const openEdit = () => {
    if (!canEdit || !resolved) return;
    if (kind === "expense") {
      expenseTriggerRef.current?.click();
      return;
    }
    setOpen(true);
  };

  const stopBubble = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <>
      <button
        type="button"
        className={cn(LEDGER_INLINE_EDIT_PEN_CN, className)}
        disabled={!canEdit || !resolved}
        aria-label="Edit account"
        title="Edit account"
        onClick={(e) => {
          stopBubble(e);
          openEdit();
        }}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
      >
        <Pencil className="h-3 w-3" aria-hidden />
      </button>

      {kind === "bank" && bankAccount ? (
        <EditAccountDialog
          account={bankAccount}
          allAccounts={processedAccounts as Account[]}
          isOpen={open}
          onOpenChange={setOpen}
          hasTransactions={hasLedgerActivity(bankAccount)}
          onAccountUpdated={(updated) => patchMasterEntity("bank_accounts", bankAccount.id, updated)}
          onAccountDeleted={() => setOpen(false)}
        >
          <button type="button" className="sr-only" tabIndex={-1} aria-hidden>
            Edit bank account
          </button>
        </EditAccountDialog>
      ) : null}

      {kind === "staff" && staffAccount ? (
        <EditStaffDialog
          staff={staffAccount}
          allGroups={processedStaffGroups}
          allStaff={processedStaff as Staff[]}
          isOpen={open}
          onOpenChange={setOpen}
          hasTransactions={hasLedgerActivity(staffAccount)}
          onStaffUpdated={(updated) => patchMasterEntity("staff", staffAccount.id, updated)}
          onStaffDeleted={() => setOpen(false)}
        >
          <button type="button" className="sr-only" tabIndex={-1} aria-hidden>
            Edit staff account
          </button>
        </EditStaffDialog>
      ) : null}

      {kind === "expense" && expenseAccount ? (
        <EditExpenseAccountDialog
          account={expenseAccount}
          hasTransactions={hasLedgerActivity(expenseAccount)}
          onAccountUpdated={(updated) => {
            if (updated) patchMasterEntity("expense_accounts", expenseAccount.id, updated);
          }}
          onAccountDeleted={() => {}}
        >
          <button ref={expenseTriggerRef} type="button" className="sr-only" tabIndex={-1} aria-hidden>
            Edit expense account
          </button>
        </EditExpenseAccountDialog>
      ) : null}
    </>
  );
}
