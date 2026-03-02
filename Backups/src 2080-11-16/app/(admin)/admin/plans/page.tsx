
"use client"

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { collection, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import { firestore as db } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DEFAULT_PLANS, type Plan, type PlanId } from "@/config/plans";
import { PlanList } from "@/components/admin/plans/PlanList";
import { PlanDetails } from "@/components/admin/plans/PlanDetails";

export default function PlansPage() {
    useAdminAccess(['SuperAdmin']);
    const [plans, setPlans] = useState<Plan[]>(Object.values(DEFAULT_PLANS));
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "app_settings", "plans"), (docSnap) => {
            if (docSnap.exists()) {
                const firestorePlans = docSnap.data() as Record<PlanId, Plan>;
                // Deep merge to preserve defaults for missing keys
                const mergedPlans = Object.values(DEFAULT_PLANS).map(defaultPlan => ({
                    ...defaultPlan,
                    ...(firestorePlans[defaultPlan.id] || {}),
                    entitlements: {
                      ...defaultPlan.entitlements,
                      ...(firestorePlans[defaultPlan.id]?.entitlements || {}),
                    },
                    price: {
                        ...defaultPlan.price,
                        ...(firestorePlans[defaultPlan.id]?.price || {}),
                    }
                }));
                setPlans(mergedPlans);
            } else {
                // If no doc, save the default
                setDoc(doc(db, "app_settings", "plans"), DEFAULT_PLANS);
                setPlans(Object.values(DEFAULT_PLANS));
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleSelectPlan = useCallback((plan: Plan) => {
        setSelectedPlan(plan);
    }, []);

    useEffect(() => {
        if (!selectedPlan && plans.length > 0) {
            setSelectedPlan(plans[0]);
        } else if (selectedPlan) {
            // Refresh selected plan with latest data from the main list
            const updatedSelectedPlan = plans.find(p => p.id === selectedPlan.id);
            if (updatedSelectedPlan) {
                setSelectedPlan(updatedSelectedPlan);
            }
        }
    }, [plans, selectedPlan]);

    const handleUpdateAndSave = async (updatedPlan: Plan) => {
        setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
        
        try {
            const plansDocRef = doc(db, "app_settings", "plans");
            const docSnap = await getDoc(plansDocRef);
            const currentPlans = docSnap.exists() ? docSnap.data() : {};
            const newPlansData = {
                ...currentPlans,
                [updatedPlan.id]: updatedPlan,
            };
            await setDoc(plansDocRef, newPlansData, { merge: true });
            return true;
        } catch (error) {
            console.error("Failed to update plan:", error);
            return false;
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
        <div className="h-full p-6">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 h-full min-h-0">
                <div className="flex flex-col h-full min-h-0 gap-4">
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
