"use client";

/**
 * Fiscal split: off vs merge divider — values `localFiscalSplitStore` me (Firestore nahi).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFiscalSplitFyRows } from "@/hooks/useFiscalSplitFyRows";
import { useDate } from "@/hooks/useDate";
import { useToast } from "@/hooks/use-toast";
import { CompanyFyVoucherSuggestionCard } from "@/components/company/CompanyFyVoucherSuggestionCard";
import {
  buildCompanyFyVoucherSuggestion,
  parseCompanyFiscalYearDate,
} from "@/lib/companyFyVoucherSuggestion";
import {
  buildAllFySplitTickedKeys,
  buildFiscalMergePeriods,
  isAllFySplitComplete,
  buildFiscalMergePeriodsByRowIndex,
  buildFiscalMergeRowVisuals,
  defaultTickedFyKeys,
  formatFiscalYearMergeBoundaryDate,
  inferTickedFyKeysFromPartitions,
  isFiscalYearMergeRowTickable,
  mergePartitionDatesFromTickedFyKeys,
  normalizeTickedFyKeys,
} from "@/lib/fiscalMergeFySelection";
import { FiscalYearMergeRowLabel } from "@/components/settings/FiscalYearMergeRowLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { startOfDay } from "date-fns";
import { writeLocalFiscalSplit, getLocalFiscalSplitOrDefaults, type FiscalSplitMode } from "@/lib/localFiscalSplitStore";
import { SettingsInfoTip } from "@/components/settings/SettingsInfoTip";
import { cn } from "@/lib/utils";

/** `pl-dashboard-tone-card` — globals.css black `border #000` override se bachne ke liye (line ~5531). */
const FISCAL_INNER_CARD_CN =
  "pl-dashboard-tone-card pl-dashboard-ribbon-emerald rounded-lg border bg-card shadow-none";
const FISCAL_MAIN_CARD_CN = FISCAL_INNER_CARD_CN;
const FISCAL_OPTION_CARD_CN = cn(FISCAL_INNER_CARD_CN, "p-3");
const FISCAL_FY_TABLE_CN = cn(FISCAL_INNER_CARD_CN, "overflow-hidden");
const FISCAL_FY_ROW_GRID_CN = "grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-emerald-400/50";
const FISCAL_MERGE_PERIOD_GRID_CN = "grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-2";

const FISCAL_SPLIT_INFO_DESCRIPTION = (
  <>
    Merge keeps one company and shows a clear divider from the date you choose (on screen and in PDF). Settings here are
    saved <strong>only on this device</strong> (local storage), not on the company Firestore document. Saving edits in the
    old period may ask for confirmation because balances after the divider change automatically.
  </>
);

export function FiscalSplitSettings() {
  const { company, companyId } = useCompany();
  const { fyRows, loading: fyRowsLoading, error: fyRowsError, firestoreScanned } = useFiscalSplitFyRows();
  const { dateSystem } = useDate();
  const { toast } = useToast();
  const [mode, setMode] = useState<FiscalSplitMode>("merge");
  const [tickedFyKeys, setTickedFyKeys] = useState<Set<string>>(() => new Set());

  const preferBs = dateSystem === "BS" || dateSystem === "Both" || company?.country === "Nepal";

  const loadTickedFromLocal = useCallback(() => {
    if (!companyId) return;
    const local = getLocalFiscalSplitOrDefaults(companyId);
    setMode("merge");

    if (!fyRows.length) {
      setTickedFyKeys(new Set());
      return;
    }

    const fromSavedKeys = local.fiscalMergeTickedFyKeys?.length
      ? normalizeTickedFyKeys(fyRows, new Set(local.fiscalMergeTickedFyKeys))
      : null;
    if (fromSavedKeys?.size) {
      setTickedFyKeys(fromSavedKeys);
      return;
    }

    const fromPartitions = inferTickedFyKeysFromPartitions(
      fyRows,
      local.fiscalMergePartitionAtIsos ?? (local.fiscalMergePartitionAtIso ? [local.fiscalMergePartitionAtIso] : null)
    );
    setTickedFyKeys(normalizeTickedFyKeys(fyRows, fromPartitions));
  }, [companyId, fyRows]);

  useEffect(() => {
    loadTickedFromLocal();
  }, [loadTickedFromLocal, company?.fiscalSplitMode, company?.fiscalMergePartitionAt, company?.fiscalPartitionLabel]);

  useEffect(() => {
    if (mode !== "merge" || !fyRows.length) return;
    setTickedFyKeys((prev) => {
      const normalized = normalizeTickedFyKeys(fyRows, prev);
      return normalized.size ? normalized : defaultTickedFyKeys(fyRows);
    });
  }, [mode, fyRows]);

  const fyMergeRowVisuals = useMemo(
    () => buildFiscalMergeRowVisuals(fyRows, tickedFyKeys),
    [fyRows, tickedFyKeys]
  );

  const mergePeriodByRowIndex = useMemo(
    () => buildFiscalMergePeriodsByRowIndex(fyRows, tickedFyKeys),
    [fyRows, tickedFyKeys]
  );

  const mergedPeriodCountForSuggestion = useMemo(() => {
    if (mode !== "merge" || !fyRows.length) return null;
    return buildFiscalMergePeriods(fyRows, tickedFyKeys).length;
  }, [mode, fyRows, tickedFyKeys]);

  const allFySplitted = useMemo(
    () => mode === "merge" && isAllFySplitComplete(fyRows, tickedFyKeys),
    [mode, fyRows, tickedFyKeys]
  );

  const fyVoucherSuggestion = useMemo(
    () =>
      company
        ? buildCompanyFyVoucherSuggestion({
            country: company.country,
            fiscalYearStart: parseCompanyFiscalYearDate(company.fiscalYearStart),
            fiscalYearEnd: parseCompanyFiscalYearDate(company.fiscalYearEnd),
            fyRows,
            mergedPeriodCount: mode === "merge" ? mergedPeriodCountForSuggestion : null,
            allFySplitted,
          })
        : null,
    [company, fyRows, mode, mergedPeriodCountForSuggestion, allFySplitted]
  );

  const toggleFyTick = (fyKey: string, checked: boolean) => {
    const rowIndex = fyRows.findIndex((row) => row.fyKey === fyKey);
    if (rowIndex < 0 || !isFiscalYearMergeRowTickable(fyRows, rowIndex)) return;
    setTickedFyKeys((prev) => {
      const next = normalizeTickedFyKeys(fyRows, new Set(prev));
      if (checked) next.add(fyKey);
      else next.delete(fyKey);
      return normalizeTickedFyKeys(fyRows, next);
    });
  };

  const handleRunSplit = () => {
    if (!companyId || !company) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }

    if (!fyRows.length) {
      toast({ variant: "destructive", title: "No fiscal years found from vouchers yet." });
      return;
    }

    const allTicked = buildAllFySplitTickedKeys(fyRows);
    setMode("merge");
    setTickedFyKeys(allTicked);

    const partitionDates = mergePartitionDatesFromTickedFyKeys(fyRows, allTicked);
    const partitionIsos = partitionDates.map((d) => startOfDay(d).toISOString());
    const tickedKeysList = [...allTicked];

    const local = getLocalFiscalSplitOrDefaults(companyId);
    writeLocalFiscalSplit(companyId, {
      fiscalSplitMode: "merge",
      fiscalMergePartitionAtIso: partitionIsos[0] ?? null,
      fiscalMergePartitionAtIsos: partitionIsos.length ? partitionIsos : null,
      fiscalMergeTickedFyKeys: tickedKeysList,
      fiscalPartitionLabel: null,
      fiscalAutoSplitEnabled: true,
      fiscalSplitConfiguredByUser: true,
      fiscalAutoSplitLastCheckDay: local.fiscalAutoSplitLastCheckDay,
    });
    toast({
      title: "Split applied",
      description: `Each fiscal year is now a separate period (${tickedKeysList.length} periods on this device).`,
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
    <Card className={FISCAL_MAIN_CARD_CN}>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-[10px] shrink-0">
            <CardTitle className="mb-0">Fiscal year & split</CardTitle>
            <SettingsInfoTip label="Fiscal year & split" description={FISCAL_SPLIT_INFO_DESCRIPTION} />
          </div>
          {fyVoucherSuggestion ? (
            <CompanyFyVoucherSuggestionCard
              suggestion={fyVoucherSuggestion}
              className="sm:max-w-[18rem] sm:shrink-0"
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={mode}
          onValueChange={(v) => {
            if (v === "off") return;
            setMode(v as FiscalSplitMode);
          }}
          className="space-y-3"
        >
          <div
            className={cn(
              FISCAL_OPTION_CARD_CN,
              "flex items-start gap-3 opacity-60 pointer-events-none select-none"
            )}
            aria-disabled="true"
          >
            <RadioGroupItem value="off" id="fiscal-off" disabled className="mt-1 shrink-0" />
            <div className="space-y-1">
              <Label htmlFor="fiscal-off" className="font-medium cursor-not-allowed text-muted-foreground">
                Off
              </Label>
              <p className="text-sm text-muted-foreground">No fiscal-year divider—standard behaviour.</p>
            </div>
          </div>
          <div className={cn(FISCAL_OPTION_CARD_CN, "flex items-start gap-3")}>
            <RadioGroupItem value="merge" id="fiscal-merge" className="mt-1 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Label htmlFor="fiscal-merge" className="font-medium cursor-pointer">
                  Splite Fiscal Year
                </Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="fiscal-auto-splite" checked disabled className="shrink-0" />
                  <Label
                    htmlFor="fiscal-auto-splite"
                    className="cursor-default text-sm font-normal text-muted-foreground"
                  >
                    auto splite
                  </Label>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Tick fiscal years to start a new merged period in this company. Unticked years are combined with the
                previous ticked year (divider after the last day of the merged block).
              </p>
              {mode === "merge" && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-xs">Fiscal years from your vouchers</Label>
                    {fyRowsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        {firestoreScanned > 0
                          ? `Building FY index (first time) — ${firestoreScanned.toLocaleString()} vouchers scanned…`
                          : "Loading fiscal years…"}
                      </p>
                    ) : fyRowsError ? (
                      <p className="text-sm text-destructive">{fyRowsError}</p>
                    ) : fyRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No voucher dates found yet.</p>
                    ) : (
                      <div className={FISCAL_FY_TABLE_CN}>
                        <div className="border-b border-emerald-400/60 px-2 pb-1.5 pt-2 text-center text-xs font-semibold text-muted-foreground">
                          Merged periods
                        </div>
                        <div className={cn(FISCAL_FY_ROW_GRID_CN, "border-b border-emerald-400/60")}>
                          <div className="px-2 pb-1.5 pt-1.5 text-xs font-semibold text-muted-foreground md:pr-1">
                            Fiscal Year
                          </div>
                          <div
                            className={cn(
                              FISCAL_MERGE_PERIOD_GRID_CN,
                              "border-t border-emerald-400/50 px-2 pb-1.5 pt-1.5 text-xs font-semibold text-muted-foreground md:border-t-0 md:pl-1"
                            )}
                          >
                            <span>S/N</span>
                            <span>Fiscal Year</span>
                          </div>
                        </div>
                        <div className="divide-y divide-emerald-400/45">
                          {fyRows.map((row, index) => {
                            const tickable = isFiscalYearMergeRowTickable(fyRows, index);
                            const checked = tickedFyKeys.has(row.fyKey);
                            const visual = fyMergeRowVisuals[index];
                            const period = mergePeriodByRowIndex.get(index);
                            const periodStartText = period
                              ? formatFiscalYearMergeBoundaryDate(company.country, period.start, preferBs)
                              : null;
                            const periodEndText = period
                              ? formatFiscalYearMergeBoundaryDate(company.country, period.end, preferBs)
                              : null;
                            return (
                              <div key={row.fyKey} className={FISCAL_FY_ROW_GRID_CN}>
                                <div className="flex min-w-0 items-start gap-2 px-2 py-2 md:pr-3">
                                  <Checkbox
                                    id={`fy-merge-${row.fyKey}`}
                                    className="mt-0.5 shrink-0"
                                    checked={checked}
                                    disabled={!tickable}
                                    onCheckedChange={(v) => toggleFyTick(row.fyKey, v === true)}
                                  />
                                  <Label
                                    htmlFor={tickable ? `fy-merge-${row.fyKey}` : undefined}
                                    className={cn(
                                      "min-w-0 font-normal text-sm leading-snug",
                                      tickable ? "cursor-pointer" : "cursor-default"
                                    )}
                                  >
                                    <FiscalYearMergeRowLabel
                                      row={row}
                                      visual={visual}
                                      country={company.country}
                                      preferBs={preferBs}
                                    />
                                  </Label>
                                </div>
                                <div className="min-h-[2.5rem] border-t border-emerald-400/50 px-2 py-2 md:border-t-0 md:pl-3">
                                  {!row.hasTransactions ? (
                                    <p className="text-sm text-muted-foreground">No transactions</p>
                                  ) : period ? (
                                    <div className={cn(FISCAL_MERGE_PERIOD_GRID_CN, "text-sm leading-snug")}>
                                      <span className="tabular-nums text-muted-foreground">{period.serial}</span>
                                      <span className="font-semibold text-foreground">
                                        {periodStartText} To {periodEndText}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </RadioGroup>

        <div className="flex justify-end">
          <Button type="button" onClick={handleRunSplit}>
            run split
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
