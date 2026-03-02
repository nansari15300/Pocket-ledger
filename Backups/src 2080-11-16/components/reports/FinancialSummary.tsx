"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useVouchers } from "@/hooks/useVouchers";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialSummaryCards } from "./FinancialSummaryCards";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export default function FinancialSummary() {
    const { vouchers, loading: vouchersLoading, processedParties, processedStaff, processedTaxes, processedAccounts, processedItems, expenseAccounts } = useVouchers();
    const isMobile = useIsMobile();

    if (vouchersLoading) {
        return <div className="p-8 space-y-6"><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></div>
    }

    return (
        <div className={cn("pb-[72px] p-0.5 w-full", isMobile && "h-full min-h-0 overflow-y-auto overflow-x-hidden")}>
            <div className="p-0 space-y-3">
                <Card className="border-2 border-foreground/20">
                    <CardHeader>
                        <CardTitle>Financial Summary Report</CardTitle>
                        <CardDescription>A complete overview of your company's financial standing.</CardDescription>
                    </CardHeader>
                </Card>

                <FinancialSummaryCards
                    vouchers={vouchers}
                    processedParties={processedParties}
                    processedStaff={processedStaff}
                    processedTaxes={processedTaxes}
                    processedAccounts={processedAccounts}
                    processedItems={processedItems}
                    expenseAccounts={expenseAccounts}
                    loading={vouchersLoading}
                    showDetails={true}
                    compact={true}
                />
            </div>
        </div>
    );
}
