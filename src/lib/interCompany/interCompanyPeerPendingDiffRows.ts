import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import {
  interCompanyVoucherViewerSide,
  isInterCompanySourceApprovedForTarget,
  readInterCompanyBankLabelSnapshot,
  readInterCompanyEntityLabelSnapshot,
} from "@/lib/interCompany/interCompanyVoucherHydrate";
import {
  peerPendingProposedFieldKeys,
  readInterCompanyPeerPending,
  type InterCompanyPeerPendingFieldKey,
} from "@/lib/interCompany/interCompanyPeerPending";
import { normalizeInterCompanyTargetPostMode } from "@/lib/interCompany/interCompanyPostingLegs";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

export type InterCompanyPeerPendingDiffRow = {
  key: InterCompanyPeerPendingFieldKey;
  field: string;
  oldLabel: string;
  newLabel: string;
  applyable: boolean;
  note?: string;
};

export function buildInterCompanyPeerPendingDiffRows(args: {
  voucher: Record<string, unknown>;
  formatDateLabel: (d: Date) => string;
  formatAmount: (n: unknown) => string;
}): InterCompanyPeerPendingDiffRow[] {
  const pending = readInterCompanyPeerPending(args.voucher);
  if (!pending) return [];
  const row = args.voucher;
  const p = pending.proposed;
  const keys = peerPendingProposedFieldKeys(p);
  const rows: InterCompanyPeerPendingDiffRow[] = [];
  const icViewerSide = interCompanyVoucherViewerSide(row) ?? "source";
  const sourceIsApprovedForLock =
    icViewerSide === "source"
      ? row.isApproved === true
      : isInterCompanySourceApprovedForTarget(row);

  const push = (
    key: InterCompanyPeerPendingFieldKey,
    field: string,
    oldLabel: string,
    newLabel: string,
    applyable = true,
    note?: string
  ) => {
    rows.push({ key, field, oldLabel, newLabel, applyable, note });
  };

  for (const key of keys) {
    if (key === "amount" && p.amount != null) {
      push("amount", "Amount", args.formatAmount(row.amount ?? row.total), args.formatAmount(p.amount));
    } else if (key === "date" && p.dateIso) {
      const oldD = parseFirestoreDateFieldToJsDate(row.date);
      const newD = new Date(p.dateIso);
      push(
        "date",
        "Date",
        oldD ? args.formatDateLabel(oldD) : "—",
        !Number.isNaN(newD.getTime()) ? args.formatDateLabel(newD) : p.dateIso
      );
    } else if (key === "narration" && p.narration != null) {
      push(
        "narration",
        "Narration",
        String(row.narration || "—").slice(0, 120) || "—",
        String(p.narration || "—").slice(0, 120) || "—"
      );
    } else if (key === "sourceEntity") {
      const locked = sourceIsApprovedForLock && icViewerSide === "target";
      push(
        "sourceEntity",
        "Source account",
        readInterCompanyEntityLabelSnapshot(row, "source") || String(row.sourceEntityId || "—"),
        p.sourceEntityLabel || p.sourceEntityId || "—",
        !locked,
        locked ? "Source already approved — unapprove only; posting stays on the source account" : undefined
      );
    } else if (key === "targetEntity") {
      push(
        "targetEntity",
        "Target account",
        readInterCompanyEntityLabelSnapshot(row, "target") || String(row.targetEntityId || "—"),
        p.targetEntityLabel || p.targetEntityId || "—"
      );
    } else if (key === "sourceBank") {
      const locked = sourceIsApprovedForLock && icViewerSide === "target";
      push(
        "sourceBank",
        "Clearing account (source)",
        readInterCompanyBankLabelSnapshot(row, "source") || String(row.sourceCompanyBankAccountId || "—"),
        p.sourceCompanyBankLabel || p.sourceCompanyBankAccountId || "—",
        !locked,
        locked ? "Source already approved — unapprove only; posting stays on the source account" : undefined
      );
    } else if (key === "targetBank") {
      push(
        "targetBank",
        "Clearing account (target)",
        readInterCompanyBankLabelSnapshot(row, "target") ||
          String(row.targetCompanyBankAccountId || row.companyBankAccountId || "—"),
        p.targetCompanyBankLabel || p.targetCompanyBankAccountId || "—"
      );
    } else if (key === "targetPostMode" && p.targetPostMode) {
      const oldMode =
        normalizeInterCompanyTargetPostMode(String(row.interCompanyTargetPostMode || "payment_in")) === "journal"
          ? "Company to Company"
          : "Account to Account";
      const newMode =
        normalizeInterCompanyTargetPostMode(p.targetPostMode) === "journal"
          ? "Company to Company"
          : "Account to Account";
      push("targetPostMode", "Pay mode", oldMode, newMode);
    }
  }
  return rows;
}
