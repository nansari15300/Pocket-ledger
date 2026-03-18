
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Calendar as CalendarIcon } from "lucide-react";
import { DEFAULT_PLANS, type Plan, type EntitlementKey } from "@/config/plans";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PlanDetailsProps {
    plan: Plan;
    onSave: (updatedPlan: Plan) => Promise<boolean>;
}

const entitlementLabels: Partial<Record<EntitlementKey, string>> = {
    allowCompanyAdminRecycleBin: "Allow Restore Company",
    canAddAvatar: "Can add avatar (Profile & Company logo)",
    canAddFileImagePdf: "Can add file (image/PDF) on vouchers",
    voucherHistoryEnabled: "Voucher edit history enabled",
    voucherHistoryLimit: "Max history entries per voucher",
};

export function PlanDetails({ plan, onSave }: PlanDetailsProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const { toast } = useToast();
    const [editablePlan, setEditablePlan] = useState<Plan>(plan);

    useEffect(() => {
        setEditablePlan(plan);
    }, [plan]);

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

    const entitlementNumberFields: EntitlementKey[] = ["maxUsers", "maxCompanies", "maxAttachmentsGB", "maxStorageGB", "dailyVoucherLimit", "monthlyVoucherLimit"];
    const entitlementBooleanFields: EntitlementKey[] = ["hasPrioritySupport", "hasAuditLogs", "hasRoleBasedAccess", "allowCompanyAdminRecycleBin", "canAddAvatar"];

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
                        <div className="space-y-2">
                            <Label>Monthly Price (NPR)</Label>
                            <Input 
                                type="number" 
                                value={editablePlan.price.monthly} 
                                onChange={e => handlePriceChange('monthly', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Yearly Price (NPR)</Label>
                            <Input 
                                type="number" 
                                value={editablePlan.price.yearly} 
                                onChange={e => handlePriceChange('yearly', e.target.value)} 
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {entitlementNumberFields.map((key) => {
                        const value = editablePlan.entitlements[key];
                        const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                        return (
                            <div key={key} className="space-y-1.5">
                                <Label htmlFor={`${plan.id}-${key}`}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</Label>
                                <Input 
                                    id={`${plan.id}-${key}`}
                                    type="number" 
                                    value={String(Number.isFinite(numericValue) ? numericValue : 0)}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        handleEntitlementChange(key, raw === '' ? 0 : Number(raw));
                                    }}
                                    className="w-full"
                                    placeholder="0 for unlimited"
                                />
                            </div>
                        )
                    })}
                    
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 col-span-1 md:col-span-2">
                        <Switch
                            id={`${plan.id}-hasMultiDeviceSync`}
                            checked={!!editablePlan.entitlements.hasMultiDeviceSync}
                            onCheckedChange={(checked) => {
                                handleEntitlementChange('hasMultiDeviceSync', checked);
                                const currentDevices = editablePlan.entitlements.maxDevices as number;
                                if (!checked) {
                                    handleEntitlementChange('maxDevices', 1);
                                } else {
                                    if (currentDevices <= 1) {
                                        handleEntitlementChange('maxDevices', 3); 
                                    }
                                }
                            }}
                        />
                        <Label htmlFor={`${plan.id}-hasMultiDeviceSync`} className="flex-1">Multi-Device Sync</Label>
                        <div className="flex items-center gap-2">
                            <Label htmlFor={`${plan.id}-maxDevices`} className="text-sm">Max Devices</Label>
                            <Input 
                                id={`${plan.id}-maxDevices`}
                                type="number"
                                className="w-20 h-8"
                                value={editablePlan.entitlements.maxDevices as number || 1}
                                onChange={(e) => handleEntitlementChange('maxDevices', Number(e.target.value))}
                                disabled={!editablePlan.entitlements.hasMultiDeviceSync}
                            />
                        </div>
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

                    {/* Plan-wise: Voucher History — On/Off + max entries per voucher */}
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 col-span-1 md:col-span-2 flex-wrap">
                        <Switch
                            id={`${plan.id}-voucherHistoryEnabled`}
                            checked={!!editablePlan.entitlements.voucherHistoryEnabled}
                            onCheckedChange={(checked) => {
                                handleEntitlementChange('voucherHistoryEnabled', checked);
                                if (!checked) {
                                    handleEntitlementChange('voucherHistoryLimit', 0);
                                } else if ((editablePlan.entitlements.voucherHistoryLimit as number) <= 0) {
                                    handleEntitlementChange('voucherHistoryLimit', 10);
                                }
                            }}
                        />
                        <Label htmlFor={`${plan.id}-voucherHistoryEnabled`} className="flex-1">{entitlementLabels.voucherHistoryEnabled}</Label>
                        {editablePlan.entitlements.voucherHistoryEnabled && (
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`${plan.id}-voucherHistoryLimit`} className="text-sm whitespace-nowrap">Max history entries</Label>
                                <Input
                                    id={`${plan.id}-voucherHistoryLimit`}
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="w-20 h-8"
                                    value={Math.max(0, Math.min(100, Number(editablePlan.entitlements.voucherHistoryLimit) || 0))}
                                    onChange={(e) => handleEntitlementChange('voucherHistoryLimit', Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                                />
                            </div>
                        )}
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
