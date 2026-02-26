

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { firestore } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { ALL_FEATURES, type Feature } from '@/components/layout/AppSidebar';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FeatureList } from '@/components/admin/FeatureList';
import { FeatureDetails } from '@/components/admin/FeatureDetails';
import { useIsMobile } from '@/hooks/use-mobile';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FeaturesPage() {
    useAdminAccess(['SuperAdmin']);
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [featureConfig, setFeatureConfig] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

    useEffect(() => {
        const unsub = onSnapshot(doc(firestore, "app_settings", "features"), (docSnap) => {
            if (docSnap.exists()) {
                setFeatureConfig(docSnap.data());
            } else {
                const defaultConfig: Record<string, boolean> = {};
                ALL_FEATURES.forEach(f => defaultConfig[f.id] = true);
                setFeatureConfig(defaultConfig);
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);
    
    useEffect(() => {
      if (!selectedFeature && ALL_FEATURES.length > 0 && !isMobile) {
        setSelectedFeature(ALL_FEATURES[0]);
      }
    }, [selectedFeature, isMobile]);


    const handleToggleFeature = async (featureId: string, enabled: boolean) => {
        setIsUpdating(true);
        const newConfig = { ...featureConfig, [featureId]: enabled };
        try {
            await setDoc(doc(firestore, "app_settings", "features"), newConfig, { merge: true });
            setFeatureConfig(newConfig); // Optimistic update
            toast({ title: 'Success', description: `Feature '${featureId}' has been ${enabled ? 'activated' : 'deactivated'}.` });
        } catch (error) {
            console.error("Error updating feature config:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update feature setting.' });
        } finally {
            setIsUpdating(false);
        }
    };
    
    const filteredFeatures = useMemo(() => {
        return ALL_FEATURES.filter(feature => 
            feature.label.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm]);

    const handleSelectFeature = useCallback((feature: Feature) => {
        setSelectedFeature(feature);
    }, []);

    if (loading) {
        return (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 h-full w-full max-w-full overflow-x-hidden p-3 md:p-0">
                <div>
                    <Skeleton className="h-12 w-full mb-4" />
                    <Skeleton className="h-20 w-full mb-2" />
                </div>
                <div>
                     <Skeleton className="h-full w-full" />
                </div>
            </div>
        );
    }

    if (isMobile) {
        return (
            <div className="w-full max-w-full overflow-x-hidden p-3">
                {!selectedFeature ? (
                    <div className="flex flex-col gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Add/Remove Features</CardTitle>
                                <CardDescription>Select a feature to manage its status.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search features..."
                                        className="pl-9"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                        <FeatureList
                            features={filteredFeatures}
                            selectedFeature={selectedFeature}
                            onSelectFeature={handleSelectFeature}
                            featureConfig={featureConfig}
                        />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Button variant="outline" size="sm" onClick={() => setSelectedFeature(null)}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Feature List
                        </Button>
                        <FeatureDetails
                            feature={selectedFeature}
                            isEnabled={featureConfig[selectedFeature.id] !== false}
                            featureConfig={featureConfig}
                            onToggle={handleToggleFeature}
                            isUpdating={isUpdating}
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 h-full w-full max-w-full overflow-x-hidden">
            <div className="flex flex-col gap-4 min-w-0">
                <Card>
                    <CardHeader>
                        <CardTitle>Add/Remove Features</CardTitle>
                        <CardDescription>Select a feature to manage its status.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search features..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>
                <FeatureList
                    features={filteredFeatures}
                    selectedFeature={selectedFeature}
                    onSelectFeature={handleSelectFeature}
                    featureConfig={featureConfig}
                />
            </div>
            <div>
                 {selectedFeature ? (
                    <FeatureDetails 
                        feature={selectedFeature} 
                        isEnabled={featureConfig[selectedFeature.id] !== false}
                        featureConfig={featureConfig}
                        onToggle={handleToggleFeature}
                        isUpdating={isUpdating}
                    />
                ): (
                    <Card className="h-full flex items-center justify-center">
                        <CardContent className="text-center">
                            <p className="text-muted-foreground">No feature selected.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
