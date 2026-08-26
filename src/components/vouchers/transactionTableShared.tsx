"use client";

import * as React from "react";
import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pencil, History, CheckCircle, CheckCheck, Printer, MousePointerClick, RefreshCw, Loader2 } from "lucide-react";
import { VoucherAttachmentFileIndicator } from "@/components/vouchers/VoucherAttachmentFileIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AttachmentHoverPortal } from "@/components/vouchers/AttachmentHoverPortal";
import { MultiAttachmentPortalPreview } from "@/components/vouchers/attachmentHoverPreviewBody";
import { differenceInDays } from "date-fns";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import usePermissions from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { isLedgerTransactionPeerPendingChange, isLedgerTransactionUnapproved } from "@/lib/ledgerPendingApproval";
import { txnSelectedMainRowCn, txnSelectedNarrationRowCn, txnTableIconBtnCn } from "@/lib/listSelectionChrome";
import { getAllocationTotal } from "@/lib/payment-allocation-utils";
import type { Item } from "@/components/items/types";
import { motion } from "framer-motion";
import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { getAttachmentFormatLabel } from "@/lib/attachmentFormatLabel";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { companyRequiresLocalAttachmentUrlsOnly } from "@/lib/staticAttachmentDisplayUrl";
import { getVoucherAttachmentUrlsForUi, voucherAttachmentUiOptionsForCompany } from "@/lib/voucherAttachmentNormalize";
import { formatVoucherEntryTimeLocal, parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import { getJournalVoucherLegs } from "@/lib/journalLedgerAmounts";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import {
  isRecurringBsMonthlyAutoVoucherForLedgerUserDisplay,
  resolveLedgerTransactionUserDisplayName,
  shouldShowAutoRecurringSwitchInLedgerUserCell,
} from "@/lib/ledgerUserColumnDisplay";
import { isInterCompanyVoucherEditDeleteBlocked } from "@/lib/interCompany/interCompanyVoucherHydrate";

/**
 * Ledger row Dr/Cr/Balance: kabhi Firestore/legacy `debit`/`credit` object ho — table me `[object Object]` na aaye.
 * Animated `formatCurrency` ReactNode ko `String()` se mat ghumao.
 */
function toLedgerAmount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  if (v != null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.toNumber === "function") {
      try {
        const n = Number((o.toNumber as () => unknown)());
        if (Number.isFinite(n)) return n;
      } catch {
        /* ignore */
      }
    }
    if ("amount" in o) return toLedgerAmount(o.amount);
  }
const n = Number(v as number);
  return Number.isFinite(n) ? n : 0;
}

export function getDisplayVoucherNumber(t: any): string {
  if (!t) return "";
  const rawVoucherNumber = String(t.voucherNumber ?? t.voucher_number ?? "").trim();
  if (t.type !== "contra") return rawVoucherNumber;
  const outNo = String(t.voucherNumberOut ?? "").trim();
  const inNo = String(t.voucherNumberIn ?? "").trim();
  if (rawVoucherNumber) return rawVoucherNumber;
  return outNo || inNo || "";
}

function getContraVoucherSearchAliases(t: any): string[] {
  if (!t || t.type !== "contra") return [];
  const aliases = new Set<string>(["cntr", "contra"]);
  const outNo = String(t.voucherNumberOut ?? "").trim();
  const inNo = String(t.voucherNumberIn ?? "").trim();
  const rawVoucherNumber = String(t.voucherNumber ?? t.voucher_number ?? "").trim();

  if (outNo) {
    aliases.add(outNo);
    aliases.add("out");
    aliases.add("cntr out");
    aliases.add("contra out");
    aliases.add("cntra out");
  }
  if (inNo) {
    aliases.add(inNo);
    aliases.add("in");
    aliases.add("cntr in");
    aliases.add("contra in");
    aliases.add("cntra in");
  }
  if (rawVoucherNumber) {
    const lower = rawVoucherNumber.toLowerCase();
    if (/\bout\b/.test(lower)) {
      aliases.add("out");
      aliases.add("cntr out");
      aliases.add("contra out");
      aliases.add("cntra out");
    }
    if (/\bin\b/.test(lower)) {
      aliases.add("in");
      aliases.add("cntr in");
      aliases.add("contra in");
      aliases.add("cntra in");
    }
  }
  return Array.from(aliases);
}

export type Context =
  | "party"
  | "group"
  | "daybook"
  | "account"
  | "staff"
  | "tax"
  | "tax_group"
  | "item"
  | "expense"
  | "note"
  | "other";

export type Transaction = Record<string, any>;
export type FileColumnDisplayMode = "preview" | "tick";
export type FileColumnFilterMode = "all" | "with" | "without";

export const TXN_FILE_COLUMN_VIEW_PREF_KEY = "pocket-ledger:transactions:file-column-view:v1";

export function readSavedFileColumnViewPrefs(): {
  displayMode: FileColumnDisplayMode;
  showAll: boolean;
  filterMode: FileColumnFilterMode;
} {
  if (typeof window === "undefined") return { displayMode: "preview", showAll: false, filterMode: "all" };
  try {
    const raw = window.localStorage.getItem(TXN_FILE_COLUMN_VIEW_PREF_KEY);
    if (!raw) return { displayMode: "preview", showAll: false, filterMode: "all" };
    const parsed = JSON.parse(raw) as { displayMode?: unknown; showAll?: unknown; filterMode?: unknown };
    const displayMode: FileColumnDisplayMode = parsed.displayMode === "tick" ? "tick" : "preview";
    const filterMode =
      parsed.filterMode === "with" || parsed.filterMode === "without" ? parsed.filterMode : "all";
    return { displayMode, showAll: displayMode === "preview" && parsed.showAll === true, filterMode };
  } catch {
    return { displayMode: "preview", showAll: false, filterMode: "all" };
  }
}

export function saveFileColumnViewPrefs(
  displayMode: FileColumnDisplayMode,
  showAll: boolean,
  filterMode: FileColumnFilterMode
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TXN_FILE_COLUMN_VIEW_PREF_KEY,
    JSON.stringify({ displayMode, showAll: displayMode === "preview" && showAll === true, filterMode })
  );
}

/** Portal preview — stable memo taaki table re-render / reuse-border tick par fetch/spinner reset na ho. */
function StableAttachmentPortalPreview({
  urls,
  companyId,
  voucherId,
}: {
  urls: readonly string[];
  companyId?: string | null;
  voucherId?: string | null;
}) {
  // Join by content — parent har render pe naya `urls` array deta hai; `urls` ko dep mat banao warna
  // MultiAttachmentPreview har tick pe remount → fetch cancel → portal spinner forever (origin/green row zyada).
  const urlsKey = urls.map((u) => String(u || "").trim()).filter(Boolean).join("\x1e");
  const stableUrls = React.useMemo(
    () => (urlsKey ? urlsKey.split("\x1e") : []),
    [urlsKey]
  );
  return React.useMemo(
    () => (
      <MultiAttachmentPortalPreview
        urls={stableUrls}
        companyId={companyId}
        voucherId={voucherId}
      />
    ),
    [stableUrls, companyId, voucherId]
  );
}

/**
 * Ledger row par attachment — File column filter (with / without / all).
 */
export function transactionRowHasFileAttachment(t: { fileUrls?: unknown; unassignedFile?: unknown } | null | undefined): boolean {
  return getVoucherAttachmentUrlsForUi(t).length > 0;
}

/**
 * Opening balance row — File column: entity `documentFileUrls` par voucher jaisa hover preview + green tick (`local:` refs supported).
 */
export function OpeningBalanceFileCellContent({
  fileUrls,
  displayMode = "preview",
  showAll = false,
}: {
  fileUrls?: readonly string[] | null;
  displayMode?: FileColumnDisplayMode;
  showAll?: boolean;
}) {
  const { company } = useCompany();
  const localLedgerOnly = companyRequiresLocalAttachmentUrlsOnly(company);
  const urls = Array.isArray(fileUrls)
    ? fileUrls.map((u) => String(u)).filter((s) => s.length > 0)
    : [];
  if (urls.length === 0) {
    return <span>-</span>;
  }

  const indicator =
    showAll && displayMode === "preview" ? (
      <span className="inline-flex items-center gap-1">
        {urls.map((url, index) => (
          <span key={`${url}:${index}`} data-attachment-index={index}>
            <VoucherAttachmentFileIndicator
              urls={[url]}
              displayMode="preview"
              aria-label={`Attachment ${index + 1}`}
            />
          </span>
        ))}
      </span>
    ) : (
      <VoucherAttachmentFileIndicator urls={urls} displayMode={displayMode} aria-label="Has attachment" />
    );

  // Files tick OFF: still allow click — openAttachmentInApp opens local cache only (no download).
  const serverFb =
    company?.id && urls.length > 0
      ? { companyId: company.id, voucherId: "", clientFileUrls: urls }
      : undefined;
  const singlePdfOpen =
    urls.length === 1 && getAttachmentFormatLabel(urls[0]!) === "PDF"
      ? (e: React.MouseEvent<HTMLDivElement>) => {
          e.stopPropagation();
          void openAttachmentInApp(urls[0]!, {
            kind: "pdf",
            localLedgerOnly,
            serverFallback: serverFb,
            gateCompany: company,
          });
        }
      : undefined;

  return (
    <AttachmentHoverPortal
      triggerClassName="inline-flex cursor-pointer"
      onPreviewDoubleClick={singlePdfOpen}
      galleryUrls={urls.length > 1 ? urls : undefined}
      preview={<StableAttachmentPortalPreview urls={urls} companyId={company?.id} />}
    >
      {indicator}
    </AttachmentHoverPortal>
  );
}

export function MobileTransactionFilePreview({
  transaction,
  showAll = false,
}: {
  transaction?: { fileUrls?: unknown; unassignedFile?: unknown; id?: unknown } | null;
  /** File column "Show all" — ON: har file alag thumb; OFF: ek thumb (mixed source/reuse → 50/50 frame). */
  showAll?: boolean;
}) {
  const { company } = useCompany();
  const voucherAttachmentUiOpts = React.useMemo(() => voucherAttachmentUiOptionsForCompany(company), [company]);
  const urls = getVoucherAttachmentUrlsForUi(transaction, voucherAttachmentUiOpts).map((u) => String(u)).filter((s) => s.length > 0);
  if (urls.length === 0) return null;
  const localLedgerOnly = companyRequiresLocalAttachmentUrlsOnly(company);
  const serverFallback =
    company?.id
      ? {
          companyId: company.id,
          voucherId: String(transaction?.id || ""),
          clientFileUrls: urls,
        }
      : undefined;
  const portalPreviewUrls = showAll ? urls : [urls[0]!];
  const singlePdfOpen =
    !showAll && urls.length === 1 && getAttachmentFormatLabel(urls[0]!) === "PDF"
      ? (e: React.MouseEvent<HTMLDivElement>) => {
          e.stopPropagation();
          void openAttachmentInApp(urls[0]!, {
            kind: "pdf",
            localLedgerOnly,
            serverFallback,
            gateCompany: company,
          });
        }
      : undefined;

  const indicator =
    showAll && urls.length > 1 ? (
      <span className="inline-flex items-center gap-1">
        {urls.map((url, index) => (
          <span key={`${url}:${index}`} data-attachment-index={index}>
            <VoucherAttachmentFileIndicator
              urls={[url]}
              displayMode="preview"
              size="sm"
              aria-label={`Attachment ${index + 1}`}
              companyId={company?.id}
              voucherId={String(transaction?.id || "")}
              clientFileUrls={urls}
            />
          </span>
        ))}
      </span>
    ) : (
      <VoucherAttachmentFileIndicator
        urls={urls}
        displayMode="preview"
        size="sm"
        aria-label="Open attachment preview"
        companyId={company?.id}
        voucherId={String(transaction?.id || "")}
        clientFileUrls={urls}
      />
    );

  return (
    <AttachmentHoverPortal
      triggerClassName="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center overflow-visible rounded bg-transparent"
      onPreviewDoubleClick={singlePdfOpen}
      galleryUrls={urls.length > 1 ? urls : undefined}
      preview={
        <StableAttachmentPortalPreview
          urls={portalPreviewUrls}
          companyId={company?.id}
          voucherId={String(transaction?.id || "")}
        />
      }
    >
      {indicator}
    </AttachmentHoverPortal>
  );
}

const safeToDate = (date: any): Date | null => {
  // Transaction rows may come from Firestore, local SQLite, or backup JSON; one parser keeps date/dueDate stable.
  return parseFirestoreDateFieldToJsDate(date);
};

export const getConversionFactor = (
  item: Item | undefined,
  displayUnit: string | undefined
): number => {
  if (!item || !displayUnit) return 1;
  const conversions = (item.unitConversions || []) as any[];
  if (conversions.length === 0) return 1;
  const smallestUnit =
    conversions.length > 0
      ? conversions[conversions.length - 1].toUnit
      : (item as any).openingBalanceUnit || "";
  if (displayUnit === smallestUnit) return 1;
  let factor = 1;
  let currentUnit = displayUnit;
  let attempts = 0;
  while (currentUnit !== smallestUnit && currentUnit && attempts < 10) {
    const conv = conversions.find((c: any) => c.fromUnit === currentUnit);
    if (!conv) return 1;
    factor *= Number(conv.conversionFactor) || 1;
    currentUnit = conv.toUnit;
    attempts++;
  }
  return factor > 0 ? factor : 1;
};

export const formatQuantity = (val: number) =>
  Math.abs(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const getDisplayType = (t: any) => {
  if (!t.type) return "";
  if (t.type === "journal" && t.subType === "add_salary") return "Add Salary";
  if (t.type === "inter_company") return "Inter Company";
  return t.type.replace(/_/g, " ");
};

/** Journal + Adjustment — multi-leg vouchers (`entries[]` ya `lines[]`). */
function isJournalOrAdjustmentEntries(t: any): boolean {
  if (t?.type !== "journal" && t?.type !== "adjustment") return false;
  return getJournalVoucherLegs(t).length > 0;
}

function journalEntryAccountLabel(e: any, names: Record<string, string>): string {
  const fromEntry = String(e?.accountName ?? "").trim();
  if (fromEntry) return fromEntry;
  const id = e?.accountId;
  if (!id) return "N/A";
  return names[String(id)] || "—";
}

function journalLikeEntriesFallbackLabel(t: any): string {
  return t.type === "adjustment" ? "Adjustment" : "Journal";
}

function getTransactionSyncStatus(t: any): "synced" | "sync_due" {
  return String(t?.__plSyncStatus || "").trim() === "sync_due" ? "sync_due" : "synced";
}

function TransactionSyncStatusCell({
  transaction,
  ensureMinGaps,
  syncInFlight,
  onSyncNow,
}: {
  transaction: any;
  ensureMinGaps?: boolean;
  syncInFlight?: boolean;
  onSyncNow?: (transaction: any) => void;
}) {
  const status = getTransactionSyncStatus(transaction);
  if (status === "synced") {
    return (
      <TableCell className={cn("text-center align-middle", ensureMinGaps && "min-w-[78px] px-[5px]")}>
        <span className="inline-flex items-center justify-center rounded-full text-green-600" title="Synced">
          <CheckCircle className="h-4 w-4" />
        </span>
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-center align-middle", ensureMinGaps && "min-w-[78px] px-[5px]")}>
      <span className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-500/60 bg-amber-50 pl-2 pr-1 text-[10px] font-semibold text-amber-700">
        {syncInFlight ? "Syncing" : "Sync due"}
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-amber-100 disabled:cursor-wait"
          title={syncInFlight ? "Syncing this voucher" : "Sync this voucher now"}
          disabled={syncInFlight}
          onClick={(event) => {
            event.stopPropagation();
            onSyncNow?.(transaction);
          }}
        >
          {syncInFlight ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </span>
    </TableCell>
  );
}

/** Type column pill: row amount Dr → green, Cr → red (`note` alag — neutral rehta hai). */
export type TxnDrCrSide = "dr" | "cr";

export function resolveTxnDrCrSide(debit: number, credit: number, signedBalance?: number): TxnDrCrSide | null {
  const dr = Number(debit) || 0;
  const cr = Number(credit) || 0;
  if (dr > 0 && cr <= 0) return "dr";
  if (cr > 0 && dr <= 0) return "cr";
  if (dr > 0 && cr > 0) return dr >= cr ? "dr" : "cr";
  if (typeof signedBalance === "number" && signedBalance !== 0) {
    return signedBalance >= 0 ? "dr" : "cr";
  }
  return null;
}

/** Voucher row se Dr/Cr side — spend-wise linked amount bhi debit/credit columns jaisa. */
export function resolveTxnDrCrSideFromTransaction(
  t: any,
  opts?: { spendWiseLinkedAmount?: number }
): TxnDrCrSide | null {
  if (!t || t.type === "note") return null;
  let debit = toLedgerAmount(t.debit);
  let credit = toLedgerAmount(t.credit);
  const linked = opts?.spendWiseLinkedAmount;
  if (typeof linked === "number" && linked > 0) {
    const isOutflow =
      t.type === "payment_out" ||
      t.type === "direct_expense" ||
      Number(t.credit) > 0;
    if (isOutflow) {
      debit = 0;
      credit = linked;
    } else {
      debit = linked;
      credit = 0;
    }
  }
  const bal =
    typeof t.balance === "number"
      ? t.balance
      : typeof t.runningBalance === "number"
        ? t.runningBalance
        : undefined;
  return resolveTxnDrCrSide(debit, credit, bal);
}

/** Reverted IC voucher — type column pill blue (Dr/Cr dono equal hone par green na dikhe). */
export function isInterCompanyReversedVoucher(t: { type?: string; interCompanyReversed?: boolean } | null | undefined): boolean {
  return String(t?.type || "") === "inter_company" && t?.interCompanyReversed === true;
}

/** Type pill classes — Dr green / Cr red; reverted IC = blue; `null` = default outline. */
export function voucherTypePillClassName(
  side: TxnDrCrSide | null,
  opts?: { interCompanyReversed?: boolean }
): string {
  const base = "inline-flex h-6 items-center rounded-xl px-2.5 font-medium";
  if (opts?.interCompanyReversed) {
    return cn(
      base,
      "border-blue-600/50 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-600/40"
    );
  }
  if (side === "dr") {
    return cn(
      base,
      "border-green-600/50 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 dark:border-green-600/40"
    );
  }
  if (side === "cr") {
    return cn(
      base,
      "border-red-600/50 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border-red-600/40"
    );
  }
  return base;
}

/** Note voucher: Firestore par entityName + entityId — Daybook Accounts column ke liye */
export const getNoteLinkedEntityLabel = (t: any, names: Record<string, string> = {}) => {
  const fromDoc = typeof t.entityName === "string" && t.entityName.trim() ? t.entityName.trim() : "";
  const fromMap = t.entityId ? names[t.entityId] : "";
  return fromDoc || fromMap || (t.entityId ? String(t.entityId) : "") || "N/A";
};

export const getParticularsText = (t: any, names: Record<string, string> = {}) => {
  const getName = (id: string | undefined) => (id ? (names[id] || "—") : "N/A");
  if (t.type === "sale") {
    const partyName = getName(t.partyId);
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `To: ${partyName} (via ${accountName})` : `To: ${partyName}`;
  }
  if (t.type === "purchase") {
    const partyName = getName(t.partyId);
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `From: ${partyName} (via ${accountName})` : `From: ${partyName}`;
  }
  if (t.type === "payment_in") {
    const payeeName = names[t.partyId] || names[t.staffId] || names[t.taxAccountId] || names[t.incomeAccountId] || t.payeeName || "N/A";
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `From: ${payeeName} (via ${accountName})` : `From: ${payeeName}`;
  }
  if (t.type === "payment_out") {
    const payeeName = names[t.partyId] || names[t.staffId] || names[t.taxAccountId] || names[t.expenseAccountId] || t.payeeName || "N/A";
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `To: ${payeeName} (via ${accountName})` : `To: ${payeeName}`;
  }
  if (t.type === "contra") return `${getName(t.fromAccountId)} to ${getName(t.toAccountId)}`;
  if (t.type === "direct_income") {
    const incomeAccountName = getName(t.incomeAccountId);
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `By: ${incomeAccountName} (via ${accountName})` : `By: ${incomeAccountName}`;
  }
  if (t.type === "direct_expense") {
    const toAccountId = t.toAccountId || t.expenseAccountId;
    const toAccountName = getName(toAccountId);
    const accountName = getName(t.fromAccountId || t.accountId);
    return accountName && accountName !== "N/A" ? `To: ${toAccountName} (via ${accountName})` : `To: ${toAccountName}`;
  }
  if (isJournalOrAdjustmentEntries(t)) {
    const legs = getJournalVoucherLegs(t);
    const dr = legs.filter((e) => (Number(e.debit) || 0) > 0).map((e) => `Dr: ${journalEntryAccountLabel(e, names)}`);
    const cr = legs.filter((e) => (Number(e.credit) || 0) > 0).map((e) => `Cr: ${journalEntryAccountLabel(e, names)}`);
    return [...dr, ...cr].join(", ");
  }
  if (t.type === "note") return `Note for: ${getNoteLinkedEntityLabel(t, names)}`;
  return t.narration || "";
};

/** One account / opposite side only (for mobile card - no "From/To X (via Y)"). */
export const getOppositeAccountLabel = (
  t: any,
  names: Record<string, string> = {},
  context?: Context,
  contextId?: string,
  groupEntityType?: "party" | "account" | "staff" | "tax" | "expense" | "item"
): string => {
  const getName = (id: string | undefined) => {
    if (!id) return "";
    const n = String(names[id] || "").trim();
    // Missing map → empty so payment_in/out fallbacks (payeeName / labels) run on APK.
    if (!n || n === "—" || n === "-") return "";
    return n;
  };
  // Keep voucher title clean: hide placeholder-only labels like "—, —".
  const sanitizeOpposite = (raw: string): string => {
    const text = String(raw || "").trim();
    if (!text) return "";
    const normalized = text.replace(/[,\s]/g, "");
    if (!normalized) return "";
    return /^[—-]+$/.test(normalized) ? "" : text;
  };
  const labelFromJournalEntry = (e: any) => {
    const raw = String(e?.accountName ?? "").trim();
    if (raw) return raw;
    const id = e?.accountId;
    return id ? getName(id) : "N/A";
  };
  const getPartyDisplay = (partyId: string | undefined) => {
    // Item-ledger rows can carry partyName even when id->name map is incomplete.
    const fromMap = partyId ? names[partyId] : undefined;
    return fromMap || t.partyName || t.payeeName || "—";
  };
  if (context === "item" && (t.type === "sale" || t.type === "purchase")) {
    return getPartyDisplay(t.partyId);
  }
  if (context === "item" && t.type === "note") {
    // Item details note row should display linked item/entity name in Party column.
    return getNoteLinkedEntityLabel(t, names);
  }
  // Party context: show opposite/counter account (bank, expense, etc.) not the current party
  if (context === "party" && contextId) {
    const partyInTx =
      t.partyId === contextId ||
      (isJournalOrAdjustmentEntries(t) && t.entries.some((e: any) => e?.accountId === contextId));
    if (partyInTx) {
      if (t.type === "sale") return getName(t.salesAccountId || "sales_account") || "Sales Account";
      if (t.type === "purchase") return getName(t.purchaseAccountId || "purchase_account") || "Purchase Account";
      if (t.type === "payment_in") return getName(t.accountId) || "Payment In";
      if (t.type === "payment_out") return getName(t.accountId) || getName(t.fromAccountId) || "Payment Out";
      if (t.type === "direct_income") return getName(t.accountId) || "Direct Income";
      if (t.type === "direct_expense") return getName(t.fromAccountId) || getName(t.accountId) || "Direct Expense";
      if (t.type === "contra") return getName(t.fromAccountId) || getName(t.toAccountId);
      if (isJournalOrAdjustmentEntries(t)) {
        const partyEntry = t.entries.find((e: any) => e?.accountId === contextId);
        const oppositeSide = partyEntry ? ((Number(partyEntry?.debit) || 0) > 0 ? "credit" : "debit") : "debit";
        const oppositeEntry = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId && (Number(e?.[oppositeSide]) || 0) > 0);
        if (oppositeEntry?.accountId) return sanitizeOpposite(labelFromJournalEntry(oppositeEntry));
        const anyOther = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId);
        if (anyOther?.accountId) return sanitizeOpposite(labelFromJournalEntry(anyOther));
        return journalLikeEntriesFallbackLabel(t);
      }
      if (t.type === "note") return getNoteLinkedEntityLabel(t, names);
    }
  }
  // Tax group: sale/purchase show party (opposite of tax), not Sales/Purchase account
  if (context === "group" && groupEntityType === "tax" && (t.type === "sale" || t.type === "purchase")) {
    return getName(t.partyId);
  }
  // Item group: sale/purchase should show party (same as item details Party column).
  if (context === "group" && groupEntityType === "item" && (t.type === "sale" || t.type === "purchase")) {
    return getPartyDisplay(t.partyId);
  }
  if (context === "group" && groupEntityType === "item" && t.type === "note") {
    // Item-group note rows should display linked item/entity name in Party column.
    return getNoteLinkedEntityLabel(t, names);
  }
  // Group context: sale/purchase show Sales/Purchase account (party group, etc.)
  if (context === "group" && (t.type === "sale" || t.type === "purchase")) {
    if (t.type === "sale") return getName(t.salesAccountId || "sales_account") || "Sales Account";
    if (t.type === "purchase") return getName(t.purchaseAccountId || "purchase_account") || "Purchase Account";
  }
  // Account group: show opposite (party/staff/tax/income/expense) for payments, like bank details
  if (context === "group" && groupEntityType === "account") {
    if (t.type === "payment_in") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.incomeAccountId && getName(t.incomeAccountId)) || t.payeeName || "N/A";
    if (t.type === "payment_out") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.expenseAccountId && getName(t.expenseAccountId)) || t.payeeName || "N/A";
    if (t.type === "direct_income") return getName(t.incomeAccountId);
    if (t.type === "direct_expense") return getName(t.toAccountId || t.expenseAccountId);
    if (t.type === "contra") return getName(t.fromAccountId) || getName(t.toAccountId);
    if (isJournalOrAdjustmentEntries(t)) {
      const parts = t.entries.slice(0, 2).map((e: any) => labelFromJournalEntry(e));
      return sanitizeOpposite(parts.join(", ")) || journalLikeEntriesFallbackLabel(t);
    }
  }
  // Account (bank) context: show opposite account - Sales/Purchase for sale/purchase, party for payments, etc.
  const accountInTx = context === "account" && contextId && (
    t.accountId === contextId ||
    (t.type === "contra" && (t.fromAccountId === contextId || t.toAccountId === contextId)) ||
    (isJournalOrAdjustmentEntries(t) && t.entries.some((e: any) => e?.accountId === contextId))
  );
  if (accountInTx) {
    if (t.type === "sale") return getName(t.salesAccountId || "sales_account") || "Sales Account";
    if (t.type === "purchase") return getName(t.purchaseAccountId || "purchase_account") || "Purchase Account";
    if (t.type === "payment_in") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.incomeAccountId && getName(t.incomeAccountId)) || t.payeeName || "N/A";
    if (t.type === "payment_out") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.expenseAccountId && getName(t.expenseAccountId)) || t.payeeName || "N/A";
    if (t.type === "direct_income") return getName(t.incomeAccountId);
    if (t.type === "direct_expense") return getName(t.toAccountId || t.expenseAccountId);
    if (t.type === "contra") return getName(t.fromAccountId === contextId ? t.toAccountId : t.fromAccountId);
    if (isJournalOrAdjustmentEntries(t)) {
      const accountEntry = t.entries.find((e: any) => e?.accountId === contextId);
      const oppositeSide = accountEntry ? ((Number(accountEntry?.debit) || 0) > 0 ? "credit" : "debit") : "debit";
      const oppositeEntry = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId && (Number(e?.[oppositeSide]) || 0) > 0);
      if (oppositeEntry?.accountId) return sanitizeOpposite(labelFromJournalEntry(oppositeEntry));
      const anyOther = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId);
      if (anyOther?.accountId) return sanitizeOpposite(labelFromJournalEntry(anyOther));
      return journalLikeEntriesFallbackLabel(t);
    }
  }
  // Expense ledger rows should also resolve an actual opposite account next to voucher number.
  const expenseInTx =
    context === "expense" &&
    contextId &&
    (t.expenseAccountId === contextId ||
      t.incomeAccountId === contextId ||
      t.toAccountId === contextId ||
      t.accountId === contextId ||
      (isJournalOrAdjustmentEntries(t) && t.entries.some((e: any) => e?.accountId === contextId)));
  if (expenseInTx) {
    if (t.type === "direct_expense") return sanitizeOpposite(getName(t.fromAccountId || t.accountId));
    if (t.type === "direct_income") return sanitizeOpposite(getName(t.accountId));
    if (t.type === "payment_in") {
      return sanitizeOpposite(
        (t.partyId && getName(t.partyId)) ||
        (t.staffId && getName(t.staffId)) ||
        (t.taxAccountId && getName(t.taxAccountId)) ||
        t.payeeName ||
        getName(t.accountId)
      );
    }
    if (t.type === "payment_out") {
      return sanitizeOpposite(
        (t.partyId && getName(t.partyId)) ||
        (t.staffId && getName(t.staffId)) ||
        (t.taxAccountId && getName(t.taxAccountId)) ||
        t.payeeName ||
        getName(t.fromAccountId || t.accountId)
      );
    }
    if (isJournalOrAdjustmentEntries(t)) {
      const selectedEntry = t.entries.find((e: any) => e?.accountId === contextId);
      const oppositeSide = selectedEntry ? ((Number(selectedEntry?.debit) || 0) > 0 ? "credit" : "debit") : "debit";
      const oppositeEntry = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId && (Number(e?.[oppositeSide]) || 0) > 0);
      if (oppositeEntry?.accountId) return sanitizeOpposite(labelFromJournalEntry(oppositeEntry));
      const anyOther = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId);
      if (anyOther?.accountId) return sanitizeOpposite(labelFromJournalEntry(anyOther));
      return journalLikeEntriesFallbackLabel(t);
    }
  }
  const isStaffContext =
    context === "staff" ||
    (context === "group" && (t?.subType === "add_salary" || !!t?.staffId));
  const staffId = isStaffContext ? contextId : undefined;
  const taxId = t.taxAccountId as string | undefined;

  if (isStaffContext) {
    const isTaxLikeId = (id: string | undefined) => {
      if (!id) return false;
      if (taxId && id === taxId) return true;
      const label = (names[id] || "").toLowerCase();
      return label.includes("tax") || label.includes("tds") || label.includes("vat");
    };
    const pickFirstValidId = (ids: Array<string | undefined>) =>
      ids.find((id) => id && id !== staffId && !isTaxLikeId(id));

    // Payment in/out: show bank account (opposite of staff)
    if (t.type === "payment_in" || t.type === "payment_out") {
      const bankId = t.type === "payment_in" ? t.accountId : (t.fromAccountId || t.accountId);
      if (bankId) return getName(bankId);
      const oppositeId = pickFirstValidId([
        t.accountId,
        t.fromAccountId,
        t.toAccountId,
        t.expenseAccountId,
        t.incomeAccountId,
        t.partyId,
      ]);
      return oppositeId ? getName(oppositeId) : t.payeeName || "N/A";
    }

    if (t.type === "journal" && t.subType === "add_salary" && Array.isArray(t.entries)) {
      const nonStaffEntries = t.entries.filter((e: any) => e?.accountId && e.accountId !== staffId);
      const expenseEntry =
        nonStaffEntries.find((e: any) => (Number(e?.debit) || 0) > 0 && !isTaxLikeId(e.accountId)) ||
        nonStaffEntries.find((e: any) => (Number(e?.debit) || 0) > 0) ||
        nonStaffEntries.find((e: any) => !isTaxLikeId(e.accountId)) ||
        nonStaffEntries[0];
      if (expenseEntry?.accountId) return sanitizeOpposite(labelFromJournalEntry(expenseEntry));
      return "Add Salary";
    }

    if (isJournalOrAdjustmentEntries(t)) {
      const selectedEntry = t.entries.find((e: any) => e?.accountId === staffId);
      const preferredSide = (Number(selectedEntry?.credit) || 0) > 0 ? "debit" : "credit";
      const nonStaffEntries = t.entries.filter((e: any) => e?.accountId && e.accountId !== staffId);
      const oppositeEntry =
        nonStaffEntries.find((e: any) => (Number(e?.[preferredSide]) || 0) > 0 && !isTaxLikeId(e.accountId)) ||
        nonStaffEntries.find((e: any) => !isTaxLikeId(e.accountId)) ||
        nonStaffEntries[0];
      if (oppositeEntry?.accountId) return sanitizeOpposite(labelFromJournalEntry(oppositeEntry));
    }
  }

  if (t.type === "sale") return getName(t.partyId);
  if (t.type === "purchase") return getName(t.partyId);
  // Tax context: add_salary → staff; sale/purchase already party above; payment → party/staff if set
  const isTaxContext = context === "tax" || context === "tax_group";
  if (isTaxContext && t.type === "journal" && t.subType === "add_salary" && Array.isArray(t.entries)) {
    const staffNames = t.entries
      .filter((e: any) => {
        const credit = Number(e.credit) || 0;
        if (credit <= 0) return false;
        return !String(e.narration || "").includes("(Staff ID:");
      })
      .map((e: any) => getName(e.accountId))
      .filter(Boolean);
    if (staffNames.length > 0) return sanitizeOpposite(staffNames.join(", "));
  }
  if (isTaxContext && (t.type === "payment_in" || t.type === "payment_out")) {
    if (t.partyId) return getName(t.partyId);
    if (t.staffId) return getName(t.staffId);
    const bankId = t.type === "payment_in" ? t.accountId : (t.fromAccountId || t.accountId);
    if (bankId) return getName(bankId);
  }
  if (t.type === "payment_in") {
    return (
      names[t.partyId] ||
      names[t.staffId] ||
      names[t.taxAccountId] ||
      names[t.incomeAccountId] ||
      t.payeeName ||
      getName(t.accountId) ||
      "Payment In"
    );
  }
  if (t.type === "payment_out") {
    return (
      names[t.partyId] ||
      names[t.staffId] ||
      names[t.taxAccountId] ||
      names[t.expenseAccountId] ||
      names[t.toAccountId] ||
      t.payeeName ||
      getName(t.accountId) ||
      "Payment Out"
    );
  }
  if (t.type === "contra") return getName(t.toAccountId) || getName(t.fromAccountId);
  if (t.type === "direct_income") return getName(t.incomeAccountId);
  if (t.type === "direct_expense") return getName(t.toAccountId || t.expenseAccountId);
  if (isJournalOrAdjustmentEntries(t)) {
    const parts = t.entries.slice(0, 2).map((e: any) => labelFromJournalEntry(e));
    return sanitizeOpposite(parts.join(", ")) || journalLikeEntriesFallbackLabel(t);
  }
  if (t.type === "note") return getNoteLinkedEntityLabel(t, names);
  return t.narration || "";
};

/**
 * Mobile "Search transactions" text blob: voucher, narration, particulars, opposite account (card title), user display, etc.
 */
export function getTransactionQuickSearchHaystack(
  t: any,
  names: Record<string, string> = {},
  context?: Context,
  contextId?: string,
  groupEntityType?: "party" | "account" | "staff" | "tax" | "expense" | "item"
): string {
  const chunks: string[] = [
    getDisplayVoucherNumber(t),
    t?.voucherNumberOut,
    t?.voucherNumberIn,
    getDisplayType(t),
    t?.narration,
    typeof t?.partyName === "string" ? t.partyName : "",
    typeof t?.payeeName === "string" ? t.payeeName : "",
    typeof t?.userDisplayName === "string" ? t.userDisplayName : "",
    typeof t?.userName === "string" ? t.userName : "",
    getParticularsText(t, names),
    ...getContraVoucherSearchAliases(t),
  ];
  const uid = t?.userId;
  if (uid && names[uid]) chunks.push(names[uid]);
  if (isRecurringBsMonthlyAutoVoucherForLedgerUserDisplay(t)) chunks.push("Auto");
  if (context && contextId) {
    chunks.push(getOppositeAccountLabel(t, names, context, contextId, groupEntityType));
  }
  return chunks.filter(Boolean).join(" ").toLowerCase();
}

const isStatusJournalOrNote = (t: any) =>
  t.type === "journal" || t.type === "note";

const isStatusJournalOrNoteOrContra = (t: any) =>
  t.type === "journal" || t.type === "note" || t.type === "contra";

/** context: on staff/group or tax ledger, Add Salary shows Paid/Unpaid/Partial/Overdue (like party), not "Journal". */
export const getStatusLabel = (t: any, context?: string) => {
  const isStaffContext = context === "staff" || context === "group";
  const isTaxContext = context === "tax" || context === "tax_group";
  const isAddSalary = t.type === "journal" && t.subType === "add_salary";
  
  // Always show real status for Add Salary transactions if paymentStatus exists
  if (isAddSalary) {
    const status = (t as any).paymentStatus;
    if (status === "paid") return "Paid";
    if (status === "unpaid") return "Unpaid";
    if (status === "partially_paid") return "Partial";
    if (status === "overdue" || (t as any).isOverdue) return "Overdue";
    // If no paymentStatus but has allocations, check payment status
    const allocations = (t.allocations as any[] | undefined) || [];
    const linkedFrom = (t.linkedFromVoucherNos as string[] | undefined) || [];
    const linkedTo = (t.linkedToVoucherNos as string[] | undefined) || [];
    if (allocations.length > 0 || linkedFrom.length > 0 || linkedTo.length > 0) {
      // Has payment links, check if fully paid
      const amount = Number(t.amount ?? t.total ?? t.debit ?? t.credit ?? 0) || 0;
      if (amount > 0) {
        const totalLinked = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
        if (totalLinked >= amount) return "Paid";
        if (totalLinked > 0) return "Partial";
      }
    }
    // Default to Unpaid if no payment status info
    return "Unpaid";
  }
  
  if (isStaffContext && (t.type === "payment_out" || t.type === "direct_expense")) {
    const amountPaid = Number(t.amount ?? t.total ?? 0) || 0;
    const allocations = (t.allocations as any[] | undefined) || [];
    const totalLinked = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
    if (amountPaid <= 0) return "Unpaid";
    if (totalLinked >= amountPaid) return "Paid";
    if (totalLinked > 0) return "Partial";
    return "Unpaid";
  }
  if (t.type === "contra") return "Contra";
  if (t.type === "adjustment") return "Adjustment";
  // Bill-wise journal: use paymentStatus (Paid/Partial/Unpaid) when set by use-transactions, same as sale/purchase.
  if (t.type === "journal" && !isAddSalary) {
    const status = (t as any).paymentStatus;
    if (status === "paid") return "Paid";
    if (status === "unpaid") return "Unpaid";
    if (status === "partially_paid") return "Partial";
    if (status === "overdue" || (t as any).isOverdue) return "Overdue";
    // No paymentStatus: fall back to "Journal" (e.g. statement view, non-bill-wise)
  }
  if (isStatusJournalOrNote(t)) return t.type === "journal" ? "Journal" : "Note";
  const status = (t as any).paymentStatus;
  if (status === "paid") return "Paid";
  if (status === "unpaid") return "Unpaid";
  if (status === "partially_paid") return "Partial";
  if (status === "overdue" || (t as any).isOverdue) return "Overdue";
  return "";
};

/** Days overdue (today - dueDate). Returns 0 if not overdue or no dueDate. */
const getOverdueDays = (t: any): number => {
  if (!(t.isOverdue || t.paymentStatus === "overdue")) return 0;
  const due = safeToDate(t.dueDate);
  if (!due) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueOnly = new Date(due);
  dueOnly.setHours(0, 0, 0, 0);
  if (today <= dueOnly) return 0;
  return differenceInDays(today, dueOnly);
};


/** Status detail: list all linked voucher nos only (no "from"/"to" prefix). When billWiseOnly: ONLY bill-wise fields — never fall back to spend-wise–mixed linkedFromVoucherNos. */
export const getStatusDetail = (t: any, opts?: { billWiseOnly?: boolean }) => {
  const billWiseOnly = opts?.billWiseOnly === true;
  const fromRaw = (
    billWiseOnly
      ? (t.linkedFromVoucherNosBillWise as string[] | undefined)
      : (t.linkedFromVoucherNos as string[] | undefined)
  ) || [];
  const toRaw = (
    billWiseOnly ? (t.linkedToVoucherNosBillWise as string[] | undefined) : (t.linkedToVoucherNos as string[] | undefined)
  ) || [];
  const all = Array.from(new Set([...fromRaw, ...toRaw])).filter(Boolean);
  if (all.length === 0) return "";
  return all.join(", ");
};

/** Chunk status detail (comma-separated voucher nos) into 2–3 lines for wrap (2 nos per line). */
export const getStatusDetailLines = (statusDetail: string): string[] => {
  if (!statusDetail?.trim()) return [];
  const parts = statusDetail.split(",").map((s) => s.trim()).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts.slice(i, i + 2).join(", "));
  }
  return lines;
};

/** Same as getStatusDetail but returns array of voucher strings for per-voucher styling (e.g. cyclical colors). */
export const getStatusDetailVouchers = (t: any, opts?: { billWiseOnly?: boolean }): string[] => {
  const billWiseOnly = opts?.billWiseOnly === true;
  const fromRaw = (
    billWiseOnly
      ? (t.linkedFromVoucherNosBillWise as string[] | undefined)
      : (t.linkedFromVoucherNos as string[] | undefined)
  ) || [];
  const toRaw = (
    billWiseOnly ? (t.linkedToVoucherNosBillWise as string[] | undefined) : (t.linkedToVoucherNos as string[] | undefined)
  ) || [];
  return Array.from(new Set([...fromRaw, ...toRaw])).filter(Boolean);
};

/** Cyclical 3 colors for multi-voucher display: 1st Blue, 2nd Gray, 3rd Green, then repeat. */
const LINKED_VOUCHER_COLOR_CLASSES = ["text-blue-600", "text-gray-600", "text-green-600"] as const;
const LINKED_VOUCHER_COLOR_CLASSES_BILLWISE = ["text-blue-600", "text-pink-600", "text-green-600"] as const;
export const getLinkedVoucherColorClass = (index: number): string =>
  LINKED_VOUCHER_COLOR_CLASSES[index % 3];

/** Renders voucher list in 2-per-line with cyclical Blue / Gray / Green (or Pink in bill-wise). Reusable for status detail and opening balance. */
export function LinkedVouchersColored({
  vouchers,
  vouchersPerLine = 2,
  className,
  align = "center",
  billWisePink = false,
  /** Print parity: inline " + " separators with flex-wrap across Status+Balance width. */
  wrapInline = false,
}: {
  vouchers: string[];
  vouchersPerLine?: number;
  className?: string;
  align?: "start" | "center" | "end";
  /** Bill-wise: use pink instead of gray for voucher details below status. */
  billWisePink?: boolean;
  wrapInline?: boolean;
}) {
  if (!vouchers?.length) return null;
  if (wrapInline) {
    const justifyClass =
      align === "end" ? "justify-end" : align === "start" ? "justify-start" : "justify-center";
    return (
      <div className={cn("flex flex-wrap items-center gap-y-[1px] text-[10px]", justifyClass, className)}>
        {vouchers.map((v, globalIdx) => {
          const colorClass = billWisePink
            ? LINKED_VOUCHER_COLOR_CLASSES_BILLWISE[globalIdx % 3]
            : getLinkedVoucherColorClass(globalIdx);
          return (
            <React.Fragment key={globalIdx}>
              {globalIdx > 0 ? <span className="text-black"> + </span> : null}
              <span className={colorClass}>{v}</span>
            </React.Fragment>
          );
        })}
      </div>
    );
  }
  const lines: string[][] = [];
  for (let i = 0; i < vouchers.length; i += vouchersPerLine) {
    lines.push(vouchers.slice(i, i + vouchersPerLine));
  }
  const alignClass = align === "end" ? "items-end" : align === "start" ? "items-start" : "items-center";
  return (
    <div className={cn("flex flex-col gap-[1px] text-[10px]", alignClass, className)}>
      {lines.map((lineVouchers, lineIdx) => (
        <span key={lineIdx} className="block">
          {lineVouchers.map((v, j) => {
            const globalIdx = lineIdx * vouchersPerLine + j;
            const colorClass = billWisePink ? LINKED_VOUCHER_COLOR_CLASSES_BILLWISE[globalIdx % 3] : getLinkedVoucherColorClass(globalIdx);
            return (
              <React.Fragment key={globalIdx}>
                {j > 0 ? ", " : null}
                <span className={colorClass}>{v}</span>
              </React.Fragment>
            );
          })}
        </span>
      ))}
    </div>
  );
}

/** Bill-wise print parity: linked voucher / overdue detail spans Status + Balance columns in narration sub-rows. */
export function BillWiseLinkedDetailCells({
  vouchers,
  overdueText,
  billWisePink = true,
  showStatus,
  hideStatusColumn,
  showBalance,
  hideBalanceColumn,
  ensureMinGaps,
}: {
  vouchers: string[];
  overdueText?: React.ReactNode;
  billWisePink?: boolean;
  showStatus: boolean;
  hideStatusColumn?: boolean;
  showBalance: boolean;
  hideBalanceColumn?: boolean;
  ensureMinGaps?: boolean;
}) {
  const hasDetail = (vouchers?.length ?? 0) > 0 || overdueText != null;
  if (!showStatus || hideStatusColumn) return null;
  const spanBoth = hasDetail && showBalance && !hideBalanceColumn;

  if (!hasDetail) {
    return (
      <>
        <TableCell className={cn("text-center align-top py-0", ensureMinGaps && "min-w-[95px] px-[5px]")} />
        {showBalance && !hideBalanceColumn && (
          <TableCell className={cn("text-right align-top py-0", ensureMinGaps && "min-w-[115px] px-[5px]")} />
        )}
      </>
    );
  }

  return (
    <>
      <TableCell
        colSpan={spanBoth ? 2 : 1}
        className={cn(
          "text-left text-[10px] leading-tight align-top py-0 text-black whitespace-normal break-words",
          ensureMinGaps && (spanBoth ? "min-w-[210px] px-[5px]" : "min-w-[95px] px-[5px]")
        )}
      >
        <div className="flex flex-col items-start gap-[1px] min-w-0">
          <LinkedVouchersColored vouchers={vouchers} wrapInline align="start" billWisePink={billWisePink} />
          {overdueText ? <span className="block font-medium text-red-600">{overdueText}</span> : null}
        </div>
      </TableCell>
      {showBalance && !hideBalanceColumn && !spanBoth && (
        <TableCell className={cn("text-right align-top py-0", ensureMinGaps && "min-w-[115px] px-[5px]")} />
      )}
    </>
  );
}

/** Chunk OB linked voucher nos into 2–3 lines (no "to" prefix). Used by TransactionsTable and BillwiseTransactionTable. */
export function openingBalanceLinkedLines(nos: string[]): string[] {
  if (!nos?.length) return [];
  const deduped = Array.from(new Set(nos));
  const lines: string[] = [];
  for (let i = 0; i < deduped.length; i += 2) {
    lines.push(deduped.slice(i, i + 2).join(", "));
  }
  return lines;
}

export const TransactionRow = React.memo(
  ({
    transaction,
    showNarration,
    userNames,
    journalAccountNames,
    accountNames,
    context,
    contextId,
    groupEntityType,
    stockView,
    displayUnit,
    item,
    onRowClick,
    onAddLink,
    onHistoryVoucher,
    onApproveVoucher,
    onApproveAllVisible,
    showApproveAll = false,
    onRowSelect,
    isSelected,
    isRelatedBlink = false,
    isSelectedRowBlink = false,
    getDisplayValue,
    isTaxContext,
    isBalanceMasked,
    hideBalanceColumn,
    hideStatusColumn,
    visibleColumns,
    useOutstandingForBalance,
    isBillWise,
    ensureMinGaps = false,
    showFileColumn = false,
    fileDisplayMode = "preview",
    fileShowAll = false,
    showItemPartyColumn = true,
    isSpendWiseChild = false,
    isSpendWiseGroupFirst = false,
    isSpendWiseGroupLast = false,
    spendWiseRunningBalance,
    spendWiseGroupColorIndex,
    spendWiseGroupSize,
    blinkMode,
    animateLayout = false,
    statusBillWiseOnly = false,
    /** Party ledger: use default true — unapproved (`isApproved` !== true) pink main + narration row */
    highlightPendingApproval = true,
    /** Bill-wise + fiscal divider: full table colspan for banner row. */
    fullRowColSpan,
    /** Recent/top Search: global pink highlight (sirf is query). Column header filters alag — `columnFilters`. */
    textSearchHighlight,
    /** Column header filter values — highlight sirf usi column cell me. */
    columnFilters,
    /** List index: main + narration dono rows ko same gray/white stripe (nth-child odd/even se alag nahi). */
    txnStripeIndex,
    /** Check mode: keyboard focus row (scroll-into-view) */
    isCheckModeFocused = false,
    /** Check mode: Space mark — halka green bg (border nahi) */
    isCheckModeMarked = false,
    /** Spend-wise group card: 3-dot me Select + Print */
    spendWiseInGroupCard = false,
    showSpendWiseGroupMenuActions = false,
    onPrintRow,
    syncInFlight = false,
    onSyncNow,
    /** Enabled recurring templates se active trigger ids — switch sirf in par (dashboard jaisa). */
    activeRecurringTriggerVoucherIds = null,
  }: any) => {
    const { company } = useCompany();
    const localLedgerOnly = companyRequiresLocalAttachmentUrlsOnly(company);
    const voucherAttachmentUiOpts = React.useMemo(() => voucherAttachmentUiOptionsForCompany(company), [company]);
    /* Main + narration hover ek block — narration par mouse par bhi dono rows highlight (globals.css [data-pl-txn-hovered]) */
    const [pairHovered, setPairHovered] = React.useState(false);
    const mainRowRef = React.useRef<HTMLTableRowElement>(null);
    const narrRowRef = React.useRef<HTMLTableRowElement>(null);
    const onPairHoverEnter = React.useCallback(() => setPairHovered(true), []);
    const clearPairHoverIfLeavingBlock = React.useCallback((e: React.MouseEvent) => {
      const rel = e.relatedTarget;
      if (rel instanceof Node) {
        if (mainRowRef.current?.contains(rel) || narrRowRef.current?.contains(rel)) return;
      }
      setPairHovered(false);
    }, []);

    // Merge fiscal mode: FY ke beech full-width divider — amounts / row actions nahi.
    if (transaction.type === FISCAL_YEAR_PARTITION_ROW_TYPE) {
      const span = typeof fullRowColSpan === "number" && fullRowColSpan > 0 ? fullRowColSpan : 12;
      const label =
        typeof (transaction as any)._partitionLabel === "string" && (transaction as any)._partitionLabel
          ? (transaction as any)._partitionLabel
          : "── Closing fiscal period · New fiscal period ──";
      return (
        <motion.tr
          layout={animateLayout ? "position" : false}
          initial={false}
          className="cursor-default border-y-2 border-blue-600/55 bg-blue-50/90 dark:bg-blue-950/45 hover:!bg-blue-50/90 dark:hover:!bg-blue-950/45"
          onClick={(e) => e.stopPropagation()}
        >
          <TableCell colSpan={span} className="py-2.5 px-3 text-center align-middle">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-100">{label}</span>
          </TableCell>
        </motion.tr>
      );
    }

    const isSpendWiseInGroup = isSpendWiseGroupFirst || isSpendWiseGroupLast || isSpendWiseChild || (transaction as any)._spendWiseGroupFirst;
    const hasSpendWiseColor = typeof spendWiseGroupColorIndex === "number";
    const swColor = hasSpendWiseColor && (spendWiseGroupColorIndex === 1 ? "green" : spendWiseGroupColorIndex === 2 ? "pink" : "blue");
    // Bank spend-wise: split-group page edges — bank Account / Group details set _spendWisePageShow*; else full-group first/last.
    const effSpendTop =
      typeof (transaction as any)._spendWisePageShowTopEdge === "boolean"
        ? (transaction as any)._spendWisePageShowTopEdge
        : isSpendWiseGroupFirst;
    const effSpendBottom =
      typeof (transaction as any)._spendWisePageShowBottomEdge === "boolean"
        ? (transaction as any)._spendWisePageShowBottomEdge
        : isSpendWiseGroupLast;
    const useRowSpendBorders = hasSpendWiseColor && !spendWiseInGroupCard;
    const spendWiseBorderFirst = useRowSpendBorders && effSpendTop && cn(
      "[&>td]:border-t-2 [&>td]:border-b-0 [&>td]:border-solid",
      swColor === "green" && "[&>td]:border-t-green-500 [&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td]:border-t-pink-500 [&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td]:border-t-blue-500 [&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l-2 [&>td:last-child]:border-r-2",
      "[&>td:first-child]:rounded-tl-xl [&>td:last-child]:rounded-tr-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
    );
    const spendWiseBorderMid = useRowSpendBorders && !effSpendTop && !effSpendBottom && isSpendWiseInGroup && cn(
      "[&>td]:border-t-0 [&>td]:border-b-0 [&>td]:border-solid",
      swColor === "green" && "[&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l-2 [&>td:last-child]:border-r-2"
    );
    const isMobileView = useIsMobile();
    const showCol = (key: string) => {
      // Mobile ledger rows: date column always visible rakho (desktop column-toggle se hide na ho).
      if (isMobileView && key === "date") return true;
      return visibleColumns == null || visibleColumns[key] !== false;
    };
    const { dateSystem, formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint } = useDate();
    const { effectiveNotificationSettings } = useCompany();
    const { user, customUser } = useAuth();
    const currentUserUid = user?.uid ?? null;
    const currentUserDisplayName = customUser?.displayName || user?.displayName || user?.email || null;
    const { can } = usePermissions();
    const isNote = context === "note";
    const { settings: animationSettings } = useAnimationSettings();
    const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
    const rawRowDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
    const rowAnimationDuration = rawRowDuration;
    const isNumberAnimationEnabled = animationSettings?.numbers?.enabled === true;
    const numberAnimationDuration = isNumberAnimationEnabled ? (animationSettings?.numbers?.duration ?? 2.5) : 0;

    const d = safeToDate(transaction.date);
    // Desktop table me bhi mobile card wali same entry-time priority dikhani hai: createdAt -> edited/updated -> voucher date.
    const entryClock = formatVoucherEntryTimeLocal(transaction as Record<string, unknown>);
    let debit = toLedgerAmount(transaction.debit);
    let credit = toLedgerAmount(transaction.credit);
    let balance = toLedgerAmount(transaction.balance);
    const spendWiseGroupBalance =
      typeof spendWiseRunningBalance === "number" ? spendWiseRunningBalance : null;
    if (typeof (transaction as any)._spendWiseLedgerRunningBalance === "number") {
      balance = Number((transaction as any)._spendWiseLedgerRunningBalance);
    } else if (typeof spendWiseRunningBalance === "number") {
      balance = spendWiseRunningBalance;
    }
    const spendWiseBlinkBalance = spendWiseGroupBalance ?? balance;
    const spendWiseLinkedAmount = (transaction as any)._spendWiseLinkedAmount;
    if (isSpendWiseChild && typeof spendWiseLinkedAmount === "number" && spendWiseLinkedAmount > 0) {
      const isOutflow = (transaction.type === "payment_out" || transaction.type === "direct_expense") || (Number(transaction.credit) > 0);
      if (isOutflow) {
        debit = 0;
        credit = spendWiseLinkedAmount;
      } else {
        debit = spendWiseLinkedAmount;
        credit = 0;
      }
    }
    if (context === "item" && stockView === "qty" && item) {
      const factor = getConversionFactor(item, displayUnit);
      debit = debit / factor;
      credit = credit / factor;
      balance = balance / factor;
    }

    // Blink animation: Dr/Cr/Balance numerals + Dr/Cr suffix only — not group border / full cell (see MainRow, no row-level animate).
    const activeBlinkModes = Array.isArray(blinkMode) ? blinkMode : [];
    const shouldBlinkByAll =
      activeBlinkModes.includes("all") &&
      isSpendWiseGroupLast &&
      hasSpendWiseColor &&
      spendWiseBlinkBalance !== 0 &&
      !isBalanceMasked;
    const shouldBlinkByGroup =
      activeBlinkModes.includes("group") &&
      isSpendWiseGroupLast &&
      hasSpendWiseColor &&
      spendWiseBlinkBalance !== 0 &&
      !isBalanceMasked &&
      (spendWiseGroupSize ?? 0) > 1;
    const shouldBlinkByRowMode =
      activeBlinkModes.includes("row") &&
      isSelectedRowBlink &&
      hasSpendWiseColor &&
      !isBalanceMasked;
    const shouldRowModeSameVoucherBlink =
      activeBlinkModes.includes("row") &&
      hasSpendWiseColor &&
      !isBalanceMasked &&
      (isRelatedBlink || isSelectedRowBlink);
    const isGroupBalanceNonZero = shouldBlinkByAll || shouldBlinkByGroup || shouldBlinkByRowMode;
    const shouldAnimateSpendWiseAmountText =
      isGroupBalanceNonZero ||
      shouldRowModeSameVoucherBlink ||
      ((isRelatedBlink || isSelectedRowBlink) && !isSelected);

    const formatAnimatedAmountText = (value: number) =>
      formatCurrencyForPrint(value, { noSuffix: true, context: "transaction" });

    const formatBalanceCell = (value: number) => {
      const isItemQty = context === "item" && stockView === "qty";
      if (isItemQty)
        return `${formatQuantity(value)} ${displayUnit || ""}`;
      const absValue = Math.abs(value);
      const suffix = value >= 0 ? "Dr" : "Cr";
      const formattedText = `${formatAnimatedAmountText(absValue)} ${suffix}`;
      return (
        <span className={cn("font-bold", value >= 0 ? "text-green-700" : "text-red-700")}>
          {isNumberAnimationEnabled && numberAnimationDuration > 0 ? (
            <AnimatedNumber
              value={absValue}
              duration={numberAnimationDuration}
              formatter={(n) => `${formatAnimatedAmountText(Math.abs(Number(n) || 0))} ${suffix}`}
            />
          ) : (
            formattedText
          )}
        </span>
      );
    };

    // Per-row outstanding: Dr amount (sale, payment_out) → Dr balance; Cr amount (payment_in, purchase) → Cr balance.
    const getOutstandingBalanceDisplay = () => {
      const out = Number((transaction as any).outstanding) || 0;
      const hasDrAmount = (Number(debit) || 0) > 0;
      const value = hasDrAmount ? out : -out;
      return formatBalanceCell(value);
    };

    /** Daybook search highlight: string pe column+global `hl`, `AnimatedNumber` jaisa ReactNode seedha */
    const renderHlDrCr = (formatted: React.ReactNode, columnKey: "debit" | "credit" | "balance") =>
      typeof formatted === "string" || typeof formatted === "number"
        ? hlForColumn(columnKey)(String(formatted))
        : formatted;

    // User column — recurring BS-month = Auto; "Auto" snapshot se IC/payment flicker na ho
    const displayName = resolveLedgerTransactionUserDisplayName(transaction, userNames, {
      currentUserUid,
      currentUserDisplayName,
    });
    const names = { ...journalAccountNames, ...userNames, ...(accountNames || {}) };
    const globalHlQ = String(textSearchHighlight ?? "").trim();
    const hlForColumn = (columnKey: string) => {
      const colQ = String((columnFilters && columnFilters[columnKey]) || "").trim();
      const q = [globalHlQ, colQ].filter(Boolean).join(" ");
      return (s: string) => (q ? (highlightQueryInText(s, q) as React.ReactNode) : s);
    };
    const hl = hlForColumn(""); // global only (narration / misc)
    const isItemPartyContext = context === "item" || (context === "group" && groupEntityType === "item");
    const shouldDisableAmountTextAnimation = (context === "daybook" && globalHlQ.length > 0) || (context === "item" && stockView === "qty");

    const formatAmountCell = (val: number) => {
      const n = toLedgerAmount(val);
      if (n === 0) return "-";
      if (context === "item" && stockView === "qty") {
        return `${formatQuantity(n)} ${displayUnit || ""}`;
      }
      if (!isNumberAnimationEnabled || numberAnimationDuration <= 0 || shouldDisableAmountTextAnimation) {
        return getDisplayValue(n);
      }
      return (
        <AnimatedNumber
          value={n}
          duration={numberAnimationDuration}
          formatter={(next) => formatAnimatedAmountText(Number(next) || 0)}
        />
      );
    };

    const isPeerPendingChange = isLedgerTransactionPeerPendingChange(
      transaction as { type?: string; interCompanyPeerPending?: unknown }
    );

    const mainRowContent = (
      <>
        {showCol("syncStatus") && (
          <TransactionSyncStatusCell
            transaction={transaction}
            ensureMinGaps={ensureMinGaps}
            syncInFlight={syncInFlight}
            onSyncNow={onSyncNow}
          />
        )}
        {showCol("date") &&
          (dateSystem === "Both" ? (
            <>
              <TableCell className={ensureMinGaps ? "min-w-[95px] px-[5px]" : undefined}>{d ? hlForColumn("date_bs")(formatDateBS(d)) : ""}</TableCell>
              <TableCell className={ensureMinGaps ? "min-w-[112px] px-[5px]" : undefined}>
                {d ? hlForColumn("date_ad")(formatDate(d)) : ""}
                {entryClock ? (
                  <span className="ml-1 whitespace-nowrap text-[10px] text-muted-foreground">• {hlForColumn("date_ad")(entryClock)}</span>
                ) : null}
              </TableCell>
            </>
          ) : (
            <TableCell className={ensureMinGaps ? "min-w-[112px] px-[5px]" : undefined}>
              {d ? hlForColumn("date")(dateSystem === "AD" ? formatDate(d) : formatDateBS(d)) : ""}
              {entryClock ? (
                <span className="ml-1 whitespace-nowrap text-[10px] text-muted-foreground">• {hlForColumn("date")(entryClock)}</span>
              ) : null}
            </TableCell>
          ))}
        {showCol("type") && (
          <TableCell
            className={cn(
              "align-middle overflow-hidden",
              ensureMinGaps &&
                (spendWiseInGroupCard ||
                isSpendWiseChild ||
                isSpendWiseGroupFirst ||
                typeof spendWiseGroupColorIndex === "number"
                  ? "min-w-[112px] px-[5px]"
                  : "min-w-[75px] px-[5px]")
            )}
          >
            <Badge
              variant="outline"
              className={cn(
                voucherTypePillClassName(
                  isNote || transaction.type === "note"
                    ? null
                    : resolveTxnDrCrSide(debit, credit, balance),
                  { interCompanyReversed: isInterCompanyReversedVoucher(transaction) }
                ),
                (spendWiseInGroupCard ||
                  isSpendWiseChild ||
                  isSpendWiseGroupFirst ||
                  typeof spendWiseGroupColorIndex === "number") &&
                  "max-w-full whitespace-nowrap"
              )}
            >
              {hlForColumn("type")(getDisplayType(transaction))}
            </Badge>
          </TableCell>
        )}
        {showCol("voucherNo") && (
          <TableCell className={ensureMinGaps ? "min-w-[105px] px-[5px]" : undefined}>
            <span className="inline-flex max-w-full flex-wrap items-center gap-1">
              <span className="min-w-0 truncate">
                {hlForColumn("voucherNumber")(getDisplayVoucherNumber(transaction))}
              </span>
              {isPeerPendingChange ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-blue-600/50 bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm dark:border-blue-400/50 dark:bg-blue-600"
                  title="Peer company saved changes — open voucher and use Change Detected to apply"
                >
                  Change Detected
                </span>
              ) : null}
            </span>
          </TableCell>
        )}
        {context === "daybook" && (
          <TableCell className="max-w-[260px] min-w-[210px] overflow-hidden">
            <span className="block truncate" title={getParticularsText(transaction, names)}>
              {hlForColumn("accounts")(getParticularsText(transaction, names))}
            </span>
          </TableCell>
        )}
        {/* Item + Item-group page: Party/Entity column should respect page-level show/hide toggle. */}
        {isItemPartyContext && showItemPartyColumn && (
          <TableCell className="max-w-[180px] truncate text-muted-foreground">
            {getOppositeAccountLabel(transaction, names, context, contextId, groupEntityType)}
          </TableCell>
        )}
        {showCol("user") && context !== "note" && (
          <TableCell
            className={cn(
              ensureMinGaps && "px-[5px]",
              !isMobileView && shouldShowAutoRecurringSwitchInLedgerUserCell(transaction)
                ? "min-w-[148px] max-w-[180px]"
                : "max-w-[150px] min-w-[120px] overflow-hidden",
            )}
          >
            {(() => {
              const showAutoRecurringSwitch = shouldShowAutoRecurringSwitchInLedgerUserCell(
                transaction,
                activeRecurringTriggerVoucherIds,
              );
              // PC / web / EXE table: Auto recurring ON → user name + switch (mobile = text only).
              if (!isMobileView && showAutoRecurringSwitch) {
                return (
                  <span
                    className="inline-flex max-w-full items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <span className="min-w-0 truncate" title={displayName}>{hlForColumn("user")(displayName)}</span>
                    <Switch
                      checked
                      disabled
                      aria-label="Auto recurring voucher"
                      className="shrink-0 origin-center scale-[0.72] border-2 border-green-600 data-[state=checked]:border-green-600 dark:border-green-500 dark:data-[state=checked]:border-green-500"
                    />
                  </span>
                );
              }
              return <span className="block truncate" title={displayName}>{hlForColumn("user")(displayName)}</span>;
            })()}
          </TableCell>
        )}
        {showFileColumn && (
          <TableCell className={cn("text-center", ensureMinGaps && "min-w-[44px] px-[5px]")} onClick={(e) => e.stopPropagation()}>
            {(() => {
              const rowUrls = getVoucherAttachmentUrlsForUi(transaction, voucherAttachmentUiOpts);
              if (rowUrls.length === 0) return "-";
              const indicator =
                fileShowAll && fileDisplayMode === "preview" ? (
                  <span className="inline-flex items-center gap-1">
                    {rowUrls.map((url, index) => (
                      <span key={`${url}:${index}`} data-attachment-index={index}>
                        <VoucherAttachmentFileIndicator
                          urls={[url]}
                          displayMode="preview"
                          aria-label={`Attachment ${index + 1}`}
                          companyId={company?.id}
                          voucherId={String(transaction.id || "")}
                          clientFileUrls={rowUrls}
                        />
                      </span>
                    ))}
                  </span>
                ) : (
                  <VoucherAttachmentFileIndicator
                    urls={rowUrls}
                    displayMode={fileDisplayMode}
                    aria-label="Has attachment"
                    companyId={company?.id}
                    voucherId={String(transaction.id || "")}
                    clientFileUrls={rowUrls}
                  />
                );
              // Files tick OFF: portal still opens local cache only (openAttachmentInApp — no download).
              const serverFb = company?.id
                ? {
                    companyId: company.id,
                    voucherId: String(transaction.id || ""),
                    clientFileUrls: rowUrls,
                  }
                : undefined;
              const singlePdfOpen =
                rowUrls.length === 1 && getAttachmentFormatLabel(rowUrls[0]!) === "PDF"
                  ? (e: React.MouseEvent<HTMLDivElement>) => {
                      e.stopPropagation();
                      void openAttachmentInApp(rowUrls[0]!, {
                        kind: "pdf",
                        localLedgerOnly,
                        serverFallback: serverFb,
                        gateCompany: company,
                      });
                    }
                  : undefined;
              return (
                <AttachmentHoverPortal
                  triggerClassName="inline-flex cursor-pointer"
                  onPreviewDoubleClick={singlePdfOpen}
                  galleryUrls={rowUrls.length > 1 ? rowUrls : undefined}
                  preview={
                    <StableAttachmentPortalPreview
                      urls={rowUrls}
                      companyId={company?.id}
                      voucherId={String(transaction.id || "")}
                    />
                  }
                >
                  {indicator}
                </AttachmentHoverPortal>
              );
            })()}
          </TableCell>
        )}
        {showCol("dr") && (
          <TableCell className={cn("text-right text-green-600", ensureMinGaps && "min-w-[100px] px-[5px]")}>
            {renderHlDrCr(formatAmountCell(debit), "debit")}
          </TableCell>
        )}
        {showCol("cr") && (
          <TableCell className={cn("text-right text-red-600", ensureMinGaps && "min-w-[100px] px-[5px]")}>
            {renderHlDrCr(formatAmountCell(credit), "credit")}
          </TableCell>
        )}
        {showCol("status") && !hideStatusColumn &&
          (() => {
            const isDashboardAddSalary =
              context === "daybook" &&
              transaction.type === "journal" &&
              transaction.subType === "add_salary";
            const statusLabel = isDashboardAddSalary ? "Salary" : getStatusLabel(transaction, context);
            const useNeutralBadge = ["Journal", "Note", "Contra", "Salary"].includes(statusLabel);
            const paidByLabel = statusLabel === "Paid";
            const unpaidByLabel = statusLabel === "Partial" || statusLabel === "Unpaid";
            const statusDetailText = getStatusDetail(transaction, { billWiseOnly: statusBillWiseOnly });
            // Keep status voucher-link text tied to the shared "Show Narration" toggle.
            const showStatusDetailText = showNarration && !!statusDetailText;
            // Keep status pill vertically stable by moving voucher-link detail to narration row.
            const showStatusDetailUnderBadge = false;
            const isOverdueRow = statusLabel === "Overdue" || (transaction as any).isOverdue || (transaction as any).paymentStatus === "overdue";
            const overdueDays = isOverdueRow ? getOverdueDays(transaction) : 0;
            // Keep status badge vertically centered like amount cells in every view.
            return (
              <TableCell className={cn("text-center align-middle", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                {/* In bill-wise mode, switch to vertical stack only when detail text is visible. */}
                <div className={cn("flex min-h-6 items-center justify-center gap-[1px] leading-tight", (!isBillWise || showStatusDetailUnderBadge) && "flex-col")}>
                  <Badge
                    variant="outline"
                    className={cn(
                      // Keep status pill dimensions aligned with Type pill so it doesn't touch row lines.
                      "inline-flex h-6 items-center rounded-xl px-2.5 font-medium leading-none shrink-0",
                      useNeutralBadge
                        ? "text-muted-foreground border-muted-foreground/40"
                        : paidByLabel || (transaction as any).paymentStatus === "paid"
                          ? "text-green-600 border-green-600/50"
                          : unpaidByLabel ||
                              (transaction as any).paymentStatus === "unpaid" ||
                              (transaction as any).paymentStatus === "partially_paid" ||
                              (transaction as any).isOverdue ||
                              (transaction as any).paymentStatus === "overdue"
                            ? "text-red-600 border-red-600/50"
                            : "text-muted-foreground"
                    )}
                  >
                    {hlForColumn("status")(statusLabel || "-")}
                  </Badge>
                  {showStatusDetailUnderBadge && (
                    // Keep status voucher-detail text pure black as requested.
                    <span className="text-[10px] text-black">{statusDetailText}</span>
                  )}
                  {/* When narration is hidden, keep overdue hint under status badge. */}
                  {!showNarration && !isBillWise && isOverdueRow && overdueDays > 0 && (
                    <span className="text-[10px] text-red-600 font-medium">
                      {hlForColumn("status")(`${overdueDays} ${overdueDays === 1 ? "day" : "days"}`)}
                    </span>
                  )}
                </div>
              </TableCell>
            );
          })()}
        {showCol("runningBalance") && !hideBalanceColumn &&
          (() => {
            const out = Number((transaction as any).outstanding) || 0;
            const hasDrAmount = (Number(debit) || 0) > 0;
            const isStaffPaymentOut = (context === "staff" || context === "group") && (transaction.type === "payment_out" || transaction.type === "direct_expense");
            // In bill-wise mode, normal journals should reflect linkable remaining amount on the same row (per-row closing balance).
            const isJournalWithOutstanding =
              transaction.type === "journal" &&
              (transaction as any).subType !== "add_salary" &&
              (transaction as any).outstanding != null;
            const journalOutstandingSigned = isJournalWithOutstanding ? (debit > 0 ? out : -out) : 0;
            // When useOutstandingForBalance: Dr amount → Dr balance, Cr amount → Cr balance (match amount column).
            const displayValue =
              useOutstandingForBalance && isJournalWithOutstanding
                ? journalOutstandingSigned
                : useOutstandingForBalance
                ? (isTaxContext ? (hasDrAmount ? out : -out) : (isStaffPaymentOut ? out : (hasDrAmount ? out : -out)))
                : balance;
            // When balance/outstanding is 0 show "Settled" (running balance and bill-wise both)
            const valueToShow = useOutstandingForBalance ? displayValue : balance;
            const isZeroBalance = !isBalanceMasked && (typeof valueToShow === "number" && Math.abs(valueToShow) < 1e-6);
            return (
              <TableCell
                className={cn(
                  "text-right font-semibold",
                  isZeroBalance ? "text-green-600" : (displayValue >= 0 ? "text-green-600" : "text-red-600"),
                  ensureMinGaps && "min-w-[115px] px-[5px]"
                )}
                {...(isZeroBalance ? { "data-cell-settled": "true" } : {})}
              >
                {isBalanceMasked ? (
                  "*****"
                ) : isZeroBalance ? (
                  <span
                    className={cn(
                      "font-bold text-green-700",
                      shouldAnimateSpendWiseAmountText && "animate-spend-wise-balance-blink"
                    )}
                  >
                    Settled
                  </span>
                ) : (
                  <span
                    className={cn(
                      "inline",
                      shouldAnimateSpendWiseAmountText && !isZeroBalance && "animate-spend-wise-balance-blink"
                    )}
                  >
                    {renderHlDrCr(
                      useOutstandingForBalance ? formatBalanceCell(displayValue) : formatBalanceCell(balance),
                      "balance"
                    )}
                  </span>
                )}
              </TableCell>
            );
          })()}
        <TableCell
          className="w-11 min-w-[44px] p-1 text-center align-middle"
          data-pl-txn-row-menu=""
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-pl-txn-icon-btn=""
                data-pl-txn-row-menu-trigger=""
                className={cn(txnTableIconBtnCn, "h-8 w-8 shrink-0")}
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {showSpendWiseGroupMenuActions ? (
                <>
                  <DropdownMenuItem
                    onClick={() => onRowSelect?.(transaction)}
                    className="flex items-center gap-2"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    Select
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onPrintRow?.()} className="flex items-center gap-2">
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </DropdownMenuItem>
                </>
              ) : null}
              {/* Add Link action intentionally removed from 3-dot menu as per latest UX requirement. */}
              {can("approve_transactions") &&
                effectiveNotificationSettings?.approve?.on !== false &&
                effectiveNotificationSettings?.approve?.onTransaction !== false &&
                (transaction as any).isApproved !== true && (
                  <DropdownMenuItem onClick={() => onApproveVoucher?.(transaction)} className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Approve
                  </DropdownMenuItem>
                )}
              {can("approve_transactions") &&
                effectiveNotificationSettings?.approve?.on !== false &&
                effectiveNotificationSettings?.approve?.onTransaction !== false &&
                showApproveAll &&
                onApproveAllVisible && (
                  <DropdownMenuItem onClick={() => onApproveAllVisible()} className="flex items-center gap-2">
                    <CheckCheck className="h-3.5 w-3.5" />
                    Approve All
                  </DropdownMenuItem>
                )}
              {(() => {
                const icViewOnly = isInterCompanyVoucherEditDeleteBlocked(transaction as Record<string, unknown>);
                return (
                  <DropdownMenuItem onClick={() => onRowClick?.(transaction)} className="flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5" />
                    {icViewOnly ? "View" : "Edit"}
                  </DropdownMenuItem>
                );
              })()}
              {can('view_voucher_history') && onHistoryVoucher && (
                <DropdownMenuItem onClick={() => onHistoryVoucher?.(transaction)} className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  History
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </>
    );

    const isPaid = (transaction as any).paymentStatus === "paid";
    const isPendingApproval = highlightPendingApproval && isLedgerTransactionUnapproved(transaction as { isApproved?: boolean; type?: string; id?: string });
    // Peer change-detect blue wins over unapproved pink when both present
    const showPendingApprovalPink = isPendingApproval && !isPeerPendingChange;
    const narrationText =
      transaction.type === "note" ? transaction.title : transaction.narration;
    const narrationLabel = transaction.type === "note" ? "Title" : "Narration";
    const dateCols = dateSystem === "Both" ? 2 : 1;
    const colsThroughCredit =
      visibleColumns == null
        ? (showCol("syncStatus") ? 1 : 0) + dateCols + 1 + 1 + (context === "daybook" ? 1 : 0) + (isItemPartyContext && showItemPartyColumn ? 1 : 0) + (context !== "note" ? 1 : 0) + (showFileColumn ? 1 : 0) + 1 + 1
        : (showCol("syncStatus") ? 1 : 0) +
          (showCol("date") ? dateCols : 0) +
          (showCol("type") ? 1 : 0) +
          (showCol("voucherNo") ? 1 : 0) +
          (context === "daybook" ? 1 : 0) +
          (isItemPartyContext && showItemPartyColumn ? 1 : 0) +
          (showCol("user") && context !== "note" ? 1 : 0) +
          (showFileColumn ? 1 : 0) +
          (showCol("dr") ? 1 : 0) +
          (showCol("cr") ? 1 : 0);
    const statusDetailText = getStatusDetail(transaction, { billWiseOnly: statusBillWiseOnly });
    const showNarrationRow =
      showNarration &&
      (narrationText || (showCol("status") && !hideStatusColumn && statusDetailText));
    const spendWiseBorderLast = useRowSpendBorders && effSpendBottom && !showNarrationRow && cn(
      "[&>td]:border-b-2 [&>td]:border-solid [&>td]:pb-1",
      !effSpendTop && "[&>td]:border-t-0",
      swColor === "green" && "[&>td]:border-b-green-500 [&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td]:border-b-pink-500 [&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td]:border-b-blue-500 [&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l-2 [&>td:last-child]:border-r-2",
      "[&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-br-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
    );
    const spendWiseBorderLastNarr = useRowSpendBorders && effSpendBottom && showNarrationRow && cn(
      "[&>td]:border-b-0 [&>td]:border-solid",
      !effSpendTop && "[&>td]:border-t-0",
      swColor === "green" && "[&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l-2 [&>td:last-child]:border-r-2"
    );
    // Keep narration row width identical to data rows in every mode; status/running/actions are rendered as separate cells.
    const narrationColSpan = colsThroughCredit;

    const inSpendWiseGroup = hasSpendWiseColor && (isSpendWiseGroupFirst || isSpendWiseGroupLast || isSpendWiseChild);
    /** Spend-wise row type: inflow (payment in / direct income / contra in) = green bg; outflow (payment out / direct expense / contra out) = dim white, smaller text, 30px left gap */
    const isSpendWiseInflowRow = inSpendWiseGroup && (
      transaction.type === "payment_in" ||
      transaction.type === "direct_income" ||
      (transaction.type === "contra" && context === "account" && contextId && transaction.toAccountId === contextId) ||
      (transaction.type === "contra" && (transaction.debit ?? 0) > 0) // Contra In (debit) = inflow, green on both details and group page
    );
    const isSpendWiseOutflowRow = inSpendWiseGroup && (
      transaction.type === "payment_out" ||
      transaction.type === "direct_expense" ||
      (transaction.type === "contra" && context === "account" && contextId && transaction.fromAccountId === contextId)
    );
    /** In group details (context "group") contra child rows are not classified as outflow (no single account contextId), so give them 30px indent by treating any non-inflow child as indent-worthy. */
    /** Bank group: standalone out Cr rows (payment_out, direct_expense, contra with credit) also get left indent like PYMT row. */
    const spendWiseGroupStandaloneOutflow =
      context === "group" &&
      (isSpendWiseGroupFirst && isSpendWiseGroupLast) &&
      (transaction.type === "payment_out" ||
        transaction.type === "direct_expense" ||
        (transaction.type === "contra" && (transaction.credit ?? 0) > 0));
    const spendWiseChildNeedsIndent =
      isSpendWiseOutflowRow || (context === "group" && isSpendWiseChild && !isSpendWiseInflowRow) || spendWiseGroupStandaloneOutflow;
    /** Extra gap below last row of each group so containers don't touch during layout animation */
    const groupGapBottom = "[&>td]:pb-3";
    // Page split: effSpendBottom = visible “close” of group box (no next page) — padding/border matches that, not only logical last.
    const spendWiseMainInset = inSpendWiseGroup && cn(
      spendWiseChildNeedsIndent ? "[&>td:first-child]:pl-[30px]" : "[&>td:first-child]:pl-[6px]",
      "[&>td:last-child]:pr-[6px]",
      isSpendWiseGroupFirst && "[&>td]:pt-[6px]",
      effSpendBottom && !showNarrationRow && cn("[&>td]:pb-[6px]", groupGapBottom),
      !isSpendWiseGroupFirst && "[&>td]:pt-[3px]"
    );
    const spendWiseNarrInset = inSpendWiseGroup && cn(
      spendWiseChildNeedsIndent ? "[&>td:first-child]:pl-[30px]" : "[&>td:first-child]:pl-[6px]",
      "[&>td:last-child]:pr-[6px]",
      effSpendBottom && cn("[&>td]:pb-[6px]", groupGapBottom),
      !effSpendBottom && "[&>td]:pb-[3px]"
    );

    const rowExitTransition = isRowAnimationEnabled && animateLayout
      ? { transition: { duration: rowAnimationDuration, ease: "easeInOut" as const } }
      : { transition: { duration: 0 } };
    const txnStripeMod =
      typeof txnStripeIndex === "number" ? txnStripeIndex % 2 : null;
    const txnStripeAttr = txnStripeMod !== null ? String(txnStripeMod) : undefined;
    /* Spend-wise / pending / selected par apna rang — sirf normal rows par gray-white alternate */
    const txnStripeBgClass =
      txnStripeMod === null || isSelected || isCheckModeMarked || (highlightPendingApproval && isPendingApproval) || isPeerPendingChange || hasSpendWiseColor
        ? ""
        : txnStripeMod === 0
          ? "[&>td]:!bg-muted/50"
          : "[&>td]:!bg-card";
    /* Check mode: marked = green bg; focused (selected) row par orange border bhi rahe */
    const txnRowSelectedChrome = isSelected;
    /* Spend-wise: theme CSS ko group color / inflow-outflow tint batane ke liye data attrs */
    const spendWiseEdgeAttr = hasSpendWiseColor
      ? [effSpendTop ? "top" : "", effSpendBottom ? "bottom" : "", !effSpendTop && !effSpendBottom && isSpendWiseInGroup ? "mid" : ""]
          .filter(Boolean)
          .join(" ") || undefined
      : undefined;
    const MainRow = (
      <motion.tr
        layout={animateLayout ? "position" : false}
        initial={false}
        exit={rowExitTransition}
        transition={
          isRowAnimationEnabled && animateLayout
            ? { duration: rowAnimationDuration, ease: "easeInOut" }
            : { duration: 0 }
        }
        style={isRowAnimationEnabled && animateLayout ? { isolation: "isolate", willChange: "transform" } : undefined}
        onClick={() => onRowSelect?.(transaction)}
        onDoubleClick={() => onRowClick?.(transaction)}
        data-txn-stripe={txnStripeAttr}
        /* Theme stripe rules (globals.css) se bachne + pink !important target */
        data-pl-pending-approval={showPendingApprovalPink ? "" : undefined}
        data-pl-peer-pending={isPeerPendingChange ? "" : undefined}
        /* globals.css [data-pl-txn-selected] — theme stripe/bg par orange box dikhe */
        ref={mainRowRef}
        onMouseEnter={onPairHoverEnter}
        onMouseLeave={clearPairHoverIfLeavingBlock}
        data-pl-txn-hovered={pairHovered ? "" : undefined}
        data-pl-txn-selected={txnRowSelectedChrome ? "" : undefined}
        data-pl-check-marked={isCheckModeMarked ? "" : undefined}
        data-check-focus={isCheckModeFocused ? "true" : undefined}
        data-pl-spend-wise-group={useRowSpendBorders ? swColor : undefined}
        data-pl-spend-edge={useRowSpendBorders ? spendWiseEdgeAttr : undefined}
        data-pl-spend-in-group-card={spendWiseInGroupCard ? "" : undefined}
        data-pl-spend-wise-inflow={isSpendWiseInflowRow ? "" : undefined}
        data-pl-spend-wise-outflow={
          isSpendWiseOutflowRow || spendWiseGroupStandaloneOutflow ? "" : undefined
        }
        className={cn(
          "transaction-main-row min-h-[28px] cursor-pointer",
          txnStripeBgClass,
          isSpendWiseChild && "pl-6 text-sm [&>td]:py-1",
          isSpendWiseChild && !isSelected && !isSpendWiseInflowRow && !isSpendWiseOutflowRow && !spendWiseChildNeedsIndent && "bg-muted/20 [&>td]:bg-muted/20",
          isSpendWiseInflowRow && !isSelected && "bg-green-100 dark:bg-green-900/30 [&>td]:bg-green-100 [&>td]:dark:bg-green-900/30 hover:bg-green-200 [&>td]:hover:bg-green-200 [&>td]:dark:hover:bg-green-900/40",
          (isSpendWiseOutflowRow || (context === "group" && isSpendWiseChild && !isSpendWiseInflowRow) || spendWiseGroupStandaloneOutflow) && !isSelected && "bg-gray-50 dark:bg-gray-900/20 [&>td]:bg-gray-50 [&>td]:dark:bg-gray-900/20 [&>td]:text-xs",
          spendWiseMainInset,
          spendWiseBorderFirst,
          spendWiseBorderLast,
          spendWiseBorderLastNarr,
          spendWiseBorderMid,
          isNote && !isSelected && "bg-amber-50 [&>td]:bg-amber-50 hover:bg-amber-100 [&>td]:hover:bg-amber-100",
          isPaid && !isSelected && "opacity-75 bg-muted/20 [&>td]:bg-muted/20",
          /* Statement / non–spend-wise: full pink band — bank, item, tax, reports, etc. */
          showPendingApprovalPink && !isSelected && !inSpendWiseGroup &&
            "bg-pink-100 dark:bg-pink-950/40 [&>td]:bg-pink-100 [&>td]:dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50 [&>td]:hover:bg-pink-200 [&>td]:dark:hover:bg-pink-950/50 outline outline-1 outline-black/30 dark:outline-white/30 outline-offset-0",
          /* Spend-wise group: green/gray pe bhi unapproved dikhe — tint override + ring */
          showPendingApprovalPink && !isSelected && inSpendWiseGroup &&
            "[&>td]:!bg-pink-100/90 dark:[&>td]:!bg-pink-950/45 [&>td]:hover:!bg-pink-200/95 dark:hover:[&>td]:!bg-pink-950/55 ring-2 ring-inset ring-pink-500/45 dark:ring-pink-400/35",
          isPeerPendingChange && !isSelected && !inSpendWiseGroup &&
            "bg-blue-100 dark:bg-blue-950/40 [&>td]:bg-blue-100 [&>td]:dark:bg-blue-950/40 hover:bg-blue-200 dark:hover:bg-blue-950/50 [&>td]:hover:bg-blue-200 [&>td]:dark:hover:bg-blue-950/50 outline outline-1 outline-black/30 dark:outline-white/30 outline-offset-0",
          isPeerPendingChange && !isSelected && inSpendWiseGroup &&
            "[&>td]:!bg-blue-100/90 dark:[&>td]:!bg-blue-950/45 [&>td]:hover:!bg-blue-200/95 dark:hover:[&>td]:!bg-blue-950/55 ring-2 ring-inset ring-blue-500/45 dark:ring-blue-400/35",
          txnRowSelectedChrome && txnSelectedMainRowCn(showNarrationRow),
          // Spend-wise blink: animation on Dr/Cr/Balance text only (see shouldAnimateSpendWiseAmountText), not on tr/border.
          // Keep transaction row compact when narration is visible (override default TableCell p-1).
          showNarrationRow && "[&>td]:pt-0.5 [&>td]:pb-0",
          /* No narration: bottom padding so separator stays visible (not covered by next row chrome) */
          !showNarrationRow && "[&>td]:pb-1",
          showNarration &&
            (narrationText || (!hideStatusColumn && getStatusDetail(transaction, { billWiseOnly: statusBillWiseOnly })))
            ? "border-b-0"
            : (isSpendWiseGroupFirst || isSpendWiseChild || isSpendWiseGroupLast)
              ? "border-b-0"
              : "border-b",
          // Spend-wise pill: main↔narration ke beech line mat; statement rows par black divider.
          !inSpendWiseGroup && "border-black",
          inSpendWiseGroup && showNarrationRow && "[&>td]:border-b-0"
        )}
      >
        {mainRowContent}
      </motion.tr>
    );

    const isOverdueForSubRow = (() => {
      const lbl = getStatusLabel(transaction, context);
      return lbl === "Overdue" || (transaction as any).isOverdue || (transaction as any).paymentStatus === "overdue";
    })();
    const overdueDaysForSubRow = isOverdueForSubRow ? getOverdueDays(transaction) : 0;
    // Keep voucher-link + overdue helper beside narration in same row.
    const statusDetailVouchers = getStatusDetailVouchers(transaction, { billWiseOnly: statusBillWiseOnly });
    const overdueSubText = showNarration && overdueDaysForSubRow > 0 ? `${overdueDaysForSubRow} day${overdueDaysForSubRow === 1 ? "" : "s"}` : "";
    const NarrationRow = showNarrationRow ? (
      <motion.tr
        layout={animateLayout ? "position" : false}
        initial={false}
        exit={rowExitTransition}
        transition={
          isRowAnimationEnabled && animateLayout
            ? { duration: rowAnimationDuration, ease: "easeInOut" }
            : { duration: 0 }
        }
        style={isRowAnimationEnabled && animateLayout ? { isolation: "isolate", willChange: "transform" } : undefined}
        role="button"
        tabIndex={-1}
        ref={narrRowRef}
        onMouseEnter={onPairHoverEnter}
        onMouseLeave={clearPairHoverIfLeavingBlock}
        onClick={() => onRowSelect?.(transaction)}
        onDoubleClick={() => onRowClick?.(transaction)}
        data-txn-stripe={txnStripeAttr}
        data-pl-pending-approval={showPendingApprovalPink ? "" : undefined}
        data-pl-peer-pending={isPeerPendingChange ? "" : undefined}
        data-pl-txn-hovered={pairHovered ? "" : undefined}
        data-pl-txn-selected={txnRowSelectedChrome ? "" : undefined}
        data-pl-check-marked={isCheckModeMarked ? "" : undefined}
        data-pl-spend-wise-group={useRowSpendBorders ? swColor : undefined}
        data-pl-spend-edge={useRowSpendBorders ? spendWiseEdgeAttr : undefined}
        data-pl-spend-in-group-card={spendWiseInGroupCard ? "" : undefined}
        data-pl-spend-wise-inflow={isSpendWiseInflowRow ? "" : undefined}
        data-pl-spend-wise-outflow={
          isSpendWiseOutflowRow || spendWiseGroupStandaloneOutflow ? "" : undefined
        }
        className={cn(
          "narration-row cursor-pointer",
          !spendWiseInGroupCard && "border-b",
          txnStripeBgClass,
          /* Sirf neeche horizontal line — left/right vertical border mat ([&>td]:border-black se side line aa jati thi) */
          !inSpendWiseGroup && "border-b border-black [&>td]:border-x-0 [&>td]:border-t-0 [&>td]:border-b-0",
          isBillWise && "-mt-1.5",
          spendWiseNarrInset,
          /* Group card: narration par upar ki line mat (txn + narration ek block) */
          spendWiseInGroupCard && "[&>td]:border-t-0 [&>td]:border-b-0",
          effSpendBottom && !spendWiseInGroupCard && cn(
            "[&>td]:border-b-2 [&>td]:border-t-0 [&>td]:border-solid [&>td]:pb-0.5",
            swColor === "green" && "[&>td]:border-b-green-500 [&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
            swColor === "pink" && "[&>td]:border-b-pink-500 [&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
            swColor === "blue" && "[&>td]:border-b-blue-500 [&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
            "[&>td:first-child]:border-l-2 [&>td:last-child]:border-r-2",
            "[&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-br-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
          ),
          /* Side borders sirf main row par — narration par dubara mat (beech line hat jati hai) */
          showPendingApprovalPink && !isSelected && !inSpendWiseGroup &&
            "bg-pink-100 dark:bg-pink-950/40 [&>td]:bg-pink-100 [&>td]:dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50 [&>td]:hover:bg-pink-200 [&>td]:dark:hover:bg-pink-950/50",
          showPendingApprovalPink && !isSelected && inSpendWiseGroup &&
            "[&>td]:!bg-pink-100/90 dark:[&>td]:!bg-pink-950/45 [&>td]:hover:!bg-pink-200/95 ring-2 ring-inset ring-pink-500/40 dark:ring-pink-400/30",
          isPeerPendingChange && !isSelected && !inSpendWiseGroup &&
            "bg-blue-100 dark:bg-blue-950/40 [&>td]:bg-blue-100 [&>td]:dark:bg-blue-950/40 hover:bg-blue-200 dark:hover:bg-blue-950/50 [&>td]:hover:bg-blue-200 [&>td]:dark:hover:bg-blue-950/50",
          isPeerPendingChange && !isSelected && inSpendWiseGroup &&
            "[&>td]:!bg-blue-100/90 dark:[&>td]:!bg-blue-950/45 [&>td]:hover:!bg-blue-200/95 ring-2 ring-inset ring-blue-500/40 dark:ring-blue-400/30",
          txnRowSelectedChrome
            ? txnSelectedNarrationRowCn()
            : isSpendWiseChild && !isSpendWiseInflowRow && !isSpendWiseOutflowRow && !spendWiseChildNeedsIndent && "bg-muted/20 [&>td]:bg-muted/20",
          isSpendWiseInflowRow && !isSelected && "bg-green-100 dark:bg-green-900/30 [&>td]:bg-green-100 [&>td]:dark:bg-green-900/30 hover:bg-green-200 [&>td]:hover:bg-green-200 [&>td]:dark:hover:bg-green-900/40",
          (isSpendWiseOutflowRow || (context === "group" && isSpendWiseChild && !isSpendWiseInflowRow) || spendWiseGroupStandaloneOutflow) && !isSelected && "bg-gray-50 dark:bg-gray-900/20 [&>td]:bg-gray-50 [&>td]:dark:bg-gray-900/20 [&>td]:text-xs",
          isNote && !isSelected && "bg-amber-50 hover:bg-amber-100 [&>td]:bg-amber-50 [&>td]:hover:bg-amber-100",
          isPaid && !isSelected && "opacity-75 bg-muted/20 [&>td]:bg-muted/20",
          !isSelected && !showPendingApprovalPink && !isPeerPendingChange && !isSpendWiseChild && !isNote && !isPaid && "hover:bg-muted/20 [&>td]:hover:bg-muted/20",
          // Avoid extra bottom expansion in sub-row; we only want a small top gap.
          "md:[&>td]:pb-0"
        )}
      >
        <TableCell
          colSpan={narrationColSpan}
          className={cn(
            "px-3 text-[11px] italic leading-tight align-top whitespace-normal break-words w-full min-w-0 overflow-hidden",
            // Keep narration text pure black in all row states.
            "text-black",
            // Keep narration text exactly 2px below the main transaction row.
            isBillWise ? "pt-[1px] pb-0" : "pt-[1px] pb-0",
            inSpendWiseGroup && "pr-[10px]"
          )}
        >
          {narrationText ? (
            <span className="block min-w-0 overflow-hidden break-words font-normal" style={{ overflowWrap: "anywhere" }}>
              <span className="not-italic">{narrationLabel}:</span> {hl(String(narrationText))}
            </span>
          ) : null}
        </TableCell>
        {/* Bill-wise: linked vouchers Status se Balance tak wrap (print jaisa); spend-wise: sirf Status column. */}
        {isBillWise ? (
          <BillWiseLinkedDetailCells
            vouchers={statusDetailVouchers}
            overdueText={overdueSubText ? hl(overdueSubText) : undefined}
            billWisePink
            showStatus={showCol("status")}
            hideStatusColumn={hideStatusColumn}
            showBalance={showCol("runningBalance")}
            hideBalanceColumn={hideBalanceColumn}
            ensureMinGaps={ensureMinGaps}
          />
        ) : (
          <>
            {showCol("status") && !hideStatusColumn && (
              <TableCell
                className={cn(
                  "text-center text-[10px] leading-tight align-top py-0 text-black",
                  isOverdueForSubRow && overdueDaysForSubRow > 0 && "font-medium",
                  ensureMinGaps && "min-w-[95px] px-[5px]"
                )}
              >
                <div className="flex flex-col items-center gap-[1px]">
                  <LinkedVouchersColored vouchers={statusDetailVouchers} align="center" billWisePink={isBillWise} />
                  {overdueSubText ? (
                    <span className="block font-medium text-red-600">{hl(overdueSubText)}</span>
                  ) : null}
                </div>
              </TableCell>
            )}
            {showCol("runningBalance") && !hideBalanceColumn && (
              <TableCell className={cn("text-right", ensureMinGaps && "min-w-[115px] px-[5px]")} />
            )}
          </>
        )}
        <TableCell className="w-10 p-0" />
      </motion.tr>
    ) : null;

    return (
      <>
        {MainRow}
        {NarrationRow}
      </>
    );
  }
);
TransactionRow.displayName = "TransactionRow";
