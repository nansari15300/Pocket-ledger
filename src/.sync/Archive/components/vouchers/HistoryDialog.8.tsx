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
import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { diff } from "deep-object-diff";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { resetVoucherHistory } from "@/lib/voucherActionsClient";
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
                        <TableRow className="bg-amber-50/50">
                            <TableCell className="font-medium align-top min-w-[160px] w-1/3 text-left pr-2.5 whitespace-normal break-words">
                                <span className="font-semibold">Item: {itemName}</span>
                                <span className="mx-1 text-muted-foreground">›</span>
                                <span className="text-muted-foreground">{capitalizeFirst("lineItems")}</span>
                            </TableCell>
                            <TableCell className="bg-red-50/30 min-w-[140px] w-1/3 align-top text-left px-2.5" />
                            <TableCell className="bg-green-50/30 min-w-[140px] w-1/3 align-top text-left pl-2.5" />
                        </TableRow>
                        {changedKeys.map((key) => (
                            <TableRow key={key} className="bg-amber-50">
                                <TableCell className="font-medium pl-8 min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">{capitalizeFirst(key)}</TableCell>
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

function EntriesChangesRows({ from, to, renderValue }: { from: any[]; to: any[]; renderValue: (v: any) => React.ReactNode }) {
  const { processedAccounts, processedStaff, processedParties, expenseAccounts, processedTaxes } = useVouchers();

  /** Returns { label, name } for an accountId. label is a type prefix like "Staff", name is the display name. */
  const resolveEntry = (id: string): { label: string; name: string } => {
    if (!id) return { label: '', name: id };
    const staff = processedStaff?.find((s: any) => s.id === id);
    if (staff) return { label: 'Staff', name: staff.name };
    const tax = processedTaxes?.find((t: any) => t.id === id);
    if (tax) return { label: '', name: tax.name || tax.accountName };
    const account = processedAccounts?.find((a: any) => a.id === id);
    if (account) return { label: '', name: account.accountName };
    const party = processedParties?.find((p: any) => p.id === id);
    if (party) return { label: '', name: party.name };
    const expense = expenseAccounts?.find((e: any) => e.id === id);
    if (expense) return { label: '', name: expense.name || expense.accountName };
    return { label: '', name: id };
  };

  const resolveAccountName = (id: string) => {
    const { label, name } = resolveEntry(id);
    return label ? `${label}: ${name}` : name;
  };

  const allAccountIds = [...new Set([
    ...(from || []).map((e: any) => e.accountId),
    ...(to || []).map((e: any) => e.accountId),
  ])];

  /** Build a display-ready entry: resolve accountId to name, clean narration, strip hidden fields */
  const prepareEntry = (entry: any) => {
    if (!entry) return null;
    const prepared: any = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'accountId') continue; // shown in header, not as sub-row
      prepared[k] = (k === 'narration' && typeof v === 'string') ? cleanNarration(v) : v;
    }
    return prepared;
  };

  const changedEntries = allAccountIds.map((id: string) => {
    const rawOld = (from || []).find((e: any) => e.accountId === id);
    const rawNew = (to || []).find((e: any) => e.accountId === id);
    if (JSON.stringify(rawOld) === JSON.stringify(rawNew)) return null;
    return { id, oldEntry: prepareEntry(rawOld), newEntry: prepareEntry(rawNew) };
  }).filter(Boolean);

  if (changedEntries.length === 0) return null;

  return (
    <>
      {changedEntries.map(({ id, oldEntry, newEntry }: any) => {
        const entryChanges = diff(oldEntry || {}, newEntry || {});
        const changedKeys = Object.keys(entryChanges);
        const { label, name } = resolveEntry(id);
        const headerLabel = label ? `${label}: ${name}` : name;
        if (changedKeys.length === 0) return null;
        return (
          <React.Fragment key={id}>
            <TableRow className="bg-amber-50/50">
              <TableCell className="font-medium align-top min-w-[160px] w-1/3 text-left pr-2.5 whitespace-normal break-words">
                <span className="font-semibold">{headerLabel}</span>
              </TableCell>
              <TableCell className="bg-red-50/30 min-w-[140px] w-1/3 align-top text-left px-2.5" />
              <TableCell className="bg-green-50/30 min-w-[140px] w-1/3 align-top text-left pl-2.5" />
            </TableRow>
            {changedKeys.map((key) => (
              <TableRow key={key} className="bg-amber-50">
                <TableCell className="font-medium pl-8 min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">{capitalizeFirst(key)}</TableCell>
                <TableCell className="bg-red-50/60 min-w-[140px] w-1/3 align-top text-left px-2.5 whitespace-normal break-words">{renderValue(oldEntry?.[key])}</TableCell>
                <TableCell className="bg-green-50/60 min-w-[140px] w-1/3 align-top text-left pl-2.5 whitespace-normal break-words">{renderValue(newEntry?.[key])}</TableCell>
              </TableRow>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}

export function HistoryDialog({ voucher, isOpen, onOpenChange, onHistoryReset }: { voucher: any; isOpen: boolean; onOpenChange: (v: boolean) => void; onHistoryReset?: () => void; }) {
  const [historyUserNames, setHistoryUserNames] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { processedParties, processedAccounts, processedStaff, processedTaxes, processedItems, expenseAccounts, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  const { companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();

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
                return (
                <div key={i} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted p-3 flex flex-wrap items-start justify-between gap-2 text-sm shrink-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0", badgeClass)}>
                        {badgeLabel}
                      </span>
                      <p className="min-w-0 break-words"><b>User:</b> {historyUserNames[entry.changedBy] || vouchersUserNames?.[entry.changedBy] || entry.changedBy}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-muted-foreground">Modified: {formatModifiedDate(entry.changedAt)}</p>
                      <p className="text-muted-foreground">
                        {formatDistanceToNow(getHistoryChangedAt(entry.changedAt) || new Date(), { addSuffix: true })}
                      </p>
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
                      {Object.entries(entry.changes).map(([field, values]: [string, any]) => {
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
                        if (field === 'entries' || field === 'Entries') {
                          return (
                            <EntriesChangesRows
                              key={field}
                              from={values.from}
                              to={values.to}
                              renderValue={renderCellValue}
                            />
                          );
                        }
                        if (
                          field === 'approvedByUserId' || field === 'approvedBy' || field === 'lastEditedByUserName' ||
                          field === 'userId' || field === 'UserId' ||
                          field === 'companyId' || field === 'CompanyId'
                        ) return null;

                        const isIdField = field.toLowerCase().endsWith('id');
                        const isUserRefField = field === 'approvedByUserId' || field === 'lastEditedBy' || field === 'changedBy' || field === 'lastEditedByUserName';
                        const resolveVal = (val: any) => (isIdField || isUserRefField) ? getNameById(val, field) : val;
                        // For lastEditedBy, "New" = who made this edit; if stored "to" is empty/N/A, use entry.changedBy (same as top "User:")
                        let displayTo = values.to;
                        if (field === 'lastEditedBy' && (values.to == null || values.to === '' || String(values.to) === 'N/A')) {
                          displayTo = entry.changedBy;
                        } else if (field === 'approvedAt' && (values.to == null || values.to === '' || String(values.to) === 'N/A')) {
                          // When unapproved, "New" shows when this change happened (real date instead of N/A)
                          displayTo = entry.changedAt;
                        } else if (field === 'date') {
                          // "date" in history: show save time (when change was recorded), not voucher transaction date (12:00 PM)
                          displayTo = entry.changedAt;
                        }

                        const fieldLabel =
                          field === 'lastEditedBy' ? 'Last edited by' :
                          field === 'lastEditedAt' ? 'Last edited date and time' :
                          field === 'date' ? 'Voucher Date' :
                          field === 'UserDisplayName' || field === 'userDisplayName' ? 'User Name' :
                          field;
                        return (
                          <TableRow key={field}>
                            <TableCell className="font-medium min-w-[160px] w-1/3 align-top text-left pr-2.5 whitespace-normal break-words">{capitalizeFirst(fieldLabel)}</TableCell>
                            <TableCell className="bg-red-50/60 min-w-[140px] w-1/3 align-top text-left px-2.5 whitespace-normal break-words">{renderCellValue(resolveVal(values.from))}</TableCell>
                            <TableCell className="bg-green-50/60 min-w-[140px] w-1/3 align-top text-left pl-2.5 whitespace-normal break-words">{renderCellValue(resolveVal(displayTo))}</TableCell>
                          </TableRow>
                        );
                      })}
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
