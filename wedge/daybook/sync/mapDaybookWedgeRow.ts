import type { DaybookWedgeRow } from "@wedge/daybook/types/daybookWedgeRow";
import { getDisplayType } from "@/components/vouchers/transactionTableShared";
import { formatVoucherEntryTimeLocal, parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

export type MapDaybookWedgeRowCtx = {
  /** Plain string only — never React `formatCurrency` (AnimatedNumber → [object Object] in JSON). */
  formatCurrency: (n: number, opts?: { noSuffix?: boolean; context?: string }) => string;
  dateSystem: "AD" | "BS" | "Both";
  formatDate: (d: Date) => string;
  formatDateBS: (d: Date) => string;
};

function moneyText(
  formatCurrency: MapDaybookWedgeRowCtx["formatCurrency"],
  amount: number,
  opts?: { noSuffix?: boolean; context?: string }
): string {
  const raw = formatCurrency(amount, opts);
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  return "";
}

function oppositeLine(t: any): string {
  return String(
    t?.partyName ||
      t?.accountName ||
      t?.payeeName ||
      t?.title ||
      ""
  ).trim();
}

/** Processed daybook row (useTransactions) → wedge card JSON. */
export function mapDaybookWedgeRow(t: any, ctx: MapDaybookWedgeRowCtx): DaybookWedgeRow {
  const id = String(t?.id || t?.documentId || "");
  const voucherNumber = String(t?.voucherNumber || t?.invoiceNumber || "").trim();
  const displayType = getDisplayType(t);
  const opposite = oppositeLine(t);
  const titleLine =
    [voucherNumber, displayType, opposite].filter(Boolean).join(" · ") || "Transaction";

  const debit = Number(t?.debit) || 0;
  const credit = Number(t?.credit) || 0;
  const amount = credit > 0 ? credit : debit;
  const amountLine = amount > 0 ? moneyText(ctx.formatCurrency, amount, { noSuffix: true, context: "transaction" }) : "-";
  const amountColor: DaybookWedgeRow["amountColor"] =
    amount <= 0 ? "neutral" : credit > 0 ? "out" : "in";

  const narrationRaw =
    t?.type === "note"
      ? String(t?.title || t?.narration || "").trim()
      : String(t?.narration || "").trim();
  const narrationLine = narrationRaw ? `Narration : ${narrationRaw}` : "";

  const d = parseFirestoreDateFieldToJsDate(t?.date) ?? parseFirestoreDateFieldToJsDate(t?.createdAt);
  const entryClock = formatVoucherEntryTimeLocal(t as Record<string, unknown>);
  const datePartAd = d ? ctx.formatDate(d) : "";
  const datePartBs = d ? ctx.formatDateBS(d) : "";
  const datePart = d
    ? ctx.dateSystem === "Both"
      ? `${ctx.formatDateBS(d)} · ${ctx.formatDate(d)}`
      : ctx.dateSystem === "BS"
        ? ctx.formatDateBS(d)
        : ctx.formatDate(d)
    : "";
  const metaLine = [datePart, entryClock].filter(Boolean).join(" • ");
  const metaLineAd = [datePartAd, entryClock].filter(Boolean).join(" • ");
  const metaLineBs = [datePartBs, entryClock].filter(Boolean).join(" • ");

  const balance = Number(t?.balance);
  let balanceLine = "";
  if (Number.isFinite(balance)) {
    const suffix = balance >= 0 ? "Dr" : "Cr";
    balanceLine = `Bal: ${moneyText(ctx.formatCurrency, Math.abs(balance), { noSuffix: true, context: "transaction" })}${suffix}`;
  }

  const sortKey = d?.getTime() ?? 0;
  const fileUrls = Array.isArray(t?.fileUrls) ? t.fileUrls : [];
  const hasFile = fileUrls.some((u: unknown) => String(u || "").trim());

  return {
    id,
    voucherNumber,
    typeLabel: displayType,
    partyLine: opposite,
    amountLine,
    sortKey,
    titleLine,
    narrationLine,
    metaLine,
    metaLineAd,
    metaLineBs,
    balanceLine,
    amountColor,
    showMenu: t?.isApproved !== true,
    showFile: hasFile,
    isPendingApproval: t?.isApproved !== true,
    timePart: entryClock || undefined,
  };
}
