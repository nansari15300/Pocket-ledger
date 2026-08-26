"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS } from "@/lib/masterDialogFooterStyles";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { bankAccountDisplayName } from "@/lib/bankAccountDisplayName";
import { useVouchers } from "@/hooks/useVouchers";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { convertExistingBankToLoanAccount, type ConvertedBankLoanLink } from "../services/convertExistingBankToLoanAccount";
import { LoanHelpInfo } from "./LoanHelpInfo";

export type BankAccountOption = {
  id: string;
  accountName?: string;
  name?: string;
  accountType?: string;
  bankName?: string;
  accountNumber?: string;
  loanModuleLinked?: boolean;
  linkedLoanLiabilityId?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: BankAccountOption[];
  onConverted: (link: ConvertedBankLoanLink) => void;
};

function defaultLoanName(account: BankAccountOption): string {
  const base = bankAccountDisplayName(account) || "Bank";
  if (/\bloan\b/i.test(base)) return base;
  return `${base} Loan`;
}

function defaultLender(account: BankAccountOption): string {
  return String(account.bankName || "").trim() || bankAccountDisplayName(account) || "";
}

function isDeletedAccount(row: { isDeleted?: unknown; id?: unknown }): boolean {
  return row.isDeleted === true || row.isDeleted === 1 || row.isDeleted === "true";
}

export function ConvertExistingBankAccountDialog({ open, onOpenChange, accounts, onConverted }: Props) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const { processedAccounts } = useVouchers();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loanLedgerName, setLoanLedgerName] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sqliteAccounts, setSqliteAccounts] = useState<BankAccountOption[]>([]);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    void listCompanyDocsFromBrowserDb(companyId, "bank_accounts").then((rows) => {
      if (cancelled) return;
      setSqliteAccounts(
        (Array.isArray(rows) ? rows : []).flatMap((row) => {
          const rec = (row || {}) as BankAccountOption & { isDeleted?: unknown };
          const id = String(rec.id || "").trim();
          if (!id || isDeletedAccount(rec)) return [];
          return [
            {
              ...rec,
              id,
              accountName: bankAccountDisplayName(rec) || id,
            },
          ];
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  const liveAccounts = useMemo((): BankAccountOption[] => {
    const fromProp = Array.isArray(accounts) ? accounts : [];
    const fromLedger = (processedAccounts || []).map((a) => ({
      ...a,
      id: String(a.id || ""),
      accountName: bankAccountDisplayName(a) || String(a.id || ""),
    }));
    const byId = new Map<string, BankAccountOption>();
    for (const row of [...sqliteAccounts, ...fromLedger, ...fromProp]) {
      const id = String(row?.id || "").trim();
      if (!id || isDeletedAccount(row as { isDeleted?: unknown })) continue;
      const prev = byId.get(id);
      byId.set(id, {
        ...prev,
        ...row,
        id,
        accountName: bankAccountDisplayName(row) || prev?.accountName || id,
      });
    }
    return [...byId.values()].sort((a, b) =>
      bankAccountDisplayName(a).localeCompare(bankAccountDisplayName(b))
    );
  }, [accounts, processedAccounts, sqliteAccounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveAccounts;
    return liveAccounts.filter((a) => {
      const hay = [bankAccountDisplayName(a), a.bankName, a.accountNumber, a.accountType]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [liveAccounts, search]);

  const selected = filtered.find((a) => a.id === selectedId) || liveAccounts.find((a) => a.id === selectedId);

  const pick = (account: BankAccountOption) => {
    setSelectedId(account.id);
    setLoanLedgerName(defaultLoanName(account));
    setLenderName(defaultLender(account));
  };

  const save = async () => {
    if (!selected) {
      toast.error("Select a bank or cash account first.");
      return;
    }
    if (!companyId || !user?.uid) {
      toast.error("Select a company and sign in first.");
      return;
    }
    setSaving(true);
    try {
      const link = await convertExistingBankToLoanAccount({
        companyId,
        userId: user.uid,
        bankAccountId: selected.id,
        loanLedgerName,
        lenderName,
      });
      toast.success("Bank account linked. Loan liability is ready — finish the form and Save Loan.");
      onConverted(link);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not convert this account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearch("");
          setSelectedId("");
          setLoanLedgerName("");
          setLenderName("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="z-[130] flex max-h-[min(92vh,44rem)] w-[min(96vw,40rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg" overlayClassName="z-[130]">
        <DialogHeader className="space-y-1 border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            Add Existing Account
            <LoanHelpInfo introKey="addExistingAccount" />
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Choose a Bank/Cash account, edit the loan name if needed, then Save. Help is only inside (i).
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Existing Bank / Cash accounts</Label>
              <LoanHelpInfo introKey="convertPickBank" />
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, bank, or account number"
            />
            <ScrollArea className="h-52 rounded-md border">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {liveAccounts.length === 0
                    ? "No Bank/Cash account in this company yet. Add one on the Bank page first."
                    : "No Bank/Cash account matches the search."}
                </p>
              ) : (
                <ul className="divide-y">
                  {filtered.map((account) => {
                    const name = bankAccountDisplayName(account) || account.id;
                    const active = account.id === selectedId;
                    const linked = Boolean(account.loanModuleLinked || account.linkedLoanLiabilityId);
                    return (
                      <li key={account.id}>
                        <button
                          type="button"
                          className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/70 ${active ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}
                          onClick={() => pick(account)}
                        >
                          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium leading-tight">{name}</span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {account.accountType || "Bank/Cash"}
                              {account.bankName ? ` · ${account.bankName}` : ""}
                              {account.accountNumber ? ` · ${account.accountNumber}` : ""}
                              {linked ? " · already linked to a loan liability" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {selected ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">Loan liability name</Label>
                  <LoanHelpInfo introKey="convertLoanLedgerName" />
                </div>
                <Input value={loanLedgerName} onChange={(e) => setLoanLedgerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">Lender name</Label>
                  <LoanHelpInfo introKey="convertLenderName" />
                </div>
                <Input value={lenderName} onChange={(e) => setLenderName(e.target.value)} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Select an account above, then edit names before Save.</p>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button type="button" variant="outline" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className={BTN_SAVE_CLASS} disabled={saving || !selectedId} onClick={() => void save()}>
            {saving ? "Converting…" : "Save & convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
