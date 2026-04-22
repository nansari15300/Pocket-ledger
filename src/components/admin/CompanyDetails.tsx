
"use client";

import { useState } from "react";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { firestore as db } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { Company } from "@/app/(admin)/admin/companies/page";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, Eye, EyeOff, Info } from "lucide-react";
import type { Plan, PlanId, EntitlementKey } from "@/config/plans";
import { DEFAULT_PLANS } from "@/config/plans";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCompany as useCompanyContext } from "@/hooks/useCompany";


// Get all possible entitlement keys from the default plans
const ALL_ENTITLEMENT_KEYS = Array.from(
  new Set(
    Object.values(DEFAULT_PLANS).flatMap(plan => Object.keys(plan.entitlements))
  )
) as EntitlementKey[];

const featureLabels: Record<string, string> = {
    allowCompanyAdminRecycleBin: "Allow Restore Company"
};

const featureDescriptions: Record<string, { en: string; ne: string }> = {
    maxUsers: {
        en: "On: Sets the maximum number of users that can be invited to this company.\nOff: The company will be limited to the default number of users for its plan.",
        ne: "On: यो कम्पनीमा आमन्त्रित गर्न सकिने प्रयोगकर्ताहरूको अधिकतम संख्या सेट गर्दछ।\nOff: कम्पनी आफ्नो योजनाको लागि पूर्वनिर्धारित प्रयोगकर्ता संख्यामा सीमित हुनेछ।"
    },
    maxCompanies: {
        en: "On: Sets the maximum number of companies this user can own or be a part of.\nOff: User is limited to the default number of companies for their plan.",
        ne: "On: यो प्रयोगकर्ताले स्वामित्व वा सदस्य हुन सक्ने कम्पनीहरूको अधिकतम संख्या सेट गर्दछ।\nOff: प्रयोगकर्ता आफ्नो योजनाको पूर्वनिर्धारित कम्पनी संख्यामा सीमित हुनेछ।"
    },
    maxAttachmentsGB: {
        en: "On: Sets the total storage limit in Gigabytes (GB) for file attachments.\nOff: Storage limit reverts to the plan's default.",
        ne: "On: फाइल संलग्नकहरूको लागि कुल भण्डारण सीमा गिगाबाइट (GB) मा सेट गर्दछ।\nOff: भण्डारण सीमा योजनाको पूर्वनिर्धारितमा फर्किनेछ।"
    },
    maxStorageGB: {
        en: "On: Sets the total storage limit in Gigabytes (GB) for all company data and backups.\nOff: Storage limit reverts to the plan's default.",
        ne: "On: सबै कम्पनी डाटा र ब्याकअपहरूको लागि कुल भण्डारण सीमा गिगाबाइट (GB) मा सेट गर्दछ।\nOff: भण्डारण सीमा योजनाको पूर्वनिर्धारितमा फर्किनेछ।"
    },
    dailyVoucherLimit: {
        en: "On: Sets the maximum number of vouchers that can be created per day. Use 0 for unlimited.\nOff: Limit reverts to the plan's default.",
        ne: "On: प्रति दिन बनाउन सकिने भाउचरहरूको अधिकतम संख्या सेट गर्दछ। असीमितको लागि ० प्रयोग गर्नुहोस्।\nOff: सीमा योजनाको पूर्वनिर्धारितमा फर्किनेछ।"
    },
    monthlyVoucherLimit: {
        en: "On: Sets the maximum number of vouchers that can be created per month. Use 0 for unlimited.\nOff: Limit reverts to the plan's default.",
        ne: "On: प्रति महिना बनाउन सकिने भाउचरहरूको अधिकतम संख्या सेट गर्दछ। असीमितको लागि ० प्रयोग गर्नुहोस्।\nOff: सीमा योजनाको पूर्वनिर्धारितमा फर्किनेछ।"
    },
    hasMultiDeviceSync: {
        en: "On: Enables real-time data synchronization across multiple devices.\nOff: Data will only be saved locally on the device it was entered on.",
        ne: "On: धेरै यन्त्रहरूमा वास्तविक-समय डाटा सिङ्क्रोनाइजेसन सक्षम गर्दछ।\nOff: डाटा केवल प्रविष्ट गरिएको यन्त्रमा स्थानीय रूपमा सुरक्षित हुनेछ।"
    },
    hasPrioritySupport: {
        en: "On: Grants the company priority access to customer support with faster response times.\nOff: Standard support channels and response times apply.",
        ne: "On: कम्पनीलाई छिटो प्रतिक्रिया समयको साथ ग्राहक समर्थनमा प्राथमिकता पहुँच प्रदान गर्दछ।\nOff: मानक समर्थन च्यानलहरू र प्रतिक्रिया समयहरू लागू हुनेछन्।"
    },
    hasAuditLogs: {
        en: "On: Enables detailed logging of all user activities and changes within the company.\nOff: Only basic activity logs will be kept.",
        ne: "On: कम्पनी भित्र सबै प्रयोगकर्ता गतिविधिहरू र परिवर्तनहरूको विस्तृत लगिङ सक्षम गर्दछ।\nOff: केवल आधारभूत गतिविधि लगहरू राखिनेछन्।"
    },
    hasCustomBranding: {
        en: "On: Allows the company to use their own logo and branding on invoices and reports.\nOff: Default Pocket Ledger branding will be used.",
        ne: "On: कम्पनीलाई इनभ्वाइस र रिपोर्टहरूमा आफ्नै लोगो र ब्रान्डिङ प्रयोग गर्न अनुमति दिन्छ।\nOff: पूर्वनिर्धारित Pocket Ledger ब्रान्डिङ प्रयोग गरिनेछ।"
    },
    hasRoleBasedAccess: {
        en: "On: Enables the ability to create custom roles and define granular permissions for users.\nOff: Users will be limited to default roles like Viewer, Data Entry, etc.",
        ne: "On: प्रयोगकर्ताहरूको लागि अनुकूलन भूमिकाहरू सिर्जना गर्न र विस्तृत अनुमतिहरू परिभाषित गर्ने क्षमता सक्षम गर्दछ।\nOff: प्रयोगकर्ताहरू पूर्वनिर्धारित भूमिकाहरूमा सीमित हुनेछन् जस्तै दर्शक, डाटा प्रविष्टि, आदि।"
    },
    hasAPIAccess: {
        en: "On: Grants access to the Pocket Ledger API for custom integrations and data access.\nOff: API access is disabled.",
        ne: "On: अनुकूलन एकीकरण र डाटा पहुँचको लागि Pocket Ledger API मा पहुँच प्रदान गर्दछ।\nOff: API पहुँच असक्षम छ।"
    },
    allowCompanyAdminRecycleBin: {
        en: "On: Allows this company to be restored from the recycle bin if deleted.\nOff: The company cannot be restored and would require a plan upgrade to enable restoration.",
        ne: "On: यदि मेटाइयो भने यो कम्पनीलाई रिसाइकल बिनबाट पुनर्स्थापना गर्न अनुमति दिन्छ।\nOff: यदि मेटाइयो भने यो कम्पनीलाई पुनर्स्थापना गर्न सकिँदैन, र पुन: प्राप्ति सक्षम गर्न योजना अपग्रेड गर्न आवश्यक हुनेछ।"
    }
};

const InfoPopupContent = ({ descriptions }: { descriptions: { en: string; ne: string } }) => {
  const [lang, setLang] = useState<'en' | 'ne'>('en');

  return (
    <div className="p-2 max-w-sm">
      <p className="text-sm whitespace-pre-wrap">
        {lang === 'en' ? descriptions.en : descriptions.ne}
      </p>
      <div className="mt-2 text-right">
        <Button
          variant="link"
          size="sm"
          className="p-0 h-auto text-xs"
          onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
        >
          {lang === 'en' ? 'नेपालीमा हेर्नुहोस्' : 'View in English'}
        </Button>
      </div>
    </div>
  );
};


interface CompanyDetailsProps {
    company: Company;
    onUpdate: (updatedCompany: Company) => void;
    plans: Plan[];
}

export function CompanyDetails({ company, onUpdate, plans }: CompanyDetailsProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const { toast } = useToast();
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { triggerSync, reloadLocalCompanyRegistry } = useCompanyContext();

    const updatePlan = async (planId: PlanId) => {
        setIsUpdating(true);
        try {
            const planDefaults = DEFAULT_PLANS[planId].entitlements;
            const settingsUpdate: Record<string, boolean> = {};
            
            Object.keys(planDefaults).forEach(key => {
                const featureKey = key as EntitlementKey;
                const companySetting = company.settings?.[featureKey];

                if (companySetting === undefined) {
                    settingsUpdate[`settings.${featureKey}`] = planDefaults[featureKey] as boolean;
                }
            });

            await updateDoc(doc(db, 'companies', company.id), { planId, ...settingsUpdate });
            onUpdate({ ...company, planId });
            triggerSync();
            toast({ title: "Success", description: "Company plan updated." });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update plan." });
        } finally {
            setIsUpdating(false);
        }
    }

    const updateExpiry = async (isoDate: string) => {
        if (!isoDate) return;
        setIsUpdating(true);
        try {
            const at = Timestamp.fromDate(new Date(isoDate));
            await updateDoc(doc(db, 'companies', company.id), { planExpiry: at });
            onUpdate({ ...company, planExpiry: at });
            reloadLocalCompanyRegistry();
            triggerSync();
            toast({ title: "Success", description: "Plan expiry updated." });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update expiry." });
        } finally {
            setIsUpdating(false);
        }
    }

    const resetCompanyPassword = async () => {
        if (!newPassword) {
            toast({ variant: "destructive", title: "Error", description: "Password cannot be empty." });
            return;
        }
        setIsResettingPassword(true);
        try {
            await updateDoc(doc(db, 'companies', company.id), { password: newPassword });
            onUpdate({ ...company, password: newPassword });
            reloadLocalCompanyRegistry();
            triggerSync();
            toast({ title: "Success", description: "Company password has been reset." });
            setIsResetDialogOpen(false); // Close dialog on success
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to reset password." });
        } finally {
            setIsResettingPassword(false);
            setNewPassword("");
        }
    }

    const toggleFeature = async (key: string, value: boolean) => {
        setIsUpdating(true);
        try {
            await updateDoc(doc(db, 'companies', company.id), { [`settings.${key}`]: value });
            const updatedSettings = { ...(company.settings || {}), [key]: value };
            onUpdate({ ...company, settings: updatedSettings });
            reloadLocalCompanyRegistry();
            triggerSync();
            toast({ title: "Success", description: `Feature '${key}' ${value ? 'enabled' : 'disabled'}.` });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to toggle feature." });
        } finally {
            setIsUpdating(false);
        }
    }

    const isBasicPlan = company.planId === 'basic';

    return (
        <Card className="h-full min-h-0 overflow-hidden relative flex flex-col">
             {(isUpdating || isResettingPassword) && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            )}
            <CardHeader className="shrink-0 flex flex-row items-start justify-between">
                <div>
                    <CardTitle>{company.name}</CardTitle>
                    <CardDescription>ID: {company.id}</CardDescription>
                </div>
                 <div className="flex items-center gap-4">
                    <div className="text-sm">
                        <Label>Plan:</Label>
                        <Select value={company.planId || 'basic'} onValueChange={(value) => updatePlan(value as PlanId)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {plans.map(plan => (
                                    <SelectItem key={plan.id} value={plan.id}>
                                        {plan.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="text-sm">
                        <Label htmlFor={`expiry-${company.id}`}>Plan Expiry:</Label>
                        <Input
                            id={`expiry-${company.id}`}
                            type="date"
                            className="ml-2 border rounded px-2 py-1"
                            defaultValue={company.planExpiry?.toDate ? company.planExpiry.toDate().toISOString().slice(0,10) : ''}
                            onBlur={(e) => updateExpiry(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>

            <ScrollArea className="flex-1 min-h-0">
                <CardContent className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ALL_ENTITLEMENT_KEYS.map(key => {
                    const defaultEntitlement = company.planId ? DEFAULT_PLANS[company.planId].entitlements[key as EntitlementKey] : false;
                    const isEnabled = company.settings?.[key] ?? defaultEntitlement;
                
                return (
                 <div key={key} className={cn("flex items-center gap-2 text-sm p-3 border rounded-lg", isEnabled ? "bg-green-50" : "bg-red-50")}>
                    <Switch
                        id={`${company.id}-${key}`}
                        checked={!!isEnabled}
                        onCheckedChange={(checked) => toggleFeature(key, checked)}
                    />
                    <Label htmlFor={`${company.id}-${key}`}>{featureLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</Label>
                    <div className="flex-1" />
                    {featureDescriptions[key] && (
                        <Popover>
                            <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto rounded-full hover:bg-black/10">
                                <Info className="h-4 w-4" />
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80" side="top" align="center">
                                <InfoPopupContent descriptions={featureDescriptions[key]} />
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
                )})}
            </CardContent>
            </ScrollArea>
            <CardFooter className="shrink-0">
                 <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline"><KeyRound className="mr-2 h-4 w-4" /> Reset Company Password</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset Password for {company.name}</DialogTitle>
                            <DialogDescription>This will set a new main password for the company.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 relative">
                            <Input 
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                             <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                            <Button onClick={resetCompanyPassword} disabled={isResettingPassword}>
                                {isResettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Set New Password
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                 </Dialog>
            </CardFooter>
        </Card>
    )
}
