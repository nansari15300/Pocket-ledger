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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { registerImperativeDialogBack } from "@/contexts/DialogBackHandlerContext";
import type { PrintColorMode } from "@/lib/printColorPalette";

export type PrintOptionsResult = {
  printIncludeLogo: boolean;
  printIncludeCompanyDetails: boolean;
  printIncludeNarration?: boolean;
  printIncludeTitle?: boolean;
  printIncludeUserColumn?: boolean;
  printIncludeFileColumn?: boolean;
  printIncludeNotes?: boolean;
  /** Color = green/red amounts; bw = sab amounts black/gray (printer-friendly). */
  printColorMode?: PrintColorMode;
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
      // PC + mobile/APK sab par same checklist — column toggles niche false (optional PDF width).
      const [printLogo, setPrintLogo] = React.useState(true);
      const [printCompany, setPrintCompany] = React.useState(true);
      const [printNarration, setPrintNarration] = React.useState(true);
      const [printTitle, setPrintTitle] = React.useState(true);
      const [printUserColumn, setPrintUserColumn] = React.useState(false);
      const [printFileColumn, setPrintFileColumn] = React.useState(false);
      const [printNotes, setPrintNotes] = React.useState(false);
      const [printColorMode, setPrintColorMode] = React.useState<PrintColorMode>("color");

      React.useEffect(() => {
        if (!open) return;
        // Android device back: is print options dialog ko pehle close karo; peeche ka page route back consume na ho.
        return registerImperativeDialogBack(() => {
          setOpen(false);
          finish(null);
        });
      }, [open]);

      return (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) finish(null);
          }}
        >
          <DialogContent
            // Choti screen par full-ish height scroll; desktop par `max-w-md` + overflow — options list lambi hai.
            className="w-[98vw] max-w-[98vw] h-[90vh] max-h-[90vh] rounded-2xl p-4 overflow-y-auto sm:h-auto sm:w-full sm:max-w-md"
            aria-describedby="print-options-desc"
          >
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
                    Off: removes logo or placeholder from PDF header.
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
                    Name, address, phone, PAN in header.
                  </p>
                </div>
              </div>
              {/* Report body + optional columns — pehle sirf narrow mobile ke liye tha; ab PC print bhi yehi choose karta hai */}
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-title"
                  checked={printTitle}
                  onCheckedChange={(c) => setPrintTitle(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-title" className="cursor-pointer font-medium">
                    Print report title
                  </Label>
                  <p className="text-xs text-muted-foreground">Shows title and total vouchers line.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-narration"
                  checked={printNarration}
                  onCheckedChange={(c) => setPrintNarration(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-narration" className="cursor-pointer font-medium">
                    Print narration
                  </Label>
                  <p className="text-xs text-muted-foreground">Shows narration/details rows below entries.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-user-column"
                  checked={printUserColumn}
                  onCheckedChange={(c) => setPrintUserColumn(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-user-column" className="cursor-pointer font-medium">
                    Include User column
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Adds User column to the PDF table when checked. Off by default.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-file-column"
                  checked={printFileColumn}
                  onCheckedChange={(c) => setPrintFileColumn(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-file-column" className="cursor-pointer font-medium">
                    Include File column
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Adds File column to the PDF table when checked. Off by default.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 space-y-0">
                <Checkbox
                  id="print-note-vouchers"
                  checked={printNotes}
                  onCheckedChange={(c) => setPrintNotes(c === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="print-note-vouchers" className="cursor-pointer font-medium">
                    Include Note vouchers
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Includes note-type vouchers in the printout when checked. Off by default.
                  </p>
                </div>
              </div>
              {/* Print color: PDF me green/red vs black-only amounts */}
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Print color</p>
                <RadioGroup
                  value={printColorMode}
                  onValueChange={(v) => setPrintColorMode(v === "bw" ? "bw" : "color")}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="color" id="print-color-mode-color" className="mt-0.5" />
                    <div className="grid gap-1 leading-none">
                      <Label htmlFor="print-color-mode-color" className="cursor-pointer font-medium">
                        Color
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Green debit, red credit, and colored bill-wise voucher links.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="bw" id="print-color-mode-bw" className="mt-0.5" />
                    <div className="grid gap-1 leading-none">
                      <Label htmlFor="print-color-mode-bw" className="cursor-pointer font-medium">
                        Black &amp; white
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        All amounts print in black/gray — better for B&amp;W printers.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <DialogFooter className="flex-row items-center justify-end gap-2 [&>*]:mt-0">
              {/* Company-login-like action styling: blue cancel + green continue in one row. */}
              <Button
                type="button"
                className="rounded-full border border-blue-600 bg-blue-600 px-5 text-white hover:bg-blue-700 hover:text-white"
                onClick={() => finish(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full border border-green-600 bg-green-600 px-5 text-white hover:bg-green-700 hover:text-white"
                onClick={() =>
                  finish({
                    printIncludeLogo: printLogo,
                    printIncludeCompanyDetails: printCompany,
                    printIncludeNarration: printNarration,
                    printIncludeTitle: printTitle,
                    printIncludeUserColumn: printUserColumn,
                    printIncludeFileColumn: printFileColumn,
                    printIncludeNotes: printNotes,
                    printColorMode,
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
