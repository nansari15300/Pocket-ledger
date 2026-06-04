"use client";

import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MASTER_PRINT_KIND_LABELS,
  MASTER_PRINT_KIND_ORDER,
  type MasterPrintKind,
} from "@/lib/printMastersTypes";

export function promptPrintMastersTypes(
  initialSelected: MasterPrintKind[] = []
): Promise<MasterPrintKind[] | null> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let settled = false;
    const finish = (result: MasterPrintKind[] | null) => {
      if (settled) return;
      settled = true;
      root.unmount();
      container.remove();
      resolve(result);
    };

    function SelectDialog() {
      const [open, setOpen] = React.useState(true);
      const [selected, setSelected] = React.useState<Set<MasterPrintKind>>(
        () => new Set(initialSelected)
      );

      const allKinds = MASTER_PRINT_KIND_ORDER;
      const allSelected = allKinds.every((k) => selected.has(k));

      const toggle = (kind: MasterPrintKind, on: boolean) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (on) next.add(kind);
          else next.delete(kind);
          return next;
        });
      };

      const setAll = (on: boolean) => {
        setSelected(on ? new Set(allKinds) : new Set());
      };

      return (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) finish(null);
          }}
        >
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select masters to print</DialogTitle>
              <DialogDescription>
                Choose which master lists to include in the 4-column printout.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAll(!allSelected)}>
                  {allSelected ? "Clear all" : "Select all"}
                </Button>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              </div>
              {allKinds.map((kind) => (
                <div key={kind} className="flex items-center gap-3">
                  <Checkbox
                    id={`master-kind-${kind}`}
                    checked={selected.has(kind)}
                    onCheckedChange={(c) => toggle(kind, c === true)}
                  />
                  <Label htmlFor={`master-kind-${kind}`} className="cursor-pointer font-medium">
                    {MASTER_PRINT_KIND_LABELS[kind]}
                  </Label>
                </div>
              ))}
            </div>
            <DialogFooter className="flex-row flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => finish(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full border border-green-600 bg-green-600 text-white hover:bg-green-700"
                disabled={selected.size === 0}
                onClick={() => finish(Array.from(selected))}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }

    root.render(<SelectDialog />);
  });
}
