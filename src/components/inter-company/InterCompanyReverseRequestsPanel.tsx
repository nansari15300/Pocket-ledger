"use client";

/**
 * Target company — incoming reverse requests list; Accept par linked vouchers reverse.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useDate } from "@/hooks/useDate";
import {
  IC_REVERSE_REQUESTS_CHANGED,
  readInterCompanyReverseInbox,
  updateInterCompanyReverseRequestStatus,
  type InterCompanyReverseRequest,
} from "@/lib/interCompany/interCompanyReverseRequests";
import { applyInterCompanyReverseAccept } from "@/lib/interCompany/applyInterCompanyReverse";
import { interCompanySettingsCardClass, interCompanyVoucherTabShellClass } from "@/lib/interCompany/interCompanyVoucherChrome";

type Props = {
  companyId: string;
  /** Open IC voucher se linked — highlight/sort; list poori company inbox dikhati hai */
  highlightTargetVoucherId?: string;
  onAccepted?: () => void;
};

export function InterCompanyReverseRequestsPanel({
  companyId,
  highlightTargetVoucherId,
  onAccepted,
}: Props) {
  const { user, customUser } = useAuth();
  const { formatCurrencyForPrint, formatDate } = useDate();
  const formatAmountLabel = useCallback(
    (n: number) => formatCurrencyForPrint(n, { noAnimation: true, showDrCr: false }),
    [formatCurrencyForPrint],
  );
  const [rows, setRows] = useState<InterCompanyReverseRequest[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // Poori company inbox — badge count jaisa; pehle sirf current voucher filter tha isliye list khali rehti thi
    setRows(readInterCompanyReverseInbox(companyId));
  }, [companyId]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(IC_REVERSE_REQUESTS_CHANGED, onChange);
    return () => window.removeEventListener(IC_REVERSE_REQUESTS_CHANGED, onChange);
  }, [refresh]);

  const handleAccept = async (req: InterCompanyReverseRequest) => {
    if (!user?.uid || req.status !== "pending") return;
    setAcceptingId(req.id);
    try {
      await applyInterCompanyReverseAccept({
        request: req,
        acceptedByUid: user.uid,
        acceptedByName: customUser?.displayName || user.displayName || user.email || user.uid,
      });
      updateInterCompanyReverseRequestStatus(req.id, req.targetCompanyId, req.sourceCompanyId, {
        status: "accepted",
        acceptedAt: Date.now(),
        acceptedByUid: user.uid,
        acceptedByName: customUser?.displayName || user.displayName || user.email,
      });
      toast.success("Voucher reversed on both companies");
      refresh();
      onAccepted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAcceptingId(null);
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div className={cn("pl-inter-company-voucher space-y-3 p-1", interCompanyVoucherTabShellClass)}>
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-emerald-800" />
        <h3 className="text-sm font-semibold">Revert requests</h3>
        {pending.length > 0 ? (
          <Badge variant="destructive" className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]">
            {pending.length}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Requests from other companies to reverse linked Inter Company vouchers. Accept applies Dr/Cr reversal
        note on both sides and merges request attachments into the voucher.
      </p>

      <ScrollArea className="max-h-[min(28rem,50vh)] pr-2">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No revert requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                highlighted={
                  !!highlightTargetVoucherId &&
                  (req.targetVoucherId === highlightTargetVoucherId || !req.targetVoucherId)
                }
                formatCurrency={formatAmountLabel}
                formatDate={formatDate}
                accepting={acceptingId === req.id}
                onAccept={() => void handleAccept(req)}
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
                accepting={false}
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
  accepting,
  highlighted = false,
  onAccept,
}: {
  req: InterCompanyReverseRequest;
  formatCurrency: (n: number) => string;
  formatDate: (d: Date) => string;
  accepting: boolean;
  highlighted?: boolean;
  onAccept?: () => void;
}) {
  const created = new Date(req.createdAt);
  return (
    <div
      className={cn(
        interCompanySettingsCardClass,
        "space-y-2 p-3 text-sm",
        highlighted && "ring-2 ring-amber-400/80"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{req.sourceCompanyName}</span>
        <Badge
          variant="outline"
          className={cn(
            req.status === "pending" && "border-amber-500 text-amber-900",
            req.status === "accepted" && "border-emerald-600 text-emerald-800"
          )}
        >
          {req.status === "pending" ? "Pending" : req.status === "accepted" ? "Accepted" : req.status}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(created)}</p>
      <dl className="grid gap-1 text-xs">
        <div>
          <dt className="text-muted-foreground">Voucher</dt>
          <dd className="font-mono">
            {req.sourceVoucherNumber} → {req.targetVoucherNumber}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source account</dt>
          <dd>
            {req.sourceEntityLabel}
            {req.sourceEntityAcNo ? ` · ${req.sourceEntityAcNo}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Target account</dt>
          <dd>
            {req.targetEntityLabel}
            {req.targetEntityAcNo ? ` · ${req.targetEntityAcNo}` : ""}
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
      {req.attachmentUrls.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {req.attachmentUrls.length} attachment(s) — will merge into voucher on accept
        </p>
      ) : null}
      {req.status === "pending" && onAccept ? (
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto"
          disabled={accepting}
          onClick={onAccept}
        >
          {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Accept &amp; reverse
        </Button>
      ) : null}
    </div>
  );
}
