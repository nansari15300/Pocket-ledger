"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  NESTED_VOUCHER_ALERT_CONTENT_CN,
  NESTED_VOUCHER_ALERT_OVERLAY_CN,
} from "@/lib/dialogShellChrome";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useDate } from "@/hooks/useDate";
import { buildInterCompanyPeerPendingDiffRows } from "@/lib/interCompany/interCompanyPeerPendingDiffRows";
import type { InterCompanyPeerPendingFieldKey } from "@/lib/interCompany/interCompanyPeerPending";
import { applyInterCompanyPeerPendingFromLedgerVoucher } from "@/lib/interCompany/applyInterCompanyPeerPendingFromLedger";
import { PermissionDeniedError } from "@/lib/permissions/enforcePermission";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: Record<string, unknown> | null;
  onApplied?: () => void;
};

export function InterCompanyLedgerChangeDetectDialog({
  open,
  onOpenChange,
  voucher,
  onApplied,
}: Props) {
  const { companyId, allCompanies } = useCompany();
  const { user, customUser } = useAuth();
  const { formatDate, formatDateBS, dateSystem, formatCurrencyForPrint } = useDate();
  const [rows, setRows] = useState<ReturnType<typeof buildInterCompanyPeerPendingDiffRows>>([]);
  const [selected, setSelected] = useState<Partial<Record<InterCompanyPeerPendingFieldKey, boolean>>>({});
  const [applying, setApplying] = useState(false);

  const formatDateLabel = useCallback(
    (d: Date) => {
      if (dateSystem === "BS") return formatDateBS(d);
      if (dateSystem === "Both") return `${formatDateBS(d)} (${formatDate(d)})`;
      return formatDate(d);
    },
    [dateSystem, formatDate, formatDateBS]
  );

  const formatAmount = useCallback(
    (n: unknown) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return "—";
      try {
        return formatCurrencyForPrint(v);
      } catch {
        return String(v);
      }
    },
    [formatCurrencyForPrint]
  );

  const resolveCompanyName = useCallback(
    (id: string) => allCompanies.find((c) => c.id === id)?.name,
    [allCompanies]
  );

  useEffect(() => {
    if (!open || !voucher) {
      setRows([]);
      setSelected({});
      return;
    }
    const diffRows = buildInterCompanyPeerPendingDiffRows({
      voucher,
      formatDateLabel,
      formatAmount,
    });
    setRows(diffRows);
    setSelected(Object.fromEntries(diffRows.filter((d) => d.applyable).map((d) => [d.key, true])));
  }, [open, voucher, formatDateLabel, formatAmount]);

  const canApply = useMemo(() => rows.some((r) => r.applyable && selected[r.key]), [rows, selected]);

  const handleApply = async () => {
    if (!voucher || !companyId || !user?.uid) {
      toast.error("Sign in and select a company");
      return;
    }
    const keys = rows.filter((r) => r.applyable && selected[r.key]).map((r) => r.key);
    if (keys.length === 0) {
      toast.error("Tick at least one field to apply");
      return;
    }
    const toastId = toast.loading("Applying changes…");
    setApplying(true);
    try {
      await applyInterCompanyPeerPendingFromLedgerVoucher({
        voucher,
        currentCompanyId: companyId,
        userId: user.uid,
        approverName: customUser?.displayName || user.displayName || user.email || user.uid,
        applyKeys: keys,
        resolveCompanyName,
      });
      toast.success("Changes applied", { id: toastId });
      onOpenChange(false);
      onApplied?.();
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        toast.error("Permission denied", { id: toastId, description: err.message });
      } else {
        const message = err instanceof Error ? err.message : "Could not apply";
        toast.error("Apply failed", { id: toastId, description: message });
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        overlayClassName={NESTED_VOUCHER_ALERT_OVERLAY_CN}
        className={cn(NESTED_VOUCHER_ALERT_CONTENT_CN, "max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-3xl")}
      >
        <div className="border-b-[1.5px] border-foreground/80 bg-muted px-4 py-3">
          <AlertDialogHeader className="space-y-1 text-left">
            <AlertDialogTitle>Change Detected</AlertDialogTitle>
            <AlertDialogDescription>
              Peer company saved changes. Review Old vs New, then tick Apply for fields to update on this company.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <div className="max-h-[55vh] overflow-auto px-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No pending changes on this voucher.</p>
          ) : (
            <Table className="w-full min-w-[520px] [&_tr]:!border-b-[1.5px] [&_tr]:!border-foreground/90 [&_tbody>tr:last-child]:!border-b-0">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[22%] min-w-[120px] pl-4 text-left font-semibold">Field</TableHead>
                  <TableHead className="w-[30%] min-w-[140px] px-2.5 text-left font-semibold">Old</TableHead>
                  <TableHead className="w-[30%] min-w-[140px] px-2.5 text-left font-semibold">New</TableHead>
                  <TableHead className="w-[18%] min-w-[88px] pr-4 text-center font-semibold">Apply</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const checked = Boolean(selected[row.key]);
                  return (
                    <TableRow
                      key={row.key}
                      className={cn("even:bg-muted/30", !row.applyable && "bg-muted/40 opacity-90")}
                    >
                      <TableCell className="align-top whitespace-normal break-words pl-4 pr-2.5 font-medium">
                        {row.field}
                        {row.note ? (
                          <span className="mt-1 block text-[10px] font-medium leading-snug text-amber-800 dark:text-amber-200">
                            {row.note}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal break-words px-2.5 text-muted-foreground">
                        {row.oldLabel}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal break-words px-2.5 text-emerald-800 dark:text-emerald-300">
                        {row.newLabel}
                      </TableCell>
                      <TableCell className="align-middle pr-4 text-center">
                        <Checkbox
                          id={`ic-ledger-change-${row.key}`}
                          checked={row.applyable ? checked : false}
                          disabled={!row.applyable || applying}
                          aria-label={`Apply ${row.field}`}
                          onCheckedChange={(v) => {
                            if (!row.applyable) return;
                            setSelected((prev) => ({ ...prev, [row.key]: v === true }));
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <AlertDialogFooter className="border-t-[1.5px] border-foreground/80 bg-muted/40 px-4 py-3 sm:space-x-2">
          <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={!canApply || applying || rows.length === 0}
            onClick={(e) => {
              e.preventDefault();
              void handleApply();
            }}
          >
            Apply selected
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
