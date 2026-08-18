"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { cn } from "@/lib/utils";
import type { StockView, Item } from "@/components/items/types";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Filter, MoreVertical, CheckSquare, MousePointerClick, Printer, Pencil, X, CheckCircle, CheckCheck } from "lucide-react";
import { txnTableIconBtnCn } from "@/lib/listSelectionChrome";
import { scrollTransactionSelectedRowIntoView } from "@/lib/ledgerScrollToSelection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { Virtuoso } from "react-virtuoso";
import { VoucherTypeFilter } from "@/components/vouchers/VoucherTypeFilter";
import {
  type Context,
  type Transaction,
  TransactionRow,
  MobileTransactionFilePreview,
  OpeningBalanceFileCellContent,
  getConversionFactor,
  formatQuantity,
  getOppositeAccountLabel,
  getParticularsText,
  getDisplayType,
  getStatusLabel,
  getStatusDetail,
  getStatusDetailVouchers,
  LinkedVouchersColored,
  BillWiseLinkedDetailCells,
  voucherTypePillClassName,
  type FileColumnDisplayMode,
  type TxnDrCrSide,
} from "./transactionTableShared";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card } from "@/components/ui/card";
import { differenceInDays, format, startOfDay } from "date-fns";
import {
  formatVoucherEntryTimeLocal,
  parseFirestoreDateFieldToJsDate,
  parseOpeningBalanceDateToLocalNoon,
} from "@/lib/voucherDateNormalize";
import { flushVoucherOutbox, listPendingOutboxDocIdsForCompany } from "@/lib/localVoucherOutbox";
import { mirrorVoucherDocToBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT,
  isFirebaseLedgerDataSyncDisabled,
} from "@/lib/firebaseLedgerDataSyncDisabled";
import { SPEND_WISE_OPENING_GROUP_ID } from "@/lib/spendWiseDateRangeGroups";
import { resolveSpendWiseRowBaseVoucherId } from "@/lib/spendWisePagination";
import { useCompany } from "@/hooks/useCompany";
import type { SpendWiseBlinkMode } from "@/components/vouchers/transactionColumnVisibility";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import usePermissions from "@/hooks/usePermissions";
import { approveVoucherWithHistory, approveVouchersWithHistoryBatch } from "@/lib/voucherActionsClient";
import { clearLedgerVouchersLocallyApproved, isLedgerTransactionUnapproved } from "@/lib/ledgerPendingApproval";
import { dispatchVoucherLivePatch, dispatchVoucherLivePatchMany } from "@/lib/voucherFormAttachmentSave";
import {
  insertFiscalPartitionRows,
  getFiscalMergePartitionDateFromCompany,
  FISCAL_YEAR_PARTITION_ROW_TYPE,
} from "@/lib/fiscalPartitionRows";
import { buildFiscalMergePartitionBannerLabel } from "@/lib/fiscalYearLabel";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { resolveLedgerTransactionUserDisplayName } from "@/lib/ledgerUserColumnDisplay";
import {
  prewarmHoverPreviewHttpsUrls,
  prewarmVisibleAttachmentRefsForInstantOpen,
} from "@/components/vouchers/attachmentHoverPreviewBody";
import { updateAttachmentPrefetchPriorityFromVisibleRows } from "@/lib/attachmentPrefetchPriorityBuffer";
import {
  isOnlineCompanyAttachmentFilesTickEnabled,
  setVisiblePageAttachmentUrls,
} from "@/lib/attachmentNetworkGate";
import { FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT } from "@/lib/firebaseLedgerCompanySyncPrefs";
import { shouldSkipVisibleRowFullIdlePrewarmOnWeb } from "@/lib/webAttachmentLazyLoadPolicy";
import { getVoucherAttachmentUrlsForUi, voucherAttachmentUiOptionsForCompany } from "@/lib/voucherAttachmentNormalize";
import { publishVoucherAttachmentListReuseIndex } from "@/lib/voucherAttachmentListReuseIndex";
import { statementCheckTxnId } from "@/lib/statementCheckModeStorage";
import {
  type LedgerTxnTableTone,
  readLedgerTxnTableTone,
  writeLedgerTxnTableTone,
  LEDGER_TXN_TABLE_TONE_CHANGED_EVENT,
} from "@/lib/ledgerTxnTableTone";
import { chromeProPillCn, chromePillActive } from "@/lib/chromePillButton";
import { stripSpendWiseSyntheticOpeningMaster } from "@/lib/ledgerPagePrint";
import {
  BOOK_OB_EPS as SHARED_BOOK_OB_EPS,
  isMasterOpeningDateInLedgerQueryRange as isMasterOpeningDateInLedgerQueryRangeShared,
  shouldStackBookOpeningAboveDatedRow,
} from "@/lib/ledgerOpeningBalanceDisplay";
import {
  extractSpendWiseGroupTransactions,
  printSpendWiseGroupTransactions,
  type SpendWiseGroupPrintConfig,
} from "@/lib/spendWiseGroupPrint";

export type { Context, Transaction };

export type TransactionColumnKey = "syncStatus" | "date" | "type" | "voucherNo" | "user" | "file" | "dr" | "cr" | "status" | "runningBalance";
export type VisibleColumns = Partial<Record<TransactionColumnKey, boolean>>;

export { TransactionRow, getConversionFactor, formatQuantity };

/** Spend-wise table-fixed: type pill ("direct expense") — 75px par voucher no overlap hota tha. */
const SPEND_WISE_TYPE_COL_PX = 112;
const TXN_FILE_COLUMN_VIEW_PREF_KEY = "pocket-ledger:transactions:file-column-view:v1";

function readSavedFileColumnViewPrefs(): {
  displayMode: FileColumnDisplayMode;
  showAll: boolean;
  filterMode: "all" | "with" | "without";
} {
  if (typeof window === "undefined") return { displayMode: "preview", showAll: false, filterMode: "all" };
  try {
    const raw = window.localStorage.getItem(TXN_FILE_COLUMN_VIEW_PREF_KEY);
    if (!raw) return { displayMode: "preview", showAll: false, filterMode: "all" };
    const parsed = JSON.parse(raw) as { displayMode?: unknown; showAll?: unknown; filterMode?: unknown };
    const displayMode: FileColumnDisplayMode = parsed.displayMode === "tick" ? "tick" : "preview";
    const filterMode = parsed.filterMode === "with" || parsed.filterMode === "without" ? parsed.filterMode : "all";
    return { displayMode, showAll: displayMode === "preview" && parsed.showAll === true, filterMode };
  } catch {
    return { displayMode: "preview", showAll: false, filterMode: "all" };
  }
}

function saveFileColumnViewPrefs(
  displayMode: FileColumnDisplayMode,
  showAll: boolean,
  filterMode: "all" | "with" | "without"
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TXN_FILE_COLUMN_VIEW_PREF_KEY,
    JSON.stringify({ displayMode, showAll: displayMode === "preview" && showAll === true, filterMode })
  );
}

/** Firestore Timestamp | plain `{seconds}` | Date | string — opening / period row; OB noon parse shared helper */
function normalizeLedgerObDateField(v: unknown): Date | null {
  return parseOpeningBalanceDateToLocalNoon(v);
}

/** Form "As on" date ledger query range (from/to days, inclusive) ke andar? — shared helper. */
function isMasterOpeningDateInLedgerQueryRange(
  range: { from?: Date | null; to?: Date | null } | null | undefined,
  masterObDay: Date | null
): boolean {
  return isMasterOpeningDateInLedgerQueryRangeShared(range, masterObDay);
}

/** Spend-wise row grouping — mobile cards + desktop table must share shape; hooks using this stay above any conditional return. */
type MobileBlock =
  | { type: "spacer" }
  | { type: "group"; colorIndex: number; items: any[] }
  | { type: "single"; item: any };
type TableBlock =
  | { type: "spacer"; id: string }
  | { type: "group"; colorIndex: number; items: any[]; clippedTop?: boolean; clippedBottom?: boolean }
  | { type: "single"; item: any };

interface TransactionsTableProps {
  transactions: Transaction[];
  context: Context;
  contextId?: string;
  openingBalance?: number;
  /** Party/staff: master books opening (signed). Opening row Dr/Cr when period-brought balance is 0 but bill-wise row still shows OB links. */
  booksOpeningBalance?: number;
  openingBalanceOutstanding?: number;
  openingBalanceLinkedVoucherNos?: string[];
  /** Party (etc.): opening row ke turant baad voucher-style narration line */
  openingBalanceNarration?: string;
  /** Opening row File column: party/bank `documentFileUrls` (voucher jaisa tick + hover) */
  openingBalanceAttachmentUrls?: string[];
  /** Entity "As on" date — opening row ke Date column(s) me dikhai (party/bank/staff/tax/item/expense) */
  openingBalanceDate?: unknown;
  showNarration?: boolean;
  /** Daybook: narration column me note-text filter (parent state) */
  narrationNoteSearch?: string;
  stockView?: StockView;
  item?: Item;
  displayUnit?: string;
  setDisplayUnit?: (unit: string) => void;
  journalAccountNames?: Record<string, string>;
  userNames?: Record<string, string>;
  /** Account id -> name for resolving opposite account in bank/account context */
  accountNames?: Record<string, string>;
  filters?: Record<string, string>;
  setFilters?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeFilter?: string | null;
  setActiveFilter?: React.Dispatch<React.SetStateAction<string | null>>;
  onRowClick?: (transaction: any) => void;
  periodDr?: number;
  periodCr?: number;
  closingBalance?: number;
  isTaxContext?: boolean;
  isAllVouchersView?: boolean;
  hideDebitColumn?: boolean;
  hideCreditColumn?: boolean;
  /** Optional header labels (e.g. staff tax-details: Tax / Salary). */
  debitColumnHeaderLabel?: string;
  creditColumnHeaderLabel?: string;
  hideBalanceColumn?: boolean;
  hideFooter?: boolean;
  /** Ledger date filter range — Books opening sirf tab jab `openingBalanceDate` is inclusive range me ho. */
  dateRange?: { from?: Date | null; to?: Date | null };
  isInitialLoad?: boolean;
  isDateChange?: boolean;
  getDisplayValue?: (value: number) => string;
  voucherTypes?: string[];
  onVoucherTypeChange?: (types: string[]) => void;
  isBalanceMasked?: boolean;
  visibleColumns?: Record<string, boolean>;
  openingBalanceActions?: React.ReactNode;
  /** Label for the opening balance row (e.g. "Opening" on report page) */
  openingBalanceLabel?: string;
  /** Optional search input to show on the left of the opening balance row (same row) */
  openingBalanceSearch?: React.ReactNode;
  /** Optional content to show to the left of the opening balance row (e.g. unit selector) */
  openingBalanceLeftContent?: React.ReactNode;
  /** Closing Balance label ke left — e.g. Adjust Balance pill */
  closingBalanceActions?: React.ReactNode;
  onDeleteVoucher?: (transaction: any) => void;
  onHistoryVoucher?: (transaction: any) => void;
  onAddLink?: (transaction: any) => void;
  onApproveVoucher?: (transaction: any) => void;
  scrollOnlyTransactions?: boolean;
  /** Status filter for bill-wise Status header dropdown */
  statusFilter?: { paid: boolean; unpaid: boolean; partial: boolean; overdue: boolean };
  statusFilterAllChecked?: boolean;
  onStatusFilterAll?: () => void;
  onStatusFilterChange?: (key: "paid" | "unpaid" | "partial" | "overdue", checked: boolean) => void;
  statusFilterIdPrefix?: string;
  /** When context=group, indicates group type for opposite account display */
  groupEntityType?: "party" | "account" | "staff" | "tax" | "expense" | "item";
  /** When true, disables layout animation (e.g. when switching Spend wise / Statement view) */
  disableLayoutAnimation?: boolean;
  /** Spend-wise balance blink multi-select modes ('all' | 'group' | 'row'). Empty = Off. */
  blinkMode?: SpendWiseBlinkMode[];
  /** Optional override for pages that always want a fixed balance layout regardless of the shared page preference. */
  forceBalanceMode?: "statement" | "bill_wise";
  /** Item context: allow Party column show/hide from columns dropdown. */
  showItemPartyColumn?: boolean;
  /** When true (default), `isApproved` !== true rows get pink tint (main + narration). Party details use default. */
  highlightPendingApproval?: boolean;
  /** Entity ledger: pills on when set; dated vs book wording `dateRange` + master OB date se decide. */
  ledgerDateFilterActive?: boolean;
  /** Recent tab footer search: mobile card lines me is query ka pink highlight (sirf in cards). */
  transactionCardSearchHighlight?: string;
  /** Page-1: upar stacked Book row (jab master OB nonzero + OB date range me); page>1 sirf dated carry. */
  ledgerShowBookOpeningRow?: boolean;
  /** Staff tax-details view: hide Book/Dated opening rows entirely. */
  hideLedgerOpeningRows?: boolean;
  /** Range `from` — period-carry opening row ki Date column (BS/AD). */
  openingBalancePeriodStartDate?: unknown;
  /** Statement check mode (PC): focus / mark rows — Tally-style reconciliation */
  statementCheckModeActive?: boolean;
  statementCheckFocusId?: string | null;
  statementCheckMarkedIds?: ReadonlySet<string>;
  onStatementCheckRowFocus?: (transaction: { id?: string; _rowKey?: string }) => void;
  /** Spend-wise group view: row 3-dot → Select / Print (group-only print). */
  spendWiseGroupPrint?: SpendWiseGroupPrintConfig;
}

function samePendingOutboxIdSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Outbox drain background me hota hai — badge live rakhne ke liye pending rows tak halka poll. */
const PENDING_OUTBOX_POLL_MS = 3000;

export function TransactionsTable({
  transactions,
  context,
  contextId,
  openingBalance = 0,
  booksOpeningBalance,
  openingBalanceOutstanding,
  openingBalanceLinkedVoucherNos,
  openingBalanceNarration,
  openingBalanceAttachmentUrls,
  openingBalanceDate,
  showNarration = true,
  narrationNoteSearch: _narrationNoteSearch,
  stockView = "amount",
  item,
  displayUnit,
  setDisplayUnit,
  journalAccountNames,
  userNames,
  accountNames,
  filters,
  setFilters,
  activeFilter,
  setActiveFilter,
  onRowClick,
  periodDr = 0,
  periodCr = 0,
  closingBalance = 0,
  isTaxContext,
  isAllVouchersView,
  hideDebitColumn,
  hideCreditColumn,
  debitColumnHeaderLabel,
  creditColumnHeaderLabel,
  hideBalanceColumn,
  hideFooter,
  dateRange,
  isInitialLoad,
  isDateChange,
  getDisplayValue: getDisplayValueProp,
  voucherTypes,
  onVoucherTypeChange,
  isBalanceMasked,
  visibleColumns,
  openingBalanceActions,
  openingBalanceLabel = "Opening Balance",
  openingBalanceSearch,
  openingBalanceLeftContent,
  closingBalanceActions,
  onDeleteVoucher,
  onHistoryVoucher,
  onAddLink,
  onApproveVoucher,
  scrollOnlyTransactions,
  statusFilter,
  statusFilterAllChecked,
  onStatusFilterAll,
  onStatusFilterChange,
  statusFilterIdPrefix,
  groupEntityType,
  disableLayoutAnimation = false,
  blinkMode,
  forceBalanceMode,
  showItemPartyColumn = true,
  highlightPendingApproval = true,
  ledgerDateFilterActive,
  ledgerShowBookOpeningRow = true,
  hideLedgerOpeningRows = false,
  openingBalancePeriodStartDate,
  transactionCardSearchHighlight,
  statementCheckModeActive = false,
  statementCheckFocusId = null,
  statementCheckMarkedIds,
  onStatementCheckRowFocus,
  spendWiseGroupPrint,
}: TransactionsTableProps) {
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const voucherAttachmentUiOpts = useMemo(() => voucherAttachmentUiOptionsForCompany(company), [company]);
  const [filesTickEpoch, setFilesTickEpoch] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPrefs = () => setFilesTickEpoch((n) => n + 1);
    window.addEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, onPrefs);
    return () => window.removeEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, onPrefs);
  }, []);
  const [syncingVoucherIds, setSyncingVoucherIds] = useState<Set<string>>(() => new Set());
  const [pendingOutboxVoucherIds, setPendingOutboxVoucherIds] = useState<Set<string>>(() => new Set());
  const [dataSyncEpoch, setDataSyncEpoch] = useState(0);
  const autoPrioritySyncKeyRef = useRef<string>("");
  const markVoucherSyncing = useCallback((voucherId: string, syncing: boolean) => {
    setSyncingVoucherIds((prev) => {
      const next = new Set(prev);
      if (syncing) next.add(voucherId);
      else next.delete(voucherId);
      return next;
    });
  }, []);
  const refreshPendingOutboxVoucherIds = useCallback(() => {
    const cid = String(companyId || "").trim();
    if (!cid) {
      setPendingOutboxVoucherIds((prev) => (prev.size ? new Set<string>() : prev));
      return;
    }
    void listPendingOutboxDocIdsForCompany(cid, "vouchers").then((next) => {
      // Same ids par identity stable rakho — warna har poll pe puri table re-render hogi.
      setPendingOutboxVoucherIds((prev) => (samePendingOutboxIdSet(prev, next) ? prev : next));
    });
  }, [companyId]);
  const handleSyncVoucherNow = useCallback(
    async (transaction: any) => {
      const voucherId = String(transaction?.id || "").trim();
      const cid = String(companyId || "").trim();
      if (!cid || !voucherId) return;
      markVoucherSyncing(voucherId, true);
      try {
        const result = await flushVoucherOutbox({
          only: { companyId: cid, collectionName: "vouchers", docId: voucherId },
        });
        if (result.ok > 0) toast.success("Voucher synced", { duration: 1800 });
        else if (result.failed > 0) toast.error("Voucher sync failed", { duration: 2500 });
        else {
          const mirrored = await mirrorVoucherDocToBrowserDb(cid, voucherId);
          if (mirrored) toast.success("Voucher already synced", { duration: 1800 });
          else toast.message("No pending sync for this voucher", { duration: 1800 });
        }
      } finally {
        markVoucherSyncing(voucherId, false);
        refreshPendingOutboxVoucherIds();
      }
    },
    [companyId, markVoucherSyncing, refreshPendingOutboxVoucherIds]
  );
  useEffect(() => {
    refreshPendingOutboxVoucherIds();
    const onDataSyncChanged = () => {
      autoPrioritySyncKeyRef.current = "";
      refreshPendingOutboxVoucherIds();
      setDataSyncEpoch((v) => v + 1);
    };
    window.addEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, onDataSyncChanged);
    window.addEventListener("online", onDataSyncChanged);
    return () => {
      window.removeEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, onDataSyncChanged);
      window.removeEventListener("online", onDataSyncChanged);
    };
  }, [refreshPendingOutboxVoucherIds]);
  // Pending rows rehne tak poll karo: background flush ke baad "Sync due" khud green tick ban jaye.
  useEffect(() => {
    if (!pendingOutboxVoucherIds.size) return;
    const timer = window.setInterval(refreshPendingOutboxVoucherIds, PENDING_OUTBOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingOutboxVoucherIds, refreshPendingOutboxVoucherIds]);
  // FY merge: neela divider row — company par local fiscal merge `useCompany` se aa chuka hai.
  const fiscalPartitionOpts = useMemo(() => {
    if (company?.fiscalSplitMode !== "merge") return { at: null as Date | null, label: undefined as string | undefined };
    return {
      at: getFiscalMergePartitionDateFromCompany(company),
      label: company.fiscalPartitionLabel,
    };
  }, [company?.fiscalSplitMode, company?.fiscalMergePartitionAt, company?.fiscalPartitionLabel]);
  const fiscalMergeBannerLabel = useMemo(
    () =>
      fiscalPartitionOpts.at
        ? buildFiscalMergePartitionBannerLabel(company, fiscalPartitionOpts.at, fiscalPartitionOpts.label)
        : undefined,
    [company, fiscalPartitionOpts.at, fiscalPartitionOpts.label]
  );
  const tableTransactions = useMemo(() => {
    let list =
      fiscalPartitionOpts.at
        ? insertFiscalPartitionRows(transactions as any[], fiscalPartitionOpts.at, fiscalMergeBannerLabel)
        : transactions;
    list = stripSpendWiseSyntheticOpeningMaster(list) as typeof list;
    return (list as any[]).map((row) => {
      const id = String(row?.id || "").trim();
      if (!id || row?.type === FISCAL_YEAR_PARTITION_ROW_TYPE) return row;
      const nextStatus = pendingOutboxVoucherIds.has(id) ? "sync_due" : "synced";
      return row?.__plSyncStatus === nextStatus ? row : { ...row, __plSyncStatus: nextStatus };
    }) as typeof list;
  }, [transactions, fiscalPartitionOpts.at, fiscalMergeBannerLabel, pendingOutboxVoucherIds]);
  useEffect(() => {
    publishVoucherAttachmentListReuseIndex(tableTransactions as any[], voucherAttachmentUiOpts);
  }, [tableTransactions, voucherAttachmentUiOpts]);
  /** OB narration row blue tint — openingBalanceNarrationRow `useSpendWiseOpeningBalanceCard` se pehle chahiye */
  useEffect(() => {
    const cid = String(companyId || "").trim();
    if (!cid || isFirebaseLedgerDataSyncDisabled()) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const due = (tableTransactions as any[])
      .filter((t) => t && t.type !== FISCAL_YEAR_PARTITION_ROW_TYPE && String(t.__plSyncStatus || "").trim() !== "synced")
      .map((t) => String(t.id || "").trim())
      .filter(Boolean);
    if (!due.length) return;
    const firstId = due[0];
    const key = `${cid}:${firstId}:${due.length}`;
    if (autoPrioritySyncKeyRef.current === key) return;
    autoPrioritySyncKeyRef.current = key;
    markVoucherSyncing(firstId, true);
    void (async () => {
      const result = await flushVoucherOutbox({
        priority: { companyId: cid, collectionName: "vouchers", docId: firstId },
      });
      if (result.ok === 0 && result.failed === 0) {
        await mirrorVoucherDocToBrowserDb(cid, firstId);
      }
    })().finally(() => {
      markVoucherSyncing(firstId, false);
      refreshPendingOutboxVoucherIds();
    });
  }, [
    companyId,
    tableTransactions,
    markVoucherSyncing,
    dataSyncEpoch,
    refreshPendingOutboxVoucherIds,
  ]);
  const hasSpendWiseGroups = tableTransactions?.some((t: any) => typeof t._spendWiseGroupColorIndex === "number");
  const useSpendWiseOpeningBalanceCard = context === "account" && hasSpendWiseGroups;
  const { user, customUser } = useAuth();
  const currentUserUid = user?.uid ?? null;
  const currentUserDisplayName = customUser?.displayName || user?.displayName || user?.email || null;
  const { balanceMode } = useBalanceMode();
  // Allow pages like Bank/Cash to stay on statement layout even if the shared balance-mode preference is bill-wise.
  const resolvedBalanceMode = forceBalanceMode ?? balanceMode;
  const handleApproveVoucherDefault = useCallback(
    async (transaction: any) => {
      if ((transaction as any)?.type === FISCAL_YEAR_PARTITION_ROW_TYPE) return;
      if (!companyId || !transaction?.id || !user?.uid) return;
      try {
        const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
        await approveVoucherWithHistory(companyId, transaction.id, user.uid, approverName);
        dispatchVoucherLivePatch(companyId, String(transaction.id), {
          id: String(transaction.id),
          isApproved: true,
          approvedByUserId: user.uid,
          approvedByUserName: approverName,
        });
        refreshPendingOutboxVoucherIds();
        toast.success("Transaction approved.");
      } catch (e) {
        const message = e instanceof Error && e.message ? e.message : "Failed to approve transaction.";
        toast.error(message);
      }
    },
    [
      companyId,
      user?.uid,
      user?.displayName,
      user?.email,
      customUser?.displayName,
      refreshPendingOutboxVoucherIds,
    ]
  );
  const effectiveOnApproveVoucher = onApproveVoucher ?? handleApproveVoucherDefault;
  /** Current page slice — pagination 10/20/30 pe jo rows table me hain. */
  const pageUnapprovedVouchers = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const t of tableTransactions as any[]) {
      if (!t || t._spendWiseSpacer) continue;
      if (t.type === FISCAL_YEAR_PARTITION_ROW_TYPE) continue;
      const id = String(t.id || "").trim();
      if (!id || seen.has(id)) continue;
      if (!isLedgerTransactionUnapproved(t)) continue;
      seen.add(id);
      out.push(t);
    }
    return out;
  }, [tableTransactions]);
  const approveAllTargets = pageUnapprovedVouchers;
  const approveAllInFlightRef = useRef(false);
  const handleApproveAllVisible = useCallback(async () => {
    if (!companyId || !user?.uid) return;
    if (approveAllInFlightRef.current) return;
    const pending = approveAllTargets;
    if (!pending.length) {
      toast.message("No unapproved transactions on this page.");
      return;
    }
    approveAllInFlightRef.current = true;
    const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
    const pendingById = new Map<string, any>();
    for (const row of pending as any[]) {
      const id = String(row?.id || "").trim();
      if (id) pendingById.set(id, row);
    }
    const pendingIds = pending
      .map((t) => String(t?.id || "").trim())
      .filter(Boolean);
    try {
      // Optimistic page patch first, then quiet row writes.
      dispatchVoucherLivePatchMany(companyId, pendingIds, {
        isApproved: true,
        approvedByUserId: user.uid,
        approvedByUserName: approverName,
      });
      const result = await approveVouchersWithHistoryBatch(
        companyId,
        pendingIds,
        user.uid,
        approverName
      );
      if (result.failed > 0) {
        const approvedSet = new Set(result.approvedIds);
        for (const id of pendingIds) {
          if (approvedSet.has(id)) continue;
          const original = pendingById.get(id);
          if (!original) continue;
          clearLedgerVouchersLocallyApproved([id]);
          dispatchVoucherLivePatch(companyId, id, {
            ...original,
            id,
          });
        }
      }
      refreshPendingOutboxVoucherIds();
      if (result.ok > 0) {
        void flushVoucherOutbox()
          .catch(() => undefined)
          .finally(refreshPendingOutboxVoucherIds);
      }
      if (result.ok > 0) {
        toast.success(
          result.ok === 1 ? "1 transaction approved." : `${result.ok} transactions approved.`
        );
      }
      if (result.failed > 0) {
        toast.error(
          result.failed === 1
            ? "1 transaction failed to approve."
            : `${result.failed} transactions failed to approve.`
        );
      }
    } finally {
      approveAllInFlightRef.current = false;
    }
  }, [
    companyId,
    user?.uid,
    user?.displayName,
    user?.email,
    customUser?.displayName,
    approveAllTargets,
    refreshPendingOutboxVoucherIds,
  ]);
  const showApproveAllOnPage = approveAllTargets.length > 0;
  // Statement view = running balance. Bill wise: Party/Staff show per-row outstanding (closing balance); others show running balance.
  const isBillWiseMode = resolvedBalanceMode === "bill_wise";
  // Party/Staff bill-wise only: show per-row outstanding (per row closing balance), including journal. Daybook/account/expense/tax bill-wise: running balance.
  const shouldUseOutstandingBalance =
    isBillWiseMode &&
    (context === "party" ||
      context === "staff" ||
      (context === "group" && (groupEntityType === "party" || groupEntityType === "staff")));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileDisplayMode, setFileDisplayMode] = useState<FileColumnDisplayMode>(
    () => readSavedFileColumnViewPrefs().displayMode
  );
  const [fileShowAll, setFileShowAll] = useState(() => readSavedFileColumnViewPrefs().showAll);
  const [txnTableTone, setTxnTableTone] = useState<LedgerTxnTableTone>("default");
  useEffect(() => {
    setTxnTableTone(readLedgerTxnTableTone());
    const onTone = () => setTxnTableTone(readLedgerTxnTableTone());
    window.addEventListener(LEDGER_TXN_TABLE_TONE_CHANGED_EVENT, onTone);
    return () => window.removeEventListener(LEDGER_TXN_TABLE_TONE_CHANGED_EVENT, onTone);
  }, []);
  const applyTxnTableTone = useCallback((next: LedgerTxnTableTone) => {
    setTxnTableTone(next);
    writeLedgerTxnTableTone(next);
  }, []);
  /** File column filter popover — local open state so Save always closes even if parent filter state lags. */
  const [fileFilterPopoverOpen, setFileFilterPopoverOpen] = useState(false);
  const [internalActiveFilter, setInternalActiveFilter] = useState<string | null>(null);
  const effectiveActiveFilter = activeFilter !== undefined ? activeFilter : internalActiveFilter;
  const patchActiveFilter = setActiveFilter ?? setInternalActiveFilter;
  const filterInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusFilterInputSoon = useCallback((key: string) => {
    requestAnimationFrame(() => {
      const input = filterInputRefs.current[key];
      if (!input) return;
      if (typeof document !== "undefined" && document.activeElement === input) return;
      input.focus({ preventScroll: true });
    });
  }, []);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (effectiveActiveFilter === "file") setFileFilterPopoverOpen(true);
    else if (effectiveActiveFilter != null && effectiveActiveFilter !== "file") {
      setFileFilterPopoverOpen(false);
    }
  }, [effectiveActiveFilter]);
  useEffect(() => {
    if (!setFilters) return;
    const saved = readSavedFileColumnViewPrefs();
    if (saved.filterMode === "all") return;
    setFilters((prev: Record<string, string>) => {
      if (prev.file === "with" || prev.file === "without") return prev;
      return { ...prev, file: saved.filterMode };
    });
  }, [setFilters]);
  // Keep spend-wise blink/selection groups consistent for derived row ids.
  const normalizeSpendWiseRowBase = useCallback((id?: string) => {
    if (!id || typeof id !== "string") return id ?? "";
    if (id.includes("-in-")) return id.substring(0, id.indexOf("-in-"));
    if (id.endsWith("-ob-link")) return id.substring(0, id.length - "-ob-link".length);
    return id;
  }, []);
  const spendWiseVoucherMatchKey = useCallback((row: any) => {
    const baseId = resolveSpendWiseRowBaseVoucherId(row);
    if (baseId && baseId !== "__opening_balance_group__") return `id:${baseId}`;
    const vn = String(row?.voucherNumber ?? "").trim();
    if (vn) return `vn:${vn}`;
    return "";
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const isSpendWise = tableTransactions.some((t: any) => (t as any)._spendWiseChild === true || (t as any)._spendWiseGroupFirst === true);
    if (isSpendWise) {
      const selected = tableTransactions.find((t: any) => t?.id === selectedId);
      const key = selected ? spendWiseVoucherMatchKey(selected) : "";
      const stillPresent = key
        ? tableTransactions.some((t: any) => !t?._spendWiseSpacer && spendWiseVoucherMatchKey(t) === key)
        : false;
      if (!stillPresent) setSelectedId(null);
    } else if (!tableTransactions.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tableTransactions, selectedId, spendWiseVoucherMatchKey]);

  // Click table ke bahar → row unselect; lekin Dialog/Dropdown/Popover radix portals body par hain — un par click se unselect mat karo (save ke baad edited row selected rahe)
  const isTargetInsidePortaledOverlay = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof Element)) return false;
    return !!(
      target.closest('[role="dialog"]') ||
      target.closest('[role="alertdialog"]') ||
      target.closest("[data-radix-dropdown-menu-content]") ||
      target.closest("[data-radix-select-content]") ||
      target.closest("[data-radix-popover-content]") ||
      target.closest("[data-radix-sheet-content]")
    );
  }, []);

  // Unselect when user clicks anywhere in the app outside the table (empty area, sidebar, etc.)
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const el = tableContainerRef.current;
      if (!el || !selectedId) return;
      const t = e.target;
      if (el.contains(t as Node)) return;
      if (isTargetInsidePortaledOverlay(t)) return;
      setSelectedId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [selectedId, isTargetInsidePortaledOverlay]);

  // Staff group (statement + bill wise): focus table after row select so one Enter opens edit; delay so page doesn’t steal focus
  const isStaffGroup = context === "group" && groupEntityType === "staff";
  useEffect(() => {
    if (!isStaffGroup || !selectedId) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tableContainerRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isStaffGroup, selectedId]);

  // Check mode: focus badle tab hi scroll — table refresh par jump na ho (manual scroll safe rahe)
  const statementCheckFocusScrollRef = useRef<string | null>(null);
  useEffect(() => {
    if (!statementCheckModeActive || !statementCheckFocusId) {
      statementCheckFocusScrollRef.current = statementCheckFocusId;
      return;
    }
    if (statementCheckFocusScrollRef.current === statementCheckFocusId) return;
    statementCheckFocusScrollRef.current = statementCheckFocusId;
    const el = tableContainerRef.current?.querySelector('[data-check-focus="true"]');
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [statementCheckModeActive, statementCheckFocusId]);

  /** Space — sirf selected (orange) row par scroll; auto scroll refresh par band */
  const scrollSelectedRowIntoView = useCallback(() => {
    scrollTransactionSelectedRowIntoView(tableContainerRef.current);
  }, []);

  const getStatementCheckRowProps = useCallback(
    (t: any) => {
      const rowId = statementCheckTxnId(t);
      if (statementCheckModeActive) {
        return {
          // Check mode: focus = normal blue selected border; Space mark = green border
          isSelected: statementCheckFocusId === rowId,
          isCheckModeFocused: statementCheckFocusId === rowId,
          isCheckModeMarked: statementCheckMarkedIds?.has(rowId) ?? false,
          onRowSelect: () => onStatementCheckRowFocus?.(t),
        };
      }
      return {
        isSelected: selectedId === t.id,
        isCheckModeFocused: false,
        isCheckModeMarked: false,
        onRowSelect: () => setSelectedId(t.id),
      };
    },
    [
      statementCheckModeActive,
      statementCheckFocusId,
      statementCheckMarkedIds,
      onStatementCheckRowFocus,
      selectedId,
    ]
  );

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Check mode shortcuts hook `useStatementCheckMode` window par handle karta hai
      if (statementCheckModeActive) return;
      if (tableTransactions.length === 0) return;
      const idx = tableTransactions.findIndex((t) => t.id === selectedId);
      const currentIndex = idx >= 0 ? idx : -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, tableTransactions.length - 1);
        setSelectedId(tableTransactions[next]?.id ?? null);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSelectedId(tableTransactions[prev]?.id ?? null);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        const t = tableTransactions.find((x) => x.id === selectedId);
        if (t && (t as any).type !== FISCAL_YEAR_PARTITION_ROW_TYPE) onRowClick?.(t);
      } else if ((e.key === " " || e.code === "Space") && selectedId) {
        // Manual scroll ke baad wapas selected row — sirf Space se
        e.preventDefault();
        scrollSelectedRowIntoView();
      }
    },
    [tableTransactions, selectedId, onRowClick, statementCheckModeActive, scrollSelectedRowIntoView]
  );

  /** Spend-wise multi-row: clicked row = selected (border); same voucher ki baaki rows = blink (row mode). */
  const isSpendWiseMultiRow = tableTransactions.some((t: any) => (t as any)._spendWiseChild === true || (t as any)._spendWiseGroupFirst === true);
  // Partial-linked voucher: linked child + unlinked remainder — dono rows same base id / voucher no.
  const spendWiseBaseRowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tableTransactions as any[]) {
      if (t?._spendWiseSpacer) continue;
      const key = spendWiseVoucherMatchKey(t);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tableTransactions, spendWiseVoucherMatchKey]);
  const selectedSpendWiseRow = useMemo(
    () => (selectedId ? tableTransactions.find((t: any) => t?.id === selectedId) : undefined),
    [tableTransactions, selectedId]
  );
  const selectedVoucherMatchKey =
    selectedSpendWiseRow && isSpendWiseMultiRow ? spendWiseVoucherMatchKey(selectedSpendWiseRow) : null;
  const activeBlinkModes = Array.isArray(blinkMode) ? blinkMode : [];
  const canBlinkRelatedRows = activeBlinkModes.includes("all") || activeBlinkModes.includes("group");
  const getIsRelatedBlink = useCallback(
    (t: any) => {
      if (!isSpendWiseMultiRow || !selectedVoucherMatchKey) return false;
      if (t.id === selectedId) return false;
      if (spendWiseVoucherMatchKey(t) !== selectedVoucherMatchKey) return false;
      if ((spendWiseBaseRowCounts.get(selectedVoucherMatchKey) ?? 0) <= 1) return false;
      if (canBlinkRelatedRows) return true;
      return activeBlinkModes.includes("row");
    },
    [
      canBlinkRelatedRows,
      isSpendWiseMultiRow,
      selectedVoucherMatchKey,
      spendWiseVoucherMatchKey,
      spendWiseBaseRowCounts,
      selectedId,
      activeBlinkModes,
    ]
  );
  const getIsSelectedRowBlink = useCallback(
    (t: any) => {
      if (!activeBlinkModes.includes("row")) return false;
      if (!selectedId || t?.id !== selectedId) return false;
      const key = spendWiseVoucherMatchKey(t);
      return (spendWiseBaseRowCounts.get(key) ?? 0) > 1;
    },
    [activeBlinkModes, selectedId, spendWiseVoucherMatchKey, spendWiseBaseRowCounts]
  );

  const handlePrintSpendWiseGroupFromRow = useCallback(
    async (row: any) => {
      if (!spendWiseGroupPrint) return;
      const anchor =
        selectedId != null
          ? (tableTransactions.find((t) => t.id === selectedId) as Record<string, unknown> | undefined) ?? row
          : row;
      const groupTxns = extractSpendWiseGroupTransactions(tableTransactions, anchor);
      if (!groupTxns.length) {
        toast.error("Nothing to print", { description: "No transactions in this group." });
        return;
      }
      const toastId = toast.loading("Preparing print...");
      try {
        await printSpendWiseGroupTransactions(spendWiseGroupPrint, groupTxns);
        toast.dismiss(toastId);
      } catch (e) {
        toast.dismiss(toastId);
        console.error("Spend-wise group print failed:", e);
        toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
      }
    },
    [spendWiseGroupPrint, selectedId, tableTransactions]
  );

  const getSpendWiseRowMenuProps = useCallback(
    (t: any) => {
      const inGroup = Boolean((t as { _spendWiseGroupId?: string })._spendWiseGroupId);
      return {
        showSpendWiseGroupMenuActions: Boolean(spendWiseGroupPrint && hasSpendWiseGroups && inGroup),
        onPrintRow: () => void handlePrintSpendWiseGroupFromRow(t),
      };
    },
    [spendWiseGroupPrint, hasSpendWiseGroups, handlePrintSpendWiseGroupFromRow]
  );

  const openingBalanceMenuAnchor = useMemo(() => {
    const rows = tableTransactions as any[];
    const synthetic = rows.find((x) => x?.id === "__opening_balance_group__");
    if (synthetic) return synthetic;
    return rows.find(
      (x) =>
        !x?._spendWiseSpacer &&
        String(x?._spendWiseGroupId || "") === SPEND_WISE_OPENING_GROUP_ID
    );
  }, [tableTransactions]);

  const showOpeningSpendWiseMenu = Boolean(
    spendWiseGroupPrint && hasSpendWiseGroups && openingBalanceMenuAnchor
  );

  const renderOpeningBalanceEditMenuItem = useCallback(() => {
    if (!openingBalanceActions) return null;
    if (!React.isValidElement(openingBalanceActions)) return null;
    const dialogEl = openingBalanceActions as React.ReactElement<{ children?: React.ReactNode }>;
    return (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} asChild>
        {React.cloneElement(dialogEl, {
          children: (
            <span className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </span>
          ),
        })}
      </DropdownMenuItem>
    );
  }, [openingBalanceActions]);

  const renderOpeningBalanceRowMenu = useCallback(() => {
    if (!showOpeningSpendWiseMenu && !openingBalanceActions) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" data-pl-txn-icon-btn="" className={cn(txnTableIconBtnCn, "h-8 w-8 shrink-0")}>
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {showOpeningSpendWiseMenu ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  const anchor = openingBalanceMenuAnchor;
                  if (anchor?.id) setSelectedId(anchor.id);
                }}
                className="flex items-center gap-2"
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                Select
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handlePrintSpendWiseGroupFromRow(openingBalanceMenuAnchor)}
                className="flex items-center gap-2"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </DropdownMenuItem>
            </>
          ) : null}
          {renderOpeningBalanceEditMenuItem()}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }, [
    showOpeningSpendWiseMenu,
    openingBalanceActions,
    openingBalanceMenuAnchor,
    handlePrintSpendWiseGroupFromRow,
    renderOpeningBalanceEditMenuItem,
  ]);

  const {
    formatDate,
    formatDateBS,
    formatCurrency,
    dateSystem,
  } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  
  // Get animation settings - check enabled flag explicitly (match PartyList / list motion). Disable when parent asks (e.g. view toggle).
  const isRowAnimationEnabled = !disableLayoutAnimation && animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 0.4) : 0;
  const isNumberAnimationEnabled = animationSettings?.numbers?.enabled === true;
  const numberAnimationDuration = isNumberAnimationEnabled ? (animationSettings?.numbers?.duration ?? 2.5) : 0;
  /** Framer `layout` on `<tr>` mis-projects row menu on account/user columns — party/staff/statement safe. */
  const useTxnRowLayoutAnimation =
    isRowAnimationEnabled &&
    (hasSpendWiseGroups || context !== "account");
  /** Date filter par popLayout purani row positions preserve karta hai — spend-wise list neeche chipak jati hai. */
  const spendWiseListAnimateKey = useMemo(() => {
    if (!ledgerDateFilterActive) return "spend-wise-all";
    const fromMs =
      dateRange?.from instanceof Date
        ? dateRange.from.getTime()
        : dateRange?.from
          ? new Date(dateRange.from as string | number).getTime()
          : "";
    const toMs =
      dateRange?.to instanceof Date
        ? dateRange.to.getTime()
        : dateRange?.to
          ? new Date(dateRange.to as string | number).getTime()
          : "";
    return `spend-wise-filter-${fromMs}-${toMs}-${tableTransactions.length}`;
  }, [ledgerDateFilterActive, dateRange?.from, dateRange?.to, tableTransactions.length]);
  
  const getDisplayValue = useCallback((value: number) => {
    if (getDisplayValueProp) return getDisplayValueProp(value);
    return formatCurrency(value, {noSuffix: true, context: 'transaction'});
  }, [getDisplayValueProp, formatCurrency]);

  const rowTextSearchHighlight = useMemo(
    () => String(transactionCardSearchHighlight || "").trim(),
    [transactionCardSearchHighlight]
  );


  // Header filter: `modal` true — input pe pehla click dismiss na ho (non-modal me DismissableLayer kabhi filter box ko "outside" maan leta hai)
  const renderHeaderWithFilter = (key: string, label: string, isNumeric: boolean = false, minWidthPx?: number) => {
    const isFiltered = !!(filters && filters[key]) || (key === 'type' && voucherTypes && !voucherTypes.includes('all'));
    const thClass = cn('p-0', isNumeric && 'text-right');
    const innerPadding = ensureMinGaps ? "px-[10px]" : "px-2";
    const filterValue = filters ? filters[key] || "" : "";
    const renderTextFilterInput = () => {
      if (!setFilters) return null;
      return (
        <div className="relative">
          <Input
            ref={(el) => {
              filterInputRefs.current[key] = el;
              if (el && activeFilter === key) focusFilterInputSoon(key);
            }}
            className={cn(
              "border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
              filterValue && "pr-9"
            )}
            placeholder={`Filter ${label}...`}
            value={filterValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const newValue = e.target.value;
              setFilters((prev: Record<string, string>) => ({ ...prev, [key]: newValue }));
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" && setActiveFilter) setActiveFilter(null);
            }}
            autoFocus
          />
          {filterValue ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFilters((prev: Record<string, string>) => ({ ...prev, [key]: "" }));
                focusFilterInputSoon(key);
              }}
              aria-label={`Clear ${label} filter`}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      );
    };

    return (
      <TableHead className={thClass} style={ensureMinGaps && minWidthPx != null ? { minWidth: `${minWidthPx}px` } : undefined}>
        <div className={cn("flex items-center gap-1 font-bold py-3 text-black whitespace-nowrap", innerPadding, isFiltered ? 'text-red-600' : 'text-black', isNumeric ? "justify-end" : "justify-start")}>
          <div className={cn('flex items-center', isNumeric ? 'flex-row' : 'flex-row')}>
            <span>{label}</span>
            {isNumeric && (setFilters || (key === 'type' && onVoucherTypeChange)) && (
              <Popover modal open={activeFilter === key} onOpenChange={(open) => setActiveFilter && setActiveFilter(open ? key : null)}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" data-pl-txn-icon-btn="" className={cn(txnTableIconBtnCn, "h-6 w-6 ml-1")}>
                    <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="center"
                  sideOffset={6}
                  className="w-48 p-0 overflow-hidden"
                  onOpenAutoFocus={(e: Event) => {
                    e.preventDefault();
                    focusFilterInputSoon(key);
                  }}
                  onCloseAutoFocus={(e: Event) => e.preventDefault()}
                >
                    {key === 'type' && onVoucherTypeChange ? (
                        <VoucherTypeFilter selectedTypes={voucherTypes || ['all']} onSelectionChange={onVoucherTypeChange} />
                    ) : renderTextFilterInput()}
                  </PopoverContent>
              </Popover>
            )}
            {!isNumeric && (setFilters || (key === 'type' && onVoucherTypeChange)) && (
              <Popover modal open={activeFilter === key} onOpenChange={(open) => setActiveFilter && setActiveFilter(open ? key : null)}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" data-pl-txn-icon-btn="" className={cn(txnTableIconBtnCn, "h-6 w-6 ml-0")}>
                    <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="center"
                  sideOffset={6}
                  className="w-48 p-0 overflow-hidden"
                  onOpenAutoFocus={(e: Event) => {
                    e.preventDefault();
                    focusFilterInputSoon(key);
                  }}
                  onCloseAutoFocus={(e: Event) => e.preventDefault()}
                >
                    {key === 'type' && onVoucherTypeChange ? (
                        <VoucherTypeFilter selectedTypes={voucherTypes || ['all']} onSelectionChange={onVoucherTypeChange} />
                    ) : renderTextFilterInput()}
                  </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </TableHead>
    );
  };

  /** File column — checkbox dropdown: All / with file / without file */
  const renderFileHeaderWithFilter = () => {
    const fileFilterRaw = filters?.file ?? "";
    const fileFilterMode: "all" | "with" | "without" =
      fileFilterRaw === "with" || fileFilterRaw === "without" ? fileFilterRaw : "all";
    const innerPadding = ensureMinGaps ? "px-[10px]" : "px-2";
    const setFileFilter = (mode: "all" | "with" | "without") => {
      if (!setFilters) return;
      setFilters((prev: Record<string, string>) => ({
        ...prev,
        file: mode === "all" ? "" : mode,
      }));
    };
    const saveFileView = (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      saveFileColumnViewPrefs(fileDisplayMode, fileShowAll, fileFilterMode);
      toast.success("File view saved.");
      setFileFilterPopoverOpen(false);
      patchActiveFilter(null);
    };

    return (
      <TableHead
        className="font-semibold p-0 text-center"
        style={ensureMinGaps ? { minWidth: "44px" } : undefined}
        data-theme-header="file"
      >
        <div
          className={cn(
            "flex items-center justify-center gap-1 font-bold py-3 whitespace-nowrap",
            innerPadding,
            "text-black"
          )}
        >
          <span>File</span>
          {setFilters ? (
            <Popover
              modal
              open={fileFilterPopoverOpen}
              onOpenChange={(open) => {
                setFileFilterPopoverOpen(open);
                patchActiveFilter(open ? "file" : null);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-pl-txn-icon-btn=""
                  className={cn(txnTableIconBtnCn, "h-6 w-6")}
                  aria-label="Filter by file attachment"
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-2 w-64" align="center" onCloseAutoFocus={(e: Event) => e.preventDefault()}>
                <div className="flex items-center gap-2 border-b pb-2 mb-1">
                  <Checkbox
                    id="txn-file-filter-all"
                    checked={fileFilterMode === "all"}
                    onCheckedChange={() => setFileFilter("all")}
                  />
                  <label htmlFor="txn-file-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                    All
                  </label>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <Checkbox
                    id="txn-file-filter-with"
                    checked={fileFilterMode === "with"}
                    onCheckedChange={() => setFileFilter("with")}
                  />
                  <label htmlFor="txn-file-filter-with" className="text-sm font-medium cursor-pointer flex-1">
                    With file
                  </label>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <Checkbox
                    id="txn-file-filter-without"
                    checked={fileFilterMode === "without"}
                    onCheckedChange={() => setFileFilter("without")}
                  />
                  <label htmlFor="txn-file-filter-without" className="text-sm font-medium cursor-pointer flex-1">
                    Without file
                  </label>
                </div>
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 px-0.5 text-xs font-semibold uppercase text-muted-foreground">View</p>
                  <div className="flex items-center gap-4 py-1">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Checkbox
                        id="txn-file-display-preview"
                        checked={fileDisplayMode === "preview"}
                        onCheckedChange={() => setFileDisplayMode("preview")}
                      />
                      <label htmlFor="txn-file-display-preview" className="text-sm font-medium cursor-pointer flex-1">
                        Preview
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="txn-file-display-show-all"
                        checked={fileShowAll}
                        disabled={fileDisplayMode !== "preview"}
                        onCheckedChange={(checked) => setFileShowAll(checked === true)}
                      />
                      <label
                        htmlFor="txn-file-display-show-all"
                        className={cn(
                          "whitespace-nowrap text-sm font-medium cursor-pointer",
                          fileDisplayMode !== "preview" && "cursor-not-allowed opacity-50"
                        )}
                      >
                        Show all
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-1">
                    <Checkbox
                      id="txn-file-display-tick"
                      checked={fileDisplayMode === "tick"}
                      onCheckedChange={() => setFileDisplayMode("tick")}
                    />
                    <label htmlFor="txn-file-display-tick" className="text-sm font-medium cursor-pointer flex-1">
                      Tick only
                    </label>
                  </div>
                  <div className="mt-2 border-t pt-2">
                    <Button type="button" size="sm" className="h-8 w-full" onClick={(e) => saveFileView(e)}>
                      Save
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </TableHead>
    );
  };
  
  // === TOTALS AND CLOSING BALANCE CONVERSION LOGIC ===
  const conversionFactor = useMemo(() => {
     if (context === 'item' && stockView === 'qty' && item) {
         return getConversionFactor(item, displayUnit);
     }
     return 1;
  }, [context, stockView, item, displayUnit]);

  // Apply conversion to totals
  // Ensure openingBalance is a valid number (handle undefined, null, NaN)
  const safeOpeningBalance = (typeof openingBalance === 'number' && !isNaN(openingBalance)) ? openingBalance : 0;
  const displayOpeningBalance = safeOpeningBalance / conversionFactor;
  const booksObScaled =
    typeof booksOpeningBalance === "number" && !isNaN(booksOpeningBalance)
      ? booksOpeningBalance / conversionFactor
      : null;
  const obOutstandingDisplay = openingBalanceOutstanding != null ? openingBalanceOutstanding / conversionFactor : null;
  // View/period opening can be 0 (e.g. date filter) while books still have a master OB — use master for Dr/Cr.
  // Statement + bill-wise: same fallback so first row is not empty when "View start" is 0 but books opening exists.
  const useBooksObForRowDrCr =
    (context === "party" || context === "staff" || context === "item") &&
    booksObScaled != null &&
    Math.abs(safeOpeningBalance) < 1e-7 &&
    Math.abs(booksObScaled) > 1e-7;
  // Bill-wise: Dr/Cr = full books opening; Balance = remaining on OB. Same linked PYMTs as print — avoids net period
  // credit in the row + full gross links, which read as "double" or contradict the Balance column.
  const useGrossBooksForBillWiseObRow =
    isBillWiseMode &&
    (context === "party" || context === "staff") &&
    openingBalanceOutstanding != null &&
    booksObScaled != null &&
    Math.abs(booksObScaled) > 1e-7;
  const displayOpeningForDrCr = useGrossBooksForBillWiseObRow
    ? booksObScaled!
    : useBooksObForRowDrCr
      ? booksObScaled!
      : displayOpeningBalance;
  const obSignIsNonNegative =
    isBillWiseMode && (context === "party" || context === "staff") && obOutstandingDisplay != null && booksObScaled != null
      ? booksObScaled >= 0
      : Math.abs(safeOpeningBalance) > 1e-7
        ? safeOpeningBalance >= 0
        : booksObScaled != null && Math.abs(booksObScaled) > 1e-7
          ? booksObScaled >= 0
          : safeOpeningBalance >= 0;
  // Bill-wise party/staff: opening row Balance = remaining on opening (unpaid on OB). Other ledgers
  // (tax, bank, expense, item, …) always use period ledger opening — never the bill-wise outstanding field.
  const useOutstandingForOpeningRowBalance =
    isBillWiseMode && (context === "party" || context === "staff") && obOutstandingDisplay != null;
  // Statement: when period opening is 0, Balance column = books opening (brought in via displayOpeningForDrCr).
  const displayOpeningBalanceForRow = useOutstandingForOpeningRowBalance
    ? (obSignIsNonNegative ? obOutstandingDisplay! : -obOutstandingDisplay!)
    : useBooksObForRowDrCr && !isBillWiseMode
      ? displayOpeningForDrCr
      : displayOpeningBalance;
  const obAmount = Math.abs(displayOpeningForDrCr);
  const obStatusLabel = obOutstandingDisplay != null
    ? (obOutstandingDisplay <= 0 ? "Paid" : obOutstandingDisplay >= obAmount ? "Unpaid" : "Partial")
    : null;
  const displayOpeningBalanceDr = displayOpeningForDrCr > 0 ? displayOpeningForDrCr : 0;
  const displayOpeningBalanceCr = displayOpeningForDrCr < 0 ? Math.abs(displayOpeningForDrCr) : 0;
  const displayPeriodDr = periodDr / conversionFactor;
  const displayPeriodCr = periodCr / conversionFactor;
  const displayClosingBalance = closingBalance / conversionFactor;
  
  // Total includes opening balance: Dr opening balance adds to Debit total, Cr opening balance adds to Credit total
  const displayTotalDr = (displayPeriodDr || 0) + displayOpeningBalanceDr;
  const displayTotalCr = (displayPeriodCr || 0) + displayOpeningBalanceCr;

  // Ledger contexts: Type pill — master books OB = "Book Opening"; pagination/date-filter carry = "Dated Opening".
  const ledgerOpeningPillsEnabled =
    typeof ledgerDateFilterActive === "boolean" &&
    ["party", "account", "staff", "tax", "item", "expense", "group"].includes(context);
  const BOOK_OB_EPS = SHARED_BOOK_OB_EPS;
  const masterBookSignedScaled = booksObScaled ?? 0;
  const bookRowOpeningDr = masterBookSignedScaled > 0 ? masterBookSignedScaled : 0;
  const bookRowOpeningCr = masterBookSignedScaled < 0 ? Math.abs(masterBookSignedScaled) : 0;
  /** Spend-wise dated opening row — statement period carry (Book Opening row alag stacked row me books OB). */
  const spendWiseDatedOpeningRowSigned = displayOpeningForDrCr;
  const spendWiseBookOpeningRowDr = displayOpeningBalanceDr;
  const spendWiseBookOpeningRowCr = displayOpeningBalanceCr;
  const spendWiseBookOpeningBalanceForRow = displayOpeningBalanceForRow;

  // Footer Formatters (Same Logic as Row). When balance is 0 show "Settled" (opening row + closing balance).
  const formatFooterBalance = (value: number) => {
    if (isBalanceMasked) return '*****';
    if (typeof value !== 'number' || isNaN(value)) return '-';
    const isItemQty = context === 'item' && stockView === 'qty';
    if (isItemQty) {
      if (Math.abs(value) < 1e-6) return <span className="font-bold text-green-700">Settled</span>;
      return `${formatQuantity(value)} ${displayUnit || ''}`;
    }
    if (Math.abs(value) < 1e-6) return <span className="font-bold text-green-700">Settled</span>;
    const absValue = Math.abs(value);
    const suffix = value >= 0 ? "Dr" : "Cr";
    return (
      <span className={cn("font-bold", value >= 0 ? "text-green-700" : "text-red-700")}>
        {formatCurrency(absValue, { noSuffix: true, context: 'transaction' })} {suffix}
      </span>
    );
  };
  
  const formatFooterAmount = (val: number) => {
      if (val === 0 || (typeof val === 'number' && isNaN(val))) return '-';
      if (context === 'item' && stockView === 'qty') {
          return `${formatQuantity(val)} ${displayUnit || ''}`;
      }
      return getDisplayValue(val);
  }

  // File column: `usePermissions` local/SQLite company par plan cache miss ya "basic" par bhi `canAddFileImagePdf` boost karta hai — seedha plan se mat lo
  const { can, canAddFileImagePdf } = usePermissions();
  const showFileColumn = canAddFileImagePdf === true;
  const showCol = (key: string) => visibleColumns == null || visibleColumns[key] !== false;
  const showFileBySelection = showFileColumn && showCol("file");
  const visibleAttachmentUrls = useMemo(() => {
    // Shared entity ledgers: only currently rendered rows' attachment URLs are warmed for instant hover preview.
    const urls: string[] = [];
    if (showFileBySelection && Array.isArray(tableTransactions)) {
      for (const row of tableTransactions as any[]) {
        for (const url of getVoucherAttachmentUrlsForUi(row, voucherAttachmentUiOpts)) {
          if (url) urls.push(url);
        }
      }
    }
    if (showFileBySelection && Array.isArray(openingBalanceAttachmentUrls)) {
      for (const candidate of openingBalanceAttachmentUrls) {
        const url = String(candidate ?? "").trim();
        if (url) urls.push(url);
      }
    }
    return urls;
  }, [showFileBySelection, tableTransactions, openingBalanceAttachmentUrls]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const warmCompanyId = companyId?.trim() || undefined;
    setVisiblePageAttachmentUrls(warmCompanyId, visibleAttachmentUrls);
    if (visibleAttachmentUrls.length === 0) return;
    if (warmCompanyId && !isOnlineCompanyAttachmentFilesTickEnabled(warmCompanyId)) {
      return;
    }
    updateAttachmentPrefetchPriorityFromVisibleRows(visibleAttachmentUrls);
    const browserWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const ac = new AbortController();
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const runWarm = () => {
      if (shouldSkipVisibleRowFullIdlePrewarmOnWeb()) return;
      void prewarmHoverPreviewHttpsUrls(visibleAttachmentUrls, {
        signal: ac.signal,
        maxUrls: 220,
        companyId: warmCompanyId,
      });
      void prewarmVisibleAttachmentRefsForInstantOpen(visibleAttachmentUrls, {
        signal: ac.signal,
        maxUrls: 220,
        companyId: warmCompanyId,
      });
    };
    if (typeof browserWindow.requestIdleCallback === "function") {
      idleHandle = browserWindow.requestIdleCallback(runWarm, { timeout: 450 });
    } else {
      timeoutHandle = globalThis.setTimeout(runWarm, 80);
    }
    return () => {
      ac.abort();
      if (idleHandle != null && typeof browserWindow.cancelIdleCallback === "function") {
        browserWindow.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null) globalThis.clearTimeout(timeoutHandle);
    };
  }, [visibleAttachmentUrls, companyId, filesTickEpoch]);
  const dateCols = dateSystem === "Both" ? 2 : 1;
  const userCol = context === 'note' ? 0 : 1;
  const fileCol = showFileBySelection ? 1 : 0;
  const isItemPartyContext = context === "item" || (context === "group" && groupEntityType === "item");
  // Item/Item-group Party column count should follow page-level visibility toggle.
  const syncStatusCol = showCol("syncStatus") ? 1 : 0;
  const baseCols = syncStatusCol + dateCols + 2 + userCol + fileCol + (context === 'daybook' ? 1 : 0) + (isItemPartyContext && showItemPartyColumn ? 1 : 0);
  const debitCol = hideDebitColumn ? 0 : 1;
  const creditCol = hideCreditColumn ? 0 : 1;
  // Hide status column in statement view (bill-wise only shows per-bill status)
  const hideStatusColumn = resolvedBalanceMode === "statement";
  const statusCol = hideStatusColumn ? 0 : 1;

  const visibleDateCols = visibleColumns != null ? (showCol("date") ? dateCols : 0) : dateCols;
  const visibleBaseCols = visibleColumns != null
    ? (showCol("syncStatus") ? 1 : 0) + (showCol("date") ? dateCols : 0) + (showCol("type") ? 1 : 0) + (showCol("voucherNo") ? 1 : 0) + (context === 'daybook' ? 1 : 0) + (isItemPartyContext && showItemPartyColumn ? 1 : 0) + (showCol("user") && context !== 'note' ? 1 : 0) + (showFileBySelection ? 1 : 0)
    : baseCols;
  const visibleDebitCol = visibleColumns != null ? (showCol("dr") && !hideDebitColumn ? 1 : 0) : debitCol;
  const visibleCreditCol = visibleColumns != null ? (showCol("cr") && !hideCreditColumn ? 1 : 0) : creditCol;
  const visibleStatusCol = visibleColumns != null ? (showCol("status") && !hideStatusColumn ? 1 : 0) : statusCol;
  const visibleBalanceCol = visibleColumns != null ? (showCol("runningBalance") && !hideBalanceColumn ? 1 : 0) : (hideBalanceColumn ? 0 : 1);

  const openingBalanceColSpan = visibleBaseCols + (context === 'note' ? 1 : 0);
  const totalColSpan = visibleBaseCols;
  const fullRowColSpan = openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1;
  const openingBalanceNarrationTrimmed = (openingBalanceNarration ?? "").trim();
  /** Main OB `<tr>` aur narration `<tr>` ke beech double border na ho */
  const hasOpeningBalanceNarrationSubRow = showNarration && Boolean(openingBalanceNarrationTrimmed);
  /** Firestore Timestamp | Date | string — entity form ki "As on" date */
  const openingBalanceRowDate = useMemo(() => normalizeLedgerObDateField(openingBalanceDate), [openingBalanceDate]);
  /** Date filter start — period-carry row ki Date column (BS/AD) */
  const periodOpeningRowDate = useMemo(
    () => normalizeLedgerObDateField(openingBalancePeriodStartDate),
    [openingBalancePeriodStartDate]
  );
  /** Form "As on" range ke andar ho to stacked master row + dated row; bahar ho to sirf ek OB row. */
  const masterOpeningDateWithinLedgerRange = useMemo(
    () => isMasterOpeningDateInLedgerQueryRange(dateRange, openingBalanceRowDate),
    [dateRange, openingBalanceRowDate]
  );
  // "All" preset still sets from→to — stack only when period carry ≠ books OB (pre-filter txs cut).
  const showBookOpeningAboveDatedRow =
    ledgerOpeningPillsEnabled &&
    shouldStackBookOpeningAboveDatedRow({
      ledgerDateFilterActive: Boolean(ledgerDateFilterActive),
      ledgerShowBookOpeningRow,
      booksOpeningBalance: booksObScaled,
      periodOpeningBalance: displayOpeningBalance,
      masterOpeningDateWithinLedgerRange,
    });
  /** Stacked / single dated row: master book pill vs period/pagination carry pill. */
  const bookOpeningRowPillText = ledgerOpeningPillsEnabled ? "Book Opening" : openingBalanceLabel;
  /** Dated row pill — stacked mode me hamesha; single row me Book jab filter kuch cut na kare. */
  const primaryOpeningRowPillText = ledgerOpeningPillsEnabled
    ? showBookOpeningAboveDatedRow
      ? "Dated Opening"
      : ledgerShowBookOpeningRow &&
          (!ledgerDateFilterActive ||
            (masterOpeningDateWithinLedgerRange &&
              (booksObScaled == null ||
                Math.abs(displayOpeningBalance - booksObScaled) < BOOK_OB_EPS ||
                Math.abs(displayOpeningBalance) < BOOK_OB_EPS)))
        ? "Book Opening"
        : "Dated Opening"
    : openingBalanceLabel;

  /** Narration sub-row: date se credit tak — `transactionTableShared` colsThroughCredit jaisa */
  const openingBalanceNarrationColSpan =
    visibleColumns == null
      ? dateCols +
        (showCol("syncStatus") ? 1 : 0) +
        2 +
        (context === "daybook" ? 1 : 0) +
        (isItemPartyContext && showItemPartyColumn ? 1 : 0) +
        userCol +
        fileCol +
        visibleDebitCol +
        visibleCreditCol
      : (showCol("syncStatus") ? 1 : 0) +
        (showCol("date") ? dateCols : 0) +
        (showCol("type") ? 1 : 0) +
        (showCol("voucherNo") ? 1 : 0) +
        (context === "daybook" ? 1 : 0) +
        (isItemPartyContext && showItemPartyColumn ? 1 : 0) +
        (showCol("user") && context !== "note" ? 1 : 0) +
        (showFileBySelection ? 1 : 0) +
        visibleDebitCol +
        visibleCreditCol;

  const showOpeningBalance = ["party", "account", "staff", "tax", "item", "expense", "group"].includes(context);
  const showLedgerOpeningRows = showOpeningBalance && !hideLedgerOpeningRows;

  const debitHeaderLabel =
    debitColumnHeaderLabel ?? (stockView === "amount" ? "Debit" : "In");
  const creditHeaderLabel =
    creditColumnHeaderLabel ?? (stockView === "amount" ? "Credit" : "Out");

  // Prevent header/amount overlap — opening row cells helpers
  const ensureMinGaps = true;

  /** Dated row Date column: filter from, ya page 2+ continuation (openingBalancePeriodStartDate); Book row = master OB date. */
  const datedOpeningBalanceRowDate = useMemo(() => {
    if (ledgerOpeningPillsEnabled && ledgerDateFilterActive) {
      return periodOpeningRowDate;
    }
    if (ledgerOpeningPillsEnabled && !ledgerShowBookOpeningRow && periodOpeningRowDate) {
      return periodOpeningRowDate;
    }
    return openingBalanceRowDate;
  }, [
    ledgerOpeningPillsEnabled,
    ledgerDateFilterActive,
    ledgerShowBookOpeningRow,
    periodOpeningRowDate,
    openingBalanceRowDate,
  ]);

  /** Opening row dates — normal transaction row jaisa */
  const renderOpeningBalanceDateCells = (rowDate: Date | null) => (
    <>
      {showCol("syncStatus") && <TableCell className={cn("text-center align-top", ensureMinGaps && "min-w-[78px] px-[5px]")}>-</TableCell>}
      {showOpeningBalance && showLedgerOpeningRows && showCol("date") ? (
        dateSystem === "Both" ? (
          <>
            <TableCell className={cn("align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
              {rowDate ? formatDateBS(rowDate) : ""}
            </TableCell>
            <TableCell className={cn("align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
              {rowDate ? formatDate(rowDate) : ""}
            </TableCell>
          </>
        ) : (
          <TableCell className={cn("align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
            {rowDate ? (dateSystem === "AD" ? formatDate(rowDate) : formatDateBS(rowDate)) : ""}
          </TableCell>
        )
      ) : null}
    </>
  );

  const renderOpeningBalanceMiddleCells = (
    pillLabel: string,
    showSearchSlot: boolean,
    drCrSide: TxnDrCrSide
  ) => (
    <>
      {showCol("type") && (
        <TableCell
          className={cn(
            "align-middle overflow-hidden",
            ensureMinGaps && (hasSpendWiseGroups ? "min-w-[112px] px-[5px]" : "min-w-[75px] px-[5px]")
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            {showSearchSlot ? openingBalanceLeftContent : null}
            {showSearchSlot ? openingBalanceSearch : null}
            <Badge variant="outline" className={voucherTypePillClassName(drCrSide)}>
              {pillLabel}
            </Badge>
          </div>
        </TableCell>
      )}
      {showCol("voucherNo") && (
        <TableCell className={ensureMinGaps ? "min-w-[105px] px-[5px]" : undefined} />
      )}
      {context === "daybook" && <TableCell className="max-w-[200px] truncate" />}
      {isItemPartyContext && showItemPartyColumn && (
        <TableCell className="max-w-[180px] truncate text-muted-foreground" />
      )}
      {showCol("user") && context !== "note" && (
        <TableCell className={ensureMinGaps ? "min-w-[85px] px-[5px]" : undefined} />
      )}
    </>
  );

  /** Bill-wise OB linked voucher detail — narration sub-row ya alag linked-only row par */
  const hasObLinkedVoucherDetail =
    isBillWiseMode && showNarration && (openingBalanceLinkedVoucherNos?.length ?? 0) > 0;
  /** Dated OB row ke turant baad narration ya bill-wise linked sub-row — beech ki horizontal line hide */
  const hideDatedOpeningRowBottomBeforeSubRow =
    (hasOpeningBalanceNarrationSubRow && !showBookOpeningAboveDatedRow) || hasObLinkedVoucherDetail;
  const hideBookOpeningRowBottomBeforeSubRow =
    showBookOpeningAboveDatedRow && hasOpeningBalanceNarrationSubRow;

  const openingBalanceNarrationRow = (embeddedInGroupCard = false) =>
    hasOpeningBalanceNarrationSubRow ? (
      <tr
        data-row="opening-balance-narration"
        data-pl-spend-wise-opening={useSpendWiseOpeningBalanceCard && !embeddedInGroupCard ? "" : undefined}
        className={cn(
          "narration-row border-b",
          useSpendWiseOpeningBalanceCard && !embeddedInGroupCard && "bg-blue-50/50 dark:bg-blue-950/20",
          /* OB main row + narration ke beech `TableCell` p-1 gap — tight */
          "[&>td]:!pt-0 [&>td]:!pb-0 [&>td]:border-t-0"
        )}
      >
        <TableCell
          colSpan={openingBalanceNarrationColSpan}
          className={cn(
            "px-3 text-[11px] italic leading-tight align-top whitespace-normal break-words w-full min-w-0 overflow-hidden text-black"
          )}
        >
          <span className="block min-w-0 overflow-hidden break-words font-normal" style={{ overflowWrap: "anywhere" }}>
            <span className="not-italic">Narration:</span>{" "}
            <span className="whitespace-pre-wrap">{openingBalanceNarrationTrimmed}</span>
          </span>
        </TableCell>
        {/* Bill-wise OB: linked vouchers Status+Balance span; warna empty status/balance cells */}
        {isBillWiseMode && hasObLinkedVoucherDetail ? (
          <BillWiseLinkedDetailCells
            vouchers={openingBalanceLinkedVoucherNos ?? []}
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
              <TableCell className={cn("text-center align-top py-0", ensureMinGaps && "min-w-[95px] px-[5px]")} />
            )}
            {showCol("runningBalance") && !hideBalanceColumn && (
              <TableCell className={cn("text-right", ensureMinGaps && "min-w-[115px] px-[5px]")} />
            )}
          </>
        )}
        <TableCell className="w-10 p-0" />
      </tr>
    ) : null;

  const openingBalanceLinkedOnlyRow = (embeddedInGroupCard = false) =>
    hasObLinkedVoucherDetail && !hasOpeningBalanceNarrationSubRow ? (
      <tr
        data-row="opening-balance-linked"
        data-pl-spend-wise-opening={useSpendWiseOpeningBalanceCard && !embeddedInGroupCard ? "" : undefined}
        className={cn(
          "narration-row border-b",
          useSpendWiseOpeningBalanceCard && !embeddedInGroupCard && "bg-blue-50/50 dark:bg-blue-950/20",
          "[&>td]:!pt-0 [&>td]:!pb-0 [&>td]:border-t-0"
        )}
      >
        <TableCell colSpan={openingBalanceNarrationColSpan} className="py-0" />
        <BillWiseLinkedDetailCells
          vouchers={openingBalanceLinkedVoucherNos ?? []}
          billWisePink
          showStatus={showCol("status")}
          hideStatusColumn={hideStatusColumn}
          showBalance={showCol("runningBalance")}
          hideBalanceColumn={hideBalanceColumn}
          ensureMinGaps={ensureMinGaps}
        />
        <TableCell className="w-10 p-0" />
      </tr>
    ) : null;

  const isMobile = useIsMobile();
  const names = useMemo(() => ({ ...(journalAccountNames || {}), ...(userNames || {}), ...(accountNames || {}) }), [journalAccountNames, userNames, accountNames]);

  // On mobile, party/group use same card UI for both Statement and Bill wise (not PC table).
  const useMobileCardView =
    isMobile &&
    (context === "daybook" ||
      context === "account" ||
      context === "expense" ||
      context === "staff" ||
      context === "tax" ||
      context === "item" ||
      context === "party" ||
      context === "group" ||
      context === "note");
  // Bill-wise in mobile card: party, group, staff, account (same as party details / bank details)
  const isBillWiseCardContext = resolvedBalanceMode === "bill_wise" && (context === "party" || context === "group" || context === "staff" || context === "account");
  // In party/staff/group billwise view, status shows only bill-wise link voucher no (not spend-wise RCPT/PYMT/Contra).
  const statusBillWiseOnly = resolvedBalanceMode === "bill_wise" && (context === "party" || context === "staff" || context === "group");

  // Always run these useMemos — mobile used to return early and skip them, breaking hook order when isMobile flipped.
  const mobileBlocks = useMemo((): MobileBlock[] => {
    if (!useMobileCardView) return [];
    const blocks: MobileBlock[] = [];
    let i = 0;
    while (i < tableTransactions.length) {
      const t = tableTransactions[i] as any;
      if (t._spendWiseSpacer) {
        blocks.push({ type: "spacer" });
        i++;
        continue;
      }
      if (t._spendWiseGroupFirst === true) {
        const colorIndex = typeof t._spendWiseGroupColorIndex === "number" ? t._spendWiseGroupColorIndex : 0;
        const items: any[] = [];
        while (i < tableTransactions.length) {
          const cur = tableTransactions[i] as any;
          if (cur._spendWiseSpacer) break;
          items.push(cur);
          if (cur._spendWiseGroupLast === true) {
            i++;
            break;
          }
          i++;
        }
        // Mobile: single spend-wise bhi group shell — linked jaisa rounded card
        if (items.length > 0) {
          blocks.push({ type: "group", colorIndex, items });
        }
        continue;
      }
      blocks.push({ type: "single", item: t });
      i++;
    }
    return blocks;
  }, [useMobileCardView, tableTransactions]);

  const spendWiseColWidths = useMemo((): number[] => {
    if (!hasSpendWiseGroups) return [];
    const w: number[] = [];
    if (showCol("syncStatus")) w.push(78);
    if (showCol("date")) {
      if (dateSystem === "Both") {
        w.push(95, 112);
      } else {
        w.push(112);
      }
    }
    if (showCol("type")) w.push(SPEND_WISE_TYPE_COL_PX);
    if (showCol("voucherNo")) w.push(105);
    if (context === "daybook") w.push(120);
    if (isItemPartyContext && showItemPartyColumn) w.push(90);
    if (showCol("user") && context !== "note") w.push(85);
    if (showFileBySelection) w.push(44);
    if (showCol("dr") && !hideDebitColumn) w.push(100);
    if (showCol("cr") && !hideCreditColumn) w.push(100);
    if (showCol("status") && !hideStatusColumn) w.push(95);
    if (showCol("runningBalance") && !hideBalanceColumn) w.push(115);
    w.push(40);
    return w;
  }, [
    hasSpendWiseGroups,
    dateSystem,
    context,
    groupEntityType,
    hideDebitColumn,
    hideCreditColumn,
    hideStatusColumn,
    hideBalanceColumn,
    showFileBySelection,
    showItemPartyColumn,
    isItemPartyContext,
    visibleColumns,
  ]);

  const tableBlocks = useMemo((): TableBlock[] | null => {
    if (!hasSpendWiseGroups || !tableTransactions?.length) return null;
    const blocks: TableBlock[] = [];
    let i = 0;
    while (i < tableTransactions.length) {
      const t = tableTransactions[i] as any;
      if (t._spendWiseSpacer) {
        blocks.push({ type: "spacer", id: t.id ?? (t._rowKey ?? `spacer-${i}`) });
        i++;
        continue;
      }
      const groupId = typeof t._spendWiseGroupId === "string" ? t._spendWiseGroupId : "";
      if (groupId) {
        const colorIndex = typeof t._spendWiseGroupColorIndex === "number" ? t._spendWiseGroupColorIndex : 0;
        const items: any[] = [];
        while (i < tableTransactions.length) {
          const cur = tableTransactions[i] as any;
          if (cur._spendWiseSpacer) break;
          if (String(cur._spendWiseGroupId || "") !== groupId) break;
          items.push(cur);
          i++;
        }
        const firstItem = items[0] as any;
        const lastItem = items[items.length - 1] as any;
        const clippedTop = firstItem?._spendWiseGroupFirst !== true;
        const clippedBottom = lastItem?._spendWiseGroupLast !== true;
        // Har linked/unlinked spend-wise voucher — group card (rounded box); single row par scalloped border na ho
        if (items.length > 0) {
          blocks.push({ type: "group", colorIndex, items, clippedTop, clippedBottom });
          continue;
        }
      }
      if (t._spendWiseGroupFirst === true) {
        const colorIndex = typeof t._spendWiseGroupColorIndex === "number" ? t._spendWiseGroupColorIndex : 0;
        const items: any[] = [];
        while (i < tableTransactions.length) {
          const cur = tableTransactions[i] as any;
          if (cur._spendWiseSpacer) break;
          items.push(cur);
          if (cur._spendWiseGroupLast === true) {
            i++;
            break;
          }
          i++;
        }
        if (items.length > 0) {
          blocks.push({ type: "group", colorIndex, items, clippedTop: false, clippedBottom: false });
        }
        continue;
      }
      blocks.push({ type: "single", item: t });
      i++;
    }
    return blocks;
  }, [hasSpendWiseGroups, tableTransactions]);

  /** Book/Dated opening — spend-wise group ke andar (opening-linked group ya pehla group). */
  const spendWiseOpeningEmbedBlockIndex = useMemo(() => {
    if (!useSpendWiseOpeningBalanceCard || !showOpeningBalance || !tableBlocks?.length) return -1;
    const obGroupIdx = tableBlocks.findIndex(
      (b) =>
        b.type === "group" &&
        b.items.some((t: any) => t._spendWiseGroupId === SPEND_WISE_OPENING_GROUP_ID)
    );
    if (obGroupIdx >= 0) return obGroupIdx;
    if (ledgerShowBookOpeningRow) {
      return tableBlocks.findIndex((b) => b.type === "group");
    }
    return -1;
  }, [
    useSpendWiseOpeningBalanceCard,
    showOpeningBalance,
    tableBlocks,
    ledgerShowBookOpeningRow,
  ]);

  const embedSpendWiseOpeningInGroup = spendWiseOpeningEmbedBlockIndex >= 0;

  const spendWiseOpeningRowClass = (embeddedInGroupCard: boolean, hideBottom?: boolean) =>
    embeddedInGroupCard
      ? cn(hideBottom && "[&>td]:border-b-0", hideBottom && "[&>td]:!pb-0")
      : cn(
          "bg-blue-50/50 dark:bg-blue-950/20",
          "[&>td]:border-y [&>td]:border-blue-500 [&>td]:border-solid",
          "[&>td:first-child]:border-l [&>td:last-child]:border-r",
          "[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl",
          "[&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden",
          hideBottom && "[&>td]:border-b-0",
          hideBottom && "[&>td]:!pb-0"
        );

  const renderSpendWiseOpeningTableRows = (embeddedInGroupCard: boolean) => (
    <>
      {showBookOpeningAboveDatedRow && (
        <tr
          data-row="opening-book"
          data-pl-spend-wise-opening={embeddedInGroupCard ? undefined : ""}
          data-ob-narration-follows={showBookOpeningAboveDatedRow && hideBookOpeningRowBottomBeforeSubRow ? true : undefined}
          className={spendWiseOpeningRowClass(embeddedInGroupCard, hideBookOpeningRowBottomBeforeSubRow)}
        >
          {renderOpeningBalanceDateCells(openingBalanceRowDate)}
          {renderOpeningBalanceMiddleCells(
            bookOpeningRowPillText,
            false,
            masterBookSignedScaled >= 0 ? "dr" : "cr"
          )}
          {showFileBySelection && (
            <TableCell
              className={cn("text-center align-top", ensureMinGaps && "min-w-[44px] px-[5px]")}
              onClick={(e) => e.stopPropagation()}
            >
              <OpeningBalanceFileCellContent fileUrls={openingBalanceAttachmentUrls} displayMode={fileDisplayMode} showAll={fileShowAll} />
            </TableCell>
          )}
          {showCol("dr") && !hideDebitColumn && (
            <TableCell className={cn("text-right font-semibold align-top text-green-700", ensureMinGaps && "min-w-[100px] px-[5px]")}>
              {bookRowOpeningDr > 0 ? formatFooterAmount(bookRowOpeningDr) : "-"}
            </TableCell>
          )}
          {showCol("cr") && !hideCreditColumn && (
            <TableCell className={cn("text-right font-semibold align-top text-red-700", ensureMinGaps && "min-w-[100px] px-[5px]")}>
              {bookRowOpeningCr > 0 ? formatFooterAmount(bookRowOpeningCr) : "-"}
            </TableCell>
          )}
          {showCol("status") && !hideStatusColumn && (
            <TableCell className={cn("text-center align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
              <span className="font-semibold">-</span>
            </TableCell>
          )}
          {showCol("runningBalance") && !hideBalanceColumn && (
            <TableCell className={cn("text-right font-semibold align-top", masterBookSignedScaled >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
              {formatFooterBalance(masterBookSignedScaled)}
            </TableCell>
          )}
          <TableCell className="w-10 p-1 text-center align-top" onClick={(e) => e.stopPropagation()}>
            {renderOpeningBalanceRowMenu()}
          </TableCell>
        </tr>
      )}
      {showBookOpeningAboveDatedRow && openingBalanceNarrationRow(embeddedInGroupCard)}
      <tr
        data-row="opening-balance-dated"
        data-pl-spend-wise-opening={embeddedInGroupCard ? undefined : ""}
        data-ob-narration-follows={!showBookOpeningAboveDatedRow && hideDatedOpeningRowBottomBeforeSubRow ? true : undefined}
        className={spendWiseOpeningRowClass(embeddedInGroupCard, hideDatedOpeningRowBottomBeforeSubRow)}
      >
        {renderOpeningBalanceDateCells(datedOpeningBalanceRowDate)}
        {renderOpeningBalanceMiddleCells(
          primaryOpeningRowPillText,
          true,
          spendWiseDatedOpeningRowSigned >= 0 ? "dr" : "cr"
        )}
        {showFileBySelection && (
          <TableCell
            className={cn("text-center align-top", ensureMinGaps && "min-w-[44px] px-[5px]")}
            onClick={(e) => e.stopPropagation()}
          >
            <OpeningBalanceFileCellContent
              fileUrls={showBookOpeningAboveDatedRow ? undefined : openingBalanceAttachmentUrls}
              displayMode={fileDisplayMode}
              showAll={fileShowAll}
            />
          </TableCell>
        )}
        {showCol("dr") && !hideDebitColumn && (
          <TableCell className={cn("text-right text-green-700 font-semibold align-top", ensureMinGaps && "min-w-[100px] px-[5px]")}>
            {(useSpendWiseOpeningBalanceCard ? spendWiseBookOpeningRowDr : displayOpeningBalanceDr) > 0
              ? formatFooterAmount(useSpendWiseOpeningBalanceCard ? spendWiseBookOpeningRowDr : displayOpeningBalanceDr)
              : "-"}
          </TableCell>
        )}
        {showCol("cr") && !hideCreditColumn && (
          <TableCell className={cn("text-right text-red-700 font-semibold align-top", ensureMinGaps && "min-w-[100px] px-[5px]")}>
            {(useSpendWiseOpeningBalanceCard ? spendWiseBookOpeningRowCr : displayOpeningBalanceCr) > 0
              ? formatFooterAmount(useSpendWiseOpeningBalanceCard ? spendWiseBookOpeningRowCr : displayOpeningBalanceCr)
              : "-"}
          </TableCell>
        )}
        {showCol("status") && !hideStatusColumn && (
          <TableCell className={cn("text-center align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
            {openingBalanceOutstanding != null ? (
              <div className="flex flex-col items-center gap-[1px] leading-tight">
                <Badge
                  variant="outline"
                  className={cn(
                    "inline-flex h-6 items-center rounded-xl px-2.5 font-medium leading-none shrink-0",
                    openingBalanceOutstanding <= 0 ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                  )}
                >
                  {openingBalanceOutstanding <= 0 ? "Paid" : openingBalanceOutstanding >= obAmount ? "Unpaid" : "Partial"}
                </Badge>
                {showNarration && openingBalanceLinkedVoucherNos?.length && !isBillWiseMode ? (
                  <LinkedVouchersColored vouchers={openingBalanceLinkedVoucherNos} align="center" />
                ) : null}
              </div>
            ) : (
              <span className="font-semibold">-</span>
            )}
          </TableCell>
        )}
        {showCol("runningBalance") && !hideBalanceColumn && (
          <TableCell className={cn("text-right font-semibold align-top", spendWiseBookOpeningBalanceForRow >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
            {formatFooterBalance(useSpendWiseOpeningBalanceCard ? spendWiseBookOpeningBalanceForRow : displayOpeningBalanceForRow)}
          </TableCell>
        )}
        <TableCell className="w-10 p-1 text-center align-top" onClick={(e) => e.stopPropagation()}>
          {renderOpeningBalanceRowMenu()}
        </TableCell>
      </tr>
      {!showBookOpeningAboveDatedRow && openingBalanceNarrationRow(embeddedInGroupCard)}
      {openingBalanceLinkedOnlyRow(embeddedInGroupCard)}
    </>
  );

  if (useMobileCardView) {
    const globalHlQ = (rowTextSearchHighlight ?? "").trim();
    const hlForColumn = (columnKey: string) => {
      const colQ = String((filters && filters[columnKey]) || "").trim();
      const q = [globalHlQ, colQ].filter(Boolean).join(" ");
      return (s: string) => highlightQueryInText(s, q);
    };
    const hl = hlForColumn("");
    const renderMobileCard = (t: any, key: string, insideGroup: boolean) => {
      if (t.type === FISCAL_YEAR_PARTITION_ROW_TYPE) {
        const label =
          typeof t._partitionLabel === "string" && t._partitionLabel
            ? t._partitionLabel
            : "── Closing fiscal period · New fiscal period ──";
        return (
          <div
            key={key}
            className="w-full rounded-lg border-2 border-blue-600/70 bg-blue-50 py-3 px-2 text-center text-xs font-semibold uppercase tracking-wide text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
            role="separator"
          >
            {label}
          </div>
        );
      }
      let debit = t.debit ?? 0;
      let credit = t.credit ?? 0;
      let balance = t.balance ?? t.runningBalance ?? 0;
      if (typeof (t as any)._spendWiseLedgerRunningBalance === "number") {
        balance = (t as any)._spendWiseLedgerRunningBalance;
      } else if (typeof (t as any)._spendWiseRunningBalance === "number") {
        balance = (t as any)._spendWiseRunningBalance;
      }
      const spendWiseLinkedAmount = (t as any)._spendWiseLinkedAmount;
      if ((t as any)._spendWiseChild && typeof spendWiseLinkedAmount === "number" && spendWiseLinkedAmount > 0) {
        const isOutflow = (t.type === "payment_out" || t.type === "direct_expense") || (Number(t.credit) > 0);
        if (isOutflow) {
          debit = 0;
          credit = spendWiseLinkedAmount;
        } else {
          debit = spendWiseLinkedAmount;
          credit = 0;
        }
      }
      // Keep mobile card balance behavior aligned with table: party/staff use running balance instead of outstanding.
      const useOutstanding = shouldUseOutstandingBalance && isBillWiseCardContext && (t.outstanding != null);
      if (useOutstanding) {
        const out = Number(t.outstanding) ?? 0;
        balance = t.type === "purchase" || t.type === "payment_out" || t.type === "direct_expense" ? -out : out;
      }
      if (context === "item" && stockView === "qty" && item) {
        debit = debit / conversionFactor;
        credit = credit / conversionFactor;
        balance = balance / conversionFactor;
      }
      const amount = credit > 0 ? credit : debit;
      const mainAmountClass =
        amount <= 0
          ? "text-muted-foreground"
          : credit > 0
            ? "text-red-600"
            : "text-green-600";
      // Mobile/local-company rows me `date` Firestore-like object ho sakta hai; direct `new Date(obj)` se date blank ho jata hai.
      const d =
        parseFirestoreDateFieldToJsDate(t.date) ??
        parseFirestoreDateFieldToJsDate((t as Record<string, unknown>).createdAt);
      const entryClock = formatVoucherEntryTimeLocal(t as Record<string, unknown>);
      const balanceSuffix = balance >= 0 ? "Dr" : "Cr";
      const balanceAbs = Math.abs(balance);
      const userName = resolveLedgerTransactionUserDisplayName(t, userNames, {
        currentUserUid,
        currentUserDisplayName,
      });
      const isItemQty = context === "item" && stockView === "qty";
      const formatAmountOrQty = (val: number) =>
        isItemQty && item ? `${formatQuantity(val)} ${displayUnit || ""}` : formatCurrency(val, { noSuffix: true, context: "transaction", noAnimation: true });
      const renderMobileAmountOrQty = (val: number) => {
        if (isItemQty && item) return `${formatQuantity(val)} ${displayUnit || ""}`;
        if (!isNumberAnimationEnabled || numberAnimationDuration <= 0) {
          return formatCurrency(val, { noSuffix: true, context: "transaction", noAnimation: true });
        }
        return (
          <AnimatedNumber
            value={val}
            duration={numberAnimationDuration}
            formatter={(next) => formatCurrency(Number(next) || 0, { noSuffix: true, context: "transaction", noAnimation: true })}
          />
        );
      };
      const renderHighlightedMobileAmountOrQty = (val: number): React.ReactNode => {
        const rendered = renderMobileAmountOrQty(val);
        return typeof rendered === "string" || typeof rendered === "number" ? hl(String(rendered)) : rendered;
      };
      const oppositeLabel = getOppositeAccountLabel(t, names, context, contextId, groupEntityType);
      const displayType = getDisplayType(t);
      const oppositeClean = (() => {
        const text = String(oppositeLabel || "").trim();
        if (!text || text === "—" || text === "N/A" || text === "-") return "";
        return text;
      })();
      // APK/mobile: voucher type + opposite name (Payment In / party / bank) always show on entity ledgers.
      const titleLabel = [t.voucherNumber || t.type || "", displayType, oppositeClean]
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .join(" · ") || "Transaction";
      const getGroupAccountName = () => {
        const getName = (id: string | undefined) => (id ? (names[id] || "—") : "");
        const id = t.type === "direct_expense" ? (t.toAccountId || t.expenseAccountId) :
          t.type === "direct_income" ? t.incomeAccountId :
          t.type === "payment_out" ? (t.expenseAccountId || t.toAccountId) :
          t.type === "payment_in" ? t.incomeAccountId :
          t.type === "journal" && Array.isArray(t.entries) ? t.entries.find((e: any) => e?.accountId)?.accountId :
          t.type === "note" ? t.entityId : undefined;
        return id ? getName(id) : "";
      };
      const groupAccountName = context === "group" ? getGroupAccountName() : "";
      const showStatusInCard = isBillWiseCardContext;
      const statusLabel = showStatusInCard ? getStatusLabel(t, context) : "";
      const statusDetailVouchers = showStatusInCard ? getStatusDetailVouchers(t, { billWiseOnly: statusBillWiseOnly }) : [];
      const showStatusDetailInCard = showNarration && statusDetailVouchers.length > 0;
      // Mobile parity with desktop: show overdue age below "Overdue" badge.
      const overdueDaysInCard = (() => {
        if (!(statusLabel === "Overdue" || (t as any).isOverdue || (t as any).paymentStatus === "overdue")) return 0;
        const due = parseFirestoreDateFieldToJsDate((t as any).dueDate);
        if (!due) return 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueOnly = new Date(due);
        dueOnly.setHours(0, 0, 0, 0);
        if (today <= dueOnly) return 0;
        return differenceInDays(today, dueOnly);
      })();
      // Mobile card narration: Note vouchers should surface note title (same intent as desktop narration row).
      const mobileNarrationLabel = t.type === "note" ? "Title" : "Narration";
      const mobileNarrationValue =
        t.type === "note"
          ? (String(t.title || "").trim() || String(t.narration || "").trim() || "—")
          : (String(t.narration || "").trim() || "—");
      const useNeutralStatus = ["Journal", "Note", "Contra", "Salary"].includes(statusLabel);
      const isPaidStatus = statusLabel === "Paid";
      const isUnpaidStatus = statusLabel === "Partial" || statusLabel === "Unpaid" || statusLabel === "Overdue";
      const isPendingApproval = highlightPendingApproval && (t as any).isApproved !== true; // mobile card — theme stripe N/A
      const isPeerPendingChange =
        String((t as any).type || "") === "inter_company" &&
        !!(t as any).interCompanyPeerPending?.proposed &&
        typeof (t as any).interCompanyPeerPending.proposed === "object" &&
        Object.keys((t as any).interCompanyPeerPending.proposed).length > 0;
      const swBorder = !insideGroup && typeof (t as any)._spendWiseGroupColorIndex === "number"
        ? ((t as any)._spendWiseGroupColorIndex === 1 ? "border-l-4 border-l-green-500" : (t as any)._spendWiseGroupColorIndex === 2 ? "border-l-4 border-l-pink-500" : "border-l-4 border-l-blue-500")
        : "";
      // Mobile transaction cards: border card-tone se match — black ki jagah thoda bold same-hue edge.
      return (
        <Card
          key={key}
          className={cn(
            "relative p-2.5 min-w-0 w-full overflow-hidden border-2 shadow-sm cursor-pointer transition-colors",
            context === "daybook" && "rounded-lg",
            swBorder,
            isPeerPendingChange
              ? "bg-blue-100 dark:bg-blue-950/40 hover:bg-blue-200 dark:hover:bg-blue-950/50 border-blue-300/90 dark:border-blue-700/55"
              : isPendingApproval
                ? "bg-pink-100 dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50 border-pink-300/90 dark:border-pink-700/55"
                : "bg-card hover:bg-muted/30 border-emerald-300/85 dark:border-emerald-800/50"
          )}
          onClick={() => onRowClick?.(t)}
        >
          <div className="flex justify-between items-start gap-2 min-w-0">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="font-bold text-sm truncate">{hl(titleLabel)}</p>
              {isPeerPendingChange ? (
                <span className="mt-0.5 inline-flex items-center rounded-full border border-blue-600/50 bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
                  Change Detected
                </span>
              ) : null}
            </div>
            <div className={cn("relative flex shrink-0 items-center justify-end gap-1 font-bold text-sm", showFileBySelection && "pl-8", mainAmountClass)}>
              {showFileBySelection ? (
                <div className="absolute left-0 top-1/2 -translate-y-1/2">
                  <MobileTransactionFilePreview
                    transaction={t}
                    showAll={fileShowAll && fileDisplayMode === "preview"}
                  />
                </div>
              ) : null}
              <span>{amount > 0 ? renderHighlightedMobileAmountOrQty(amount) : "-"}</span>
              {can("approve_transactions") &&
              effectiveNotificationSettings?.approve?.on !== false &&
              effectiveNotificationSettings?.approve?.onTransaction !== false &&
              (isPendingApproval || showApproveAllOnPage) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground/80 hover:bg-muted"
                      aria-label="Approve"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                    {isPendingApproval ? (
                      <DropdownMenuItem
                        onClick={() => effectiveOnApproveVoucher?.(t)}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </DropdownMenuItem>
                    ) : null}
                    {showApproveAllOnPage ? (
                      <DropdownMenuItem
                        onClick={() => void handleApproveAllVisible()}
                        className="flex items-center gap-2"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Approve All
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
          <div className="flex justify-between items-start gap-2 min-w-0 mt-0.5">
            <p className="text-xs text-muted-foreground break-words whitespace-normal line-clamp-none min-w-0 flex-1">
              <span className="font-semibold">{mobileNarrationLabel} : </span>
              {hl(mobileNarrationValue)}
            </p>
            {showStatusInCard && (statusLabel || showStatusDetailInCard) ? (
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                {statusLabel ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold h-[22px]",
                      useNeutralStatus ? "text-muted-foreground border-muted-foreground/40" : isPaidStatus ? "text-green-600 border-green-600/50" : isUnpaidStatus ? "text-red-600 border-red-600/50" : "text-muted-foreground border-muted-foreground/40"
                    )}
                  >
                    {hl(statusLabel)}
                  </Badge>
                ) : null}
                {overdueDaysInCard > 0 ? (
                  <span className="text-[10px] font-medium text-red-600">
                    {hl(
                      `${overdueDaysInCard} ${overdueDaysInCard === 1 ? "day" : "days"}`
                    )}
                  </span>
                ) : null}
              </div>
            ) : !hideBalanceColumn ? (
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs font-semibold px-1.5 py-0 whitespace-nowrap shrink-0",
                  balance >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                )}
              >
                <span>Bal:</span>
                {renderHighlightedMobileAmountOrQty(balanceAbs)}
                {!isItemQty ? <span> {balanceSuffix}</span> : null}
              </Badge>
            ) : null}
          </div>
          {/* Bill-wise mobile: linked vouchers Status→Balance width par wrap (print parity) */}
          {showStatusDetailInCard ? (
            <div className="mt-0.5 w-full min-w-0 flex justify-end">
              <LinkedVouchersColored
                vouchers={statusDetailVouchers}
                wrapInline
                align="start"
                billWisePink
                className="max-w-full"
              />
            </div>
          ) : null}
          <div className="flex justify-between items-end gap-2 min-w-0 mt-0.5">
            <div className="min-w-0 flex-1 overflow-hidden">
              {groupAccountName ? (
                <p className="text-xs text-muted-foreground truncate font-medium">{hl(`Account: ${groupAccountName}`)}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {hl(
                  `${
                    d
                      ? // Mobile transaction row: keep date behavior aligned with opening card for AD/BS/Both.
                        dateSystem === "Both"
                        ? `${formatDateBS(d)} · ${formatDate(d)}`
                        : dateSystem === "BS"
                          ? formatDateBS(d)
                          : formatDate(d)
                      : ""
                  }${
                    entryClock ? ` • ${entryClock}` : ""
                  }`
                )}
              </p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-0.5 flex-shrink-0">
              {showStatusInCard && !hideBalanceColumn && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs font-semibold px-1.5 py-0 whitespace-nowrap",
                    balance >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                  )}
                >
                  <span>Bal:</span>
                  {renderHighlightedMobileAmountOrQty(balanceAbs)}
                  {!isItemQty ? <span> {balanceSuffix}</span> : null}
                </Badge>
              )}
              {/* User line: single row — `max-w-[120px]` se lamba naam wrap ho jata tha */}
              <p className="text-[10px] text-muted-foreground whitespace-nowrap truncate max-w-[min(42vw,9rem)] sm:max-w-[10rem]">
                {hl(`User: ${userName}`)}
              </p>
            </div>
          </div>
        </Card>
      );
    };

    const groupContainerClass = (colorIndex: number) => {
      const border = colorIndex === 1 ? "border-2 border-green-500" : colorIndex === 2 ? "border-2 border-pink-500" : "border-2 border-blue-500";
      const bg = colorIndex === 1 ? "bg-green-50 dark:bg-green-950/30" : colorIndex === 2 ? "bg-pink-50 dark:bg-pink-950/30" : "bg-blue-50 dark:bg-blue-950/30";
      // Add a same-color outer outline so rounded corners look uniformly thick.
      const outerLayer = colorIndex === 1 ? "outline outline-1 outline-green-500/80" : colorIndex === 2 ? "outline outline-1 outline-pink-500/80" : "outline outline-1 outline-blue-500/80";
      return cn("rounded-xl overflow-hidden", border, bg, outerLayer);
    };

    // Daybook/Recent: horizontal gap comes from parent (DaybookReport/dashboard); other contexts use px-0.5
    // Mobile transaction list: 4px vertical gap between cards for cleaner scanability.
    return (
      <div className={cn("w-full min-w-0 space-y-1 pb-4 overflow-hidden", context === "daybook" ? "" : "px-0.5")}>
        {can("approve_transactions") &&
        effectiveNotificationSettings?.approve?.on !== false &&
        effectiveNotificationSettings?.approve?.onTransaction !== false &&
        showApproveAllOnPage ? (
          <div className="flex justify-end px-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void handleApproveAllVisible()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Approve All
            </Button>
          </div>
        ) : null}
        {showLedgerOpeningRows && (
          <>
            {/* Date filter + master OB: pehla card (stacked); search slot sirf neeche wale card par */}
            {showBookOpeningAboveDatedRow ? (
              <Card className="p-2.5 min-h-9 min-w-0 overflow-hidden bg-card border-2 border-emerald-300/85 dark:border-emerald-800/50 shadow-sm">
                <div className="flex justify-between items-start gap-2 min-w-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 min-h-9 justify-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit",
                        voucherTypePillClassName(masterBookSignedScaled >= 0 ? "dr" : "cr")
                      )}
                    >
                      {bookOpeningRowPillText}
                    </Badge>
                    {showCol("date") && openingBalanceRowDate ? (
                      <p className="text-sm font-medium text-foreground">
                        {dateSystem === "Both" ? (
                          <>
                            {formatDateBS(openingBalanceRowDate)} <span className="opacity-70">·</span>{" "}
                            {formatDate(openingBalanceRowDate)}
                          </>
                        ) : dateSystem === "AD" ? (
                          formatDate(openingBalanceRowDate)
                        ) : (
                          formatDateBS(openingBalanceRowDate)
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className={cn(
                      "text-sm font-bold px-2 py-0.5 rounded-md",
                      masterBookSignedScaled >= 0 ? "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-200" : "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200"
                    )}>
                      {context === "item" && stockView === "qty" && item
                        ? `${formatQuantity(Math.abs(masterBookSignedScaled))} ${displayUnit || ""}`
                        : (
                          <>
                            {formatCurrency(Math.abs(masterBookSignedScaled), { noSuffix: true, context: "transaction" })}{" "}
                            {masterBookSignedScaled >= 0 ? "Dr" : "Cr"}
                          </>
                        )}
                    </span>
                  </div>
                </div>
              </Card>
            ) : null}
            {showBookOpeningAboveDatedRow && showNarration && openingBalanceNarrationTrimmed ? (
              <p className="mt-1 pl-0 text-[11px] leading-tight text-black break-words whitespace-normal line-clamp-none min-w-0 w-full px-0.5">
                <span className="not-italic font-normal">Narration:</span>{" "}
                <span className="whitespace-pre-wrap font-normal">{openingBalanceNarrationTrimmed}</span>
              </p>
            ) : null}
            <Card className="p-2.5 min-h-9 min-w-0 overflow-hidden bg-card border border-border/80 shadow-sm">
              <div className="flex justify-between items-start gap-2 min-w-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 min-h-9 justify-center">
                  <div className="flex items-center gap-2 min-w-0">
                    {openingBalanceLeftContent}
                    {openingBalanceSearch}
                    {/* Table ke Type column pill: ledger = Book/Dated Opening; reports = `openingBalanceLabel` */}
                    <Badge
                      variant="outline"
                      className={voucherTypePillClassName(displayOpeningForDrCr >= 0 ? "dr" : "cr")}
                    >
                      {primaryOpeningRowPillText}
                    </Badge>
                  </div>
                  {showCol("date") && datedOpeningBalanceRowDate ? (
                    <p className="text-sm font-medium text-foreground">
                      {dateSystem === "Both" ? (
                        <>
                          {formatDateBS(datedOpeningBalanceRowDate)} <span className="opacity-70">·</span>{" "}
                          {formatDate(datedOpeningBalanceRowDate)}
                        </>
                      ) : dateSystem === "AD" ? (
                        formatDate(datedOpeningBalanceRowDate)
                      ) : (
                        formatDateBS(datedOpeningBalanceRowDate)
                      )}
                    </p>
                  ) : null}
                </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                {/* Bill-wise: show main amount (full OB) on top like normal transaction, then balance (outstanding) below. */}
                {isBillWiseCardContext && obOutstandingDisplay != null ? (
                  <>
                    <span className={cn(
                      "text-sm font-bold px-2 py-0.5 rounded-md",
                      displayOpeningForDrCr >= 0 ? "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-200" : "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200"
                    )}>
                      {/* In this bill-wise mobile branch, context can be narrowed; rely on qty+item check only. */}
                      {stockView === "qty" && item
                        ? `${formatQuantity(Math.abs(displayOpeningForDrCr))} ${displayUnit || ""}`
                        : (
                          <>
                            {formatCurrency(Math.abs(displayOpeningForDrCr), { noSuffix: true, context: "transaction" })}{" "}
                            {displayOpeningForDrCr >= 0 ? "Dr" : "Cr"}
                          </>
                        )}
                    </span>
                    {/* Same order as normal transaction: status and link above, running balance (Bal) below */}
                    <div className="flex flex-col items-end gap-0.5 mt-0.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-semibold h-[22px]",
                          obStatusLabel === "Paid" ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                        )}
                      >
                        {obStatusLabel}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs font-semibold px-1.5 py-0 whitespace-nowrap",
                          displayOpeningBalanceForRow >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        )}
                      >
                        Bal:{formatCurrency(Math.abs(displayOpeningBalanceForRow), { noSuffix: true, context: "transaction" })}{displayOpeningBalanceForRow >= 0 ? " Dr" : " Cr"}
                      </Badge>
                    </div>
                    {/* Bill-wise OB mobile: linked vouchers Status→Balance wrap */}
                    {showNarration && openingBalanceLinkedVoucherNos?.length ? (
                      <div className="mt-0.5 w-full min-w-0 flex justify-end">
                        <LinkedVouchersColored
                          vouchers={openingBalanceLinkedVoucherNos}
                          wrapInline
                          align="start"
                          billWisePink
                          className="max-w-full"
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className={cn(
                      "text-sm font-bold px-2 py-0.5 rounded-md",
                      (isBillWiseCardContext ? displayOpeningBalanceForRow : displayOpeningForDrCr) >= 0 ? "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-200" : "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200"
                    )}>
                      {context === "item" && stockView === "qty" && item
                        ? `${formatQuantity(Math.abs(displayOpeningForDrCr))} ${displayUnit || ""}`
                        : (() => {
                            const ob = isBillWiseCardContext ? displayOpeningBalanceForRow : displayOpeningForDrCr;
                            return (
                              <>
                                {formatCurrency(Math.abs(ob), { noSuffix: true, context: "transaction" })}{" "}
                                {ob >= 0 ? "Dr" : "Cr"}
                              </>
                            );
                          })()}
                    </span>
                  </>
                )}
                {/* Bill-wise OB (no outstanding split): linked vouchers full-width wrap */}
                {isBillWiseCardContext && showNarration && openingBalanceLinkedVoucherNos?.length && obOutstandingDisplay == null ? (
                  <div className="mt-0.5 w-full min-w-0 flex justify-end">
                    <LinkedVouchersColored
                      vouchers={openingBalanceLinkedVoucherNos}
                      wrapInline
                      align="start"
                      billWisePink
                      className="max-w-full"
                    />
                  </div>
                ) : null}
              </div>
              </div>
            {!showBookOpeningAboveDatedRow && showNarration && openingBalanceNarrationTrimmed ? (
              <p className="mt-1.5 pl-0 text-[11px] leading-tight text-black break-words whitespace-normal line-clamp-none min-w-0 w-full">
                <span className="not-italic font-normal">Narration:</span>{" "}
                <span className="whitespace-pre-wrap font-normal">{openingBalanceNarrationTrimmed}</span>
              </p>
            ) : null}
          </Card>
          </>
        )}
        {(() => {
          // Large mobile ledgers: blocks ko virtualize karo; poori list map karne se WebView freeze spikes aate hain.
          const mobileVirtualizationEnabled =
            !scrollOnlyTransactions && mobileBlocks.length > 80;
          if (!mobileVirtualizationEnabled) {
            return mobileBlocks.map((block, blockIdx) => {
              if (block.type === "spacer") {
                return <div key={`spacer-${blockIdx}`} className="shrink-0 w-full" style={{ height: 20 }} aria-hidden />;
              }
              if (block.type === "group") {
                const groupKey = `group-${blockIdx}-${block.items[0]?.id ?? block.items.map((t: any) => t.id).join("-")}`;
                return (
                  <motion.div
                    key={groupKey}
                    layout="position"
                    initial={false}
                    transition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                    className={cn("space-y-1", groupContainerClass(block.colorIndex))}
                  >
                    {block.items.map((t: any, itemIdx: number) => (
                      <motion.div
                        key={`${blockIdx}-${itemIdx}-${t.id ?? (t as any)._rowKey ?? ""}`}
                        layout="position"
                        initial={false}
                        transition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                      >
                        {renderMobileCard(t, t.id, true)}
                      </motion.div>
                    ))}
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={block.item.id}
                  layout="position"
                  initial={false}
                  transition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                >
                  {renderMobileCard(block.item, block.item.id, false)}
                </motion.div>
              );
            });
          }

          return (
            <Virtuoso
              // Mobile long ledgers: only visible cards mount (plus overscan) to reduce freeze.
              style={{
                height: Math.min(
                  760,
                  Math.max(320, (typeof window !== "undefined" ? window.innerHeight : 760) - 220)
                ),
                width: "100%",
              }}
              totalCount={mobileBlocks.length}
              overscan={400}
              itemContent={(index) => {
                const block = mobileBlocks[index];
                if (!block) return null;
                if (block.type === "spacer") {
                  return <div className="w-full" style={{ height: 20 }} aria-hidden />;
                }
                if (block.type === "group") {
                  return (
                    <div className={cn("space-y-1 pr-1", groupContainerClass(block.colorIndex))}>
                      {block.items.map((t: any, itemIdx: number) => (
                        <div key={`${index}-${itemIdx}-${t.id ?? (t as any)._rowKey ?? ""}`}>
                          {renderMobileCard(t, t.id, true)}
                        </div>
                      ))}
                    </div>
                  );
                }
                return <div>{renderMobileCard(block.item, block.item.id, false)}</div>;
              }}
            />
          );
        })()}
        {!hideFooter ? (
          <Card className="p-2.5 min-w-0 overflow-hidden bg-card border-2 border-emerald-300/85 dark:border-emerald-800/50 shadow-sm">
            <div className="flex min-w-0 items-center gap-2">
              {closingBalanceActions ? (
                <div
                  className="min-w-0 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {closingBalanceActions}
                </div>
              ) : null}
              {!hideBalanceColumn ? (
                <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">Closing Balance</span>
                  <span className="shrink-0 text-sm">{formatFooterBalance(displayClosingBalance)}</span>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    );
  }

  const tableContent = (
      <Table
        className={cn(
          ensureMinGaps ? "table-auto w-full min-w-full" : "table-fixed w-full",
          "border-separate border-spacing-0",
          // Spend-wise: fill viewport like statement view — w-max (max-content) was stretching rows/headers
          // when linked groups + narration had wide intrinsic width. Colgroup + table-fixed keep columns aligned.
          hasSpendWiseGroups && "w-full min-w-0 table-fixed",
          "border-b-2 border-border"
        )}
        scrollContainer={false}
      >
        {hasSpendWiseGroups && spendWiseColWidths.length > 0 && (
          <colgroup>
            {spendWiseColWidths.map((width, i) => (
              <col key={i} style={{ width: `${width}px` }} />
            ))}
          </colgroup>
        )}
        <TableHeader>
        <TableRow className="border-b-2 border-black hover:bg-transparent [&>th]:border-b-2 [&>th]:border-black">
          {showCol("syncStatus") && renderHeaderWithFilter("syncStatus", "Sync", false, ensureMinGaps ? 78 : undefined)}
          {showCol("date") && (dateSystem === "Both" ? (
            <>
              {renderHeaderWithFilter("date_bs", "Date (BS)", false, ensureMinGaps ? 95 : undefined)}
              {renderHeaderWithFilter("date_ad", "Date (AD)", false, ensureMinGaps ? 112 : undefined)}
            </>
          ) : (
            renderHeaderWithFilter("date", "Date", false, ensureMinGaps ? 112 : undefined)
          ))}
          {showCol("type") && renderHeaderWithFilter("type", "Type", false, ensureMinGaps ? (hasSpendWiseGroups ? SPEND_WISE_TYPE_COL_PX : 75) : undefined)}
          {showCol("voucherNo") && renderHeaderWithFilter("voucherNumber", "Voucher No.", false, ensureMinGaps ? 105 : undefined)}
          {context === 'daybook' && renderHeaderWithFilter("accounts", "Accounts", false, ensureMinGaps ? 120 : undefined)}
          {/* Item + Item-group page: Party header visibility follows Columns dropdown toggle. */}
          {isItemPartyContext && showItemPartyColumn && <TableHead className="font-semibold p-0" style={ensureMinGaps ? { minWidth: "90px" } : undefined}>Party</TableHead>}
          {showCol("user") && context !== 'note' && renderHeaderWithFilter("user", "User", false, ensureMinGaps ? 85 : undefined)}
          {showFileBySelection && renderFileHeaderWithFilter()}
          {showCol("dr") && !hideDebitColumn && renderHeaderWithFilter("debit", debitHeaderLabel, true, ensureMinGaps ? 100 : undefined)}
          {showCol("cr") && !hideCreditColumn && renderHeaderWithFilter("credit", creditHeaderLabel, true, ensureMinGaps ? 100 : undefined)}
          {showCol("status") && !hideStatusColumn && renderHeaderWithFilter("status", "Status", false, ensureMinGaps ? 95 : undefined)}
          {showCol("runningBalance") && !hideBalanceColumn && renderHeaderWithFilter("balance", stockView === 'amount' ? "Balance" : "Stock", true, ensureMinGaps ? 115 : undefined)}
          <TableHead className="w-10 p-0" />
        </TableRow>
      </TableHeader>
      
      <TableBody>
        <>
            {showLedgerOpeningRows && (
              useSpendWiseOpeningBalanceCard ? (
                !embedSpendWiseOpeningInGroup ? (
                  <>
                    {renderSpendWiseOpeningTableRows(false)}
                    {/* Spend-wise bank/account view: keep visual gap between OB and first group. */}
                    <tr data-row="opening-balance-gap" aria-hidden="true" className="spend-wise-gap-row">
                      <td
                        colSpan={fullRowColSpan}
                        className="p-0 m-0 border-0 bg-transparent align-middle"
                        style={{ height: "12px", minHeight: "12px", lineHeight: 0, verticalAlign: "middle" }}
                      />
                    </tr>
                  </>
                ) : null
              ) : (
                <>
                  {/* Non–spend-wise: Book + Dated pills (dual jab filter + master OB alag ho); narration dual mein book ke baad */}
                  {showBookOpeningAboveDatedRow && (
                    <tr
                      data-row="opening-book"
                      data-ob-narration-follows={showBookOpeningAboveDatedRow && hideBookOpeningRowBottomBeforeSubRow ? true : undefined}
                      className={cn(
                        hideBookOpeningRowBottomBeforeSubRow && "border-b-0 [&>td]:border-b-0",
                        hideBookOpeningRowBottomBeforeSubRow && "[&>td]:!pb-0"
                      )}
                    >
                      {renderOpeningBalanceDateCells(openingBalanceRowDate)}
                      {renderOpeningBalanceMiddleCells(
                        bookOpeningRowPillText,
                        false,
                        masterBookSignedScaled >= 0 ? "dr" : "cr"
                      )}
                      {showFileBySelection && (
                        <TableCell
                          className={cn("text-center align-top", ensureMinGaps && "min-w-[44px] px-[5px]")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <OpeningBalanceFileCellContent fileUrls={openingBalanceAttachmentUrls} displayMode={fileDisplayMode} showAll={fileShowAll} />
                        </TableCell>
                      )}
                      {showCol("dr") && !hideDebitColumn && (
                        <TableCell className={cn("text-right text-green-700 font-semibold align-top", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                          {bookRowOpeningDr > 0 ? formatFooterAmount(bookRowOpeningDr) : "-"}
                        </TableCell>
                      )}
                      {showCol("cr") && !hideCreditColumn && (
                        <TableCell className={cn("text-right text-red-700 font-semibold align-top", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                          {bookRowOpeningCr > 0 ? formatFooterAmount(bookRowOpeningCr) : "-"}
                        </TableCell>
                      )}
                      {showCol("status") && !hideStatusColumn && (
                        <TableCell className={cn("text-center align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                          <span className="font-semibold">-</span>
                        </TableCell>
                      )}
                      {showCol("runningBalance") && !hideBalanceColumn && (
                        <TableCell className={cn("text-right font-semibold align-top", masterBookSignedScaled >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                          {formatFooterBalance(masterBookSignedScaled)}
                        </TableCell>
                      )}
                      <TableCell className="w-10 p-1 text-center align-top" onClick={(e) => e.stopPropagation()}>
                        {renderOpeningBalanceRowMenu()}
                      </TableCell>
                    </tr>
                  )}
                  {showBookOpeningAboveDatedRow && openingBalanceNarrationRow()}
                  <tr
                    data-row="opening-balance-dated"
                    data-ob-narration-follows={!showBookOpeningAboveDatedRow && hideDatedOpeningRowBottomBeforeSubRow ? true : undefined}
                    className={cn(
                      hideDatedOpeningRowBottomBeforeSubRow && "border-b-0 [&>td]:border-b-0",
                      hideDatedOpeningRowBottomBeforeSubRow && "[&>td]:!pb-0"
                    )}
                  >
                    {renderOpeningBalanceDateCells(datedOpeningBalanceRowDate)}
                    {renderOpeningBalanceMiddleCells(
                      primaryOpeningRowPillText,
                      true,
                      displayOpeningForDrCr >= 0 ? "dr" : "cr"
                    )}
                    {showFileBySelection && (
                      <TableCell
                        className={cn("text-center align-top", ensureMinGaps && "min-w-[44px] px-[5px]")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <OpeningBalanceFileCellContent
                          fileUrls={showBookOpeningAboveDatedRow ? undefined : openingBalanceAttachmentUrls}
                          displayMode={fileDisplayMode}
                          showAll={fileShowAll}
                        />
                      </TableCell>
                    )}
                    {showCol("dr") && !hideDebitColumn && <TableCell className={cn("text-right text-green-700 font-semibold align-top", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                        {displayOpeningBalanceDr > 0 ? formatFooterAmount(displayOpeningBalanceDr) : '-'}
                    </TableCell>}
                    {showCol("cr") && !hideCreditColumn && <TableCell className={cn("text-right text-red-700 font-semibold align-top", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                        {displayOpeningBalanceCr > 0 ? formatFooterAmount(displayOpeningBalanceCr) : '-'}
                    </TableCell>}
                    {showCol("status") && !hideStatusColumn && (
                      <TableCell className={cn("text-center align-top", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                        {openingBalanceOutstanding != null ? (
                          <div className="flex flex-col items-center gap-[1px] leading-tight">
                            <Badge
                              variant="outline"
                              className={cn(
                                "inline-flex h-6 items-center rounded-xl px-2.5 font-medium leading-none shrink-0",
                                openingBalanceOutstanding <= 0 ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                              )}
                            >
                              {openingBalanceOutstanding <= 0 ? "Paid" : openingBalanceOutstanding >= obAmount ? "Unpaid" : "Partial"}
                            </Badge>
                            {showNarration && openingBalanceLinkedVoucherNos?.length && !isBillWiseMode ? (
                              <LinkedVouchersColored vouchers={openingBalanceLinkedVoucherNos} align="center" />
                            ) : null}
                          </div>
                        ) : (
                          <span className="font-semibold">-</span>
                        )}
                      </TableCell>
                    )}
                    {showCol("runningBalance") && !hideBalanceColumn && (
                        <TableCell className={cn("text-right font-semibold align-top", displayOpeningBalanceForRow >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                            {formatFooterBalance(displayOpeningBalanceForRow)}
                        </TableCell>
                    )}
                    <TableCell className="w-10 p-1 text-center align-top" onClick={(e) => e.stopPropagation()}>
                        {renderOpeningBalanceRowMenu()}
                    </TableCell>
                  </tr>
                  {!showBookOpeningAboveDatedRow && openingBalanceNarrationRow()}
                  {openingBalanceLinkedOnlyRow()}
                </>
              )
            )}
            {tableTransactions.length > 0 ? (
              tableBlocks ? (
                <AnimatePresence
                  key={spendWiseListAnimateKey}
                  mode={ledgerDateFilterActive ? "sync" : "popLayout"}
                  initial={false}
                >
                  {(() => {
                    let txnStripeSeq = 0;
                    return tableBlocks.map((block, blockIndex) => {
                    if (block.type === "spacer") {
                      return (
                        <React.Fragment key={block.id}>
                          <motion.tr
                            layout={false}
                            initial={false}
                            exit={{ transition: { duration: 0 } }}
                            aria-hidden="true"
                            className="spend-wise-gap-row"
                          >
                            <td
                              colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1}
                              className="p-0 m-0 border-0 bg-transparent align-middle"
                              style={{ height: "12px", minHeight: "12px", lineHeight: 0, verticalAlign: "middle" }}
                            />
                          </motion.tr>
                        </React.Fragment>
                      );
                    }
                    if (block.type === "group") {
                      // Stable key by first item (payment_in) so date reorder doesn't remount — all cards animate same speed
                      const groupKey = `group-${block.items[0]?.id ?? block.items.map((t: any) => t.id).join("-")}`;
                      const embedOpeningHere =
                        embedSpendWiseOpeningInGroup && blockIndex === spendWiseOpeningEmbedBlockIndex;
                      const innerColSpan = spendWiseColWidths.length || fullRowColSpan;
                      const tableGroupCardClass = (colorIndex: number, clippedTop?: boolean, clippedBottom?: boolean) =>
                        cn(
                          // Add a same-color outer outline so rounded corners look uniformly thick.
                          "overflow-hidden border-[2.5px] shadow-sm",
                          clippedTop && clippedBottom
                            ? "rounded-none border-y-0"
                            : clippedTop
                              ? "rounded-b-xl border-t-0"
                              : clippedBottom
                                ? "rounded-t-xl border-b-0"
                                : "rounded-xl",
                          colorIndex === 1 && "border-green-500 bg-green-50/50 dark:bg-green-950/20",
                          colorIndex === 2 && "border-pink-500 bg-pink-50/50 dark:bg-pink-950/20",
                          (colorIndex === 0 || colorIndex === 3) && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
                          !clippedTop && !clippedBottom && colorIndex === 1 && "outline outline-1 outline-green-500/80",
                          !clippedTop && !clippedBottom && colorIndex === 2 && "outline outline-1 outline-pink-500/80",
                          !clippedTop && !clippedBottom && (colorIndex === 0 || colorIndex === 3) && "outline outline-1 outline-blue-500/80"
                        );
                      return (
                        <tr key={groupKey} className="spend-wise-group-card-row">
                          <td
                            colSpan={fullRowColSpan}
                            className="p-0 align-top border-none bg-transparent"
                            style={{ verticalAlign: "top" }}
                          >
                            <motion.div
                              layout={!ledgerDateFilterActive ? "position" : false}
                              initial={false}
                              exit={{ transition: { duration: 0 } }}
                              transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                              data-pl-spend-group-card=""
                              className={tableGroupCardClass(block.colorIndex, block.clippedTop, block.clippedBottom)}
                            >
                              {/* Inner spend-wise rows should follow the same min-width contract as the outer header table. */}
                              <table className="w-full min-w-full border-0 border-collapse table-fixed">
                                {spendWiseColWidths.length > 0 && (
                                  <colgroup>
                                    {spendWiseColWidths.map((width, i) => (
                                      <col key={i} style={{ width: `${width}px` }} />
                                    ))}
                                  </colgroup>
                                )}
                                <tbody>
                                  {embedOpeningHere ? renderSpendWiseOpeningTableRows(true) : null}
                                  {embedOpeningHere && block.items.length > 0 ? (
                                    <tr aria-hidden="true" className="spend-wise-inner-txn-sep">
                                      <td colSpan={innerColSpan} />
                                    </tr>
                                  ) : null}
                                  {block.items.map((t: any, itemIdx: number) => {
                                    const rowKey = (t as any)._rowKey ?? (t as any).id;
                                    const txnStripeIndex = txnStripeSeq++;
                                    return (
                                      <React.Fragment key={rowKey}>
                                        <TransactionRow
                                          txnStripeIndex={txnStripeIndex}
                                          transaction={t}
                                          fullRowColSpan={fullRowColSpan}
                                          animateLayout={useTxnRowLayoutAnimation}
                                          layoutTransition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                                          isSpendWiseChild={!!(t as any)._spendWiseChild}
                                          isSpendWiseGroupFirst={!!(t as any)._spendWiseGroupFirst}
                                          isSpendWiseGroupLast={!!(t as any)._spendWiseGroupLast}
                                          spendWiseRunningBalance={(t as any)._spendWiseRunningBalance}
                                          spendWiseGroupColorIndex={(t as any)._spendWiseGroupColorIndex}
                                          spendWiseGroupSize={block.items.length}
                                          spendWiseInGroupCard
                                          blinkMode={blinkMode}
                                          showNarration={showNarration}
                                          userNames={userNames}
                                          journalAccountNames={journalAccountNames}
                                          accountNames={accountNames}
                                          context={context}
                                          contextId={contextId}
                                          groupEntityType={groupEntityType}
                                          showItemPartyColumn={showItemPartyColumn}
                                          stockView={stockView}
                                          displayUnit={displayUnit}
                                          item={item}
                                          onRowClick={onRowClick}
                                          onAddLink={onAddLink}
                                          onHistoryVoucher={onHistoryVoucher}
                                          onApproveVoucher={effectiveOnApproveVoucher}
                                          onApproveAllVisible={handleApproveAllVisible}
                                          showApproveAll={showApproveAllOnPage}
                                          {...getStatementCheckRowProps(t)}
                                          isRelatedBlink={getIsRelatedBlink(t)}
                                          isSelectedRowBlink={getIsSelectedRowBlink(t)}
                                          getDisplayValue={getDisplayValue}
                                          isTaxContext={isTaxContext}
                                          isBalanceMasked={isBalanceMasked}
                                          hideBalanceColumn={hideBalanceColumn}
                                          hideStatusColumn={hideStatusColumn}
                                          visibleColumns={visibleColumns}
                                          useOutstandingForBalance={shouldUseOutstandingBalance}
                                          isBillWise={isBillWiseMode}
                                          ensureMinGaps={ensureMinGaps}
                                          showFileColumn={showFileBySelection}
                                          fileDisplayMode={fileDisplayMode}
                                          fileShowAll={fileShowAll}
                                          statusBillWiseOnly={statusBillWiseOnly}
                                          highlightPendingApproval={highlightPendingApproval}
                                          syncInFlight={syncingVoucherIds.has(String((t as any).id || ""))}
                                          onSyncNow={handleSyncVoucherNow}
                                          textSearchHighlight={rowTextSearchHighlight}
                                          columnFilters={filters}
                                          {...getSpendWiseRowMenuProps(t)}
                                        />
                                        {/* Card ke andar txn ke beech — alag sep row (zoom-stable border-top) */}
                                        {itemIdx < block.items.length - 1 ? (
                                          <tr aria-hidden="true" className="spend-wise-inner-txn-sep">
                                            <td colSpan={innerColSpan} />
                                          </tr>
                                        ) : null}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </motion.div>
                          </td>
                        </tr>
                      );
                    }
                    const t = block.item;
                    const rowKey = (t as any)._rowKey ?? (t as any).id;
                    const txnStripeIndex = txnStripeSeq++;
                    return (
                      <React.Fragment key={rowKey}>
                        <TransactionRow
                          key={rowKey}
                          txnStripeIndex={txnStripeIndex}
                          transaction={t}
                          fullRowColSpan={fullRowColSpan}
                          animateLayout={useTxnRowLayoutAnimation}
                          layoutTransition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                          isSpendWiseChild={!!(t as any)._spendWiseChild}
                          isSpendWiseGroupFirst={!!(t as any)._spendWiseGroupFirst}
                          isSpendWiseGroupLast={!!(t as any)._spendWiseGroupLast}
                          spendWiseRunningBalance={(t as any)._spendWiseRunningBalance}
                          spendWiseGroupColorIndex={(t as any)._spendWiseGroupColorIndex}
                          spendWiseGroupSize={1}
                          blinkMode={blinkMode}
                          showNarration={showNarration}
                          userNames={userNames}
                          journalAccountNames={journalAccountNames}
                          accountNames={accountNames}
                          context={context}
                          contextId={contextId}
                          groupEntityType={groupEntityType}
                          showItemPartyColumn={showItemPartyColumn}
                          stockView={stockView}
                          displayUnit={displayUnit}
                          item={item}
                          onRowClick={onRowClick}
                          onAddLink={onAddLink}
                          onHistoryVoucher={onHistoryVoucher}
                          onApproveVoucher={effectiveOnApproveVoucher}
                          onApproveAllVisible={handleApproveAllVisible}
                          showApproveAll={showApproveAllOnPage}
                          {...getStatementCheckRowProps(t)}
                          isRelatedBlink={getIsRelatedBlink(t)}
                          isSelectedRowBlink={getIsSelectedRowBlink(t)}
                          getDisplayValue={getDisplayValue}
                          isTaxContext={isTaxContext}
                          isBalanceMasked={isBalanceMasked}
                          hideBalanceColumn={hideBalanceColumn}
                          hideStatusColumn={hideStatusColumn}
                          visibleColumns={visibleColumns}
                          useOutstandingForBalance={shouldUseOutstandingBalance}
                          isBillWise={isBillWiseMode}
                          ensureMinGaps={ensureMinGaps}
                          showFileColumn={showFileBySelection}
                          fileDisplayMode={fileDisplayMode}
                          fileShowAll={fileShowAll}
                          statusBillWiseOnly={statusBillWiseOnly}
                          highlightPendingApproval={highlightPendingApproval}
                          syncInFlight={syncingVoucherIds.has(String((t as any).id || ""))}
                          onSyncNow={handleSyncVoucherNow}
                          textSearchHighlight={rowTextSearchHighlight}
                          columnFilters={filters}
                          {...getSpendWiseRowMenuProps(t)}
                        />
                      </React.Fragment>
                    );
                  });
                  })()}
                </AnimatePresence>
              ) : (
                (() => {
                  let txnStripeSeq = 0;
                  return tableTransactions.map((t: any, rowIndex: number) => {
                    const rowKey = (t as any)._rowKey ?? (t as any).id ?? `row-${rowIndex}`;
                    return (t as any)._spendWiseSpacer ? (
                      <motion.tr
                        key={rowKey}
                        layout={false}
                        initial={false}
                        exit={{ transition: { duration: 0 } }}
                        aria-hidden="true"
                        className="spend-wise-gap-row"
                      >
                        <td
                          colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1}
                          className="p-0 m-0 border-0 bg-transparent align-middle"
                          style={{ height: "12px", minHeight: "12px", lineHeight: 0, verticalAlign: "middle" }}
                        />
                      </motion.tr>
                    ) : (
                      <TransactionRow
                        key={rowKey}
                        txnStripeIndex={txnStripeSeq++}
                        transaction={t}
                        fullRowColSpan={fullRowColSpan}
                        animateLayout={useTxnRowLayoutAnimation}
                        layoutTransition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                        isSpendWiseChild={!!(t as any)._spendWiseChild}
                        isSpendWiseGroupFirst={!!(t as any)._spendWiseGroupFirst}
                        isSpendWiseGroupLast={!!(t as any)._spendWiseGroupLast}
                        spendWiseRunningBalance={(t as any)._spendWiseRunningBalance}
                        spendWiseGroupColorIndex={(t as any)._spendWiseGroupColorIndex}
                        blinkMode={blinkMode}
                        showNarration={showNarration}
                        userNames={userNames}
                        journalAccountNames={journalAccountNames}
                        accountNames={accountNames}
                        context={context}
                        contextId={contextId}
                        groupEntityType={groupEntityType}
                        showItemPartyColumn={showItemPartyColumn}
                        stockView={stockView}
                        displayUnit={displayUnit}
                        item={item}
                        onRowClick={onRowClick}
                        onAddLink={onAddLink}
                        onHistoryVoucher={onHistoryVoucher}
                        onApproveVoucher={effectiveOnApproveVoucher}
                        onApproveAllVisible={handleApproveAllVisible}
                        showApproveAll={showApproveAllOnPage}
                        {...getStatementCheckRowProps(t)}
                        isRelatedBlink={getIsRelatedBlink(t)}
                        isSelectedRowBlink={getIsSelectedRowBlink(t)}
                        getDisplayValue={getDisplayValue}
                        isTaxContext={isTaxContext}
                        isBalanceMasked={isBalanceMasked}
                        hideBalanceColumn={hideBalanceColumn}
                        hideStatusColumn={hideStatusColumn}
                        visibleColumns={visibleColumns}
                        useOutstandingForBalance={shouldUseOutstandingBalance}
                        isBillWise={isBillWiseMode}
                        ensureMinGaps={ensureMinGaps}
                        showFileColumn={showFileBySelection}
                        fileDisplayMode={fileDisplayMode}
                        fileShowAll={fileShowAll}
                        statusBillWiseOnly={statusBillWiseOnly}
                        highlightPendingApproval={highlightPendingApproval}
                        syncInFlight={syncingVoucherIds.has(String((t as any).id || ""))}
                        onSyncNow={handleSyncVoucherNow}
                        textSearchHighlight={rowTextSearchHighlight}
                        columnFilters={filters}
                        {...getSpendWiseRowMenuProps(t)}
                      />
                    );
                  });
                })()
              )
            ) : (
             <tr key="no-records-row">
              <TableCell
                colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1}
                className="text-center text-gray-500 py-2"
              >
                No matching records found
              </TableCell>
            </tr>
            )}
        </>
      </TableBody>
       
       {!hideFooter && (
        <TableFooter className="bg-white shadow-inner border-t border-b border-border">
           <TableRow aria-hidden className="bg-transparent border-0 hover:bg-transparent">
                <TableCell colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1} className="p-0 m-0 border-0 bg-transparent" style={{ height: "20px", minHeight: "6px" }} />
           </TableRow>
           <TableRow>
                <TableCell colSpan={totalColSpan} className="text-right font-semibold">
                    Total
                </TableCell>
                {showCol("dr") && !hideDebitColumn && <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {formatFooterAmount(displayTotalDr)}
                </TableCell>}
                {showCol("cr") && !hideCreditColumn && <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {formatFooterAmount(displayTotalCr)}
                </TableCell>}
                {showCol("status") && !hideStatusColumn && <TableCell className={cn("text-center font-semibold", ensureMinGaps && "min-w-[95px] px-[5px]")}>-</TableCell>}
                {showCol("runningBalance") && !hideBalanceColumn && <TableCell className={cn("text-right font-semibold", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                    -
                </TableCell>}
                <TableCell className="w-10 p-0" />
            </TableRow>
            <TableRow className="border-t-2 border-black border-b-2 border-black font-bold text-base bg-muted/30">
                <TableCell
                  colSpan={totalColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol}
                  className="align-middle"
                >
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <div
                      className="flex min-w-0 flex-wrap items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {(
                        [
                          { id: "default", label: "Default" },
                          { id: "green", label: "Green" },
                          { id: "blue", label: "Blue" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={cn(
                            chromeProPillCn,
                            "h-7 rounded-full px-2.5 text-[11px] font-semibold",
                            txnTableTone === opt.id && chromePillActive
                          )}
                          aria-pressed={txnTableTone === opt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            applyTxnTableTone(opt.id);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center">
                      {closingBalanceActions ? (
                        <div
                          className="mr-[10ch] flex items-center font-normal"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {closingBalanceActions}
                        </div>
                      ) : null}
                      <span className="shrink-0 text-right">Closing Balance</span>
                    </div>
                  </div>
                </TableCell>
                {showCol("runningBalance") && !hideBalanceColumn && <TableCell className={cn("text-right font-bold", closingBalance >= 0 ? "text-green-700" : "text-red-700", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                     {formatFooterBalance(displayClosingBalance)}
                </TableCell>}
                <TableCell className="w-10 p-0" />
            </TableRow>
        </TableFooter>
       )}
      </Table>
  );

  return (
    <div className="pl-ledger-detail-table-shell flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={tableContainerRef}
        tabIndex={0}
        role="grid"
        aria-label="Transactions"
        data-theme-table="transactions"
        data-pl-txn-table-tone={txnTableTone}
        className={cn(
          "w-full min-w-full overflow-x-auto scrollbar-slim-dim outline-none focus:outline-none border-b-2 border-border"
        )}
        onKeyDown={handleTableKeyDown}
        onClick={() => tableContainerRef.current?.focus()}
      >
        {tableContent}
      </div>
      {/* Details flex column leftover — Closing Balance ke neeche empty white fill */}
      <div className="pl-ledger-detail-empty-fill min-h-0 flex-1" aria-hidden />
    </div>
  );
}
