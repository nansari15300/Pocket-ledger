"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  NESTED_VOUCHER_LINK_DIALOG_CONTENT_CN,
  NESTED_VOUCHER_LINK_DIALOG_OVERLAY_CN,
} from "@/lib/dialogShellChrome";
import type { FyUnloadedLinkHint } from "@/lib/fyPagination/types";

export function FyLinkLoadMissingPrompt({
  open,
  onOpenChange,
  hints,
  loading,
  onYes,
  onNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hints: FyUnloadedLinkHint[];
  loading?: boolean;
  onYes: (hint: FyUnloadedLinkHint) => void | Promise<void>;
  onNo: () => void;
}) {
  const hint = hints[0] ?? null;
  if (!hint) return null;

  const fyLabel = hint.fyKey.replace(/-/g, "–");
  const count = hint.voucherCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={NESTED_VOUCHER_LINK_DIALOG_CONTENT_CN}
        overlayClassName={NESTED_VOUCHER_LINK_DIALOG_OVERLAY_CN}
      >
        <DialogHeader>
          <DialogTitle>Load older vouchers?</DialogTitle>
          <DialogDescription>
            There {count === 1 ? "is" : "are"} <strong>{count}</strong> voucher{count === 1 ? "" : "s"} not
            loaded from FY <strong>{fyLabel}</strong>. Load them to link bill-wise?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={onNo}>
            No
          </Button>
          <Button type="button" disabled={loading} onClick={() => void onYes(hint)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Yes, load
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
