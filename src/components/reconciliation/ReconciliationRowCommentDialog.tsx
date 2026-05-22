"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

/** Remote row comment — popup me poora text dekho / edit karo; You-side par read-only. */
export function ReconciliationRowCommentDialog({
  open,
  onOpenChange,
  voucherLabel,
  initialComment,
  saving,
  onSave,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherLabel: string;
  initialComment: string;
  saving?: boolean;
  onSave: (comment: string) => Promise<void>;
  /** You-side: other party ka comment sirf dekho */
  readOnly?: boolean;
}) {
  const [draft, setDraft] = React.useState(initialComment);

  React.useEffect(() => {
    if (open) setDraft(initialComment);
  }, [open, initialComment]);

  const handleSave = async () => {
    await onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* min-w-0 + max-w — textarea/dialog grid se bahar overflow na ho (mobile/APK) */}
      <DialogContent className="min-w-0 max-w-[calc(100vw-1.5rem)] overflow-hidden sm:max-w-md">
        <DialogHeader className="min-w-0 pr-6">
          <DialogTitle>{readOnly ? "Comment from other side" : "Comment"}</DialogTitle>
          <DialogDescription className="break-words text-left">{voucherLabel}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={readOnly ? "No comment from the other party yet." : "Add a note about this remote transaction…"}
          rows={5}
          className="box-border w-full min-w-0 max-w-full resize-y min-h-[100px]"
          readOnly={readOnly}
          disabled={readOnly}
        />
        <DialogFooter className="min-w-0 gap-2 sm:gap-0">
          {readOnly ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save comment
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
