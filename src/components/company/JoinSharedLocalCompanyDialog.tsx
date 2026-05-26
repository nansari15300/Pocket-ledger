"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cloud } from "lucide-react";
import { JoinSharedLocalCompanyPanel } from "@/components/company/JoinSharedLocalCompanyPanel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined?: () => void;
};

/** User B — Drive par shared local companies list + Join (dialog wrapper). */
export function JoinSharedLocalCompanyDialog({ open, onOpenChange, onJoined }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Join shared local company
          </DialogTitle>
          <DialogDescription>
            Your Pocket Ledger companies on Google Drive (My Drive) and folders others shared with your Gmail.
          </DialogDescription>
        </DialogHeader>

        <JoinSharedLocalCompanyPanel
          active={open}
          embedded
          className="p-0"
          onJoined={() => {
            onJoined?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
