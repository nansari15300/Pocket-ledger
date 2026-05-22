
"use client";

import { useState, useEffect, useMemo, useRef, type ComponentProps } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Calendar as CalendarIcon } from "lucide-react";
import { type Plan, type EntitlementKey } from "@/config/plans";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBillingCatalogBase } from "@/hooks/useBillingCatalogBase";
import { BILLING_REGION_IDS, BILLING_REGIONS, type BillingRegionId } from "@/lib/billingRegions";
import {
    getNepalMarkupBaseAmounts,
    regionalPriceWithMarkup,
    type RegionalPlanPrice,
} from "@/lib/billingRegionalPricing";
import { convertWithFxRates, roundMoneyForCurrency } from "@/lib/liveFxRates";

interface PlanDetailsProps {
    plan: Plan;
    onSave: (updatedPlan: Plan) => Promise<boolean>;
}

/** Amount input — catalog base country ka symbol prefix. */
function AmountInput({
    symbol,
    className,
    ...props
}: ComponentProps<typeof Input> & { symbol: string }) {
    return (
        <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">
                {symbol}
            </span>
            <Input className={cn("pl-9", className)} {...props} />
        </div>
    );
}

const entitlementLabels: Partial<Record<EntitlementKey, string>> = {
    allowCompanyAdminRecycleBin: "Allow Restore Company",
    canAddAvatar: "Can add avatar (Profile & Company logo)",
    canAddFileImagePdf: "Can add file (image/PDF) on vouchers",
    maxInterCompanyPartners: "Max joined inter-company partners",
    shareForReconciliationEnabled: "Share for Reconciling (cross-user ledger match)",
};

export function PlanDetails({ plan, onSave }: PlanDetailsProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const { toast } = useToast();
    const [editablePlan, setEditablePlan] = useState<Plan>(plan);
    const { baseCountry, symbol: catalogSymbol, currencyCode: catalogCurrency } =
        useBillingCatalogBase();

    useEffect(() => {
        setEditablePlan(plan);
    }, [plan]);

    // Catalog amounts = billing default region currency (Regional billing upar se)
    useEffect(() => {
        if (!catalogCurrency) return;
        setEditablePlan((prev) =>
            prev.currency === catalogCurrency ? prev : { ...prev, currency: catalogCurrency }
        );
    }, [catalogCurrency]);

    useEffect(() => {
        const monthly = editablePlan.price.monthly || 0;
        const yearly = editablePlan.price.yearly || 0;
        let newDiscount = 0;

        if (monthly > 0 && yearly > 0) {
            newDiscount = 100 - (yearly * 100) / (monthly * 12);
        }

        const currentDiscount = editablePlan.discountPercentage || 0;
        if (Math.abs(currentDiscount - newDiscount) > 0.01) {
             setEditablePlan(prev => ({
                ...prev,
                discountPercentage: parseFloat(newDiscount.toFixed(2))
            }));
        }
    }, [editablePlan.price.monthly, editablePlan.price.yearly]);

    // Nepal / plan base badle to SAARC/International % dubara calculate
    useEffect(() => {
        setEditablePlan((prev) => {
            let touched = false;
            const regionalPrices = { ...(prev.regionalPrices ?? {}) };
            const base = getNepalMarkupBaseAmounts(prev);
            for (const id of ["saarc", "international"] as const) {
                const row = regionalPrices[id];
                const pct = row?.markupPercent;
                if (pct == null || !Number.isFinite(Number(pct))) continue;
                const monthly = regionalPriceWithMarkup(base.monthly, pct);
                const yearly = regionalPriceWithMarkup(base.yearly, pct);
                if (row?.monthly === monthly && row?.yearly === yearly) continue;
                regionalPrices[id] = {
                    ...row,
                    monthly,
                    yearly,
                    markupPercent: pct,
                    currency: BILLING_REGIONS[id].defaultCurrency,
                };
                touched = true;
            }
            return touched ? { ...prev, regionalPrices } : prev;
        });
    }, [
        editablePlan.price.monthly,
        editablePlan.price.yearly,
        editablePlan.regionalPrices?.nepal?.monthly,
        editablePlan.regionalPrices?.nepal?.yearly,
    ]);

    const handleSave = async () => {
        setIsUpdating(true);
        const success = await onSave(editablePlan);
        if (success) {
            toast({ title: "Success", description: `Plan '${editablePlan.name}' updated.` });
        } else {
            toast({ variant: "destructive", title: "Error", description: "Failed to update plan." });
        }
        setIsUpdating(false);
    }
    
    const handleTopLevelChange = (key: keyof Plan, value: any) => {
        setEditablePlan(prev => ({ ...prev, [key]: value }));
    }

    const handleEntitlementChange = (key: EntitlementKey, value: string | number | boolean) => {
        setEditablePlan(prev => ({
            ...prev,
            entitlements: {
                ...prev.entitlements,
                [key]: value === '' ? 0 : value
            }
        }));
    };
    
    const handlePriceChange = (cycle: 'monthly' | 'yearly', value: string) => {
        setEditablePlan(prev => ({
            ...prev,
            price: {
                ...prev.price,
                [cycle]: value === '' ? 0 : Number(value)
            }
        }));
    }

    /** Nepal / SAARC / International — admin alag monthly & yearly rate. */
    const handleRegionalPriceChange = (
        region: BillingRegionId,
        field: "monthly" | "yearly",
        value: string
    ) => {
        setEditablePlan((prev) => {
            const cur = prev.regionalPrices?.[region] ?? {
                monthly: 0,
                yearly: 0,
                currency: BILLING_REGIONS[region].defaultCurrency,
            };
            const nextRow: RegionalPlanPrice = { ...cur };
            // Sirf monthly/yearly numeric — currency/markup alag handlers
            nextRow[field] = value === "" ? 0 : Number(value);
            return {
                ...prev,
                regionalPrices: { ...prev.regionalPrices, [region]: nextRow },
            };
        });
    };

    /** SAARC / International — Nepal amount + markup % → monthly & yearly fill. */
    const handleRegionalMarkupChange = (region: "saarc" | "international", value: string) => {
        const pct = value === "" ? 0 : Number(value);
        setEditablePlan((prev) => {
            const base = getNepalMarkupBaseAmounts(prev);
            return {
                ...prev,
                regionalPrices: {
                    ...prev.regionalPrices,
                    [region]: {
                        monthly: regionalPriceWithMarkup(base.monthly, pct),
                        yearly: regionalPriceWithMarkup(base.yearly, pct),
                        markupPercent: pct,
                        currency: BILLING_REGIONS[region].defaultCurrency,
                    },
                },
            };
        });
    };

    const applyLiveFxToRegional = async () => {
        try {
            const base = String(editablePlan.currency || "NPR").toUpperCase();
            const res = await fetch(`/api/billing/fx-rates?base=${encodeURIComponent(base)}`);
            const data = await res.json();
            if (!res.ok || !data.rates) throw new Error(data.error || "FX failed");
            const rates = data.rates as Record<string, number>;
            const fxBase = data.base as string;
            setEditablePlan((prev) => {
                const regionalPrices = { ...prev.regionalPrices } as NonNullable<Plan["regionalPrices"]>;
                for (const id of BILLING_REGION_IDS) {
                    const target = BILLING_REGIONS[id].defaultCurrency;
                    regionalPrices[id] = {
                        monthly: roundMoneyForCurrency(
                            convertWithFxRates(prev.price.monthly, base, target, fxBase, rates),
                            target
                        ),
                        yearly: roundMoneyForCurrency(
                            convertWithFxRates(prev.price.yearly, base, target, fxBase, rates),
                            target
                        ),
                        currency: target,
                    };
                }
                return { ...prev, regionalPrices };
            });
            toast({ title: "Applied", description: "Regional prices filled from today's FX." });
        } catch (e: unknown) {
            toast({
                variant: "destructive",
                title: "FX apply failed",
                description: e instanceof Error ? e.message : String(e),
            });
        }
    };

    // Har numeric cap do fields: online (Firestore) + local (SQLite / storageOption local) — admin alag se set kar sake.
    const pairedNumericEntitlements: { online: EntitlementKey; local: EntitlementKey; label: string }[] = [
      { online: "maxUsers", local: "maxUsersLocal", label: "Max users" },
      { online: "maxCompanies", local: "maxCompaniesLocal", label: "Max companies" },
      { online: "maxAttachmentsGB", local: "maxAttachmentsGBLocal", label: "Max attachments (GB)" },
      { online: "maxStorageGB", local: "maxStorageGBLocal", label: "Max storage (GB)" },
      { online: "dailyVoucherLimit", local: "dailyVoucherLimitLocal", label: "Daily voucher limit" },
      { online: "monthlyVoucherLimit", local: "monthlyVoucherLimitLocal", label: "Monthly voucher limit" },
      // Multi-device switch off = dono 1; on = online/local alag caps (billing chart rows).
      { online: "maxDevices", local: "maxDevicesLocal", label: "Max devices" },
    ];
    const entitlementBooleanFields: EntitlementKey[] = ["hasPrioritySupport", "hasAuditLogs", "hasRoleBasedAccess", "allowCompanyAdminRecycleBin", "canAddAvatar", "shareForReconciliationEnabled"];

    const offerDate = editablePlan.limitedTimeOfferDate ? 
        (editablePlan.limitedTimeOfferDate.toDate ? editablePlan.limitedTimeOfferDate.toDate() : new Date(editablePlan.limitedTimeOfferDate))
        : undefined;

    return (
        <Card className="h-full min-h-0 overflow-hidden relative flex flex-col">
             {isUpdating && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            )}
            <CardHeader className="shrink-0 flex flex-row items-start justify-between">
                <div>
                    <CardTitle>{editablePlan.name}</CardTitle>
                    <CardDescription>{editablePlan.tagline}</CardDescription>
                </div>
                 <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <Label className="text-xs">Commission Rate (%)</Label>
                        <Input
                            type="number"
                            value={editablePlan.commissionRate ?? ''}
                            onChange={(e) => handleTopLevelChange('commissionRate', e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-24 h-9"
                        />
                    </div>
                    <Button onClick={handleSave} disabled={isUpdating} className="self-end">
                        <Save className="mr-2 h-4 w-4" /> Save Changes
                    </Button>
                </div>
            </CardHeader>

            <ScrollArea className="flex-1 min-h-0">
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 items-end">
                        <div className="space-y-2 md:col-span-2 xl:col-span-5">
                            <Label>Base country (catalog)</Label>
                            <div
                                className="flex h-10 w-full items-center rounded-md border border-input bg-muted/60 px-3 py-2 text-sm font-medium"
                                aria-readonly="true"
                            >
                                {baseCountry} · {catalogSymbol}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Set in <strong>Default billing region</strong> above — all amounts use {catalogSymbol}.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Monthly Price ({catalogSymbol})</Label>
                            <AmountInput
                                symbol={catalogSymbol}
                                type="number"
                                value={editablePlan.price.monthly}
                                onChange={(e) => handlePriceChange("monthly", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Yearly Price ({catalogSymbol})</Label>
                            <AmountInput
                                symbol={catalogSymbol}
                                type="number"
                                value={editablePlan.price.yearly}
                                onChange={(e) => handlePriceChange("yearly", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Discount (%)</Label>
                            <Input 
                                type="number" 
                                value={editablePlan.discountPercentage || ''} 
                                readOnly
                                className="bg-muted cursor-not-allowed"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Offer End Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !offerDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {offerDate ? format(offerDate, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                    mode="single"
                                    selected={offerDate}
                                    onSelect={(date) => handleTopLevelChange('limitedTimeOfferDate', date ? Timestamp.fromDate(date) : null)}
                                    initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id={`isFree-${plan.id}`}
                                checked={editablePlan.isFree}
                                onCheckedChange={(checked) => handleTopLevelChange('isFree', checked)}
                            />
                            <Label htmlFor={`isFree-${plan.id}`}>Mark as Free Plan</Label>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-black p-4 bg-muted/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-sm">
                                Regional prices (Nepal · SAARC · International) — {catalogSymbol}
                            </h3>
                            <Button type="button" variant="outline" size="sm" onClick={() => void applyLiveFxToRegional()}>
                                Apply today&apos;s FX to all 3
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {BILLING_REGION_IDS.map((regionId) => {
                                const row = editablePlan.regionalPrices?.[regionId];
                                const meta = BILLING_REGIONS[regionId];
                                const isMarkupRegion =
                                    regionId === "saarc" || regionId === "international";
                                return (
                                    <div key={regionId} className="space-y-2 rounded-md border border-black/40 bg-background p-3">
                                        <Label className="font-semibold">{meta.label}</Label>
                                        {isMarkupRegion && (
                                            <div className="space-y-1">
                                                <Label className="text-xs">Markup %</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        className="pr-8"
                                                        placeholder="0"
                                                        value={row?.markupPercent ?? ""}
                                                        onChange={(e) =>
                                                            handleRegionalMarkupChange(
                                                                regionId,
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                                                        %
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <Label className="text-xs">Monthly ({catalogSymbol})</Label>
                                            <AmountInput
                                                symbol={catalogSymbol}
                                                type="number"
                                                readOnly={isMarkupRegion}
                                                className={isMarkupRegion ? "bg-muted cursor-default" : undefined}
                                                value={row?.monthly ?? ""}
                                                onChange={(e) => {
                                                    if (!isMarkupRegion) {
                                                        handleRegionalPriceChange(regionId, "monthly", e.target.value);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Yearly ({catalogSymbol})</Label>
                                            <AmountInput
                                                symbol={catalogSymbol}
                                                type="number"
                                                readOnly={isMarkupRegion}
                                                className={isMarkupRegion ? "bg-muted cursor-default" : undefined}
                                                value={row?.yearly ?? ""}
                                                onChange={(e) => {
                                                    if (!isMarkupRegion) {
                                                        handleRegionalPriceChange(regionId, "yearly", e.target.value);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pairedNumericEntitlements.map(({ online, local, label }) => {
                        const onlineVal = editablePlan.entitlements[online];
                        const localVal = editablePlan.entitlements[local];
                        const onlineNum = typeof onlineVal === "number" ? onlineVal : Number(onlineVal ?? 0);
                        const localNum = typeof localVal === "number" ? localVal : Number(localVal ?? 0);
                        const isMaxDevicesPair = online === "maxDevices" && local === "maxDevicesLocal";
                        const pairDisabled = isMaxDevicesPair && !editablePlan.entitlements.hasMultiDeviceSync;
                        return (
                            <div key={`${online}-${local}`} className="rounded-lg border bg-card/50 p-3 space-y-2 md:col-span-1">
                                <div className="text-sm font-medium">{label}</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground" htmlFor={`${plan.id}-${online}`}>Online</Label>
                                        <Input
                                            id={`${plan.id}-${online}`}
                                            type="number"
                                            value={String(Number.isFinite(onlineNum) ? onlineNum : 0)}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                handleEntitlementChange(online, raw === "" ? 0 : Number(raw));
                                            }}
                                            placeholder="0 = unlimited"
                                            disabled={pairDisabled}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground" htmlFor={`${plan.id}-${local}`}>Local</Label>
                                        <Input
                                            id={`${plan.id}-${local}`}
                                            type="number"
                                            value={String(Number.isFinite(localNum) ? localNum : 0)}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                handleEntitlementChange(local, raw === "" ? 0 : Number(raw));
                                            }}
                                            placeholder="0 = unlimited"
                                            disabled={pairDisabled}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 col-span-1 md:col-span-2">
                        <Switch
                            id={`${plan.id}-hasMultiDeviceSync`}
                            checked={!!editablePlan.entitlements.hasMultiDeviceSync}
                            onCheckedChange={(checked) => {
                                handleEntitlementChange('hasMultiDeviceSync', checked);
                                const dOn = Number(editablePlan.entitlements.maxDevices) || 1;
                                const dLoc = Number(editablePlan.entitlements.maxDevicesLocal) || 1;
                                if (!checked) {
                                    handleEntitlementChange('maxDevices', 1);
                                    handleEntitlementChange('maxDevicesLocal', 1);
                                } else {
                                    const next = Math.max(dOn, dLoc) <= 1 ? 3 : Math.max(dOn, dLoc);
                                    handleEntitlementChange('maxDevices', next);
                                    handleEntitlementChange('maxDevicesLocal', next);
                                }
                            }}
                        />
                        <Label htmlFor={`${plan.id}-hasMultiDeviceSync`} className="flex-1">Multi-Device Sync</Label>
                    </div>

                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 col-span-1 md:col-span-2 flex-wrap">
                        <Switch
                            id={`${plan.id}-canAddFileImagePdf`}
                            checked={!!editablePlan.entitlements.canAddFileImagePdf}
                            onCheckedChange={(checked) => {
                                handleEntitlementChange('canAddFileImagePdf', checked);
                                if (!checked) {
                                    handleEntitlementChange('maxVoucherFileCount', 0);
                                } else if ((editablePlan.entitlements.maxVoucherFileCount as number) <= 0) {
                                    handleEntitlementChange('maxVoucherFileCount', 3);
                                }
                            }}
                        />
                        <Label htmlFor={`${plan.id}-canAddFileImagePdf`} className="flex-1">{entitlementLabels.canAddFileImagePdf}</Label>
                        {editablePlan.entitlements.canAddFileImagePdf && (
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`${plan.id}-maxVoucherFileCount`} className="text-sm whitespace-nowrap">Max files per voucher</Label>
                                <Input
                                    id={`${plan.id}-maxVoucherFileCount`}
                                    type="number"
                                    min={1}
                                    max={10}
                                    className="w-20 h-8"
                                    value={Math.max(0, Math.min(10, Number(editablePlan.entitlements.maxVoucherFileCount) || 0))}
                                    onChange={(e) => handleEntitlementChange('maxVoucherFileCount', Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)))}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 col-span-1 md:col-span-2 flex-wrap">
                        <Label htmlFor={`${plan.id}-maxInterCompanyPartners`} className="text-sm flex-1">
                            {entitlementLabels.maxInterCompanyPartners}
                        </Label>
                        <Input
                            id={`${plan.id}-maxInterCompanyPartners`}
                            type="number"
                            min={0}
                            className="w-24 h-8"
                            value={String(
                                Number.isFinite(Number(editablePlan.entitlements.maxInterCompanyPartners))
                                    ? Number(editablePlan.entitlements.maxInterCompanyPartners)
                                    : 0
                            )}
                            onChange={(e) =>
                                handleEntitlementChange(
                                    "maxInterCompanyPartners",
                                    Math.max(0, parseInt(e.target.value, 10) || 0)
                                )
                            }
                            placeholder="0 = unlimited"
                        />
                    </div>

                    {entitlementBooleanFields.map((key) => {
                        const value = editablePlan.entitlements[key];
                        return (
                            <div key={key} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                                <Switch
                                    id={`${plan.id}-${key}`}
                                    checked={!!value}
                                    onCheckedChange={(checked) => handleEntitlementChange(key, checked)}
                                />
                                <Label htmlFor={`${plan.id}-${key}`}>{entitlementLabels[key] || key.replace(/([A-Z])/g, ' $1').replace('Has ', '')}</Label>
                            </div>
                        )
                    })}
                </div>
                </CardContent>
            </ScrollArea>
        </Card>
    )
}
