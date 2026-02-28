
"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { Feature } from '@/components/layout/AppSidebar';

interface FeatureDetailsProps {
    feature: Feature;
    isEnabled: boolean;
    onToggle: (featureId: string, enabled: boolean) => void;
    isUpdating: boolean;
}

export function FeatureDetails({ feature, isEnabled, onToggle, isUpdating }: FeatureDetailsProps) {
    return (
        <Card className="h-full relative">
            {isUpdating && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            )}
            <CardHeader>
                <CardTitle>{feature.label}</CardTitle>
                <CardDescription>
                    Toggle to activate or deactivate this menu for all users.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-4 rounded-md border p-4">
                    <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                            {isEnabled ? "Active" : "Inactive"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            This menu is currently {isEnabled ? "visible to" : "hidden from"} users.
                        </p>
                    </div>
                    <Switch
                        id={`feature-toggle-${feature.id}`}
                        checked={isEnabled}
                        onCheckedChange={(checked) => onToggle(feature.id, checked)}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
