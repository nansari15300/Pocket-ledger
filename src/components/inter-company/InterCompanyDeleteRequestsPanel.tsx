"use client";

/**
 * Incoming delete requests — Confirm delete par dono linked vouchers recycle bin.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useDate } from "@/hooks/useDate";
import {
  IC_DELETE_REQUESTS_CHANGED,
  readInterCompanyDeleteInbox,
  updateInterCompanyDeleteRequestStatus,
  type InterCompanyDeleteRequest,
} from "@/lib/interCompany/interCompanyDeleteRequests";
import { applyInterCompanyDeleteAccept } from "@/lib/interCompany/applyInterCompanyDeleteAccept";
import { interCompanySettingsCardClass, interCompanyVoucherTabShellClass } from "@/lib/interCompany/interCompanyVoucherChrome";

type Props = {
  companyId: string;
  highlightVoucherId?: string;
  onOpenVoucher?: (req: InterCompanyDeleteRequest) => void;
  onConfirmed?: () => void;
};

export function InterCompanyDeleteRequestsPanel({
  companyId,
  highlightVoucherId,
  onOpenVoucher,
  onConfirmed,
}: Props) {
  const { user, customUser } = useAuth();
  const { formatCurrencyForPrint, formatDate } = useDate();
  const formatAmountLabel = useCallback(
    (n: number) => formatCurrencyForPrint(n, { noAnimation: true, showDrCr: false }),
    [formatCurrencyForPrint]
  );
  const [rows, setRows] = useState<InterCompanyDeleteRequest[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setRows(readInterCompanyDeleteInbox(companyId));
  }, [companyId]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(IC_DELETE_REQUESTS_CHANGED, onChange);
    return () => window.removeEventListener(IC_DELETE_REQUESTS_CHANGED, onChange);
  }, [refresh]);

  const handleConfirm = async (req: InterCompanyDeleteRequest) => {
    if (!user?.uid || req.status !== "pending") return;
    setConfirmingId(req.id);
    try {
      await applyInterCompanyDeleteAccept({
        request: req,
        acceptedByUid: user.uid,
      });
      const requesterCompanyId =
        req.requestedBySide === "source" ? req.sourceCompanyId : req.targetCompanyId;
      updateInterCompanyDeleteRequestStatus(req.id, companyId, requesterCompanyId, {
        status: "accepted",
        acceptedAt: Date.now(),
        acceptedByUid: user.uid,
        acceptedByName: customUser?.displayName || user.displayName || user.email,
      });
      toast.success("Inter Company voucher deleted on both companies");
      refresh();
      onConfirmed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setConfirmingId(null);
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div className={cn("pl-inter-company-voucher space-y-3 p-1", interCompanyVoucherTabShellClass)}>
      <div className="flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-emerald-800" />
        <h3 className="text-sm font-semibold">Delete requests</h3>
        {pending.length > 0 ? (
          <Badge variant="destructive" className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]">
            {pending.length}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Another company asked to delete a linked Inter Company voucher. Confirm delete removes both
        copies from the ledger (recycle bin).
      </p>

      <ScrollArea className="max-h-[min(28rem,50vh)] pr-2">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No delete requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                highlighted={
                  !!highlightVoucherId &&
                  (req.sourceVoucherId === highlightVoucherId ||
                    req.targetVoucherId === highlightVoucherId)
                }
                formatCurrency={formatAmountLabel}
                formatDate={formatDate}
                confirming={confirmingId === req.id}
                onOpenVoucher={onOpenVoucher ? () => onOpenVoucher(req) : undefined}
                onConfirm={() => void handleConfirm(req)}
              />
            ))}
            {done.length > 0 ? (
              <p className="pt-2 text-xs font-medium text-muted-foreground">Earlier</p>
            ) : null}
            {done.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                formatCurrency={formatAmountLabel}
                formatDate={formatDate}
                confirming={false}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function RequestCard({
  req,
  formatCurrency,
  formatDate,
  confirming,
  highlighted = false,
  onOpenVoucher,
  onConfirm,
}: {
  req: InterCompanyDeleteRequest;
  formatCurrency: (n: number) => string;
  formatDate: (d: Date) => string;
  confirming: boolean;
  highlighted?: boolean;
  onOpenVoucher?: () => void;
  onConfirm?: () => void;
}) {
  const requesterName =
    req.requestedBySide === "source" ? req.sourceCompanyName : req.targetCompanyName;
  return (
    <div
      className={cn(
        interCompanySettingsCardClass,
        "space-y-2 p-3 text-sm",
        highlighted && "ring-2 ring-red-400/80"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{requesterName}</span>
        <Badge
          variant="outline"
          className={cn(
            req.status === "pending" && "border-red-500 text-red-900",
            req.status === "accepted" && "border-emerald-600 text-emerald-800"
          )}
        >
          {req.status === "pending" ? "Pending" : req.status === "accepted" ? "Deleted" : req.status}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(new Date(req.createdAt))}</p>
      <dl className="grid gap-1 text-xs">
        <div>
          <dt className="text-muted-foreground">Voucher</dt>
          <dd className="font-mono">
            {req.sourceVoucherNumber} → {req.targetVoucherNumber}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(req.amount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reason</dt>
          <dd className="whitespace-pre-wrap">{req.reason}</dd>
        </div>
      </dl>
      {req.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          {onOpenVoucher ? (
            <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={onOpenVoucher}>
              Open voucher
            </Button>
          ) : null}
          {onConfirm ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={confirming}
              onClick={onConfirm}
            >
              {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm delete
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
