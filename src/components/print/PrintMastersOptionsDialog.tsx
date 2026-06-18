"use client";

import * as React from "react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { PrintColorMode } from "@/lib/printColorPalette";
import {
  MASTER_PRINT_KIND_LABELS,
  MASTER_PRINT_KIND_ORDER,
  type MasterPrintKind,
} from "@/lib/printMastersTypes";
import { useToast } from "@/hooks/use-toast";

export type PrintMastersSettings = {
  masterTypes: MasterPrintKind[];
  printIncludeZeroBalanceMasters: boolean;
  printMasterIncludeBalance: boolean;
  printIncludeLogo: boolean;
  printIncludeCompanyDetails: boolean;
  printColorMode: PrintColorMode;
};

function MasterPrintKindPicker({
  selected,
  onSelectedChange,
}: {
  selected: Set<MasterPrintKind>;
  onSelectedChange: (next: Set<MasterPrintKind>) => void;
}) {
  const allKinds = MASTER_PRINT_KIND_ORDER;
  const allSelected = allKinds.every((k) => selected.has(k));

  const toggle = (kind: MasterPrintKind, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(kind);
    else next.delete(kind);
    onSelectedChange(next);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Master types</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelectedChange(allSelected ? new Set() : new Set(allKinds))}
        >
          {allSelected ? "Clear all" : "Select all"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground -mt-1">{selected.size} selected</span>
      {allKinds.map((kind) => (
        <div key={kind} className="flex items-center gap-3">
          <Checkbox
            id={`masters-opt-kind-${kind}`}
            checked={selected.has(kind)}
            onCheckedChange={(c) => toggle(kind, c === true)}
          />
          <Label htmlFor={`masters-opt-kind-${kind}`} className="cursor-pointer font-medium">
            {MASTER_PRINT_KIND_LABELS[kind]}
          </Label>
        </div>
      ))}
    </div>
  );
}

/** Inner panel only — parent must render inside one Dialog (no nested Radix dialogs). */
export function PrintMastersOptionsPanel({
  onBack,
  onPrint,
}: {
  onBack: () => void;
  onPrint: (destination: "internal" | "external", settings: PrintMastersSettings) => void;
}) {
  const { toast } = useToast();
  const [masterTypes, setMasterTypes] = React.useState<Set<MasterPrintKind>>(() => new Set());
  const [printLogo, setPrintLogo] = React.useState(true);
  const [printCompany, setPrintCompany] = React.useState(true);
  const [printMasterIncludeBalance, setPrintMasterIncludeBalance] = React.useState(true);
  const [includeZeroBalanceMasters, setIncludeZeroBalanceMasters] = React.useState(false);
  const [printColorMode, setPrintColorMode] = React.useState<PrintColorMode>("color");

  const buildSettings = (): PrintMastersSettings => ({
    masterTypes: Array.from(masterTypes),
    printIncludeZeroBalanceMasters: includeZeroBalanceMasters,
    printMasterIncludeBalance,
    printIncludeLogo: printLogo,
    printIncludeCompanyDetails: printCompany,
    printColorMode,
  });

  const tryPrint = (destination: "internal" | "external") => {
    if (masterTypes.size === 0) {
      toast({
        variant: "destructive",
        title: "Select master types",
        description: "Choose at least one master list to print.",
      });
      return;
    }
    onPrint(destination, buildSettings());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle>Print masters</DialogTitle>
        <DialogDescription>
          Prints only the selected master lists in a table layout. The current screen report is not
          included.
        </DialogDescription>
      </DialogHeader>
      {/* APK/WebView: options scroll; action buttons niche fixed */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] pr-1">
      <div className="flex flex-col gap-4 py-2">
        <MasterPrintKindPicker selected={masterTypes} onSelectedChange={setMasterTypes} />
        <div className="flex items-start gap-3">
          <Checkbox
            id="masters-opt-logo"
            checked={printLogo}
            onCheckedChange={(c) => setPrintLogo(c === true)}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <Label htmlFor="masters-opt-logo" className="cursor-pointer font-medium">
              Print logo
            </Label>
            <p className="text-xs text-muted-foreground">Company logo or QR in PDF header.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="masters-opt-company"
            checked={printCompany}
            onCheckedChange={(c) => setPrintCompany(c === true)}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <Label htmlFor="masters-opt-company" className="cursor-pointer font-medium">
              Print company details
            </Label>
            <p className="text-xs text-muted-foreground">Name, address, phone, PAN in header.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="masters-opt-balance"
            checked={printMasterIncludeBalance}
            onCheckedChange={(c) => setPrintMasterIncludeBalance(c === true)}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <Label htmlFor="masters-opt-balance" className="cursor-pointer font-medium">
              Print balance
            </Label>
            <p className="text-xs text-muted-foreground">
              On: 3 columns on page — Name, Balance, Remark. Off: 4 columns — Name, Remark only.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="masters-opt-zero"
            checked={includeZeroBalanceMasters}
            onCheckedChange={(c) => setIncludeZeroBalanceMasters(c === true)}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <Label htmlFor="masters-opt-zero" className="cursor-pointer font-medium">
              Include zero balance
            </Label>
            <p className="text-xs text-muted-foreground">Off: skip masters with zero balance.</p>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Print color</p>
          <RadioGroup
            value={printColorMode}
            onValueChange={(v) => setPrintColorMode(v === "bw" ? "bw" : "color")}
            className="flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="color" id="masters-color" className="mt-0.5" />
              <Label htmlFor="masters-color" className="cursor-pointer font-medium">
                Color
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="bw" id="masters-bw" className="mt-0.5" />
              <Label htmlFor="masters-bw" className="cursor-pointer font-medium">
                Black &amp; white
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>
      </div>
      <DialogFooter className="shrink-0 !flex-row flex-nowrap items-center justify-end gap-2 w-full overflow-x-auto border-t bg-background pt-3 mt-2 sm:space-x-0 [&>*]:mt-0 [&>button]:shrink-0">
        <Button type="button" variant="outline" className="rounded-full px-4 sm:px-5" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border border-slate-500 px-4 sm:px-5"
          onClick={() => tryPrint("external")}
        >
          External
        </Button>
        <Button
          type="button"
          className="rounded-full border border-green-600 bg-green-600 px-4 sm:px-5 text-white hover:bg-green-700"
          onClick={() => tryPrint("internal")}
        >
          Internal
        </Button>
      </DialogFooter>
    </div>
  );
}
