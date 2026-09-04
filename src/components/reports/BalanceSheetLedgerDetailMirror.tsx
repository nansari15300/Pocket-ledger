"use client";

import type { DateRange } from "@/components/ui/ad-calendar";
import type { BalanceSheetRow } from "@/lib/reports/balanceSheetAccounting";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import { PartyDetails } from "@/components/party/PartyDetails";
import { StaffDetails } from "@/components/staff/StaffDetails";
import { TaxDetails } from "@/components/tax/TaxDetails";

type Props = {
  row: BalanceSheetRow;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onClose: () => void;
  processedAccounts: any[];
  processedParties: any[];
  processedStaff: any[];
  processedStaffGroups: any[];
  processedTaxes: any[];
  userNames?: Record<string, string>;
  journalAccountNames?: Record<string, string>;
};

/** Balance Sheet account click — same ledger detail UI as Bank / Party / Staff / Tax pages. */
export function BalanceSheetLedgerDetailMirror({
  row,
  dateRange,
  onDateRangeChange,
  onClose,
  processedAccounts,
  processedParties,
  processedStaff,
  processedStaffGroups,
  processedTaxes,
  userNames,
  journalAccountNames,
}: Props) {
  const noop = () => {};

  switch (row.entityType) {
    case "account": {
      const account = processedAccounts.find((a) => a.id === row.accountId);
      if (!account) {
        return (
          <p className="p-6 text-sm text-muted-foreground">Bank/Cash account not found. Refresh and try again.</p>
        );
      }
      return (
        <AccountDetails
          account={account}
          allAccounts={processedAccounts}
          onAccountUpdated={noop}
          onAccountDeleted={onClose}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          onBack={onClose}
          userNames={userNames}
        />
      );
    }
    case "party":
    case "opening_balance": {
      const party = processedParties.find((p) => p.id === row.accountId);
      if (!party) {
        return (
          <p className="p-6 text-sm text-muted-foreground">Party account not found. Refresh and try again.</p>
        );
      }
      return (
        <PartyDetails
          party={party}
          allParties={processedParties}
          onPartyUpdated={noop}
          onPartyDeleted={onClose}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          onBack={onClose}
          userNames={userNames}
          journalAccountNames={journalAccountNames}
        />
      );
    }
    case "staff": {
      const staff = processedStaff.find((s) => s.id === row.accountId);
      if (!staff) {
        return (
          <p className="p-6 text-sm text-muted-foreground">{`${row.accountName} not found. Refresh and try again.`}</p>
        );
      }
      return (
        <StaffDetails
          staff={staff}
          allStaff={processedStaff}
          allGroups={processedStaffGroups}
          onStaffUpdated={noop}
          onStaffDeleted={onClose}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          onBack={onClose}
          userNames={userNames}
        />
      );
    }
    case "tax": {
      const tax = processedTaxes.find((t) => t.id === row.accountId);
      if (!tax) {
        return (
          <p className="p-6 text-sm text-muted-foreground">Tax account not found. Refresh and try again.</p>
        );
      }
      return (
        <TaxDetails
          tax={tax}
          allTaxes={processedTaxes}
          onTaxUpdated={noop}
          onTaxDeleted={onClose}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          onBack={onClose}
          userNames={userNames}
          journalAccountNames={journalAccountNames}
        />
      );
    }
    default:
      return (
        <p className="p-6 text-sm text-muted-foreground">This account type cannot be opened from Balance Sheet.</p>
      );
  }
}
