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
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect, useCallback, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { diff } from "deep-object-diff";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { resetVoucherHistory } from "@/lib/voucher-actions";
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

function renderValue(value: any) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">N/A</span>;
  if (typeof value === "boolean") return <Badge variant={value ? 'default' : 'secondary'}>{value ? "Yes" : "No"}</Badge>;
  
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
                            <TableCell className="font-medium align-top w-1/3 text-left">
                                <span className="font-semibold">Item: {itemName}</span>
                                <span className="mx-1 text-muted-foreground">›</span>
                                <span className="text-muted-foreground">lineItems</span>
                            </TableCell>
                            <TableCell className="bg-red-50/30 w-1/3 align-top text-left" />
                            <TableCell className="bg-green-50/30 w-1/3 align-top text-left" />
                        </TableRow>
                        {changedKeys.map((key) => (
                            <TableRow key={key} className="bg-amber-50">
                                <TableCell className="font-medium pl-8 w-1/3 align-top text-left">{key}</TableCell>
                                <TableCell className="bg-red-50/60 w-1/3 align-top text-left">{renderValue(oldItem?.[key])}</TableCell>
                                <TableCell className="bg-green-50/60 w-1/3 align-top text-left">{renderValue(newItem?.[key])}</TableCell>
                            </TableRow>
                        ))}
                    </React.Fragment>
                );
            })}
        </>
    );
}

export function HistoryDialog({ voucher, isOpen, onOpenChange, onHistoryReset }: { voucher: any; isOpen: boolean; onOpenChange: (v: boolean) => void; onHistoryReset?: () => void; }) {
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { processedParties, processedAccounts, processedStaff, processedTaxes, processedItems, expenseAccounts } = useVouchers();
  const { can } = usePermissions();
  const { companyId } = useCompany();

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
    if (userNames[userId]) return userNames[userId];
    try {
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data().displayName || userDoc.data().email || userId;
        }
    } catch (e) {}
    return userId;
  }, [userNames]);

  useEffect(() => {
    const uids = new Set(history.map((h: any) => h.changedBy).filter(Boolean));
    uids.forEach(async (uid: any) => {
        if (!userNames[uid]) {
            const name = await fetchUserName(uid);
            setUserNames((prev) => ({ ...prev, [uid as any]: name }));
        }
    });
  }, [history, userNames, fetchUserName]);

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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Voucher History #{voucher?.voucherNumber || ""}</DialogTitle>
          <DialogDescription>Last 10 modifications recorded.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-x-hidden">
          <div className="space-y-6 p-1 min-w-0 max-w-full">
            {history.length > 0 ? (
              history.map((entry: any, i: number) => (
                <div key={i} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted p-3 flex justify-between text-sm">
                    <p><b>User:</b> {userNames[entry.changedBy] || entry.changedBy}</p>
                    <p className="text-muted-foreground">
                      {formatDistanceToNow(entry.changedAt?.toDate ? entry.changedAt.toDate() : new Date(entry.changedAt), { addSuffix: true })}
                    </p>
                  </div>

                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3 text-left font-semibold">Field</TableHead>
                        <TableHead className="w-1/3 text-left font-semibold">Old</TableHead>
                        <TableHead className="w-1/3 text-left font-semibold">New</TableHead>
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
                              renderValue={renderValue}
                            />
                          );
                        }

                        const isIdField = field.toLowerCase().endsWith('id');

                        return (
                          <TableRow key={field}>
                            <TableCell className="font-medium w-1/3 align-top text-left">{field}</TableCell>
                            <TableCell className="bg-red-50/60 w-1/3 align-top text-left">{isIdField ? renderValue(getNameById(values.from, field)) : renderValue(values.from)}</TableCell>
                            <TableCell className="bg-green-50/60 w-1/3 align-top text-left">{isIdField ? renderValue(getNameById(values.to, field)) : renderValue(values.to)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-10">No history found for this voucher.</p>
            )}
          </div>
        </ScrollArea>

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
