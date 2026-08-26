import { addDays } from "date-fns";
import type { Loan, LoanAutoPayEmiSettings } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { remainingDue } from "./loanStatus";
import { formatIsoDate, parseIsoDate, todayIso } from "./loanDateUtils";
import { roundMoney } from "./loanRounding";

export const DEFAULT_LOAN_AUTO_PAY_EMI_SETTINGS: LoanAutoPayEmiSettings = {
  enabled: false,
  paymentDateMode: "due_date",
  journalDateMode: "same_as_payment",
  dayOffset: 0,
  accountIds: [],
  amountMode: "full",
  enforceAvailableBalance: true,
  noteMode: "auto",
  autoNoteTemplate: "Auto EMI #{installment} — {loanName}",
  autoPostOnOpen: false,
  lastAutoPaidScheduleId: null,
};

export function mergeLoanAutoPayEmiSettings(
  loan: Loan | null | undefined,
  partial?: Partial<LoanAutoPayEmiSettings> | null
): LoanAutoPayEmiSettings {
  const saved = loan?.autoPayEmiSettings;
  const fallbackAccounts = saved?.accountIds?.length
    ? saved.accountIds
    : loan?.bankAccountId
      ? [loan.bankAccountId]
      : [];
  return {
    ...DEFAULT_LOAN_AUTO_PAY_EMI_SETTINGS,
    ...saved,
    ...partial,
    accountIds: partial?.accountIds ?? saved?.accountIds ?? fallbackAccounts,
  };
}

type AccountRow = { id: string; accountName?: string; name?: string; balance?: number };

export function buildAutoPayEmiNote(
  template: string,
  loan: Loan,
  row: LoanScheduleRow
): string {
  return template
    .replace(/\{installment\}/g, String(row.installmentNumber))
    .replace(/\{loanName\}/g, loan.loanName || "")
    .replace(/\{loanNumber\}/g, loan.loanNumber || "");
}

function resolvePaymentDateIso(settings: LoanAutoPayEmiSettings, row: LoanScheduleRow): string {
  if (settings.paymentDateMode === "today") return todayIso();
  const due = parseIsoDate(row.dueDate);
  if (settings.paymentDateMode === "due_plus_offset") {
    const offset = Math.max(0, Number(settings.dayOffset) || 0);
    return formatIsoDate(addDays(due, offset));
  }
  return formatIsoDate(due);
}

function accountBalance(account: AccountRow | undefined): number | null {
  if (!account) return null;
  const bal = Number(account.balance);
  return Number.isFinite(bal) ? bal : null;
}

export type AutoPayEmiDraft = {
  amount: number;
  paymentDate: string;
  journalDate: string;
  bankAccountId: string;
  notes: string;
  accountLabel?: string;
  skippedReason?: string;
};

export function buildAutoPayEmiDraft(params: {
  settings: LoanAutoPayEmiSettings;
  loan: Loan;
  row: LoanScheduleRow;
  accounts: AccountRow[];
  manualNotes?: string;
}): AutoPayEmiDraft | null {
  if (!params.settings.enabled) return null;
  const due = remainingDue(params.row);
  if (due <= 0) return null;

  const orderedIds =
    params.settings.accountIds.length > 0
      ? params.settings.accountIds
      : params.loan.bankAccountId
        ? [params.loan.bankAccountId]
        : [];
  if (orderedIds.length === 0) {
    return {
      amount: 0,
      paymentDate: todayIso(),
      journalDate: todayIso(),
      bankAccountId: "",
      notes: "",
      skippedReason: "No payment account selected in auto pay settings.",
    };
  }

  const paymentDate = resolvePaymentDateIso(params.settings, params.row);
  const journalDate =
    params.settings.journalDateMode === "today" ? todayIso() : paymentDate;

  let pickedAccountId = "";
  let pickedLabel = "";
  let payAmount = params.settings.amountMode === "full" ? due : 0;

  for (const id of orderedIds) {
    const acct = params.accounts.find((a) => String(a.id).trim() === String(id).trim());
    const bal = accountBalance(acct);
    const label = String(acct?.accountName || acct?.name || id);
    if (bal == null) continue;
    const available = Math.max(0, bal);
    if (params.settings.amountMode === "full") {
      if (!params.settings.enforceAvailableBalance || available >= due) {
        pickedAccountId = id;
        pickedLabel = label;
        payAmount = due;
        break;
      }
    } else {
      const partialAmt = roundMoney(Math.min(due, available));
      if (partialAmt > 0) {
        pickedAccountId = id;
        pickedLabel = label;
        payAmount = partialAmt;
        break;
      }
    }
  }

  if (!pickedAccountId || payAmount <= 0) {
    return {
      amount: 0,
      paymentDate,
      journalDate,
      bankAccountId: "",
      notes: "",
      skippedReason: params.settings.enforceAvailableBalance
        ? "No selected account has enough available balance."
        : "Could not resolve a payment account.",
    };
  }

  const autoNote = buildAutoPayEmiNote(params.settings.autoNoteTemplate, params.loan, params.row);
  let notes = "";
  if (params.settings.noteMode === "auto") notes = autoNote;
  else if (params.settings.noteMode === "both") {
    const manual = String(params.manualNotes || "").trim();
    notes = manual ? `${autoNote}\n${manual}` : autoNote;
  } else {
    notes = String(params.manualNotes || "").trim();
  }

  return {
    amount: payAmount,
    paymentDate,
    journalDate,
    bankAccountId: pickedAccountId,
    notes,
    accountLabel: pickedLabel,
  };
}
