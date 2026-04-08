"use client";

/**
 * Settings: fiscal-year divider (merge in one company) vs separate books (new company guide).
 */
import { useEffect, useState } from "react";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { startOfDay } from "date-fns";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";

export function FiscalSplitSettings() {
  const { company, companyId } = useCompany();
  const { toast } = useToast();
  const [mode, setMode] = useState<"off" | "merge" | "separate">("off");
  const [partitionAD, setPartitionAD] = useState<Date | undefined>(undefined);
  const [partitionLabel, setPartitionLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    const m = company.fiscalSplitMode;
    setMode(m === "merge" || m === "separate" ? m : "off");
    const ts = company.fiscalMergePartitionAt as { toDate?: () => Date } | undefined;
    setPartitionAD(ts?.toDate ? startOfDay(ts.toDate()) : undefined);
    setPartitionLabel(typeof company.fiscalPartitionLabel === "string" ? company.fiscalPartitionLabel : "");
  }, [company]);

  const partitionRequiredInvalid = mode === "merge" && !partitionAD;

  const handleSave = async () => {
    if (!companyId || !company) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    if (partitionRequiredInvalid) {
      toast({ variant: "destructive", title: "Merge mode requires a partition date." });
      return;
    }
    setSaving(true);
    try {
      const ref = doc(firestore, "companies", companyId);
      const labelTrim = partitionLabel.trim();
      await updateDoc(ref, {
        fiscalSplitMode: mode,
        fiscalMergePartitionAt:
          mode === "merge" && partitionAD ? Timestamp.fromDate(startOfDay(partitionAD)) : null,
        fiscalPartitionLabel: mode === "merge" && labelTrim ? labelTrim : null,
      });
      toast({ title: "Saved", description: "Fiscal split settings updated." });
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Save failed",
        description: isCompanyNotFoundError(e) ? COMPANY_NOT_SYNCED_MESSAGE : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
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
          means using another company for fully separate books—this screen only explains how. For Separate mode,
          turn <strong>Edit vouchers before current fiscal year</strong> on or off per role under Manage users →
          Permissions (Fiscal period). For Merge, saving edits in the old period asks for confirmation because
          balances after the divider change automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="space-y-3">
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
                // Same row (wrap only if too narrow); items-end aligns date button + text field on one baseline.
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
          <Button type="button" onClick={handleSave} disabled={saving || partitionRequiredInvalid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save split settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
