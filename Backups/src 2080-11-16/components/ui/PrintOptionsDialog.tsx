"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Expand, FileText, ChevronDown, ChevronUp } from "lucide-react";

interface PrintOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (option: 'expand' | 'collapse') => void;
}

export function PrintOptionsDialog({ open, onOpenChange, onSelect }: PrintOptionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg">Print Options</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center gap-2 hover:bg-accent w-full justify-start"
            onClick={() => {
              onSelect('expand');
              onOpenChange(false);
            }}
          >
            <ChevronDown className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">Print Expanded</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center gap-2 hover:bg-accent w-full justify-start"
            onClick={() => {
              onSelect('collapse');
              onOpenChange(false);
            }}
          >
            <ChevronUp className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">Print Collapsed</span>
          </Button>
        </div>
        <DialogFooter className="mt-3 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto sm:min-w-[80px]">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
