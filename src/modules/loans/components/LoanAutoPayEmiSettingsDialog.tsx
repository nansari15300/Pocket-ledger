"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import type { Loan, LoanAutoPayEmiSettings } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import {
  buildAutoPayEmiDraft,
  DEFAULT_LOAN_AUTO_PAY_EMI_SETTINGS,
  mergeLoanAutoPayEmiSettings,
} from "../utils/loanAutoEmiSettings";
import { remainingDue } from "../utils/loanStatus";
import { useFormatLoanIso } from "./LoanSystemDateField";

const LOAN_BLUE_PILL_INPUT =
  "h-9 rounded-full border-sky-400 bg-sky-100 px-4 text-sky-950 shadow-sm dark:border-sky-600 dark:bg-sky-900 dark:text-sky-50";
const LOAN_BLUE_PILL_TRIGGER = "h-9 rounded-full border-sky-400 bg-sky-100 text-sky-950 dark:border-sky-600 dark:bg-sky-900 dark:text-sky-50";
const LOAN_BLUE_PILL_TEXTAREA =
  "min-h-[4rem] resize-y rounded-2xl border-sky-400 bg-sky-100 px-4 py-2 text-sky-950 shadow-sm dark:border-sky-600 dark:bg-sky-900 dark:text-sky-50";

export function LoanAutoPayEmiSettingsDialog({
  open,
  onOpenChange,
  loan,
  scheduleRow,
  voucherNumber = "",
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
  scheduleRow?: LoanScheduleRow | null;
  voucherNumber?: string;
  onSave: (settings: LoanAutoPayEmiSettings) => Promise<void>;
}) {
  const { formatCurrencyForPrint } = useDate();
  const fmtDate = useFormatLoanIso();
  const { processedAccounts } = useVouchers();
  const [draft, setDraft] = useState<LoanAutoPayEmiSettings>(DEFAULT_LOAN_AUTO_PAY_EMI_SETTINGS);
  const [busy, setBusy] = useState(false);

  const accounts = useMemo(
    () =>
      (processedAccounts || []).map((a: { id: string; accountName?: string; name?: string; balance?: number }) => ({
        id: a.id,
        label: String(a.accountName || a.name || a.id),
        balance: Number(a.balance) || 0,
      })),
    [processedAccounts]
  );

  const money = (n: number) =>
    formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false, context: "transaction" });

  const bankOptions = useMemo(
    () =>
      accounts.map((acct) => ({
        value: acct.id,
        triggerLabel: acct.label,
        label: `${acct.label} — Balance: ${money(acct.balance)}`,
      })),
    [accounts, formatCurrencyForPrint]
  );

  const selectedAccountIds = useMemo(
    () => draft.accountIds.filter((id) => id !== "all"),
    [draft.accountIds]
  );

  const handleAccountMultiChange = (values: string[]) => {
    let ids = values.filter((v) => v !== "all");
    if (values.includes("all")) {
      ids = accounts.map((a) => a.id);
    }
    setDraft((p) => ({ ...p, accountIds: ids }));
  };

  useEffect(() => {
    if (!open) return;
    setDraft(mergeLoanAutoPayEmiSettings(loan));
  }, [open, loan]);

  const due = scheduleRow ? remainingDue(scheduleRow) : 0;

  const payPreview = useMemo(() => {
    if (!loan || !scheduleRow || !draft.enabled) return null;
    return buildAutoPayEmiDraft({
      settings: draft,
      loan,
      row: scheduleRow,
      accounts: (processedAccounts || []) as Array<{ id: string; accountName?: string; name?: string; balance?: number }>,
    });
  }, [loan, scheduleRow, draft, processedAccounts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden border-emerald-300 p-0 !bg-emerald-100 dark:border-emerald-700 dark:!bg-emerald-950">
        <div className="flex max-h-[90vh] flex-col bg-emerald-100 dark:bg-emerald-950">
          <DialogHeader className="shrink-0 border-b border-emerald-200 px-6 pb-3 pt-6 dark:border-emerald-800">
            <DialogTitle className="text-emerald-950 dark:text-emerald-50">Auto Pay EMI Settings</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
            {loan && scheduleRow ? (
              <div className="overflow-hidden rounded-lg border border-emerald-200 bg-white text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-100 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate font-medium">{loan.loanName}</span>
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full border-sky-300 bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100"
                    >
                      Installment #{scheduleRow.installmentNumber}
                    </Badge>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-full border-emerald-400 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100"
                  >
                    {String(voucherNumber || "").trim() || "EMI voucher no. pending"}
                  </Badge>
                </div>
                <Table>
                  <TableBody className="bg-emerald-50/80 dark:bg-emerald-950/30">
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="py-1.5 font-medium text-muted-foreground">Voucher no.</TableCell>
                      <TableCell className="py-1.5 text-right font-bold tabular-nums text-emerald-900 dark:text-emerald-50">
                        {String(voucherNumber || "").trim() || "—"}
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="py-1.5 text-muted-foreground">Due date</TableCell>
                      <TableCell className="py-1.5 text-right font-medium tabular-nums">{fmtDate(scheduleRow.dueDate)}</TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="py-1.5 text-muted-foreground">Principal due</TableCell>
                      <TableCell className="py-1.5 text-right font-medium tabular-nums">
                        {money(scheduleRow.principalDue - scheduleRow.principalPaid)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="py-1.5 text-muted-foreground">Interest due</TableCell>
                      <TableCell className="py-1.5 text-right font-medium tabular-nums">
                        {money(scheduleRow.interestDue - scheduleRow.interestPaid)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t border-emerald-200 bg-emerald-100/80 hover:bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-900/50">
                      <TableCell className="py-2 font-semibold">Total due</TableCell>
                      <TableCell className="py-2 text-right text-base font-bold tabular-nums">{money(due)}</TableCell>
                    </TableRow>
                    {draft.enabled && payPreview && !payPreview.skippedReason ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="py-1.5 text-muted-foreground">Auto pay amount</TableCell>
                        <TableCell className="py-1.5 text-right font-semibold tabular-nums text-sky-900 dark:text-sky-100">
                          {money(payPreview.amount)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {draft.enabled && payPreview?.accountLabel ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="py-1.5 text-muted-foreground">From account</TableCell>
                        <TableCell className="max-w-[12rem] truncate py-1.5 text-right text-xs font-medium">
                          {payPreview.accountLabel}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-900">
              <div>
                <Label htmlFor="auto-pay-enabled" className="font-medium">
                  Auto pay EMI
                </Label>
                <p className="text-xs text-muted-foreground">Due installment par auto entry / prefill</p>
              </div>
              <Switch
                id="auto-pay-enabled"
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, enabled: Boolean(v) }))}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-900">
              <p className="text-xs font-semibold uppercase text-emerald-900 dark:text-emerald-100">Date</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payment date</Label>
                  <Select
                    value={draft.paymentDateMode}
                    onValueChange={(v) =>
                      setDraft((p) => ({
                        ...p,
                        paymentDateMode: v as LoanAutoPayEmiSettings["paymentDateMode"],
                      }))
                    }
                  >
                    <SelectTrigger className={LOAN_BLUE_PILL_INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due_date">Schedule due date</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="due_plus_offset">Due + offset days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Journal date</Label>
                  <Select
                    value={draft.journalDateMode}
                    onValueChange={(v) =>
                      setDraft((p) => ({
                        ...p,
                        journalDateMode: v as LoanAutoPayEmiSettings["journalDateMode"],
                      }))
                    }
                  >
                    <SelectTrigger className={LOAN_BLUE_PILL_INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same_as_payment">Same as payment</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {draft.paymentDateMode === "due_plus_offset" ? (
                <div className="space-y-1">
                  <Label>Days after due date</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.dayOffset}
                    onChange={(e) => setDraft((p) => ({ ...p, dayOffset: Number(e.target.value) || 0 }))}
                    className={LOAN_BLUE_PILL_INPUT}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-sky-300 bg-sky-100 p-3 dark:border-sky-700 dark:bg-sky-950">
              <p className="text-xs font-semibold uppercase text-sky-900 dark:text-sky-100">Payment accounts</p>
              <div className="space-y-1">
                <Label>Payment accounts</Label>
                <p className="text-xs text-muted-foreground">
                  Select one or more accounts (top to bottom). Dropdown closes on outside click.
                </p>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No bank/cash accounts found.</p>
                ) : (
                  <Combobox
                    options={bankOptions}
                    value={selectedAccountIds}
                    isMultiSelect
                    onMultiChange={handleAccountMultiChange}
                    placeholder="Select payment account(s)"
                    searchPlaceholder="Search accounts..."
                    triggerClassName={LOAN_BLUE_PILL_TRIGGER}
                    highlightBalanceInOptions
                    popoverModal={false}
                  />
                )}
                {selectedAccountIds.length > 0 ? (
                  <div className="space-y-0.5 rounded-md border border-sky-200/80 bg-white/60 px-2 py-1.5 text-xs dark:border-sky-800 dark:bg-sky-950/40">
                    {selectedAccountIds.map((id, idx) => {
                      const acct = accounts.find((a) => a.id === id);
                      if (!acct) return null;
                      return (
                        <p key={id} className="tabular-nums text-muted-foreground">
                          <span className="font-medium text-sky-900 dark:text-sky-100">{idx + 1}.</span> {acct.label} — Bal:{" "}
                          {money(acct.balance)}
                        </p>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Pay amount</Label>
                  <Select
                    value={draft.amountMode}
                    onValueChange={(v) =>
                      setDraft((p) => ({ ...p, amountMode: v as LoanAutoPayEmiSettings["amountMode"] }))
                    }
                  >
                    <SelectTrigger className={LOAN_BLUE_PILL_INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full due</SelectItem>
                      <SelectItem value="partial">Partial (up to balance)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.enforceAvailableBalance}
                      onCheckedChange={(v) => setDraft((p) => ({ ...p, enforceAvailableBalance: v === true }))}
                    />
                    Limit to available balance
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-sky-300 bg-sky-100 p-3 dark:border-sky-700 dark:bg-sky-950">
              <p className="text-xs font-semibold uppercase text-sky-900 dark:text-sky-100">Notes</p>
              <div className="space-y-1">
                <Label>Note mode</Label>
                <Select
                  value={draft.noteMode}
                  onValueChange={(v) =>
                    setDraft((p) => ({ ...p, noteMode: v as LoanAutoPayEmiSettings["noteMode"] }))
                  }
                >
                  <SelectTrigger className={LOAN_BLUE_PILL_INPUT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto template only</SelectItem>
                    <SelectItem value="manual">Manual only (Pay EMI form)</SelectItem>
                    <SelectItem value="both">Auto + manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Auto note template</Label>
                <Textarea
                  value={draft.autoNoteTemplate}
                  onChange={(e) => setDraft((p) => ({ ...p, autoNoteTemplate: e.target.value }))}
                  placeholder="Auto EMI #{installment} — {loanName}"
                  className={LOAN_BLUE_PILL_TEXTAREA}
                />
                <p className="text-[10px] text-muted-foreground">Tokens: {"{installment}"}, {"{loanName}"}, {"{loanNumber}"}</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-900">
              <div>
                <Label htmlFor="auto-post-open" className="font-medium">
                  Auto post on Pay EMI open
                </Label>
                <p className="text-xs text-muted-foreground">Dialog khulte hi entry post ho jaye (review skip)</p>
              </div>
              <Switch
                id="auto-post-open"
                checked={draft.autoPostOnOpen}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, autoPostOnOpen: Boolean(v) }))}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-emerald-200 bg-emerald-100 px-6 pb-6 pt-4 dark:border-emerald-800 dark:bg-emerald-950">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={BTN_SAVE_CLASS}
              disabled={busy || (draft.enabled && draft.accountIds.length === 0)}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(draft);
                  onOpenChange(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
