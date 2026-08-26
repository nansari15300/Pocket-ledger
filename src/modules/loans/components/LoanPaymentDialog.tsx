"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { DEFAULT_VOUCHER_PREFIX_LABELS, getNextVoucherNumberForCompany } from "@/lib/nextVoucherNumber";
import { normalizePrefix } from "@/lib/voucherNumberFormat";
import type { Loan, LoanAutoPayEmiSettings } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanPaymentInput } from "../types/loanTransactionTypes";
import { saveLoan } from "../db/loanRepository";
import { nowIso } from "../db/loanIds";
import { buildAutoPayEmiDraft, mergeLoanAutoPayEmiSettings } from "../utils/loanAutoEmiSettings";
import { LoanAutoPayEmiSettingsDialog } from "./LoanAutoPayEmiSettingsDialog";
import { remainingDue, daysOverdue } from "../utils/loanStatus";
import { calculateLateFee } from "../services/loanInterestService";
import { todayIso } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { LoanSystemDateField, useFormatLoanIso } from "./LoanSystemDateField";
import { LoanVoucherAttachmentsField } from "./LoanVoucherAttachmentsField";

const PAY_EMI_VOUCHER_KEY = "pay_emi";

const LOAN_BLUE_PILL_INPUT =
  "h-9 rounded-full border-sky-400 bg-sky-100 px-4 text-sky-950 shadow-sm placeholder:text-sky-700/60 focus-visible:ring-sky-500 dark:border-sky-600 dark:bg-sky-900 dark:text-sky-50 dark:placeholder:text-sky-300/60";
const LOAN_BLUE_PILL_TEXTAREA =
  "min-h-[4.5rem] resize-y rounded-2xl border-sky-400 bg-sky-100 px-4 py-2 text-sky-950 shadow-sm placeholder:text-sky-700/60 focus-visible:ring-sky-500 dark:border-sky-600 dark:bg-sky-900 dark:text-sky-50 dark:placeholder:text-sky-300/60";
const LOAN_BLUE_PILL_TRIGGER = "h-9 rounded-full border-sky-400 bg-sky-100 text-sky-950 dark:border-sky-600 dark:bg-sky-900 dark:text-sky-50";

export function LoanPaymentDialog({
  open,
  onOpenChange,
  loan,
  row,
  onSubmit,
  onLoanUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
  row: LoanScheduleRow | null;
  onSubmit: (input: LoanPaymentInput) => Promise<void>;
  onLoanUpdated?: () => void | Promise<void>;
}) {
  const due = row ? remainingDue(row) : 0;
  const [amount, setAmount] = useState(due);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [journalDate, setJournalDate] = useState(todayIso());
  const [referenceNumber, setReferenceNumber] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<(File | string)[]>([]);
  const [bankAccountId, setBankAccountId] = useState(loan?.bankAccountId || "");
  const [voucherNumber, setVoucherNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoPayHint, setAutoPayHint] = useState<string | null>(null);
  const [localLoan, setLocalLoan] = useState(loan);
  const autoPostedRef = useRef(false);
  const { formatCurrencyForPrint } = useDate();
  const { company, companyId } = useCompany();
  const fmtDate = useFormatLoanIso();
  const { processedAccounts } = useVouchers();
  const money = (n: number) => formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false });
  const overdueDays = loan && row ? daysOverdue(row.dueDate, loan.gracePeriodDays, paymentDate) : 0;
  const lateFee = loan && row ? calculateLateFee(loan, due, overdueDays) : 0;

  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.[PAY_EMI_VOUCHER_KEY] !== false;
  const canEditVoucherNumber = company?.allowVoucherNumberEditing?.[PAY_EMI_VOUCHER_KEY] === true;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.[PAY_EMI_VOUCHER_KEY] === true;
  const voucherPrefixes = useMemo(
    () => company?.voucherPrefixes?.[PAY_EMI_VOUCHER_KEY] || [DEFAULT_VOUCHER_PREFIX_LABELS.pay_emi],
    [company?.voucherPrefixes]
  );
  const [selectedPrefix, setSelectedPrefix] = useState(() => voucherPrefixes[0] || DEFAULT_VOUCHER_PREFIX_LABELS.pay_emi);

  const fetchVoucherNumber = useCallback(
    async (prefix?: string) => {
      if (!companyId || !company || !isAutoVoucherEnabled) return;
      try {
        const nextNo = await getNextVoucherNumberForCompany({
          companyId,
          companyDoc: company as unknown as Record<string, unknown>,
          voucherLike: { type: "journal", subType: "pay_emi" },
          selectedPrefix: prefix,
        });
        setVoucherNumber(nextNo);
      } catch {
        /* ignore */
      }
    },
    [companyId, company, isAutoVoucherEnabled]
  );

  const autoPaySettings = useMemo(() => mergeLoanAutoPayEmiSettings(localLoan), [localLoan]);

  useEffect(() => {
    setLocalLoan(loan);
  }, [loan]);

  const submitPayment = useCallback(async () => {
    if (!loan || !row) return;
    setBusy(true);
    try {
      await onSubmit({
        scheduleId: row.id,
        amount: roundMoney(amount),
        paymentDate,
        journalDate,
        bankAccountId,
        voucherNumber: String(voucherNumber || "").trim(),
        referenceNumber,
        chequeNumber,
        notes,
        includeLateFee: false,
        attachmentFiles,
      });
      if (localLoan && autoPaySettings.enabled) {
        const nextLoan: Loan = {
          ...localLoan,
          autoPayEmiSettings: {
            ...autoPaySettings,
            lastAutoPaidScheduleId: row.id,
          },
          updatedAt: nowIso(),
        };
        await saveLoan(nextLoan);
        setLocalLoan(nextLoan);
        await onLoanUpdated?.();
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }, [
    loan,
    row,
    amount,
    paymentDate,
    journalDate,
    bankAccountId,
    voucherNumber,
    referenceNumber,
    chequeNumber,
    notes,
    attachmentFiles,
    onSubmit,
    localLoan,
    autoPaySettings,
    onLoanUpdated,
    onOpenChange,
  ]);

  const bankOptions = (processedAccounts || []).map((a: { id: string; accountName?: string; name?: string }) => ({
    value: a.id,
    label: String(a.accountName || a.name || a.id),
  }));

  useEffect(() => {
    if (!open) {
      autoPostedRef.current = false;
      setAutoPayHint(null);
      return;
    }
    if (!row || !loan) return;
    setAmount(remainingDue(row));
    setPaymentDate(todayIso());
    setJournalDate(todayIso());
    setBankAccountId(loan.bankAccountId || "");
    setReferenceNumber("");
    setChequeNumber("");
    setNotes("");
    setAttachmentFiles([]);
    setAutoPayHint(null);
    const prefix = voucherPrefixes[0] || DEFAULT_VOUCHER_PREFIX_LABELS.pay_emi;
    setSelectedPrefix(prefix);
    if (isAutoVoucherEnabled) void fetchVoucherNumber(prefix);
    else setVoucherNumber("");

    const settings = mergeLoanAutoPayEmiSettings(localLoan);
    if (!settings.enabled) return;
    const draft = buildAutoPayEmiDraft({
      settings,
      loan,
      row,
      accounts: (processedAccounts || []) as Array<{ id: string; accountName?: string; name?: string; balance?: number }>,
    });
    if (!draft) return;
    if (draft.skippedReason) {
      setAutoPayHint(draft.skippedReason);
      return;
    }
    if (draft.amount > 0) {
      setAmount(draft.amount);
      setPaymentDate(draft.paymentDate);
      setJournalDate(draft.journalDate);
      setBankAccountId(draft.bankAccountId);
      if (settings.noteMode !== "manual") setNotes(draft.notes);
      setAutoPayHint(`Auto pay from ${draft.accountLabel || "selected account"}`);
    }
  }, [open, row, loan, localLoan, isAutoVoucherEnabled, fetchVoucherNumber, voucherPrefixes, processedAccounts]);

  useEffect(() => {
    if (!open || !loan || !row || autoPostedRef.current || busy) return;
    const settings = mergeLoanAutoPayEmiSettings(localLoan);
    if (!settings.enabled || !settings.autoPostOnOpen) return;
    if (settings.lastAutoPaidScheduleId === row.id) return;
    const draft = buildAutoPayEmiDraft({
      settings,
      loan,
      row,
      accounts: (processedAccounts || []) as Array<{ id: string; accountName?: string; name?: string; balance?: number }>,
    });
    if (!draft || draft.amount <= 0 || draft.skippedReason) {
      if (draft?.skippedReason) toast.error(draft.skippedReason);
      return;
    }
    autoPostedRef.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        let vn = String(voucherNumber || "").trim();
        if (!vn && isAutoVoucherEnabled && companyId && company) {
          try {
            vn = await getNextVoucherNumberForCompany({
              companyId,
              companyDoc: company as unknown as Record<string, unknown>,
              voucherLike: { type: "journal", subType: "pay_emi" },
              selectedPrefix: selectedPrefix,
            });
            setVoucherNumber(vn);
          } catch {
            /* ignore */
          }
        }
        if (!vn) {
          toast.error("Voucher number is required for auto post.");
          autoPostedRef.current = false;
          return;
        }
        setBusy(true);
        try {
          await onSubmit({
            scheduleId: row.id,
            amount: roundMoney(draft.amount),
            paymentDate: draft.paymentDate,
            journalDate: draft.journalDate,
            bankAccountId: draft.bankAccountId,
            voucherNumber: vn,
            referenceNumber,
            chequeNumber,
            notes: settings.noteMode !== "manual" ? draft.notes : notes,
            includeLateFee: false,
            attachmentFiles,
          });
          if (localLoan) {
            const nextLoan: Loan = {
              ...localLoan,
              autoPayEmiSettings: { ...settings, lastAutoPaidScheduleId: row.id },
              updatedAt: nowIso(),
            };
            await saveLoan(nextLoan);
            setLocalLoan(nextLoan);
            await onLoanUpdated?.();
          }
          onOpenChange(false);
        } finally {
          setBusy(false);
        }
      })();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [
    open,
    loan,
    row,
    localLoan,
    processedAccounts,
    busy,
    voucherNumber,
    isAutoVoucherEnabled,
    companyId,
    company,
    selectedPrefix,
    onSubmit,
    referenceNumber,
    chequeNumber,
    notes,
    attachmentFiles,
    onLoanUpdated,
    onOpenChange,
  ]);

  const handleSaveAutoPaySettings = async (settings: LoanAutoPayEmiSettings) => {
    if (!localLoan) return;
    const nextLoan: Loan = {
      ...localLoan,
      autoPayEmiSettings: settings,
      updatedAt: nowIso(),
    };
    await saveLoan(nextLoan);
    setLocalLoan(nextLoan);
    await onLoanUpdated?.();
    toast.success(settings.enabled ? "Auto pay EMI enabled." : "Auto pay settings saved.");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] max-w-md gap-0 overflow-hidden border-emerald-300 p-0 !bg-emerald-100 dark:border-emerald-700 dark:!bg-emerald-950">
        <div className="flex max-h-[90vh] flex-col bg-emerald-100 dark:bg-emerald-950">
          <DialogHeader className="shrink-0 border-b border-emerald-200 px-6 pb-3 pt-6 dark:border-emerald-800">
            <DialogTitle className="text-emerald-950 dark:text-emerald-50">Pay EMI</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
          {loan && row ? (
            <div className="space-y-3 px-6 py-4 text-sm">
            <div className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 text-sm dark:border-emerald-800 dark:bg-emerald-900/80">
              <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200 bg-emerald-100 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900">
                <span className="min-w-0 truncate font-medium">{loan.loanName}</span>
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full border-sky-300 bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100"
                >
                  Installment #{row.installmentNumber}
                </Badge>
              </div>
              <Table>
                <TableBody className="bg-emerald-50 dark:bg-emerald-900/80">
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="py-1.5 text-muted-foreground" title="Schedule due date is not overwritten by payment date">
                      Due date
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-medium tabular-nums">{fmtDate(row.dueDate)}</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="py-1.5 text-muted-foreground">Principal due</TableCell>
                    <TableCell className="py-1.5 text-right font-medium tabular-nums">
                      {money(row.principalDue - row.principalPaid)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="py-1.5 text-muted-foreground">Interest due</TableCell>
                    <TableCell className="py-1.5 text-right font-medium tabular-nums">
                      {money(row.interestDue - row.interestPaid)}
                    </TableCell>
                  </TableRow>
                  {overdueDays > 0 ? (
                    <>
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="py-1.5 text-muted-foreground">Days overdue</TableCell>
                        <TableCell className="py-1.5 text-right font-medium tabular-nums text-amber-700">{overdueDays}</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="py-1.5 text-muted-foreground">Late fee (optional)</TableCell>
                        <TableCell className="py-1.5 text-right font-medium tabular-nums">{money(lateFee)}</TableCell>
                      </TableRow>
                    </>
                  ) : null}
                  <TableRow className="border-t border-emerald-200 bg-emerald-100 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900">
                    <TableCell className="py-2 font-semibold">Total due</TableCell>
                    <TableCell className="py-2 text-right text-base font-bold tabular-nums">{money(due)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-100 p-3 dark:border-emerald-700 dark:bg-emerald-900">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-1">
                  <Label>Payment amount</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    className={LOAN_BLUE_PILL_INPUT}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Voucher no.</Label>
                  <div className="flex min-w-0 gap-2">
                    {isPrefixSelectionEnabled && voucherPrefixes.length > 0 ? (
                      <Select
                        value={
                          voucherPrefixes.find(
                            (p) => voucherNumber.startsWith(normalizePrefix(p)) || voucherNumber.startsWith(p)
                          ) || selectedPrefix
                        }
                        onValueChange={(prefix) => {
                          setSelectedPrefix(prefix);
                          void fetchVoucherNumber(prefix);
                        }}
                      >
                        <SelectTrigger className="h-9 w-[5.5rem] shrink-0 rounded-full border-sky-400 bg-sky-100 px-2 text-xs dark:border-sky-600 dark:bg-sky-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {voucherPrefixes.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Input
                      value={voucherNumber}
                      onChange={(e) => setVoucherNumber(e.target.value)}
                      readOnly={isAutoVoucherEnabled && !canEditVoucherNumber}
                      placeholder="Voucher no."
                      className={LOAN_BLUE_PILL_INPUT}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-1">
                  <Label>Payment date</Label>
                  <LoanSystemDateField value={paymentDate} onChange={setPaymentDate} />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Journal date</Label>
                  <LoanSystemDateField value={journalDate} onChange={setJournalDate} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Payment account</Label>
                <Combobox
                  options={bankOptions}
                  value={bankAccountId}
                  onChange={setBankAccountId}
                  triggerClassName={LOAN_BLUE_PILL_TRIGGER}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-sky-300 bg-sky-100 p-3 dark:border-sky-700 dark:bg-sky-950">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs text-sky-900/80 dark:text-sky-100">Reference</Label>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Reference"
                    className={LOAN_BLUE_PILL_INPUT}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs text-sky-900/80 dark:text-sky-100">Cheque no.</Label>
                  <Input
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    placeholder="Cheque no."
                    className={LOAN_BLUE_PILL_INPUT}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-sky-900/80 dark:text-sky-100">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes"
                  className={LOAN_BLUE_PILL_TEXTAREA}
                />
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-800 dark:bg-emerald-900/50">
              <LoanVoucherAttachmentsField files={attachmentFiles} setFiles={setAttachmentFiles} />
            </div>
            {autoPayHint ? <p className="text-xs text-emerald-800 dark:text-emerald-100">{autoPayHint}</p> : null}
            {autoPaySettings.enabled ? (
              <p className="text-xs font-medium text-emerald-900 dark:text-emerald-50">Auto pay EMI is ON</p>
            ) : null}
            {amount > 0 && amount < due ? (
              <p className="text-amber-700">Partial payment — installment will stay Partially Paid.</p>
            ) : null}
            </div>
          ) : null}
          </div>
          <DialogFooter className="shrink-0 flex-col gap-3 border-t border-emerald-200 bg-emerald-100 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-800 dark:bg-emerald-950">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className={BTN_SAVE_CLASS}
                disabled={busy || !loan || !row || amount <= 0 || !String(voucherNumber || "").trim()}
                onClick={() => void submitPayment()}
              >
                {busy ? "Posting…" : "Post Payment"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
      <LoanAutoPayEmiSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        loan={localLoan}
        scheduleRow={row}
        voucherNumber={voucherNumber}
        onSave={handleSaveAutoPaySettings}
      />
    </Dialog>
  );
}
