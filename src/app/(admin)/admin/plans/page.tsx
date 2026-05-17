
"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { onSnapshot, doc, setDoc, getDocFromServer } from 'firebase/firestore';
import { firestore as db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Plan, PlanId } from "@/config/plans";
import { buildDefaultPlansFirestoreDoc, mergeAppSettingsPlansDoc, sanitizePlanForFirestoreWrite } from "@/lib/mergeAppSettingsPlans";
import {
  defaultPlansListFallback,
  readAdminPlansSelectedPlanId,
  readCachedPlansList,
  writeAdminPlansSelectedPlanId,
  writeCachedPlansList,
} from "@/lib/plansCatalogCache";
import { PlanList } from "@/components/admin/plans/PlanList";
import { PlanDetails } from "@/components/admin/plans/PlanDetails";
import { BillingRegionalSettings } from "@/components/admin/plans/BillingRegionalSettings";

export default function PlansPage() {
    useAdminAccess(['SuperAdmin']);
    const { user } = useAuth();
    const { toast } = useToast();
    // Pehli paint stale localStorage na ho — server read ke baad ya snapshot se fill.
    const [plans, setPlans] = useState<Plan[]>(() => defaultPlansListFallback());
    const [loading, setLoading] = useState(true);
    const [missingPlansDoc, setMissingPlansDoc] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    /** Sirf button se: refresh par kabhi defaults upload nahi. */
    const [seedBusy, setSeedBusy] = useState(false);
    /** `getDocFromServer` se hydrate ho chuka ho to purana IndexedDB `fromCache` snapshot UI mat dubara set karo. */
    const serverHydratedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        const plansRef = doc(db, "app_settings", "plans");

        // Refresh / open: seedha Firestore server — local cache / persistence se purane amount na dikhen.
        (async () => {
            try {
                const snap = await getDocFromServer(plansRef);
                if (cancelled) return;
                if (snap.exists()) {
                    const merged = mergeAppSettingsPlansDoc(snap.data() as Record<string, unknown>);
                    setPlans(merged);
                    writeCachedPlansList(merged);
                    setMissingPlansDoc(false);
                    serverHydratedRef.current = true;
                } else {
                    setMissingPlansDoc(true);
                    setPlans(readCachedPlansList() ?? defaultPlansListFallback());
                }
            } catch {
                if (!cancelled) {
                    const c = readCachedPlansList();
                    if (c?.length) setPlans(c);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        const unsub = onSnapshot(
            plansRef,
            (docSnap) => {
                // Hoist metadata: TS narrows `docSnap` after `exists()` so `metadata` can be typed as unusable in the missing-doc branch.
                const fromCache = docSnap.metadata.fromCache;
                if (!docSnap.exists()) {
                    // Server pe doc hai (`getDocFromServer`) lekin listener abhi cache miss dikhaye — defaults mat samjho.
                    if (!(fromCache && serverHydratedRef.current)) {
                        setMissingPlansDoc(true);
                        setPlans(readCachedPlansList() ?? defaultPlansListFallback());
                    }
                    setLoading(false);
                    return;
                }
                const mergedPlans = mergeAppSettingsPlansDoc(docSnap.data() as Record<string, unknown>);
                const online = typeof navigator !== "undefined" && navigator.onLine;
                const skipStaleCacheOverlay =
                    fromCache && online && serverHydratedRef.current;
                if (!skipStaleCacheOverlay) {
                    setPlans(mergedPlans);
                }
                setMissingPlansDoc(false);
                if (!fromCache) {
                    writeCachedPlansList(mergedPlans);
                    serverHydratedRef.current = true;
                }
                setLoading(false);
            },
            (err) => {
                console.error("[admin/plans] Firestore listener", err);
                const cached = readCachedPlansList();
                if (cached) setPlans(cached);
                toast({
                    variant: "destructive",
                    title: "Plans load failed",
                    description: err?.message ?? "Showing last saved catalog from this device.",
                });
                setLoading(false);
            }
        );
        return () => {
            cancelled = true;
            unsub();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount par ek hi subscription
    }, []);

    /** Pehli baar project: sirf SuperAdmin button dabane par defaults Firestore me — refresh auto-upload band. */
    const handleCreateDefaultPlansDocOnce = useCallback(async () => {
        if (!user) {
            toast({ variant: "destructive", title: "Login required" });
            return;
        }
        setSeedBusy(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/admin/app-settings/plans", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ seedDefaults: true }),
            });
            if (!res.ok) {
                await setDoc(doc(db, "app_settings", "plans"), buildDefaultPlansFirestoreDoc(), { merge: true });
            }
            const snap = await getDocFromServer(doc(db, "app_settings", "plans"));
            if (snap.exists()) {
                const merged = mergeAppSettingsPlansDoc(snap.data() as Record<string, unknown>);
                setPlans(merged);
                writeCachedPlansList(merged);
                setMissingPlansDoc(false);
            }
            toast({ title: "Done", description: "Default plans document created in Firestore." });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast({ variant: "destructive", title: "Create failed", description: msg });
        } finally {
            setSeedBusy(false);
        }
    }, [user, toast]);

    const handleSelectPlan = useCallback((plan: Plan) => {
        setSelectedPlan(plan);
        writeAdminPlansSelectedPlanId(plan.id as PlanId);
    }, []);

    useEffect(() => {
        if (plans.length === 0) return;
        if (!selectedPlan) {
            const stored = readAdminPlansSelectedPlanId();
            const fromStorage = stored ? plans.find((p) => p.id === stored) : undefined;
            setSelectedPlan(fromStorage ?? plans[0]);
            return;
        }
        const updatedSelectedPlan = plans.find((p) => p.id === selectedPlan.id);
        if (updatedSelectedPlan) {
            setSelectedPlan(updatedSelectedPlan);
        } else {
            const stored = readAdminPlansSelectedPlanId();
            const fromStorage = stored ? plans.find((p) => p.id === stored) : undefined;
            setSelectedPlan(fromStorage ?? plans[0]);
        }
    }, [plans, selectedPlan]);

    const handleUpdateAndSave = async (updatedPlan: Plan) => {
        setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));

        const pushCatalogToLocal = () => {
            setPlans((prev) => {
                const next = prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p));
                writeCachedPlansList(next);
                return next;
            });
        };

        if (!user) {
            toast({ variant: "destructive", title: "Not signed in", description: "Login required to save plans." });
            return false;
        }

        const writeClientOnly = async () => {
            // Sirf is tier ka field — poora doc spread nahi (kam undefined / size issues).
            await setDoc(
                doc(db, "app_settings", "plans"),
                { [updatedPlan.id]: sanitizePlanForFirestoreWrite(updatedPlan) },
                { merge: true }
            );
        };

        try {
            const token = await user.getIdToken();
            const planPayload = sanitizePlanForFirestoreWrite(updatedPlan);
            const res = await fetch("/api/admin/app-settings/plans", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ planId: updatedPlan.id, plan: planPayload }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };

            if (res.ok) {
                pushCatalogToLocal();
                return true;
            }

            if (res.status === 401) {
                toast({ variant: "destructive", title: "Save failed", description: j?.error ?? "Invalid session." });
                return false;
            }

            try {
                await writeClientOnly();
                pushCatalogToLocal();
                return true;
            } catch (clientErr: unknown) {
                const msg = clientErr instanceof Error ? clientErr.message : String(clientErr);
                toast({ variant: "destructive", title: "Save failed", description: msg });
                return false;
            }
        } catch (error: unknown) {
            try {
                await writeClientOnly();
                pushCatalogToLocal();
                return true;
            } catch (clientErr: unknown) {
                const msg = clientErr instanceof Error ? clientErr.message : String(clientErr);
                toast({ variant: "destructive", title: "Save failed", description: msg });
                return false;
            }
        }
    };

    const filteredPlans = useMemo(() => {
        return plans.filter(plan =>
            plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            plan.tagline.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [plans, searchTerm]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 h-full p-6">
                <div>
                    <Skeleton className="h-12 w-full mb-4" />
                    <Skeleton className="h-20 w-full mb-2" />
                    <Skeleton className="h-20 w-full mb-2" />
                </div>
                <div>
                     <Skeleton className="h-full w-full" />
                </div>
            </div>
        )
    }

    return (
        <div className="h-full p-6 space-y-4">
            <BillingRegionalSettings />
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 h-full min-h-0">
                <div className="flex flex-col h-full min-h-0 gap-4">
                    {missingPlansDoc && (
                        <Card className="shrink-0 border-amber-500/50 bg-amber-500/5">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm">No `app_settings/plans` on server</CardTitle>
                                <CardDescription className="text-xs">
                                    Showing cached or bundled data only. Page refresh will not upload defaults anymore — use Download (server) or create once below.
                                </CardDescription>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-2 w-fit"
                                    disabled={seedBusy || !user}
                                    onClick={handleCreateDefaultPlansDocOnce}
                                >
                                    {seedBusy ? "Working…" : "Create default plans in Firestore (one-time)"}
                                </Button>
                            </CardHeader>
                        </Card>
                    )}
                    <Card className="shrink-0">
                        <CardHeader>
                            <CardTitle>Subscription Plans</CardTitle>
                            <CardDescription>Select a plan to view and edit its details.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name or tagline..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <div className="flex-1 min-h-0">
                        <PlanList
                            plans={filteredPlans}
                            selectedPlan={selectedPlan}
                            onSelectPlan={handleSelectPlan}
                        />
                    </div>
                </div>
                <div className="h-full min-h-0 overflow-hidden">
                    {selectedPlan ? (
                        <PlanDetails plan={selectedPlan} onSave={handleUpdateAndSave} />
                    ): (
                        <Card className="h-full flex items-center justify-center">
                            <CardContent className="text-center">
                                <p className="text-muted-foreground">No plan selected.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
