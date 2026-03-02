
"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDate } from "@/hooks/useDate";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Users, Landmark, Briefcase, Receipt, DollarSign, Building } from "lucide-react";

export type UnifiedPayee = {
  id: string;
  name: string;
  type: 'Party' | 'Staff' | 'Tax' | 'Expense' | 'Other' | 'Income';
  balance: number;
  entity: any;
};

const typeIconMap = {
    Party: Users,
    Staff: Briefcase,
    Tax: Receipt,
    Expense: DollarSign,
    Income: DollarSign,
    Other: Building,
}

export function PayeeList({
  payees,
  selectedPayee,
  onSelectPayee,
  searchTerm,
}: {
  payees: UnifiedPayee[];
  selectedPayee: UnifiedPayee | null;
  onSelectPayee: (payee: UnifiedPayee) => void;
  searchTerm: string;
}) {
  const { formatCurrency } = useDate();

  const filteredPayees = payees.filter((payee) =>
    payee.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-t-0 bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          {filteredPayees.map((payee) => {
            const isSelected = selectedPayee?.id === payee.id && selectedPayee?.type === payee.type;
            const Icon = typeIconMap[payee.type] || Building;
            return (
              <li key={`${payee.type}-${payee.id}`}>
                <Card
                  className={cn(
                    "p-1.5 cursor-pointer border",
                    isSelected
                      ? "border-primary bg-secondary"
                      : "hover:border-primary/50"
                  )}
                  onClick={() => onSelectPayee(payee)}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="h-8 w-8 flex-shrink-0 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                            <Icon className="h-4 w-4" />
                        </div>
                       <Tooltip>
                        <TooltipTrigger className="text-sm font-medium whitespace-nowrap truncate flex-1 min-w-0 text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none">
                          {payee.name}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{payee.name}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Badge variant="outline" className="flex-shrink-0 text-xs">{payee.type}</Badge>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium whitespace-nowrap flex-shrink-0 ml-2",
                        payee.balance >= 0 ? "text-green-600" : "text-red-600",
                        isSelected &&
                          (payee.balance >= 0
                            ? "text-green-800"
                            : "text-red-800")
                      )}
                    >
                      {formatCurrency(payee.balance, { showDrCr: true })}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
          {filteredPayees.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No payees found.
            </div>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
