"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format as formatFns, formatDistanceToNow } from "date-fns";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { diff } from "deep-object-diff";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { resetVoucherHistory, deleteHistoryEntries } from "@/lib/voucherActionsClient";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Capitalize first letter of a label for display in Field column */
function capitalizeFirst(s: string): string {
  if (!s || !s.length) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const APPROVAL_FIELDS = new Set([
  'isApproved', 'IsApproved',
  'approvedAt', 'ApprovedAt',
  'approvedByUserId', 'ApprovedByUserId',
  'approvedBy', 'ApprovedBy',
  'approvedByUserName', 'ApprovedByUserName',
]);

/**
 * Display order for history fields (lower = shown first).
 * Matches the desired order: voucher no → date → accounts → entries/items →
 * amounts → narration → linked voucher → file url → approval → last edited.
 * Unknown fields get order 999.
 */
const FIELD_ORDER: Record<string, number> = {
  // 1. Voucher identifiers
  voucherNumber: 1,
  date: 2,
  // 2. Accounts / parties
  partyId: 3,
  accountId: 4, debitAccountId: 4, fromAccountId: 4, toAccountId: 4,
  // 3. Line items / journal entries body (excludes narration rows which go after total)
  lineItems: 5,
  entries: 5, Entries: 5,
  // Account identifier rows from entries — rendered AFTER total (synthetic slot)
  __entries_ids__: 10.2,
  // Narration rows from entries — rendered after identifiers (synthetic slot)
  __entries_narration__: 10.5,
  // 4. Amounts
  subTotal: 6,
  discount: 7,
  tax: 8, taxAmount: 9,
  total: 10,
  // 5. Narration (overall)
  narration: 11,
  // 6. Linked voucher
  linkedVoucherNo: 12,
  // 7. File attachments
  fileUrls: 13, fileUrl: 13, url: 13,
  // 8. Approval fields
  ApprovedByUserName: 14, approvedByUserName: 14,
  approvedAt: 15, ApprovedAt: 15,
  IsApproved: 16, isApproved: 16,
  // 9. Edit metadata
  lastEditedBy: 17,
  lastEditedAt: 18,
  // 10. User info (at end)
  UserDisplayName: 19, userDisplayName: 19,
};

/** Human-readable labels for history fields. */
const FIELD_LABELS: Record<string, string> = {
  voucherNumber: 'Voucher No',
  date: 'Voucher Date',
  partyId: 'Party',
  accountId: 'Account',
  debitAccountId: 'Debit Account',
  fromAccountId: 'From Account',
  toAccountId: 'To Account',
  lineItems: 'Line Items',
  entries: 'Entries', Entries: 'Entries',
  subTotal: 'Sub Total',
  discount: 'Discount',
  tax: 'Tax',
  taxAmount: 'Tax Amount',
  total: 'Total',
  narration: 'Overall Narration',
  linkedVoucherNo: 'Linked Voucher No',
  fileUrls: 'File URLs', fileUrl: 'File URL', url: 'URL',
  ApprovedByUserName: 'Approved By', approvedByUserName: 'Approved By',
  approvedAt: 'Approved At', ApprovedAt: 'Approved At',
  IsApproved: 'Approved', isApproved: 'Approved',
  lastEditedBy: 'Last Edited By',
  lastEditedAt: 'Last Edited Date & Time',
  UserDisplayName: 'User Name', userDisplayName: 'User Name',
};

/** Renders a URL string (or array of URLs) as clickable links. */
function renderUrlValue(value: any): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">N/A</span>;
  const urls: string[] = Array.isArray(value)
    ? value.filter((u: any) => typeof u === 'string' && u)
    : typeof value === 'string' && value ? [value] : [];
  if (urls.length === 0) return <span className="text-muted-foreground">N/A</span>;
  return (
    <div className="flex flex-col gap-1">
      {urls.map((u, idx) => (
        <a key={idx} href={u} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800 break-all text-xs">
          {urls.length > 1 ? `View File ${idx + 1}` : 'View File'}
        </a>
      ))}
    </div>
  );
}

const URL_FIELDS = new Set(['fileUrls', 'fileUrl', 'url', 'imageUrl', 'logoUrl']);

/**
 * Merges multiple history entries (from the same user, same timeframe) into one.
 * For each field: keep the earliest `from` and the latest `to`.
 */
function mergeEntryGroup(entries: any[]): any {
  // entries are sorted descending; reverse to process oldest→newest
  const sorted = [...entries].reverse();
  const mergedChanges: Record<string, { from: any; to: any }> = {};
  for (const entry of sorted) {
    for (const [field, values] of Object.entries(entry.changes || {}) as [string, any][]) {
      if (!(field in mergedChanges)) {
        mergedChanges[field] = { from: values.from, to: values.to };
      } else {
        // keep original `from`, update to the latest `to`
        mergedChanges[field] = { from: mergedChanges[field].from, to: values.to };
      }
    }
  }
  return {
    changes: mergedChanges,
    changedBy: entries[0].changedBy,
    changedAt: entries[0].changedAt, // most-recent timestamp
    _originalEntries: entries,       // keep originals for per-entry deletion
  };
}

function getMergedEntryBadge(changes: any): { label: string; className: string } {
  const allKeys = Object.keys(changes || {}).filter(
    k => k !== 'approvedByUserId' && k !== 'approvedBy' && k !== 'lastEditedByUserName'
  );
  const approvalKeys = allKeys.filter(k => APPROVAL_FIELDS.has(k));
  const editKeys = allKeys.filter(k => !APPROVAL_FIELDS.has(k));
  const hasApproval = approvalKeys.length > 0;
  const hasEdit = editKeys.length > 0;
  const isApprovedChange = changes['IsApproved'] ?? changes['isApproved'];
  const approvedTo = isApprovedChange?.to;

  if (hasEdit && hasApproval) {
    return approvedTo === true
      ? { label: 'Edited & Approved', className: 'bg-blue-600 text-white' }
      : { label: 'Edited & Unapproved', className: 'bg-blue-600 text-white' };
  }
  if (hasApproval) {
    return approvedTo === true
      ? { label: 'Approved', className: 'bg-green-600 text-white' }
      : { label: 'Unapproved', className: 'bg-rose-600 text-white' };
  }
  return { label: 'Edited', className: 'bg-blue-600 text-white' };
}

function renderValue(value: any) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">N/A</span>;
  if (typeof value === "boolean") return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap", value ? "bg-green-600 text-white" : "bg-pink-500 text-white")}>
      {value ? "Yes" : "No"}
    </span>
  );
  
  const isTimestamp = value?.toDate instanceof Function || (value?._seconds !== undefined && value?._nanoseconds !== undefined);
  if (isTimestamp) {
    const date = value.toDate ? value.toDate() : new Date(value._seconds * 1000);
    return date.toLocaleString();
  }

  if (typeof value === "object") return <pre className="text-xs whitespace-pre-wrap break-words bg-muted/50 p-2 rounded-md max-w-full">{JSON.stringify(value, null, 2)}</pre>;
  return <span className="break-words whitespace-normal">{String(value)}</span>;
}

function LineItemChangesRows({ from, to, renderValue }: { from: any[]; to: any[]; renderValue: (v: any) => React.ReactNode }) {
    const { processedItems, processedTaxes } = useVouchers();

    const allItemIds = [...new Set([...(from || []).map((i: any) => i.itemId), ...(to || []).map((i: any) => i.itemId)])];

    const changedItems = allItemIds.map((id: string) => {
        const oldItem = (from || []).find((i: any) => i.itemId === id);
        const newItem = (to || []).find((i: any) => i.itemId === id);

        const oldItemName = processedItems.find((pi: any) => pi.id === oldItem?.itemId)?.name || oldItem?.itemId;
        const newItemName = processedItems.find((pi: any) => pi.id === newItem?.itemId)?.name || newItem?.itemId;

        const oldTaxName = processedTaxes.find((pt: any) => pt.id === oldItem?.taxAccountId)?.name || oldItem?.taxAccountId;
        const newTaxName = processedTaxes.find((pt: any) => pt.id === newItem?.taxAccountId)?.name || newItem?.taxAccountId;

        const displayOld = { ...oldItem, itemId: oldItemName, taxAccountId: oldTaxName };
        const displayNew = { ...newItem, itemId: newItemName, taxAccountId: newTaxName };

        if (JSON.stringify(oldItem) === JSON.stringify(newItem)) return null;

        return { id, oldItem: displayOld, newItem: displayNew };
    }).filter(Boolean);

    if (changedItems.length === 0) return null;

    return (
        <>
            {changedItems.map(({ id, oldItem, newItem }: any) => {
                const itemChanges = diff(oldItem || {}, newItem || {});
                const changedKeys = Object.keys(itemChanges);
                const itemName = processedItems.find((i: any) => i.id === id)?.name || `ID: ${id}`;

                if (changedKeys.length === 0) return null;

                return (
                    <React.Fragment key={id}>
                        {changedKeys.map((key) => (
                            <TableRow key={key} className="bg-amber-50">
                                <TableCell className="font-medium min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">
                                    <span className="font-semibold text-amber-800">Item: {itemName}</span>
                                    <span className="mx-1 text-muted-foreground">—</span>
                                    <span>{capitalizeFirst(key)}</span>
                                </TableCell>
                                <TableCell className="bg-red-50/60 min-w-[140px] w-1/3 align-top text-left px-2.5 whitespace-normal break-words">{renderValue(oldItem?.[key])}</TableCell>
                                <TableCell className="bg-green-50/60 min-w-[140px] w-1/3 align-top text-left pl-2.5 whitespace-normal break-words">{renderValue(newItem?.[key])}</TableCell>
                            </TableRow>
                        ))}
                    </React.Fragment>
                );
            })}
        </>
    );
}

/** Strip auto-appended "(Staff ID: ...)" from narration strings */
function cleanNarration(value: any): any {
  if (typeof value !== 'string') return value;
  return value.replace(/\s*\(Staff ID:[^)]*\)/gi, '').trim();
}

/** Semantic field labels per entry type */
const ENTRY_FIELD_LABELS: Record<string, Record<string, string>> = {
  staff:   { accountId: 'Staff Member',   credit: 'Salary Amount', debit: 'Debit',          narration: 'Narration' },
  tax:     { accountId: 'Tax Account',    credit: 'Tax Amount',    debit: 'Debit',          narration: 'Narration' },
  expense: { accountId: 'Debit Account',  credit: 'Credit',        debit: 'Total Salary',   narration: 'Narration' },
  other:   { accountId: 'Account',        credit: 'Credit',        debit: 'Debit',          narration: 'Narration' },
};

/** Field order inside an entry */
const ENTRY_FIELD_ORDER = ['accountId', 'credit', 'debit', 'narration'];

type EntriesMode = 'amounts' | 'ids' | 'narration';

function EntriesChangesRows({ from, to, renderValue, mode = 'amounts' }: { from: any[]; to: any[]; renderValue: (v: any) => React.ReactNode; mode?: EntriesMode }) {
  const { processedAccounts, processedStaff, processedParties, expenseAccounts, processedTaxes } = useVouchers();

  const resolveEntryInfo = (id: string): { type: 'staff' | 'tax' | 'expense' | 'other'; name: string } => {
    if (!id) return { type: 'other', name: id };
    const staff = processedStaff?.find((s: any) => s.id === id);
    if (staff) return { type: 'staff', name: staff.name };
    const tax = processedTaxes?.find((t: any) => t.id === id);
    if (tax) return { type: 'tax', name: tax.name || tax.accountName };
    const expense = expenseAccounts?.find((e: any) => e.id === id);
    if (expense) return { type: 'expense', name: expense.name || expense.accountName };
    const account = processedAccounts?.find((a: any) => a.id === id);
    if (account) return { type: 'other', name: account.accountName };
    const party = processedParties?.find((p: any) => p.id === id);
    if (party) return { type: 'other', name: party.name };
    return { type: 'other', name: id };
  };

  const fromArr = from || [];
  const toArr   = to   || [];

  // Split into: entries in both, only-removed, only-added
  const bothIds    = fromArr.filter((e: any) => toArr.some((n: any)  => n.accountId === e.accountId)).map((e: any) => e.accountId);
  const removedArr = fromArr.filter((e: any) => !toArr.some((n: any) => n.accountId === e.accountId));
  const addedArr   = toArr.filter((e: any)   => !fromArr.some((o: any) => o.accountId === e.accountId));

  // Pair removed ↔ added of the SAME type so the "Staff Member" row shows old→new in one row.
  // Sub-field rows (Salary Amount, Debit, Narration) remain SEPARATE per entry.
  const pairedNewForRemoved = new Map<string, any>(); // removedId → paired added entry
  const pairedAddedIds = new Set<string>();
  for (const removed of removedArr) {
    const { type: rType } = resolveEntryInfo(removed.accountId);
    const match = addedArr.find((a: any) =>
      !pairedAddedIds.has(a.accountId) && resolveEntryInfo(a.accountId).type === rType
    );
    if (match) {
      pairedNewForRemoved.set(removed.accountId, match);
      pairedAddedIds.add(match.accountId);
    }
  }

  // Build flat rows with sort priority
  // Priority: expense accountId (0) → staff accountId (1) → tax accountId (2) →
  //           amounts/credit (4) → other (5) → narration (10, always last)
  const rows: { key: string; label: string; oldVal: any; newVal: any; sort: number }[] = [];

  // Sort order within entries:
  // identifiers first (Debit Account → Staff Member → Tax Account)
  // then amounts (Salary Amount → Tax Amount) — so they sit right before Total
  // narration goes to __entries_narration__ slot (after Total)
  const entryTypeSortBase = (type: string, key: string): number => {
    if (key === 'accountId') {
      if (type === 'expense') return 1;   // Debit Account
      if (type === 'staff')   return 2;   // Staff Member
      if (type === 'tax')     return 3;   // Tax Account
      return 4;
    }
    if (key === 'narration') return 10;
    if (key === 'credit') {
      if (type === 'staff') return 5;     // Salary Amount
      if (type === 'tax')   return 6;     // Tax Amount
      return 7;
    }
    if (key === 'debit')  return 8;
    return 9;
  };

  /** Push sub-field rows (credit, debit, narration — NOT accountId) for one entry direction.
   *  Narration is only shown for staff entries (salary narration). Tax/expense narrations are skipped. */
  const pushSubFields = (rawOld: any, rawNew: any, prefix: string) => {
    const id = rawOld?.accountId ?? rawNew?.accountId;
    const { type } = resolveEntryInfo(id);
    const labels = ENTRY_FIELD_LABELS[type] ?? ENTRY_FIELD_LABELS.other;
    const keys = [
      ...ENTRY_FIELD_ORDER.filter(k => k !== 'accountId'),
      ...[...new Set([
        ...(rawOld ? Object.keys(rawOld) : []),
        ...(rawNew ? Object.keys(rawNew) : []),
      ])].filter(k => !ENTRY_FIELD_ORDER.includes(k) && k !== 'accountId'),
    ];
    for (const key of keys) {
      // Only show narration for staff entries; skip for tax/expense/other
      if (key === 'narration' && type !== 'staff') continue;
      // amounts mode: only credit/debit — skip narration (goes in narration slot)
      if (mode === 'amounts' && key === 'narration') continue;
      // ids mode: nothing here — accountId rows are pushed separately
      if (mode === 'ids') continue;
      // narration mode: only narration
      if (mode === 'narration' && key !== 'narration') continue;
      // Skip debit amount for expense/account entries (not meaningful to show)
      if (key === 'debit' && (type === 'expense' || type === 'other')) continue;
      let oldVal = rawOld ? (rawOld[key] ?? null) : null;
      let newVal = rawNew ? (rawNew[key] ?? null) : null;
      if (key === 'narration') {
        if (typeof oldVal === 'string') oldVal = cleanNarration(oldVal);
        if (typeof newVal === 'string') newVal = cleanNarration(newVal);
      }
      if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
      rows.push({ key: `${prefix}-${key}`, label: labels[key] ?? capitalizeFirst(key), oldVal, newVal, sort: entryTypeSortBase(type, key) });
    }
  };

  // 1. Modified entries (same accountId in both) — sub-fields only, no Staff Member row
  for (const id of bothIds) {
    const rawOld = fromArr.find((e: any) => e.accountId === id);
    const rawNew = toArr.find((e: any) => e.accountId === id);
    if (JSON.stringify(rawOld) === JSON.stringify(rawNew)) continue;
    pushSubFields(rawOld, rawNew, id);
  }

  // 2. Removed entries
  for (const rawOld of removedArr) {
    const id = rawOld.accountId;
    const { type } = resolveEntryInfo(id);
    const labels = ENTRY_FIELD_LABELS[type] ?? ENTRY_FIELD_LABELS.other;
    const pairedNew = pairedNewForRemoved.get(id) ?? null;
    // Debit Account (expense) → amounts slot (before Salary Amount)
    // Staff Member / Tax Account → ids slot (after Total)
    const accountIdSlot = type === 'expense' ? 'amounts' : 'ids';
    if (mode === accountIdSlot) {
      rows.push({
        key: `${id}-accountId`,
        label: labels.accountId ?? 'Account',
        oldVal: resolveEntryInfo(id).name,
        newVal: pairedNew ? resolveEntryInfo(pairedNew.accountId).name : null,
        sort: entryTypeSortBase(type, 'accountId'),
      });
    }
    // Sub-fields: amounts or narration slot
    pushSubFields(rawOld, pairedNew, `${id}-pair`);
  }

  // 3. Added entries — if paired, amounts/narration already shown above; only show ids row here if unpaired
  for (const rawNew of addedArr) {
    const id = rawNew.accountId;
    const isPaired = pairedAddedIds.has(id);
    if (mode === 'ids' && !isPaired) {
      const { type } = resolveEntryInfo(id);
      const labels = ENTRY_FIELD_LABELS[type] ?? ENTRY_FIELD_LABELS.other;
      rows.push({
        key: `${id}-accountId`,
        label: labels.accountId ?? 'Account',
        oldVal: null,
        newVal: resolveEntryInfo(id).name,
        sort: entryTypeSortBase(type, 'accountId'),
      });
    }
    if (!isPaired) {
      pushSubFields(null, rawNew, `${id}-add`);
    }
  }

  rows.sort((a, b) => a.sort - b.sort);
  if (rows.length === 0) return null;

  return (
    <>
      {rows.map(({ key, label, oldVal, newVal }) => (
        <TableRow key={key} className="bg-amber-50">
          <TableCell className="font-medium min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">{label}</TableCell>
          <TableCell className="bg-red-50/60 min-w-[140px] w-1/3 align-top text-left px-2.5 whitespace-normal break-words">{renderValue(oldVal)}</TableCell>
          <TableCell className="bg-green-50/60 min-w-[140px] w-1/3 align-top text-left pl-2.5 whitespace-normal break-words">{renderValue(newVal)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function HistoryDialog({ voucher, isOpen, onOpenChange, onHistoryReset, highlightTimestamp, highlightUid }: { voucher: any; isOpen: boolean; onOpenChange: (v: boolean) => void; onHistoryReset?: () => void; highlightTimestamp?: any; highlightUid?: string; }) {
  const [historyUserNames, setHistoryUserNames] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [deletingEntryIdx, setDeletingEntryIdx] = useState<number | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  // Local copy of history so per-entry deletes only remove that entry (not all)
  const [localHistory, setLocalHistory] = useState<any[] | null>(null);
  const { processedParties, processedAccounts, processedStaff, processedTaxes, processedItems, expenseAccounts, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  const { companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const history = (voucher?.history || [])
    .filter((h: any) => h.changedAt)
    .sort((a: any, b: any) => {
        const dateA = a.changedAt?.toDate ? a.changedAt.toDate() : ( a.changedAt ? new Date(a.changedAt) : 0);
        const dateB = b.changedAt?.toDate ? b.changedAt.toDate() : ( b.changedAt ? new Date(b.changedAt) : 0);
        if (dateA instanceof Date && dateB instanceof Date) {
            return dateB.getTime() - dateA.getTime();
        }
        return 0;
    });

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (historyUserNames[userId]) return historyUserNames[userId];
    if (vouchersUserNames?.[userId]) return vouchersUserNames[userId];
    try {
        const q = query(collection(firestore, "users"), where("uid", "==", userId));
        const snap = await getDocs(q);
        const byUid = snap.docs[0]?.data();
        if (byUid) {
            return byUid.displayName || byUid.name || byUid.email || userId;
        }
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        if (userDoc.exists()) {
            const data = userDoc.data();
            return data.displayName || data.name || data.email || userId;
        }
    } catch (e) {}
    return userId;
  }, [historyUserNames, vouchersUserNames]);

  useEffect(() => {
    if (!isOpen) return;
    const uids = new Set<string>();
    history.forEach((h: any) => {
      if (h?.changedBy) uids.add(String(h.changedBy));
      Object.entries(h?.changes || {}).forEach(([field, values]: [string, any]) => {
        if (field === "approvedByUserId" || field === "lastEditedBy" || field === "changedBy" || field === "lastEditedByUserName") {
          if (values?.from && values.from !== "N/A") uids.add(String(values.from));
          if (values?.to && values.to !== "N/A") uids.add(String(values.to));
        }
      });
    });

    const missing = Array.from(uids).filter((uid) => !historyUserNames[uid] && !vouchersUserNames?.[uid]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(missing.map(async (uid) => ({ uid, name: await fetchUserName(uid) }))).then((results) => {
      if (cancelled) return;
      setHistoryUserNames((prev) => {
        let changed = false;
        const next = { ...prev };
        results.forEach(({ uid, name }) => {
          if (!next[uid] && name) {
            next[uid] = name;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [history, isOpen, historyUserNames, vouchersUserNames, fetchUserName]);

  const getNameById = (id: string, type: string) => {
    if (!id) return id;
    let found;
    switch(type) {
        case 'partyId': found = processedParties.find(p => p.id === id); break;
        case 'accountId': 
        case 'fromAccountId':
        case 'toAccountId':
            found = processedAccounts.find(a => a.id === id);
            return found?.accountName || id;
        case 'staffId': found = processedStaff.find(s => s.id === id); break;
        case 'taxAccountId': found = processedTaxes.find(t => t.id === id); break;
        case 'expenseAccountId':
        case 'incomeAccountId':
            found = expenseAccounts.find(e => e.id === id); break;
        case 'lastEditedBy':
        case 'approvedByUserId':
        case 'changedBy':
        case 'lastEditedByUserName':
            return historyUserNames[id] || vouchersUserNames?.[id] || id;
        default: return id;
    }
    return found?.name || id;
  }

  const handleResetHistory = async () => {
    if (!companyId || !voucher?.id) return;
    setIsResetting(true);
    try {
      await resetVoucherHistory(companyId, voucher.id);
      toast.success("Voucher history has been reset.");
      onHistoryReset?.();
      setShowResetConfirm(false);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset history.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteEntry = async (entry: any, idx: number) => {
    if (!companyId || !voucher?.id) return;
    setDeletingEntryIdx(idx);
    try {
      const originals: any[] = entry._originalEntries ?? [entry];
      const msValues = originals.map((e: any) => {
        const c = e.changedAt;
        if (c?.toDate instanceof Function) return c.toDate().getTime();
        if (c?._seconds != null) return c._seconds * 1000;
        return typeof c === 'number' ? c : null;
      }).filter((ms: any) => ms !== null) as number[];
      await deleteHistoryEntries(companyId, voucher.id, msValues);
      toast.success("History entry deleted.");
      onHistoryReset?.();
      setConfirmDeleteIdx(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete history entry.");
    } finally {
      setDeletingEntryIdx(null);
    }
  };

  const canReset = can("reset_voucher_history") && (voucher?.history?.length ?? 0) > 0;
  const getHistoryChangedAt = useCallback((changedAt: any): Date | null => {
    if (!changedAt) return null;
    if (changedAt?.toDate instanceof Function) return changedAt.toDate();
    const parsed = new Date(changedAt);
    return isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  /**
   * Group consecutive history entries by same user + timestamps within 15 seconds,
   * then merge each group into a single display entry.
   */
  const groupedHistory = useMemo(() => {
    const groups: any[][] = [];
    for (const entry of history) {
      const entryTime = getHistoryChangedAt(entry.changedAt)?.getTime() ?? 0;
      if (groups.length > 0) {
        const lastGroup = groups[groups.length - 1];
        const lastEntry = lastGroup[0];
        const lastTime = getHistoryChangedAt(lastEntry.changedAt)?.getTime() ?? 0;
        if (lastEntry.changedBy === entry.changedBy && Math.abs(entryTime - lastTime) <= 15000) {
          lastGroup.push(entry);
          continue;
        }
      }
      groups.push([entry]);
    }
    return groups.map((group) => mergeEntryGroup(group));
  }, [history, getHistoryChangedAt]);

  /**
   * Find the grouped entry index that best matches the notification timestamp + uid.
   * Tries: time+uid match (5min window) → time-only match → most-recent by same uid → index 0.
   */
  const highlightIndex = useMemo(() => {
    if (highlightTimestamp == null || groupedHistory.length === 0) return -1;
    // highlightTimestamp is already in ms (converted in messages/page.tsx)
    const hlTime = typeof highlightTimestamp === 'number' ? highlightTimestamp : null;
    if (!hlTime) return -1;

    let bestIdx = -1;
    let bestDiff = Infinity;

    // Pass 1: time within 5 min + uid match
    groupedHistory.forEach((entry: any, idx: number) => {
      const entryTime = getHistoryChangedAt(entry.changedAt)?.getTime() ?? 0;
      const diff = Math.abs(entryTime - hlTime);
      const uidMatch = !highlightUid || entry.changedBy === highlightUid;
      if (diff <= 300000 && uidMatch && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });

    // Pass 2: time-only match within 5 min
    if (bestIdx === -1) {
      bestDiff = Infinity;
      groupedHistory.forEach((entry: any, idx: number) => {
        const entryTime = getHistoryChangedAt(entry.changedAt)?.getTime() ?? 0;
        const diff = Math.abs(entryTime - hlTime);
        if (diff <= 300000 && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = idx;
        }
      });
    }

    // Pass 3: most-recent entry by same uid
    if (bestIdx === -1 && highlightUid) {
      bestIdx = groupedHistory.findIndex((e: any) => e.changedBy === highlightUid);
    }

    // Pass 4: always highlight the most-recent entry when called from an alert
    if (bestIdx === -1) bestIdx = 0;

    return bestIdx;
  }, [highlightTimestamp, highlightUid, groupedHistory, getHistoryChangedAt]);

  // Scroll highlighted entry into center view — retry at 200ms, 500ms, 1000ms
  useEffect(() => {
    if (!isOpen || highlightIndex === -1) return;
    const scroll = () => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t1 = setTimeout(scroll, 200);
    const t2 = setTimeout(scroll, 500);
    const t3 = setTimeout(scroll, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isOpen, highlightIndex]);

  const formatModifiedDate = useCallback((changedAt: any) => {
    const changedDate = getHistoryChangedAt(changedAt);
    if (!changedDate) return "N/A";
    const dateStr = dateSystem === "BS" || dateSystem === "Both" ? formatDateBS(changedDate) : formatDate(changedDate);
    const timeStr = formatFns(changedDate, "h:mm a");
    return `${dateStr}, ${timeStr}`;
  }, [dateSystem, formatDate, formatDateBS, getHistoryChangedAt]);

  /** Renders table cell values; dates use system date format (AD/BS/Both) with time. */
  const renderCellValue = useCallback((value: any): React.ReactNode => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">N/A</span>;
    const isTimestamp = value?.toDate instanceof Function || (value?._seconds !== undefined && value?._nanoseconds !== undefined);
    if (isTimestamp) {
      const date = value.toDate ? value.toDate() : new Date((value as any)._seconds * 1000);
      const dateStr = dateSystem === "BS" || dateSystem === "Both" ? formatDateBS(date) : formatDate(date);
      const timeStr = formatFns(date, "h:mm a");
      return <span className="break-words whitespace-normal">{dateStr}, {timeStr}</span>;
    }
    return renderValue(value);
  }, [dateSystem, formatDate, formatDateBS]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg sm:rounded-xl left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-4px)] sm:w-[calc(100vw-30px)] max-w-[calc(100vw-4px)] sm:max-w-[12in] py-6 pl-[2px] pr-[2px] sm:pl-[15px] sm:pr-[15px] h-[90vh] flex flex-col min-w-0">
        <DialogHeader>
          <DialogTitle>Voucher History #{voucher?.voucherNumber || ""}</DialogTitle>
          <DialogDescription>Last 10 modifications recorded.</DialogDescription>
        </DialogHeader>

        {/* Single scroll container: horizontal + vertical so small screens get scrollbar and no overlap */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="space-y-6 p-1 min-w-[480px]">
            {groupedHistory.length > 0 ? (
              groupedHistory.map((entry: any, i: number) => {
                const { label: badgeLabel, className: badgeClass } = getMergedEntryBadge(entry.changes);
                const isHighlighted = highlightIndex !== -1 && i === highlightIndex;
                const isDimmed = highlightIndex !== -1 && i !== highlightIndex;
                return (
                <div
                  key={i}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={cn(
                    "border rounded-lg overflow-hidden transition-opacity duration-300",
                    isHighlighted && "ring-2 ring-offset-2 ring-blue-500 shadow-xl shadow-blue-200/60",
                    isDimmed && "opacity-30 pointer-events-none"
                  )}
                >
                  <div className="bg-muted p-3 flex flex-wrap items-start justify-between gap-2 text-sm shrink-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0", badgeClass)}>
                        {badgeLabel}
                      </span>
                      <p className="min-w-0 break-words"><b>User:</b> {historyUserNames[entry.changedBy] || vouchersUserNames?.[entry.changedBy] || entry.changedBy}</p>
                    </div>
                    <div className="flex items-start gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-muted-foreground">Modified: {formatModifiedDate(entry.changedAt)}</p>
                        <p className="text-muted-foreground">
                          {formatDistanceToNow(getHistoryChangedAt(entry.changedAt) || new Date(), { addSuffix: true })}
                        </p>
                      </div>
                      {canReset && (
                        confirmDeleteIdx === i ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">Delete?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 px-2 text-xs"
                              disabled={deletingEntryIdx === i}
                              onClick={() => handleDeleteEntry(entry, i)}
                            >
                              {deletingEntryIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              disabled={deletingEntryIdx === i}
                              onClick={() => setConfirmDeleteIdx(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => setConfirmDeleteIdx(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  <Table className="w-full min-w-[480px]" scrollContainer={false}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left font-semibold min-w-[160px] w-1/3 pr-2.5">Field</TableHead>
                        <TableHead className="text-left font-semibold min-w-[140px] w-1/3 px-2.5">Old</TableHead>
                        <TableHead className="text-left font-semibold min-w-[140px] w-1/3 pl-2.5">New</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const baseEntries = Object.entries(entry.changes) as [string, any][];
                        // Inject __entries_ids__ and __entries_narration__ slots so they render after Total
                        const entriesField = baseEntries.find(([f]) => f === 'entries' || f === 'Entries');
                        const withSlot: [string, any][] = entriesField
                          ? [...baseEntries, ['__entries_ids__', entriesField[1]], ['__entries_narration__', entriesField[1]]]
                          : baseEntries;
                        return withSlot
                          .sort(([a], [b]) => (FIELD_ORDER[a] ?? 999) - (FIELD_ORDER[b] ?? 999))
                          .map(([field, values]) => {
                        // --- complex sub-renderers ---
                        if (field === 'lineItems') {
                          return (
                            <LineItemChangesRows
                              key={field}
                              from={values.from}
                              to={values.to}
                              renderValue={renderCellValue}
                            />
                          );
                        }
                        // entries amounts (credit/debit only — no accountId, no narration)
                        if (field === 'entries' || field === 'Entries') {
                          return (
                            <EntriesChangesRows
                              key={field}
                              from={values.from}
                              to={values.to}
                              renderValue={renderCellValue}
                              mode="amounts"
                            />
                          );
                        }
                        // entries account identifiers (Staff Member, Tax Account, Debit Account) — after Total
                        if (field === '__entries_ids__') {
                          return (
                            <EntriesChangesRows
                              key={field}
                              from={values.from}
                              to={values.to}
                              renderValue={renderCellValue}
                              mode="ids"
                            />
                          );
                        }
                        // entries narration only — after identifiers
                        if (field === '__entries_narration__') {
                          return (
                            <EntriesChangesRows
                              key={field}
                              from={values.from}
                              to={values.to}
                              renderValue={renderCellValue}
                              mode="narration"
                            />
                          );
                        }

                        // --- hidden / internal fields ---
                        if (
                          field === 'approvedByUserId' || field === 'approvedBy' ||
                          field === 'lastEditedByUserName' ||
                          field === 'userId' || field === 'UserId' ||
                          field === 'companyId' || field === 'CompanyId' ||
                          field === 'UserEmail' || field === 'userEmail'
                        ) return null;

                        // --- resolve display values ---
                        const isIdField = field.toLowerCase().endsWith('id');
                        const isUserRefField = field === 'lastEditedBy' || field === 'changedBy';
                        const resolveVal = (val: any) => (isIdField || isUserRefField) ? getNameById(val, field) : val;

                        let displayTo = values.to;
                        const isNullish = (v: any) => v == null || v === '' || String(v) === 'N/A';
                        if ((field === 'lastEditedBy' || field === 'UserDisplayName' || field === 'userDisplayName') && isNullish(values.to)) {
                          // Fall back to the user who made this change
                          displayTo = historyUserNames[entry.changedBy] || vouchersUserNames?.[entry.changedBy] || entry.changedBy;
                        } else if (field === 'approvedAt' && isNullish(values.to)) {
                          displayTo = entry.changedAt;
                        }

                        // --- skip rows with no real change (always keep IsApproved) ---
                        const isApprovedField = field === 'IsApproved' || field === 'isApproved';
                        const isTimestampLike = (v: any) => v?.toDate instanceof Function || (v?._seconds !== undefined);
                        if (!isApprovedField && !isTimestampLike(values.from) && !isTimestampLike(displayTo) && JSON.stringify(values.from) === JSON.stringify(displayTo)) return null;

                        // --- label ---
                        const fieldLabel = FIELD_LABELS[field] ?? capitalizeFirst(field);

                        // --- URL fields: render as clickable links ---
                        if (URL_FIELDS.has(field) || field.toLowerCase().includes('url')) {
                          return (
                            <TableRow key={field}>
                              <TableCell className="font-medium min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">{fieldLabel}</TableCell>
                              <TableCell className="bg-red-50/60 min-w-[140px] w-1/3 align-top text-left px-2.5 whitespace-normal break-words">{renderUrlValue(values.from)}</TableCell>
                              <TableCell className="bg-green-50/60 min-w-[140px] w-1/3 align-top text-left pl-2.5 whitespace-normal break-words">{renderUrlValue(displayTo)}</TableCell>
                            </TableRow>
                          );
                        }

                        // --- standard row ---
                        return (
                          <TableRow key={field}>
                            <TableCell className="font-medium min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">{fieldLabel}</TableCell>
                            <TableCell className="bg-red-50/60 min-w-[140px] w-1/3 align-top text-left px-2.5 whitespace-normal break-words">{renderCellValue(resolveVal(values.from))}</TableCell>
                            <TableCell className="bg-green-50/60 min-w-[140px] w-1/3 align-top text-left pl-2.5 whitespace-normal break-words">{renderCellValue(resolveVal(displayTo))}</TableCell>
                          </TableRow>
                        );
                      });
                      })()}
                    </TableBody>
                  </Table>
                </div>
                );
              })
            ) : (
              <p className="text-center text-muted-foreground py-10">No history found for this voucher.</p>
            )}

          </div>
        </div>

        {canReset && (
          <div className="flex justify-start pt-3 border-t shrink-0">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset History
            </Button>
          </div>
        )}

        <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset voucher history?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all history for this voucher from the server. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleResetHistory(); }}
                disabled={isResetting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isResetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset History
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
