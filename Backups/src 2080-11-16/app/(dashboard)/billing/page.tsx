
"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_PLANS, PlanId, Plan, formatPrice, EntitlementKey } from "@/config/plans";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import KhaltiCheckout from "khalti-checkout-web";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, X } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter } from "@/components/ui/table";
import { format as formatDateFns } from 'date-fns';
import { Input } from "@/components/ui/input";

type CheckoutFormProps = {
  plan: Plan;
  billingCycle: "monthly" | "yearly";
};

function CheckoutForm({ plan, billingCycle }: CheckoutFormProps) {
  const [gateway, setGateway] = useState<"stripe" | "khalti" | "esewa">("stripe");
  const [isLoading, setIsLoading] = useState(false);
  const [donationAmount, setDonationAmount] = useState(100);

  const isFreePlan = plan.isFree;
  const amount = isFreePlan ? donationAmount : plan.price[billingCycle];
  const amountInPaisa = amount * 100;
  
  async function handleCheckout() {
    if (amount <= 0) {
        toast({ variant: "destructive", title: "Invalid Amount", description: "Please enter a valid amount to proceed." });
        return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        body: JSON.stringify({ 
          planId: plan.id, 
          gateway, 
          amount: amountInPaisa,
          currency: plan.currency, 
          userId: "CURRENT_USER_ID" // Replace with actual user ID
        }), 
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate payment.");
      }

      if (gateway === "stripe" && data.url) {
        window.location.assign(data.url);
      } else if (gateway === "khalti") {
        const khaltiConfig = {
          publicKey: data.publicKey,
          productIdentity: data.product_identity,
          productName: data.product_name,
          productUrl: window.location.href,
          amount: data.amount,
          eventHandler: {
            onSuccess(payload: any) {
              window.location.assign(`${data.returnUrl}?token=${'${payload.token}'}&amount=${'${payload.amount}'}`);
            },
            onError(error: any) {
              console.error(error);
              toast({ variant: "destructive", title: "Khalti Error", description: "Payment failed. Please try again." });
            },
            onClose() {
              console.log("Khalti widget closed.");
            }
          },
        };
        const checkout = new (KhaltiCheckout as any)(khaltiConfig);
        checkout.show({ amount: data.amount });

      } else if (gateway === "esewa") {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.url;
        
        const fields = {
            'amount': data.amount,
            'failure_url': data.failUrl,
            'product_delivery_charge': '0',
            'product_service_charge': '0',
            'product_code': data.merchantCode,
            'signature': data.signature,
            'signed_field_names': data.signedFieldNames,
            'success_url': data.successUrl,
            'tax_amount': '0',
            'total_amount': data.amount,
            'transaction_uuid': data.oid
        };

        for (const key in fields) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = (fields as any)[key];
            form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Checkout Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-8 border-t pt-8">
       {isFreePlan ? (
        <h3 className="text-xl font-semibold mb-4">Support Us with a Donation (Optional)</h3>
      ) : (
        <h3 className="text-xl font-semibold mb-4">Select Payment Method</h3>
      )}
       {isFreePlan && (
        <div className="mb-6 max-w-sm">
           <Label htmlFor="donation-amount">Donation Amount (NPR)</Label>
           <Input 
             id="donation-amount"
             type="number"
             value={donationAmount}
             onChange={(e) => setDonationAmount(Number(e.target.value))}
             placeholder="e.g., 100"
           />
        </div>
      )}
      <RadioGroup value={gateway} onValueChange={(val) => setGateway(val as any)} className="flex items-center gap-4 mb-6">
        <Label htmlFor="stripe" className={cn("flex items-center gap-2 border rounded-lg p-3 cursor-pointer", gateway === 'stripe' && "border-primary")}>
            <RadioGroupItem value="stripe" id="stripe" />
            Stripe (Cards)
        </Label>
         <Label htmlFor="khalti" className={cn("flex items-center gap-2 border rounded-lg p-3 cursor-pointer", gateway === 'khalti' && "border-primary")}>
            <RadioGroupItem value="khalti" id="khalti" />
            Khalti
        </Label>
         <Label htmlFor="esewa" className={cn("flex items-center gap-2 border rounded-lg p-3 cursor-pointer", gateway === 'esewa' && "border-primary")}>
            <RadioGroupItem value="esewa" id="esewa" />
            eSewa
        </Label>
      </RadioGroup>
      <Button onClick={handleCheckout} disabled={isLoading} className="w-full max-w-sm">
        {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 
          isFreePlan ? `Donate ${formatPrice({ ...plan, price: { monthly: donationAmount, yearly: donationAmount } } as Plan, 'monthly', true)}` : `Pay with ${gateway.toUpperCase()}`
        }
      </Button>
    </div>
  );
}


export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>(Object.values(DEFAULT_PLANS));
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("basic");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  useEffect(() => {
    const unsub = onSnapshot(doc(firestore, "app_settings", "plans"), (docSnap) => {
        if (docSnap.exists()) {
            const firestorePlans = docSnap.data() as Record<PlanId, Plan>;
            const mergedPlans = Object.values(DEFAULT_PLANS).map(defaultPlan => {
                const firestorePlan = firestorePlans[defaultPlan.id];
                const limitedTimeOfferDate = firestorePlan?.limitedTimeOfferDate;
                
                let discountPercentage = firestorePlan?.discountPercentage;
                if (!discountPercentage && firestorePlan?.price.monthly > 0 && firestorePlan?.price.yearly > 0) {
                  discountPercentage = 100 - (firestorePlan.price.yearly * 100) / (firestorePlan.price.monthly * 12);
                }

                return {
                  ...defaultPlan,
                  ...(firestorePlan || {}),
                  entitlements: {
                    ...defaultPlan.entitlements,
                    ...(firestorePlan?.entitlements || {}),
                  },
                  price: {
                    ...defaultPlan.price,
                    ...(firestorePlan?.price || {}),
                  },
                  isFree: firestorePlan?.isFree ?? defaultPlan.isFree,
                  limitedTimeOfferDate: limitedTimeOfferDate,
                  discountPercentage: discountPercentage
                };
            });
            setPlans(mergedPlans);
        } else {
            setPlans(Object.values(DEFAULT_PLANS));
        }
        setLoading(false);
    });
    return () => unsub();
  }, []);

  const selectedPlanDetails = plans.find(p => p.id === selectedPlanId);
  
  const yearlyDiscount = useMemo(() => {
    const totalMonthlyForYear = plans.reduce((acc, plan) => acc + (plan.price.monthly || 0), 0) * 12;
    const totalYearly = plans.reduce((acc, plan) => acc + (plan.price.yearly || 0), 0);
    
    if (totalMonthlyForYear > 0 && totalYearly > 0) {
        return Math.round(100 - (totalYearly * 100) / totalMonthlyForYear);
    }
    return 16; // Default or fallback
  }, [plans]);

  
 const allFeaturesConfig: { key: EntitlementKey, label: string }[] = [
    { key: "maxUsers", label: "Max Users" },
    { key: "maxCompanies", label: "Max Companies" },
    { key: "dailyVoucherLimit", label: "Daily Vouchers" },
    { key: "monthlyVoucherLimit", label: "Monthly Vouchers" },
    { key: "maxAttachmentsGB", label: "Attachments (GB)" },
    { key: "maxStorageGB", label: "Storage (GB)" },
    { key: "hasMultiDeviceSync", label: 'Multi-device sync' },
    { key: "hasRoleBasedAccess", label: 'Role-based access' },
    { key: "hasAuditLogs", label: 'Audit logs' },
    { key: "hasPrioritySupport", label: 'Priority support' },
  ];

  const getFeatureValue = (plan: Plan, key: EntitlementKey): { text: string; enabled: boolean } => {
    const value = plan.entitlements[key];

    if (key === 'dailyVoucherLimit' || key === 'monthlyVoucherLimit') {
        const enabled = value !== 0;
        const text = value === 0 ? "Unlimited" : String(value);
        return { text, enabled: true };
    }
    
    if (typeof value === 'boolean') {
        return { text: value ? 'Yes' : 'No', enabled: value };
    }
    
    if (typeof value === 'number') {
        const enabled = value > 0; 
        return { text: String(value), enabled };
    }

    return { text: 'No', enabled: false };
  };
  
  if (loading || !selectedPlanDetails) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Card className="max-w-7xl mx-auto">
          <CardHeader>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex justify-center items-center gap-2 my-6">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-40" />
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <Card className="max-w-7xl mx-auto">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-3xl font-bold">Billing & Plans</CardTitle>
                    <CardDescription>Choose a plan that fits your needs.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant={billingCycle === "monthly" ? "default" : "outline"} onClick={() => setBillingCycle("monthly")}>Monthly</Button>
                    <Button variant={billingCycle === "yearly" ? "default" : "outline"} onClick={() => setBillingCycle("yearly")}>Yearly (Save ~{yearlyDiscount}%)</Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-1/4 font-semibold text-base">Features</TableHead>
                                {plans.map(p => {
                                    const isSelected = p.id === selectedPlanId;
                                    const offerDate = p.limitedTimeOfferDate ? (p.limitedTimeOfferDate as any).toDate() : null;
                                    const isOfferValid = offerDate && offerDate > new Date();

                                    return (
                                        <TableHead key={p.id} className={cn("text-center w-1/4", isSelected && "bg-muted")}>
                                            <div className="p-4">
                                                <div className="flex items-center justify-center gap-4">
                                                    <h3 className="text-xl font-bold">{p.name}</h3>
                                                    {p.highlight && <Badge>Most Popular</Badge>}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{p.tagline}</p>
                                                <div className="mt-4">
                                                    {p.isFree ? (
                                                        <>
                                                            <p className="text-lg font-bold text-muted-foreground line-through">{formatPrice(p, billingCycle, true)}</p>
                                                            <p className="text-3xl font-bold text-primary">Free</p>
                                                        </>
                                                    ) : (
                                                        <div className="text-3xl font-bold">{formatPrice(p, billingCycle)}</div>
                                                    )}
                                                </div>
                                                {isOfferValid && (
                                                    <Badge variant="destructive" className="mt-2 whitespace-nowrap">
                                                        Offer ends {formatDateFns(offerDate, "MMM do, yyyy")}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allFeaturesConfig.map(feature => (
                                <TableRow key={feature.key}>
                                    <TableCell className="font-medium">{feature.label}</TableCell>
                                    {plans.map(p => {
                                        const { text, enabled } = getFeatureValue(p, feature.key);
                                        const isSelected = p.id === selectedPlanId;
                                        return (
                                            <TableCell key={`${p.id}-${feature.key}`} className={cn("text-center", isSelected && "bg-muted")}>
                                                {['hasMultiDeviceSync', 'hasRoleBasedAccess', 'hasAuditLogs', 'hasPrioritySupport'].includes(feature.key) ? (
                                                     enabled ? <Check className="h-5 w-5 mx-auto text-green-500" /> : <X className="h-5 w-5 mx-auto text-red-500" />
                                                ) : (
                                                    <span className={cn(!enabled && text !== 'Unlimited' && "text-muted-foreground")}>{text}</span>
                                                )}
                                            </TableCell>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                         <TableFooter>
                            <TableRow>
                                <TableCell></TableCell>
                                {plans.map(p => {
                                    const isSelected = p.id === selectedPlanId;
                                    return (
                                        <TableCell key={`footer-${p.id}`} className={cn("text-center p-4", isSelected && "bg-muted")}>
                                            <Button onClick={() => setSelectedPlanId(p.id)} variant={isSelected ? "default" : "outline"} className="w-full max-w-[200px]">
                                                {isSelected ? "Selected" : "Choose Plan"}
                                            </Button>
                                        </TableCell>
                                    )
                                })}
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
                
                <CheckoutForm 
                    plan={selectedPlanDetails}
                    billingCycle={billingCycle}
                />
            </CardContent>
        </Card>
    </div>
  );
}
