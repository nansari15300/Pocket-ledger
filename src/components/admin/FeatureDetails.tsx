
"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { Feature } from '@/components/layout/AppSidebar';

interface FeatureDetailsProps {
    feature: Feature;
    isEnabled: boolean;
    featureConfig: Record<string, boolean>;
    onToggle: (featureId: string, enabled: boolean) => void;
    isUpdating: boolean;
}

const INCOME_EXPENSE_KEYS = {
    list: "incomes_list",
    accountsTab: "incomes_accounts_tab",
    groupsTab: "incomes_groups_tab",
    accountDetails: "incomes_account_details",
    groupDetails: "incomes_group_details",
} as const;

export function FeatureDetails({ feature, isEnabled, featureConfig, onToggle, isUpdating }: FeatureDetailsProps) {
    const isIncomeExpenseFeature = feature.id === "incomes";
    const listEnabled = featureConfig[INCOME_EXPENSE_KEYS.list] !== false;
    const accountsTabEnabled = featureConfig[INCOME_EXPENSE_KEYS.accountsTab] !== false;
    const groupsTabEnabled = featureConfig[INCOME_EXPENSE_KEYS.groupsTab] !== false;
    const accountDetailsEnabled = featureConfig[INCOME_EXPENSE_KEYS.accountDetails] !== false;
    const groupDetailsEnabled = featureConfig[INCOME_EXPENSE_KEYS.groupDetails] !== false;

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

                {isIncomeExpenseFeature && (
                    <div className="mt-4 space-y-3">
                        <div className="rounded-md border p-4 space-y-3">
                            <p className="text-sm font-semibold">Income & Expense List</p>
                            <p className="text-xs text-muted-foreground">List page on भए पछि users side मा tab names देखिन्छन् (tab toggle off हुँदा clickable हुँदैन).</p>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="incomes-list-toggle">List page access</Label>
                                <Switch
                                    id="incomes-list-toggle"
                                    checked={listEnabled}
                                    disabled={!isEnabled}
                                    onCheckedChange={(checked) => onToggle(INCOME_EXPENSE_KEYS.list, checked)}
                                />
                            </div>
                        </div>

                        {listEnabled && (
                            <div className="rounded-md border p-4 space-y-4">
                                <p className="text-sm font-semibold">Tab Access</p>
                                <p className="text-xs text-muted-foreground">Tab on हुँदा मात्र users मा त्यो tab clickable भई list खुल्छ।</p>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="incomes-accounts-tab-toggle">Accounts tab</Label>
                                        <Switch
                                            id="incomes-accounts-tab-toggle"
                                            checked={accountsTabEnabled}
                                            disabled={!isEnabled || !listEnabled}
                                            onCheckedChange={(checked) => onToggle(INCOME_EXPENSE_KEYS.accountsTab, checked)}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="incomes-groups-tab-toggle">Groups tab</Label>
                                        <Switch
                                            id="incomes-groups-tab-toggle"
                                            checked={groupsTabEnabled}
                                            disabled={!isEnabled || !listEnabled}
                                            onCheckedChange={(checked) => onToggle(INCOME_EXPENSE_KEYS.groupsTab, checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {listEnabled && (
                            <div className="rounded-md border p-4 space-y-4">
                                <p className="text-sm font-semibold">Details Page Access</p>
                                <p className="text-xs text-muted-foreground">Details switch on हुँदा मात्र account/group details page खुल्छ।</p>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="incomes-account-details-toggle">Account details page</Label>
                                        <Switch
                                            id="incomes-account-details-toggle"
                                            checked={accountDetailsEnabled}
                                            disabled={!isEnabled || !listEnabled || !accountsTabEnabled}
                                            onCheckedChange={(checked) => onToggle(INCOME_EXPENSE_KEYS.accountDetails, checked)}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="incomes-group-details-toggle">Group details page</Label>
                                        <Switch
                                            id="incomes-group-details-toggle"
                                            checked={groupDetailsEnabled}
                                            disabled={!isEnabled || !listEnabled || !groupsTabEnabled}
                                            onCheckedChange={(checked) => onToggle(INCOME_EXPENSE_KEYS.groupDetails, checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
