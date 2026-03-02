
"use client";

import { useState, useEffect } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getGatewayKeys, updateGatewayKeys, type GatewayKeys } from '@/ai/flows/gateway-keys';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

const formSchema = z.object({
  stripeSecretKey: z.string().optional(),
  khaltiPublicKey: z.string().optional(),
  esewaMerchantCode: z.string().optional(),
  esewaSecretKey: z.string().optional(),
});

export default function BankSettingsPage() {
  useAdminAccess(['SuperAdmin']);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
        form.reset(keys);
      } catch (error) {
        console.error("Failed to fetch gateway keys:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load existing keys.' });
      } finally {
        setLoading(false);
      }
    }
    fetchKeys();
  }, [form]);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSaving(true);
    try {
      await updateGatewayKeys(data);
      toast({ title: 'Success', description: 'Gateway keys have been updated.' });
    } catch (error) {
      console.error("Failed to update gateway keys:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save keys.' });
    } finally {
      setIsSaving(false);
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
                <CardDescription>Manage API keys for Stripe, Khalti, and eSewa. These are stored securely on the server.</CardDescription>
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
                                    <Input type="password" placeholder="sk_live_..." {...field} />
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
                                    <Input placeholder="live_public_key_..." {...field} />
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
                                    <Input placeholder="e.g., EPAYTEST" {...field} />
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
                                    <Input type="password" placeholder="8gBmPxtryL2mUplJd4E9I4A6u4y7SgC5" {...field} />
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
    </div>
  );
}

    