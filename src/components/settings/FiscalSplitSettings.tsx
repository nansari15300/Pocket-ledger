"use client";

/**
 * Fiscal split: merge divider vs separate-books guidance — values `localFiscalSplitStore` me (Firestore nahi).
 */
import { useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { startOfDay } from "date-fns";
import { writeLocalFiscalSplit, getLocalFiscalSplitOrDefaults, type FiscalSplitMode } from "@/lib/localFiscalSplitStore";

export function FiscalSplitSettings() {
  const { company, companyId } = useCompany();
  const { toast } = useToast();
  const [mode, setMode] = useState<FiscalSplitMode>("off");
  const [partitionAD, setPartitionAD] = useState<Date | undefined>(undefined);
  const [partitionLabel, setPartitionLabel] = useState("");

  useEffect(() => {
    if (!companyId) return;
    const local = getLocalFiscalSplitOrDefaults(companyId);
    const m = local.fiscalSplitMode;
    setMode(m === "merge" || m === "separate" ? m : "off");
    const iso = local.fiscalMergePartitionAtIso;
    setPartitionAD(iso ? startOfDay(new Date(iso)) : undefined);
    setPartitionLabel(typeof local.fiscalPartitionLabel === "string" ? local.fiscalPartitionLabel : "");
  }, [companyId, company?.fiscalSplitMode, company?.fiscalMergePartitionAt, company?.fiscalPartitionLabel]);

  const partitionRequiredInvalid = mode === "merge" && !partitionAD;

  const handleSave = () => {
    if (!companyId || !company) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    if (partitionRequiredInvalid) {
      toast({ variant: "destructive", title: "Merge mode requires a partition date." });
      return;
    }
    const labelTrim = partitionLabel.trim();
    writeLocalFiscalSplit(companyId, {
      fiscalSplitMode: mode,
      fiscalMergePartitionAtIso:
        mode === "merge" && partitionAD ? startOfDay(partitionAD).toISOString() : null,
      fiscalPartitionLabel: mode === "merge" && labelTrim ? labelTrim : null,
    });
    toast({
      title: "Saved locally",
      description: "Fiscal split settings stored on this device only (not synced to cloud).",
    });
  };

  if (!companyId || !company) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fiscal year & split</CardTitle>
          <CardDescription>Select a company first.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiscal year & split</CardTitle>
        <CardDescription>
          Merge keeps one company and shows a clear divider from the date you choose (on screen and in PDF). Separate
          means using another company for fully separate books—this screen only explains how. Settings here are saved{" "}
          <strong>only on this device</strong> (local storage), not on the company Firestore document. For Separate
          mode, turn <strong>Edit vouchers before current fiscal year</strong> on or off per role under Manage users →
          Permissions (Fiscal period). For Merge, saving edits in the old period may ask for confirmation because
          balances after the divider change automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as FiscalSplitMode)} className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value="off" id="fiscal-off" className="mt-1" />
            <div className="space-y-1">
              <Label htmlFor="fiscal-off" className="font-medium cursor-pointer">
                Off
              </Label>
              <p className="text-sm text-muted-foreground">No fiscal-year divider—standard behaviour.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value="merge" id="fiscal-merge" className="mt-1" />
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor="fiscal-merge" className="font-medium cursor-pointer">
                Merge (same company)
              </Label>
              <p className="text-sm text-muted-foreground">
                The divider appears before the first transaction on or after this date. You can still use a wide date
                range or search to see both periods.
              </p>
              {mode === "merge" && (
                <div className="flex flex-row flex-wrap items-end gap-4 pt-2">
                  <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1">
                    <Label className="text-xs">New fiscal period starts (date)</Label>
                    <BsDatePicker
                      valueAD={partitionAD}
                      onChangeAD={(d) => setPartitionAD(d ?? undefined)}
                      isRange={false}
                      numberOfMonths={1}
                      className="w-full border-2 border-green-600 shadow-none"
                    />
                  </div>
                  <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1">
                    <Label className="text-xs">Divider label (optional)</Label>
                    <Input
                      value={partitionLabel}
                      onChange={(e) => setPartitionLabel(e.target.value)}
                      placeholder="e.g. FY 2082 closed → FY 2083"
                      className="h-10 border-2 border-green-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value="separate" id="fiscal-separate" className="mt-1" />
            <div className="space-y-2">
              <Label htmlFor="fiscal-separate" className="font-medium cursor-pointer">
                Separate (new company)
              </Label>
              <p className="text-sm text-muted-foreground">
                For completely separate books next year, create another company. Its data will not mix with this one.
              </p>
              {mode === "separate" && (
                <Button variant="outline" size="sm" asChild className="w-fit gap-1">
                  <Link href="/settings?view=company">
                    Company Profile
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              {mode === "separate" && (
                <p className="text-xs text-muted-foreground">
                  Open Company Profile, use the &quot;Add New Company&quot; tab, then switch company in the header when
                  you work.
                </p>
              )}
            </div>
          </div>
        </RadioGroup>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={partitionRequiredInvalid}>
            Save split settings (this device)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
