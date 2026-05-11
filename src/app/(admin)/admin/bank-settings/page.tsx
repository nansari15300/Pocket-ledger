
"use client";

import { useState, useEffect } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getGatewayKeys,
  updateGatewayKeys,
  ESEWA_UAT_MERCHANT_CODE,
  ESEWA_UAT_SECRET_KEY,
  type GatewayKeys,
} from '@/ai/flows/gateway-keys';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const formSchema = z.object({
  stripeSecretKey: z.string().optional(),
  khaltiPublicKey: z.string().optional(),
  esewaMerchantCode: z.string().optional(),
  esewaSecretKey: z.string().optional(),
});

type GatewayFormValues = z.infer<typeof formSchema>;

/** Firestore / spread `keys` can omit keys → `undefined`; `<Input {...field} />` must always get string (controlled). */
function toGatewayFormDefaults(raw: Partial<GatewayKeys>): GatewayFormValues {
  return {
    stripeSecretKey: typeof raw.stripeSecretKey === 'string' ? raw.stripeSecretKey : '',
    khaltiPublicKey: typeof raw.khaltiPublicKey === 'string' ? raw.khaltiPublicKey : '',
    esewaMerchantCode: typeof raw.esewaMerchantCode === 'string' ? raw.esewaMerchantCode : '',
    esewaSecretKey: typeof raw.esewaSecretKey === 'string' ? raw.esewaSecretKey : '',
  };
}

export default function BankSettingsPage() {
  useAdminAccess(['SuperAdmin']);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  /** `app_settings/billing` — owners ko paid→cheaper paid downgrade dikhana / API allow karna. */
  const [billingPolicyLoading, setBillingPolicyLoading] = useState(true);
  const [planDowngradeEnabled, setPlanDowngradeEnabled] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stripeSecretKey: '',
      khaltiPublicKey: '',
      esewaMerchantCode: '',
      esewaSecretKey: '',
    },
  });

  useEffect(() => {
    async function fetchKeys() {
      try {
        const keys = await getGatewayKeys();
        const base = toGatewayFormDefaults(keys);
        // `next dev`: pre-fill official eSewa UAT fields when Firestore is empty so you can save once or pay without saving.
        const devPrefill =
          process.env.NODE_ENV === 'development'
            ? {
                esewaMerchantCode: base.esewaMerchantCode.trim() || ESEWA_UAT_MERCHANT_CODE,
                esewaSecretKey: base.esewaSecretKey.trim() || ESEWA_UAT_SECRET_KEY,
              }
            : {};
        form.reset({ ...base, ...devPrefill });
      } catch (error) {
        console.error("Failed to fetch gateway keys:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load existing keys.' });
      } finally {
        setLoading(false);
      }
    }
    fetchKeys();
  }, [form]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, 'app_settings', 'billing'));
        if (cancelled) return;
        const v = snap.exists() ? (snap.data() as { planDowngradeEnabled?: unknown }).planDowngradeEnabled : undefined;
        setPlanDowngradeEnabled(typeof v === 'boolean' ? v : true);
      } catch (error) {
        console.error('Failed to load billing policy:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load billing policy.' });
      } finally {
        if (!cancelled) setBillingPolicyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSaving(true);
    try {
      // SuperAdmin / RHF can pass `undefined` for untouched optional fields — Firestore setDoc rejects undefined.
      await updateGatewayKeys(toGatewayFormDefaults(data));
      toast({ title: 'Success', description: 'Gateway keys have been updated.' });
    } catch (error) {
      console.error("Failed to update gateway keys:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save keys.' });
    } finally {
      setIsSaving(false);
    }
  };

  /** Toggle Firestore — billing page `onSnapshot` se turant owners ko UI update. */
  const persistPlanDowngradeEnabled = async (next: boolean) => {
    setPolicySaving(true);
    const prev = planDowngradeEnabled;
    setPlanDowngradeEnabled(next);
    try {
      await setDoc(doc(firestore, 'app_settings', 'billing'), { planDowngradeEnabled: next }, { merge: true });
      toast({
        title: 'Saved',
        description: next
          ? 'Owners can downgrade to a lower paid tier again.'
          : 'Paid-to-cheaper-paid downgrades are disabled for owners (Basic/free switch unchanged).',
      });
    } catch (error) {
      console.error('Failed to save billing policy:', error);
      setPlanDowngradeEnabled(prev);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not save billing policy.' });
    } finally {
      setPolicySaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Payment Gateway Settings</CardTitle>
                <CardDescription>
                  Manage API keys for Stripe, Khalti, and eSewa (stored in Firestore). In development, eSewa UAT
                  (EPAYTEST) is suggested when fields are empty; Stripe/Khalti still need your own test keys or{' '}
                  <code className="text-xs">.env.local</code> — see <code className="text-xs">.env.example</code>.
                </CardDescription>
            </CardHeader>
        </Card>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Stripe</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <FormField
                            control={form.control}
                            name="stripeSecretKey"
                            render={({ field }: any) => (
                                <FormItem>
                                <FormLabel>Stripe Secret Key</FormLabel>
                                <FormControl>
                                    <Input
                                      type="password"
                                      placeholder="sk_test_... or sk_live_..."
                                      {...field}
                                      value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Khalti</CardTitle>
                    </CardHeader>
                    <CardContent>
                       <FormField
                            control={form.control}
                            name="khaltiPublicKey"
                            render={({ field }: any) => (
                                <FormItem>
                                <FormLabel>Khalti Public Key</FormLabel>
                                <FormControl>
                                    <Input placeholder="live_public_key_..." {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>eSewa</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="esewaMerchantCode"
                            render={({ field }: any) => (
                                <FormItem>
                                <FormLabel>eSewa Merchant Code</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., EPAYTEST" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="esewaSecretKey"
                            render={({ field }: any) => (
                                <FormItem>
                                <FormLabel>eSewa Secret Key</FormLabel>
                                <FormControl>
                                    <Input
                                      type="password"
                                      placeholder="8gBmPxtryL2mUplJd4E9I4A6u4y7SgC5"
                                      {...field}
                                      value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                
                <div className="flex justify-end">
                    <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Settings
                    </Button>
                </div>
            </form>
        </Form>

        <Card>
          <CardHeader>
            <CardTitle>Billing behaviour</CardTitle>
            <CardDescription>
              Control whether company owners can use the Downgrade button to move to a cheaper paid tier (remaining
              value converts to more days at that plan’s rate). “Just change plan” is only for upgrading tiers. Switching
              to Basic (free) from the current plan column stays available when Basic is free.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="plan-downgrade-enabled" className="text-base">
                Allow downgrade to lower paid plans
              </Label>
              <p className="text-sm text-muted-foreground">
                {/* `app_settings/billing.planDowngradeEnabled` — billing page `onSnapshot` + `/api/company/downgrade-plan` dono isi se. */}
                Off: owners cannot move to a cheaper paid tier (button hidden, API 403); post-upgrade &quot;locked&quot;
                tiers stay blocked. On: Downgrade works including back to tiers that were locked after an upgrade. Basic
                (free) from the current plan column is unchanged when Off.
              </p>
            </div>
            <Switch
              id="plan-downgrade-enabled"
              checked={planDowngradeEnabled}
              disabled={billingPolicyLoading || policySaving}
              onCheckedChange={(c) => void persistPlanDowngradeEnabled(c)}
            />
          </CardContent>
        </Card>
    </div>
  );
}

    