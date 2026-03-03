
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Loader2, CaseSensitive, Rows, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDate } from "@/hooks/useDate";
import AnimatedNumber from "../ui/AnimatedNumber";
import { cn } from "@/lib/utils";

// 1. ZOD SCHEMA - Global settings that apply to all contexts
const animationSettingsSchema = z.object({
  numbers: z.object({
    enabled: z.boolean(),
    duration: z.number().min(1).max(5),
  }),
  rows: z.object({
    enabled: z.boolean(),
    duration: z.number().min(1).max(5),
  }),
});

type AnimationSettingsValues = z.infer<typeof animationSettingsSchema>;

const defaultAnimationSettings: AnimationSettingsValues = {
  numbers: { enabled: true, duration: 2.5 },
  rows: { enabled: true, duration: 2.5 },
};

// Generate demo list items with varying balances
const generateDemoListItems = () => [
  { id: '1', name: "Account A", balance: Math.random() * 10000 },
  { id: '2', name: "Account B", balance: Math.random() * 10000 },
  { id: '3', name: "Account C", balance: Math.random() * 10000 },
  { id: '4', name: "Account D", balance: Math.random() * 10000 },
  { id: '5', name: "Account E", balance: Math.random() * 10000 },
];

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

export function AnimationSettings() {
  const { user, customUser } = useAuth();
  const { toast } = useToast();
  const userDocId = customUser?.userDocId || user?.uid;
  const { formatCurrency } = useDate();
  const [isLoading, setIsLoading] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const [demoListItems, setDemoListItems] = useState(generateDemoListItems);

  const form = useForm<AnimationSettingsValues>({
    resolver: zodResolver(animationSettingsSchema),
    defaultValues: defaultAnimationSettings,
  });

  const watchedSettings = form.watch();

  // Load settings from user document (use same path as profile: userDocId or uid)
  useEffect(() => {
    if (userDocId) {
      const loadUserSettings = async () => {
        try {
          const userDocRef = doc(firestore, "users", userDocId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const settings = userData.animationSettings;
            if (settings) {
              const newSettings = {
                numbers: { ...defaultAnimationSettings.numbers, ...settings.numbers },
                rows: { ...defaultAnimationSettings.rows, ...settings.rows },
              };
              form.reset(newSettings);
            } else {
              form.reset(defaultAnimationSettings);
            }
          } else {
            form.reset(defaultAnimationSettings);
          }
        } catch (error) {
          console.error("Error loading user animation settings:", error);
          form.reset(defaultAnimationSettings);
        }
      };
      loadUserSettings();
    }
  }, [userDocId, form]);
  

  const handleSwitchChange = (path: 'numbers.enabled' | 'rows.enabled', checked: boolean) => {
    // Simply update the enabled state - duration remains independent
    // Components will check enabled flag and use duration 0 when disabled
    form.setValue(path, checked);
  };

  // Get active settings - global settings apply to all tabs
  const activeSettings = {
    numbers: {
      enabled: watchedSettings.numbers.enabled,
      duration: watchedSettings.numbers.duration,
    },
    rows: {
      enabled: watchedSettings.rows.enabled,
      duration: watchedSettings.rows.duration,
    },
  };

  const handleReloadDemo = useCallback(() => {
    const newItems = generateDemoListItems();
    // Sort by balance (bigger to smaller) – same item ids, order changes = layout animation (smooth move)
    newItems.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    setDemoListItems(newItems);
    setDemoKey(prev => prev + 1); // for number animation refresh
  }, []);

  const ANIMATION_SETTINGS_CHANNEL = "pocket-ledger-animation-settings";

  async function onSubmit(data: AnimationSettingsValues): Promise<void> {
    if (!userDocId) {
      toast({ variant: "destructive", title: "User not authenticated." });
      return;
    }
    setIsLoading(true);
    try {
      const userRef = doc(firestore, "users", userDocId);
      await updateDoc(userRef, { animationSettings: data });
      // Notify all tabs (same browser, same origin) so they update animation settings live
      if (typeof BroadcastChannel !== "undefined") {
        try {
          new BroadcastChannel(ANIMATION_SETTINGS_CHANNEL).postMessage(data);
        } catch (_) {}
      }
      toast({ title: "Success", description: "Animation settings have been updated." });
      // Reload demo to show new settings
      handleReloadDemo();
    } catch (error) {
      console.error("Error updating animation settings:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to save settings." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Animation & Effects Settings</CardTitle>
        <CardDescription>
          Customize animations for numbers and lists across the application to fit your preference.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            {/* DEMO SECTION - Show row animation with balance changes */}
            <Card className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Row Animation Demo</CardTitle>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleReloadDemo}
                  >
                    <RefreshCw className="mr-2 h-4 w-4"/> Reload Demo
                  </Button>
                </div>
                <CardDescription>
                  Same smooth move in account list, transaction tables (statement, billwise, spend wise). Rows slide to new position when order changes (e.g. new entry, date change). No animation on first load, refresh or tab change. Click Reload Demo to see reorder.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border-2 border-primary/20 p-4 bg-muted/30">
                  <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                      {demoListItems.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ 
                            duration: activeSettings.rows.enabled === true ? activeSettings.rows.duration : 0,
                            ease: "easeInOut"
                          }}
                        >
                          <Card className="p-2 border">
                            <div className="flex items-center justify-between w-full gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Avatar className="h-8 w-8 text-[10px] flex-shrink-0 border">
                                  <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                                    {getInitials(item.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-semibold text-sm">{item.name}</span>
                              </div>
                              <div className={cn(
                                "font-bold text-xs whitespace-nowrap flex-shrink-0",
                                item.balance >= 0 ? "text-green-600" : "text-red-600"
                              )}>
                                <AnimatedNumber 
                                  value={Math.abs(item.balance)}
                                  duration={activeSettings.numbers.enabled === true ? activeSettings.numbers.duration : 0}
                                  formatter={(val) => `Rs. ${Math.round(val).toLocaleString()} ${item.balance >= 0 ? 'Dr' : 'Cr'}`}
                                />
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* ANIMATION SETTINGS - NO TABS, JUST THE TWO SETTINGS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><CaseSensitive className="h-5 w-5"/>Number Animation</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="numbers.enabled"
                            render={({ field }: any) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <FormLabel>Enable</FormLabel>
                                <FormControl>
                                    <Switch checked={field.value} onCheckedChange={(checked) => handleSwitchChange('numbers.enabled', checked)} />
                                </FormControl>
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="numbers.duration"
                            render={({ field }: any) => (
                                <FormItem>
                                <div className="flex justify-between items-center mb-2">
                                    <FormLabel>Animation Duration</FormLabel>
                                    <span className="text-sm font-medium">{field.value.toFixed(1)}s</span>
                                </div>
                                <FormControl>
                                    <Slider 
                                        min={1} 
                                        max={5} 
                                        step={0.1} 
                                        value={[Math.max(1, field.value)]} 
                                        onValueChange={(vals) => field.onChange(vals[0])} 
                                    />
                                </FormControl>
                                <div className="text-xs text-muted-foreground mt-1">Range: 1.0s - 5.0s</div>
                                {!watchedSettings.numbers.enabled && (
                                  <div className="text-xs text-muted-foreground mt-1 italic">
                                    Animation is disabled. Enable to apply duration.
                                  </div>
                                )}
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Rows className="h-5 w-5"/>Row Animation</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="rows.enabled"
                            render={({ field }: any) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <FormLabel>Enable</FormLabel>
                                <FormControl>
                                    <Switch checked={field.value} onCheckedChange={(checked) => handleSwitchChange('rows.enabled', checked)} />
                                </FormControl>
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="rows.duration"
                            render={({ field }: any) => (
                                <FormItem>
                                    <div className="flex justify-between items-center mb-2">
                                        <FormLabel>Animation Duration</FormLabel>
                                        <span className="text-sm font-medium">{field.value.toFixed(1)}s</span>
                                    </div>
                                    <FormControl>
                                        <Slider 
                                            min={1} 
                                            max={5} 
                                            step={0.1} 
                                            value={[Math.max(1, field.value)]} 
                                            onValueChange={(vals) => field.onChange(vals[0])} 
                                        />
                                    </FormControl>
                                    <div className="text-xs text-muted-foreground mt-1">Range: 1.0s - 5.0s</div>
                                    {!watchedSettings.rows.enabled && (
                                      <div className="text-xs text-muted-foreground mt-1 italic">
                                        Animation is disabled. Enable to apply duration.
                                      </div>
                                    )}
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
            </div>
            
            <div className="flex justify-end items-center gap-4 pt-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Animation Settings
              </Button>
            </div>
            
            <div className="text-xs text-muted-foreground pt-2 border-t">
              <p>Note: These settings are saved per user and will apply across all companies you work with.</p>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
