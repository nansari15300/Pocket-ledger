"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS } from "@/lib/masterDialogFooterStyles";
import { bankAccountDisplayName } from "@/lib/bankAccountDisplayName";
import { resolveExpenseGroupComboboxLabel } from "@/lib/masterEntityGroupComboboxOptions";
import {
  DAY_BASIS_OPTIONS,
  INTEREST_METHODS,
  INTEREST_RATE_TYPES,
  LATE_FEE_MODES,
  LENDER_TYPES,
  LOAN_FINANCE_GROUP_NAME,
  LOAN_UNGROUPED_GROUP_ID,
  LOAN_TYPES,
  OD_LOAN_TYPES,
  PAYMENT_FREQUENCIES,
  REPAYMENT_TYPES,
  REPAYMENT_TYPE_LABELS,
  TENURE_UNITS,
} from "../constants/loanConstants";
import { getLoanFormIntro } from "../constants/loanFormIntros";
import type { Loan, LoanDraftInput, LoanPreview } from "../types/loanTypes";
import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import { validateLoanDraft } from "../utils/loanValidation";
import { effectiveRepaymentType, installmentAmountLabel, isNonEmiRepayment } from "../utils/loanRepaymentType";
import { resolveExistingLoanExpenseDefaults } from "../utils/loanExpenseAccountLookup";
import { isLoanLiabilityStaff } from "../utils/loanLiabilityStaff";
import { buildScheduleAndPreview } from "../services/loanCalculationService";
import type { ConvertedBankLoanLink } from "../services/convertExistingBankToLoanAccount";
import { todayIso } from "../utils/loanDateUtils";
import { useDate } from "@/hooks/useDate";
import { LoanSystemDateField, LoanTableDateCell, LoanTableDateHead, useFormatLoanIso } from "./LoanSystemDateField";
import { useVouchers } from "@/hooks/useVouchers";
import { LoanHelpInfo } from "./LoanHelpInfo";
import { ConvertExistingBankAccountDialog } from "./ConvertExistingBankAccountDialog";
import { LoanAccountingAccountTile, LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS } from "./LoanAccountingAccountTile";

const methodLabel: Record<string, string> = {
  reducing_balance: "Reducing Balance",
  flat_rate: "Flat Rate",
  simple_interest: "Simple Interest",
  compound_interest: "Compound Interest",
  daily_reducing_balance: "Daily Reducing Balance",
};

export const emptyLoanDraft = (): LoanDraftInput => ({
  loanName: "",
  loanNumber: "",
  lenderName: "",
  lenderType: "Bank",
  bankAccountId: "",
  loanAccountId: "",
  interestExpenseAccountId: "",
  processingFeeAccountId: "",
  lateFeeAccountId: "",
  createLoanAccount: true,
  createInterestAccount: true,
  loanLiabilityGroupId: LOAN_UNGROUPED_GROUP_ID,
  convertedFromBankAccountId: "",
  loanType: "Business Loan",
  customLoanType: "",
  loanPurpose: "",
  principalAmount: 0,
  disbursedAmount: 0,
  disbursementDate: todayIso(),
  firstPaymentDate: todayIso(),
  interestMethod: "reducing_balance",
  interestRate: 10.5,
  interestRateType: "fixed",
  tenure: 60,
  tenureUnit: "months",
  paymentFrequency: "monthly",
  customIntervalMonths: 1,
  emiAmount: 0,
  emiIsManual: false,
  repaymentType: "emi",
  paymentDayMode: "same_day",
  paymentDay: 1,
  gracePeriodDays: 0,
  dayBasis: 365,
  compoundingFrequency: "monthly",
  lateFeeMode: "none",
  lateFeeValue: 0,
  autoPostLateFee: false,
  postDisbursementOnSave: true,
  notes: "",
});

function Field({
  label,
  introKey,
  optionIntroKey,
  children,
}: {
  label: string;
  introKey: string;
  optionIntroKey?: string | null;
  children: React.ReactNode;
}) {
  const optionKey = optionIntroKey && getLoanFormIntro(optionIntroKey) ? optionIntroKey : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        <LoanHelpInfo introKey={introKey} />
      </div>
      <div className={optionKey ? "relative [&_button>span:first-of-type]:pr-4" : undefined}>
        {children}
        {optionKey ? (
          <div className="absolute right-8 top-1/2 z-10 -translate-y-1/2">
            <LoanHelpInfo introKey={optionKey} compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function loanToDraftInput(loan: Loan): LoanDraftInput {
  const known = (LOAN_TYPES as readonly string[]).includes(loan.loanType);
  return {
    loanName: loan.loanName,
    loanNumber: loan.loanNumber,
    lenderName: loan.lenderName,
    lenderType: loan.lenderType,
    bankAccountId: loan.bankAccountId,
    loanAccountId: loan.loanAccountId,
    interestExpenseAccountId: loan.interestExpenseAccountId,
    processingFeeAccountId: loan.processingFeeAccountId,
    lateFeeAccountId: loan.lateFeeAccountId,
    createLoanAccount: false,
    createInterestAccount: false,
    convertedFromBankAccountId: loan.convertedFromBankAccountId || "",
    loanType: known ? loan.loanType : "Other",
    customLoanType: known ? "" : loan.loanType,
    loanPurpose: loan.loanPurpose || "",
    principalAmount: loan.principalAmount,
    disbursedAmount: loan.disbursedAmount,
    disbursementDate: loan.disbursementDate,
    firstPaymentDate: loan.firstPaymentDate,
    interestMethod: loan.interestMethod,
    interestRate: loan.interestRate,
    interestRateType: loan.interestRateType,
    tenure: loan.tenure,
    tenureUnit: loan.tenureUnit,
    paymentFrequency: loan.paymentFrequency,
    customIntervalMonths: loan.customIntervalMonths || 1,
    emiAmount: loan.emiAmount,
    emiIsManual: loan.emiIsManual,
    repaymentType: effectiveRepaymentType(loan.repaymentType),
    paymentDayMode: loan.paymentDayMode,
    paymentDay: loan.paymentDay,
    gracePeriodDays: loan.gracePeriodDays,
    dayBasis: loan.dayBasis,
    compoundingFrequency: loan.compoundingFrequency,
    lateFeeMode: loan.lateFeeMode,
    lateFeeValue: loan.lateFeeValue,
    autoPostLateFee: loan.autoPostLateFee,
    postDisbursementOnSave: false,
    notes: loan.notes || "",
  };
}

export function LoanForm({
  initial,
  saving,
  mode = "create",
  lockPostedFields = false,
  onCancel,
  onSave,
}: {
  initial?: Partial<LoanDraftInput>;
  saving?: boolean;
  mode?: "create" | "edit";
  lockPostedFields?: boolean;
  onSave: (input: LoanDraftInput) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<LoanDraftInput>({ ...emptyLoanDraft(), ...initial });
  const [preview, setPreview] = useState<LoanPreview | null>(null);
  const [previewRows, setPreviewRows] = useState<GeneratedScheduleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const expenseDefaultsApplied = useRef(false);
  const [extraStaff, setExtraStaff] = useState<{ value: string; label: string }[]>(() =>
    initial?.loanAccountId
      ? [{ value: initial.loanAccountId, label: String(initial.loanName || initial.loanAccountId) }]
      : []
  );
  const { formatCurrencyForPrint } = useDate();
  const fmtDate = useFormatLoanIso();
  const {
    processedAccounts,
    processedStaff,
    processedExpenseAccounts,
    processedAccountGroups,
    processedStaffGroups,
    processedExpenseGroups,
  } = useVouchers();
  const money = (n: number) => formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false });

  const bankAccounts = useMemo(
    () =>
      (processedAccounts || []).map((a) => ({
        ...a,
        accountName: bankAccountDisplayName(a) || a.id,
      })),
    [processedAccounts]
  );

  const bankOptions = useMemo(
    () => bankAccounts.map((a) => ({ value: a.id, label: a.accountName })),
    [bankAccounts]
  );
  const staffOptions = useMemo(() => {
    const rows = (processedStaff || [])
      .filter((s: { groupId?: string; isLoanAccount?: boolean }) => isLoanLiabilityStaff(s))
      .map((s: { id: string; name?: string }) => ({
        value: s.id,
        label: String(s.name || s.id),
      }));
    for (const extra of extraStaff) {
      if (!rows.some((r) => r.value === extra.value)) rows.unshift(extra);
    }
    return rows;
  }, [processedStaff, extraStaff]);
  const expenseOptions = useMemo(
    () =>
      (processedExpenseAccounts || []).map((e: { id: string; name?: string }) => ({
        value: e.id,
        label: String(e.name || e.id),
      })),
    [processedExpenseAccounts]
  );

  useEffect(() => {
    if (expenseDefaultsApplied.current || mode !== "create") return;
    if (processedExpenseAccounts == null) return;

    const existing = resolveExistingLoanExpenseDefaults(processedExpenseAccounts);
    expenseDefaultsApplied.current = true;
    if (!existing.interestExpenseAccountId && !existing.processingFeeAccountId && !existing.lateFeeAccountId) {
      return;
    }

    setForm((prev) => {
      let next = prev;
      const touch = (patch: Partial<LoanDraftInput>) => {
        next = { ...next, ...patch };
      };

      if (prev.createInterestAccount && !prev.interestExpenseAccountId && existing.interestExpenseAccountId) {
        touch({
          createInterestAccount: false,
          interestExpenseAccountId: existing.interestExpenseAccountId,
        });
      }
      if (!prev.processingFeeAccountId && existing.processingFeeAccountId) {
        touch({ processingFeeAccountId: existing.processingFeeAccountId });
      }
      if (!prev.lateFeeAccountId && existing.lateFeeAccountId) {
        touch({ lateFeeAccountId: existing.lateFeeAccountId });
      }

      return next === prev ? prev : next;
    });
  }, [mode, processedExpenseAccounts]);

  const set = <K extends keyof LoanDraftInput>(key: K, value: LoanDraftInput[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "principalAmount" && !prev.disbursedAmount) next.disbursedAmount = Number(value) || 0;
      return next;
    });
    setPreview(null);
    setPreviewRows([]);
  };

  const applyConvertedBank = (link: ConvertedBankLoanLink) => {
    setExtraStaff((prev) => [{ value: link.loanAccountId, label: link.loanName }, ...prev.filter((r) => r.value !== link.loanAccountId)]);
    setForm((prev) => ({
      ...prev,
      loanName: link.loanName,
      lenderName: link.lenderName,
      lenderType: "Bank",
      bankAccountId: link.bankAccountId,
      loanAccountId: link.loanAccountId,
      createLoanAccount: false,
      convertedFromBankAccountId: link.bankAccountId,
    }));
    setPreview(null);
    setPreviewRows([]);
    setError(null);
  };

  const repaymentType = effectiveRepaymentType(form.repaymentType);
  const nonEmiRepayment = isNonEmiRepayment(repaymentType);
  const periodLabel = installmentAmountLabel(repaymentType);

  const calculate = () => {
    const issues = validateLoanDraft(form);
    if (issues.length) {
      setError(issues[0]!.message);
      return;
    }
    setError(null);
    const result = buildScheduleAndPreview({
      principal: form.disbursedAmount || form.principalAmount,
      interestRate: form.interestRate,
      interestMethod: form.interestMethod,
      tenure: form.tenure,
      tenureUnit: form.tenureUnit,
      paymentFrequency: form.paymentFrequency,
      customIntervalMonths: form.customIntervalMonths,
      disbursementDate: form.disbursementDate,
      firstPaymentDate: form.firstPaymentDate,
      paymentDayMode: form.paymentDayMode,
      paymentDay: form.paymentDay,
      dayBasis: form.dayBasis,
      compoundingFrequency: form.compoundingFrequency,
      emiAmount: form.emiAmount,
      emiIsManual: form.emiIsManual,
      repaymentType,
    });
    setPreview(result.preview);
    setPreviewRows(result.schedule);
    if (!form.emiIsManual) setForm((p) => ({ ...p, emiAmount: result.emiAmount }));
  };

  const loanLiabilityValue = form.createLoanAccount ? "__create__" : form.loanAccountId || "";
  const createLiabilityTriggerLabel = form.loanName.trim() || "Create new (from loan name)";
  const interestValue = form.createInterestAccount ? "__create__" : form.interestExpenseAccountId || "";

  const bankAccountDisplayLabel = useMemo(
    () => bankOptions.find((o) => o.value === form.bankAccountId)?.label || "",
    [bankOptions, form.bankAccountId]
  );
  const liabilityAccountDisplayLabel = useMemo(() => {
    if (form.createLoanAccount) return createLiabilityTriggerLabel;
    return staffOptions.find((o) => o.value === form.loanAccountId)?.label || "";
  }, [form.createLoanAccount, form.loanAccountId, staffOptions, createLiabilityTriggerLabel]);
  const interestAccountDisplayLabel = useMemo(() => {
    if (form.createInterestAccount) return "Create new (Loan Interest)";
    return expenseOptions.find((o) => o.value === form.interestExpenseAccountId)?.label || "";
  }, [form.createInterestAccount, form.interestExpenseAccountId, expenseOptions]);
  const processingFeeAccountDisplayLabel = useMemo(() => {
    if (!form.processingFeeAccountId) return "Auto-create if missing";
    return expenseOptions.find((o) => o.value === form.processingFeeAccountId)?.label || "";
  }, [form.processingFeeAccountId, expenseOptions]);
  const lateFeeAccountDisplayLabel = useMemo(() => {
    if (!form.lateFeeAccountId) return "Auto-create if missing";
    return expenseOptions.find((o) => o.value === form.lateFeeAccountId)?.label || "";
  }, [form.lateFeeAccountId, expenseOptions]);

  const resolveGroupName = (
    groups: Array<{ id: string; name?: string }>,
    groupId: string | undefined,
    fallback = "Ungrouped"
  ) => {
    if (!groupId) return fallback;
    const row = groups.find((g) => g.id === groupId);
    return String(row?.name || fallback);
  };

  const financeCostsGroupName = useMemo(() => {
    const byName = (processedExpenseGroups || []).find(
      (g: { name?: string }) => String(g.name || "").trim().toLowerCase() === LOAN_FINANCE_GROUP_NAME.toLowerCase()
    );
    return byName?.name || LOAN_FINANCE_GROUP_NAME;
  }, [processedExpenseGroups]);

  const bankGroupName = useMemo(() => {
    if (!form.bankAccountId) return "—";
    const acc = bankAccounts.find((a) => a.id === form.bankAccountId);
    return resolveGroupName(processedAccountGroups || [], acc?.groupId);
  }, [form.bankAccountId, bankAccounts, processedAccountGroups]);

  const selectedBankAccount = useMemo(
    () => bankAccounts.find((a) => a.id === form.bankAccountId),
    [form.bankAccountId, bankAccounts]
  );

  const selectedLiabilityStaff = useMemo(
    () =>
      (processedStaff || []).find((s: { id?: string }) => s.id === form.loanAccountId) as
        | { groupId?: string }
        | undefined,
    [form.loanAccountId, processedStaff]
  );

  const liabilityGroupName = useMemo(() => {
    if (form.createLoanAccount || !form.loanAccountId) {
      return resolveGroupName(
        processedStaffGroups || [],
        form.loanLiabilityGroupId || LOAN_UNGROUPED_GROUP_ID,
        "Ungrouped"
      );
    }
    const staff = (processedStaff || []).find((s: { id?: string }) => s.id === form.loanAccountId) as
      | { groupId?: string }
      | undefined;
    return resolveGroupName(processedStaffGroups || [], staff?.groupId);
  }, [
    form.createLoanAccount,
    form.loanAccountId,
    form.loanLiabilityGroupId,
    processedStaff,
    processedStaffGroups,
  ]);

  const interestGroupName = useMemo(() => {
    if (form.createInterestAccount || !form.interestExpenseAccountId) {
      return `${financeCostsGroupName} (auto-create)`;
    }
    const exp = (processedExpenseAccounts || []).find(
      (e: { id?: string }) => e.id === form.interestExpenseAccountId
    ) as { groupId?: string } | undefined;
    return resolveExpenseGroupComboboxLabel(processedExpenseGroups || [], exp?.groupId, financeCostsGroupName);
  }, [
    form.createInterestAccount,
    form.interestExpenseAccountId,
    processedExpenseAccounts,
    processedExpenseGroups,
    financeCostsGroupName,
  ]);

  const processingFeeGroupName = useMemo(() => {
    if (!form.processingFeeAccountId) return `${financeCostsGroupName} (auto-create)`;
    const exp = (processedExpenseAccounts || []).find(
      (e: { id?: string }) => e.id === form.processingFeeAccountId
    ) as { groupId?: string } | undefined;
    return resolveExpenseGroupComboboxLabel(processedExpenseGroups || [], exp?.groupId, financeCostsGroupName);
  }, [form.processingFeeAccountId, processedExpenseAccounts, processedExpenseGroups, financeCostsGroupName]);

  const lateFeeGroupName = useMemo(() => {
    if (!form.lateFeeAccountId) return `${financeCostsGroupName} (auto-create)`;
    const exp = (processedExpenseAccounts || []).find((e: { id?: string }) => e.id === form.lateFeeAccountId) as
      | { groupId?: string }
      | undefined;
    return resolveExpenseGroupComboboxLabel(processedExpenseGroups || [], exp?.groupId, financeCostsGroupName);
  }, [form.lateFeeAccountId, processedExpenseAccounts, processedExpenseGroups, financeCostsGroupName]);

  const selectedInterestExpense = useMemo(
    () =>
      (processedExpenseAccounts || []).find((e: { id?: string }) => e.id === form.interestExpenseAccountId) as
        | { groupId?: string }
        | undefined,
    [form.interestExpenseAccountId, processedExpenseAccounts]
  );

  const selectedProcessingFeeExpense = useMemo(
    () =>
      (processedExpenseAccounts || []).find((e: { id?: string }) => e.id === form.processingFeeAccountId) as
        | { groupId?: string }
        | undefined,
    [form.processingFeeAccountId, processedExpenseAccounts]
  );

  const selectedLateFeeExpense = useMemo(
    () =>
      (processedExpenseAccounts || []).find((e: { id?: string }) => e.id === form.lateFeeAccountId) as
        | { groupId?: string }
        | undefined,
    [form.lateFeeAccountId, processedExpenseAccounts]
  );

  return (
    <form
      className="flex h-full min-h-0 flex-col overflow-hidden"
      onSubmit={(e) => {
        // Portaled master-edit dialogs are still React children; submit bubbles to this form.
        if (e.target instanceof Node && !e.currentTarget.contains(e.target)) {
          return;
        }
        e.preventDefault();
        const issues = validateLoanDraft(form);
        if (issues.length) {
          setError(issues[0]!.message);
          return;
        }
        setError(null);
        void onSave(form);
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold">{mode === "edit" ? "Edit Loan Account" : "Create Loan Account"}</h1>
            <LoanHelpInfo introKey="form" />
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === "edit"
              ? lockPostedFields
                ? "Name, lender, and notes can be changed. Amounts and schedule stay locked after disbursement — use Rate Change or Prepayment."
                : "Update the loan, then Calculate Schedule and Save."
              : "Fill the loan, then Calculate Schedule and Save. Click (i) for full help."}
          </p>
        </div>
        {mode === "create" ? (
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" className="gap-2" onClick={() => setConvertOpen(true)}>
              <Landmark className="h-4 w-4" aria-hidden />
              Add Existing Account
            </Button>
            <LoanHelpInfo introKey="addExistingAccount" />
          </div>
        ) : null}
      </div>

      {mode === "create" ? (
      <ConvertExistingBankAccountDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        accounts={bankAccounts}
        onConverted={applyConvertedBank}
      />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Loan Name" introKey="loanName">
            <Input value={form.loanName} onChange={(e) => set("loanName", e.target.value)} placeholder="Nabil Bank Loan" />
          </Field>
          <Field label="Loan Number" introKey="loanNumber">
            <Input
              value={form.loanNumber}
              onChange={(e) => set("loanNumber", e.target.value)}
              placeholder="Auto if blank"
              disabled={lockPostedFields}
            />
          </Field>
          <Field label="Lender / Bank" introKey="lenderName">
            <Input value={form.lenderName} onChange={(e) => set("lenderName", e.target.value)} placeholder="Nabil Bank" />
          </Field>
          <Field label="Lender Type" introKey="lenderType" optionIntroKey={`opt:lenderType:${form.lenderType}`}>
            <Select value={form.lenderType} onValueChange={(v) => set("lenderType", v as LoanDraftInput["lenderType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LENDER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Loan Type" introKey="loanType" optionIntroKey={`opt:loanType:${form.loanType}`}>
            <Select
              value={form.loanType}
              onValueChange={(v) => {
                setForm((p) => ({
                  ...p,
                  loanType: v,
                  ...((OD_LOAN_TYPES as readonly string[]).includes(v)
                    ? { repaymentType: "interest_only" as const, emiIsManual: false, emiAmount: 0 }
                    : {}),
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOAN_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.loanType === "Other" ? (
            <Field label="Custom Type" introKey="customLoanType">
              <Input value={form.customLoanType} onChange={(e) => set("customLoanType", e.target.value)} />
            </Field>
          ) : null}
          <Field label="Purpose" introKey="loanPurpose">
            <Input value={form.loanPurpose} onChange={(e) => set("loanPurpose", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <div className={lockPostedFields ? "pointer-events-none space-y-4 opacity-70" : "contents"}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Principal Amount" introKey="principalAmount">
            <Input type="number" min={0} step="0.01" value={form.principalAmount || ""} onChange={(e) => set("principalAmount", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Disbursed Amount" introKey="disbursedAmount">
            <Input type="number" min={0} step="0.01" value={form.disbursedAmount || ""} onChange={(e) => set("disbursedAmount", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Interest Method" introKey="interestMethod" optionIntroKey={`opt:interestMethod:${form.interestMethod}`}>
            <Select value={form.interestMethod} onValueChange={(v) => set("interestMethod", v as LoanDraftInput["interestMethod"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTEREST_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{methodLabel[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Interest Rate (% p.a.)" introKey="interestRate">
            <Input type="number" min={0} step="0.01" value={form.interestRate} onChange={(e) => set("interestRate", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Rate Type" introKey="interestRateType" optionIntroKey={`opt:interestRateType:${form.interestRateType}`}>
            <Select value={form.interestRateType} onValueChange={(v) => set("interestRateType", v as LoanDraftInput["interestRateType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTEREST_RATE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t === "fixed" ? "Fixed" : "Floating"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tenure" introKey="tenure">
            <Input type="number" min={1} value={form.tenure} onChange={(e) => set("tenure", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Tenure Unit" introKey="tenureUnit" optionIntroKey={`opt:tenureUnit:${form.tenureUnit}`}>
            <Select value={form.tenureUnit} onValueChange={(v) => set("tenureUnit", v as LoanDraftInput["tenureUnit"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENURE_UNITS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Payment Frequency" introKey="paymentFrequency" optionIntroKey={`opt:paymentFrequency:${form.paymentFrequency}`}>
            <Select value={form.paymentFrequency} onValueChange={(v) => set("paymentFrequency", v as LoanDraftInput["paymentFrequency"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_FREQUENCIES.map((t) => (
                  <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Repayment Type" introKey="repaymentType" optionIntroKey={`opt:repaymentType:${repaymentType}`}>
            <Select
              value={repaymentType}
              onValueChange={(v) => {
                const next = v as LoanDraftInput["repaymentType"];
                setForm((p) => ({
                  ...p,
                  repaymentType: next,
                  ...(next !== "emi" ? { emiIsManual: false, emiAmount: 0 } : {}),
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPAYMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{REPAYMENT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.paymentFrequency === "custom" ? (
            <Field label="Custom interval (months)" introKey="customIntervalMonths">
              <Input type="number" min={1} value={form.customIntervalMonths || 1} onChange={(e) => set("customIntervalMonths", Number(e.target.value) || 1)} />
            </Field>
          ) : null}
          {form.interestMethod === "compound_interest" ? (
            <Field label="Compounding Frequency" introKey="compoundingFrequency" optionIntroKey={`opt:paymentFrequency:${form.compoundingFrequency || "monthly"}`}>
              <Select value={form.compoundingFrequency || "monthly"} onValueChange={(v) => set("compoundingFrequency", v as LoanDraftInput["compoundingFrequency"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_FREQUENCIES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {!nonEmiRepayment ? (
            <Field label="EMI (leave 0 to auto-calculate)" introKey="emiAmount">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.emiAmount || ""}
                onChange={(e) => {
                  set("emiAmount", Number(e.target.value) || 0);
                  set("emiIsManual", Number(e.target.value) > 0);
                }}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dates & Payment Rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Disbursement Date" introKey="disbursementDate">
            <LoanSystemDateField value={form.disbursementDate} onChange={(iso) => set("disbursementDate", iso)} />
          </Field>
          <Field label="First Payment Date" introKey="firstPaymentDate">
            <LoanSystemDateField value={form.firstPaymentDate} onChange={(iso) => set("firstPaymentDate", iso)} />
          </Field>
          <Field label="Payment Day" introKey="paymentDayMode" optionIntroKey={`opt:paymentDayMode:${form.paymentDayMode}`}>
            <Select value={form.paymentDayMode} onValueChange={(v) => set("paymentDayMode", v as LoanDraftInput["paymentDayMode"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="same_day">Same day of month</SelectItem>
                <SelectItem value="month_end">Month end</SelectItem>
                <SelectItem value="custom_day">Custom day</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {form.paymentDayMode === "custom_day" ? (
            <Field label="Custom Day (1–31)" introKey="paymentDay">
              <Input type="number" min={1} max={31} value={form.paymentDay} onChange={(e) => set("paymentDay", Number(e.target.value) || 1)} />
            </Field>
          ) : null}
          <Field label="Grace Period (days)" introKey="gracePeriodDays">
            <Input type="number" min={0} value={form.gracePeriodDays} onChange={(e) => set("gracePeriodDays", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Day Basis" introKey="dayBasis" optionIntroKey={`opt:dayBasis:${form.dayBasis}`}>
            <Select value={String(form.dayBasis)} onValueChange={(v) => set("dayBasis", Number(v) as LoanDraftInput["dayBasis"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_BASIS_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Late Fee Mode" introKey="lateFeeMode" optionIntroKey={`opt:lateFeeMode:${form.lateFeeMode}`}>
            <Select value={form.lateFeeMode} onValueChange={(v) => set("lateFeeMode", v as LoanDraftInput["lateFeeMode"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LATE_FEE_MODES.map((m) => (
                  <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Late Fee Value" introKey="lateFeeValue">
            <Input type="number" min={0} step="0.01" value={form.lateFeeValue} onChange={(e) => set("lateFeeValue", Number(e.target.value) || 0)} />
          </Field>
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <LoanAccountingAccountTile
            editKind="bank"
            groupId={selectedBankAccount?.groupId}
            groupFallbackLabel={bankGroupName}
            groupPickerDisabled={!form.bankAccountId}
            accountDisplayName={bankAccountDisplayLabel}
            accountLabel="Account name"
            accountIntroKey="bankAccountId"
            accountOptionIntroKey={form.bankAccountId ? "opt:bankAccount:picked" : null}
            editAccountId={form.bankAccountId}
            editDisabled={!form.bankAccountId}
            accountControl={
              <Combobox
                disabled={lockPostedFields}
                options={bankOptions}
                value={form.bankAccountId}
                onChange={(v) => set("bankAccountId", v)}
                placeholder="Select bank/cash"
                triggerClassName={LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS}
              />
            }
          />

          <LoanAccountingAccountTile
            editKind="staff"
            groupId={form.createLoanAccount ? form.loanLiabilityGroupId : selectedLiabilityStaff?.groupId}
            groupFallbackLabel={liabilityGroupName}
            groupDraftId={form.createLoanAccount ? form.loanLiabilityGroupId : undefined}
            onGroupDraftChange={
              form.createLoanAccount
                ? (gid) => set("loanLiabilityGroupId", gid || LOAN_UNGROUPED_GROUP_ID)
                : undefined
            }
            accountDisplayName={liabilityAccountDisplayLabel}
            accountLabel="Account name"
            accountIntroKey="loanAccountId"
            accountOptionIntroKey={
              loanLiabilityValue === "__create__"
                ? "opt:loanAccount:__create__"
                : loanLiabilityValue
                  ? "opt:loanAccount:picked"
                  : null
            }
            editAccountId={form.loanAccountId}
            editDisabled={form.createLoanAccount || !form.loanAccountId}
            accountControl={
              <Combobox
                disabled={lockPostedFields}
                options={[
                  {
                    value: "__create__",
                    label: "Create new (from loan name)",
                    triggerLabel: createLiabilityTriggerLabel,
                  },
                  ...staffOptions,
                ]}
                value={loanLiabilityValue}
                onChange={(v) => {
                  if (v === "__create__") {
                    set("createLoanAccount", true);
                    set("loanAccountId", "");
                  } else {
                    set("createLoanAccount", false);
                    set("loanAccountId", v);
                  }
                }}
                placeholder="Select or create"
                triggerClassName={LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS}
              />
            }
          />

          <LoanAccountingAccountTile
            editKind="expense"
            groupId={selectedInterestExpense?.groupId}
            groupFallbackLabel={interestGroupName}
            groupPickerDisabled={form.createInterestAccount || !form.interestExpenseAccountId}
            accountDisplayName={interestAccountDisplayLabel}
            accountLabel="Account name"
            accountIntroKey="interestExpenseAccountId"
            accountOptionIntroKey={
              interestValue === "__create__"
                ? "opt:interestAccount:__create__"
                : interestValue
                  ? "opt:interestAccount:picked"
                  : null
            }
            editAccountId={form.interestExpenseAccountId}
            editDisabled={form.createInterestAccount || !form.interestExpenseAccountId}
            accountControl={
              <Combobox
                disabled={lockPostedFields}
                options={[{ value: "__create__", label: "Create new (Loan Interest)" }, ...expenseOptions]}
                value={interestValue}
                onChange={(v) => {
                  if (v === "__create__") {
                    set("createInterestAccount", true);
                    set("interestExpenseAccountId", "");
                  } else {
                    set("createInterestAccount", false);
                    set("interestExpenseAccountId", v);
                  }
                }}
                placeholder="Select or create"
                triggerClassName={LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS}
              />
            }
          />

          <LoanAccountingAccountTile
            editKind="expense"
            groupId={selectedProcessingFeeExpense?.groupId}
            groupFallbackLabel={processingFeeGroupName}
            groupPickerDisabled={!form.processingFeeAccountId}
            accountDisplayName={processingFeeAccountDisplayLabel}
            accountLabel="Account name"
            accountIntroKey="processingFeeAccountId"
            accountOptionIntroKey={!form.processingFeeAccountId ? "opt:feeAccount:__auto__" : "opt:feeAccount:picked"}
            editAccountId={form.processingFeeAccountId}
            editDisabled={!form.processingFeeAccountId}
            accountControl={
              <Combobox
                disabled={lockPostedFields}
                options={[{ value: "__auto__", label: "Auto-create if missing" }, ...expenseOptions]}
                value={form.processingFeeAccountId || "__auto__"}
                onChange={(v) => set("processingFeeAccountId", v === "__auto__" ? "" : v)}
                triggerClassName={LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS}
              />
            }
          />

          <LoanAccountingAccountTile
            editKind="expense"
            groupId={selectedLateFeeExpense?.groupId}
            groupFallbackLabel={lateFeeGroupName}
            groupPickerDisabled={!form.lateFeeAccountId}
            accountDisplayName={lateFeeAccountDisplayLabel}
            accountLabel="Account name"
            accountIntroKey="lateFeeAccountId"
            accountOptionIntroKey={!form.lateFeeAccountId ? "opt:feeAccount:__auto__" : "opt:feeAccount:picked"}
            editAccountId={form.lateFeeAccountId}
            editDisabled={!form.lateFeeAccountId}
            accountControl={
              <Combobox
                disabled={lockPostedFields}
                options={[{ value: "__auto__", label: "Auto-create if missing" }, ...expenseOptions]}
                value={form.lateFeeAccountId || "__auto__"}
                onChange={(v) => set("lateFeeAccountId", v === "__auto__" ? "" : v)}
                triggerClassName={LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS}
              />
            }
          />

          {mode === "create" ? (
            <div className="flex items-start gap-2 pt-1 text-sm md:col-span-2">
              <Checkbox checked={form.postDisbursementOnSave} onCheckedChange={(v) => set("postDisbursementOnSave", v === true)} />
              <span className="flex items-center gap-1.5 leading-tight">
                Post disbursement journal on save (Dr Bank / Cr Loan Liability)
                <LoanHelpInfo introKey="postDisbursementOnSave" />
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-amber-300/80 bg-amber-50/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Notes</CardTitle>
            <LoanHelpInfo introKey="notes" />
          </div>
        </CardHeader>
        <CardContent>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[9.5rem]" />
        </CardContent>
      </Card>

      {preview ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <CardTitle className="text-base">Schedule Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3 text-sm">
              <div>{periodLabel}: <strong className="tabular-nums">{money(preview.emiAmount)}</strong></div>
              <div>Installments: <strong>{preview.installmentCount}</strong></div>
              <div>Maturity: <strong>{fmtDate(preview.maturityDate)}</strong></div>
              <div>Total Interest: <strong className="tabular-nums">{money(preview.totalInterest)}</strong></div>
              <div>Total Repayment: <strong className="tabular-nums">{money(preview.totalRepayment)}</strong></div>
            </div>
            {previewRows.length ? (
              <div className="max-h-[28rem] overflow-auto rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <LoanTableDateHead label="Due Date" />
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead className="text-right">{periodLabel}</TableHead>
                      <TableHead className="text-right">Closing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={`${row.scheduleVersion}-${row.installmentNumber}`}>
                        <TableCell>{row.installmentNumber}</TableCell>
                        <LoanTableDateCell iso={row.dueDate} />
                        <TableCell className="text-right tabular-nums">{money(row.openingPrincipal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.principalDue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.interestDue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.totalDue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.closingPrincipal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      </div>
      <div className="flex-shrink-0 border-t bg-background px-4 py-3">
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={calculate}>Calculate Schedule</Button>
          <LoanHelpInfo introKey="calculateSchedule" />
          <Button type="submit" className={BTN_SAVE_CLASS} disabled={saving}>{saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Loan"}</Button>
          <LoanHelpInfo introKey="saveLoan" />
          <Button type="button" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS} variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
