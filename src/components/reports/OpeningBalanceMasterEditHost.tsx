"use client";

import { useMemo } from "react";
import { EditPartyDialog } from "@/components/party/EditPartyDialog";
import type { Party } from "@/components/party/types";
import { EditAccountDialog } from "@/components/bank-cash/EditAccountDialog";
import type { Account } from "@/components/bank-cash/types";
import { EditStaffDialog } from "@/components/staff/EditStaffDialog";
import type { Staff } from "@/components/staff/types";
import { EditTaxDialog } from "@/components/tax/EditTaxDialog";
import type { Tax } from "@/components/tax/types";
import { EditExpenseAccountDialog } from "@/components/expenses/EditExpenseAccountDialog";
import type { ExpenseAccount } from "@/components/expenses/types";
import { useVouchers } from "@/hooks/useVouchers";
import type { OpeningBalanceLedgerAccountRow } from "@/lib/reports/openingBalanceLedgerAccounts";

type Props = {
  row: OpeningBalanceLedgerAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMasterUpdated?: () => void;
};

/** In-place master edit dialog — Opening Balance row double-click / Enter. */
export function OpeningBalanceMasterEditHost({
  row,
  open,
  onOpenChange,
  onMasterUpdated,
}: Props) {
  const {
    processedParties,
    processedAccounts,
    processedStaff,
    processedTaxes,
    processedExpenseAccounts,
    processedStaffGroups,
  } = useVouchers();

  const onUpdated = useMemo(
    () => () => {
      onMasterUpdated?.();
    },
    [onMasterUpdated]
  );

  if (!row || !open) return null;

  switch (row.entityType) {
    case "party": {
      const party = processedParties.find((p) => String(p.id) === row.id) as Party | undefined;
      if (!party) return null;
      return (
        <EditPartyDialog
          party={party}
          onPartyUpdated={onUpdated}
          onPartyDeleted={() => {}}
          hasTransactions
          isOpen={open}
          onOpenChange={onOpenChange}
          presentationMode="nested-ledger"
        >
          {null}
        </EditPartyDialog>
      );
    }
    case "account": {
      const account = processedAccounts.find((a) => String(a.id) === row.id) as Account | undefined;
      if (!account) return null;
      return (
        <EditAccountDialog
          account={account}
          allAccounts={processedAccounts as Account[]}
          onAccountUpdated={onUpdated}
          onAccountDeleted={() => {}}
          hasTransactions
          isOpen={open}
          onOpenChange={onOpenChange}
          presentationMode="nested-ledger"
        >
          {null}
        </EditAccountDialog>
      );
    }
    case "staff": {
      const staff = processedStaff.find((s) => String(s.id) === row.id) as Staff | undefined;
      if (!staff) return null;
      return (
        <EditStaffDialog
          staff={staff}
          allGroups={processedStaffGroups}
          allStaff={processedStaff as Staff[]}
          onStaffUpdated={onUpdated}
          onStaffDeleted={() => {}}
          hasTransactions
          isOpen={open}
          onOpenChange={onOpenChange}
          presentationMode="nested-ledger"
        >
          {null}
        </EditStaffDialog>
      );
    }
    case "tax": {
      const tax = processedTaxes.find((t) => String(t.id) === row.id) as Tax | undefined;
      if (!tax) return null;
      return (
        <EditTaxDialog
          tax={tax}
          allTaxes={processedTaxes as Tax[]}
          onTaxUpdated={onUpdated}
          onTaxDeleted={() => {}}
          hasTransactions
          isOpen={open}
          onOpenChange={onOpenChange}
          presentationMode="nested-ledger"
        >
          {null}
        </EditTaxDialog>
      );
    }
    case "expense": {
      const account = processedExpenseAccounts.find(
        (a) => String(a.id) === row.id
      ) as ExpenseAccount | undefined;
      if (!account) return null;
      return (
        <EditExpenseAccountDialog
          account={account}
          onAccountUpdated={onUpdated}
          onAccountDeleted={() => {}}
          hasTransactions
          isOpen={open}
          onOpenChange={onOpenChange}
          presentationMode="nested-ledger"
        >
          {null}
        </EditExpenseAccountDialog>
      );
    }
    default:
      return null;
  }
}
