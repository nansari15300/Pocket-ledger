
"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Plan } from "@/config/plans";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/config/plans";

interface PlanListProps {
    plans: Plan[];
    selectedPlan: Plan | null;
    onSelectPlan: (plan: Plan) => void;
}

export function PlanList({ plans, selectedPlan, onSelectPlan }: PlanListProps) {

    if(plans.length === 0) {
        return (
            <div className="text-center text-muted-foreground p-8">
                No plans found.
            </div>
        )
    }

    return (
        <ScrollArea className="h-full border rounded-lg">
            <div className="p-2 space-y-1">
                {plans.map(plan => (
                    <Card 
                        key={plan.id}
                        className={cn("p-3 cursor-pointer", selectedPlan?.id === plan.id && "bg-muted border-primary")}
                        onClick={() => onSelectPlan(plan)}
                    >
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{plan.name}</p>
                                <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                            </div>
                            {plan.highlight && <Badge>Popular</Badge>}
                        </div>
                         <div className="flex gap-4 mt-2 pt-2 border-t">
                            <p className="text-sm font-medium">{formatPrice(plan, 'monthly')}</p>
                            <p className="text-sm font-medium">{formatPrice(plan, 'yearly')}</p>
                        </div>
                    </Card>
                ))}
            </div>
        </ScrollArea>
    )
}
