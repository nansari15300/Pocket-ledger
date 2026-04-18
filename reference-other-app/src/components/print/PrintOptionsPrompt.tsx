"use client";

/**
 * openPrintDirect se pehle: print me logo / company lines on/off — Promise se pdf flow resume.
 */
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

export type PrintOptionsResult = {
  printIncludeLogo: boolean;
  printIncludeCompanyDetails: boolean;
};

export function promptPrintOptions(): Promise<PrintOptionsResult | null> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let settled = false;
    const finish = (result: PrintOptionsResult | null) => {
      if (settled) return;
      settled = true;
      root.unmount();
      container.remove();
      resolve(result);
    };

    function PrintOptionsDialog() {
      const [open, setOpen] = React.useState(true);
      const [printLogo, setPrintLogo] = React.useState(true);
      const [printCompany, setPrintCompany] = React.useState(true);

      return (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) finish(null);
          }}
        >
          <DialogContent className="sm:max-w-md" aria-describedby="print-options-desc">
            <DialogHeader>
              <DialogTitle>Print options</DialogTitle>
              <DialogDescription id="print-options-desc">
                Choose what appears in the PDF header. Cancel stops printing.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-logo"
                  checked={printLogo}
                  onCheckedChange={(c) => setPrintLogo(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-logo" className="cursor-pointer font-medium">
                    Print logo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Off: logo / placeholder box header se hata diya jata hai.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-company"
                  checked={printCompany}
                  onCheckedChange={(c) => setPrintCompany(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-company" className="cursor-pointer font-medium">
                    Print company details
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Name, address, phone, PAN — off par sirf date range header par chhota rahega.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => finish(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() =>
                  finish({
                    printIncludeLogo: printLogo,
                    printIncludeCompanyDetails: printCompany,
                  })
                }
              >
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }

    root.render(<PrintOptionsDialog />);
  });
}
