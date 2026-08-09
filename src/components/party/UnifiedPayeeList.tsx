
"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Badge } from "@/components/ui/badge";
import { useDate } from "@/hooks/useDate";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Users, Briefcase, Receipt, DollarSign, Building } from "lucide-react";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { masterEntityAttachmentPreviewUrl } from "@/lib/masterEntityAttachmentPreviewUrl";
import { useCompany } from "@/hooks/useCompany";

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

export function UnifiedPayeeList({
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
  const { company } = useCompany();

  const filteredPayees = payees.filter((payee) =>
    payee.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-t-0 bg-transparent">
      <ScrollArea listChrome className="flex-1 min-h-0">
        <ul className="pl-master-list-ul">
          {filteredPayees.map((payee) => {
            const isSelected = selectedPayee?.id === payee.id && selectedPayee?.type === payee.type;
            const Icon = typeIconMap[payee.type] || Building;
            const attachmentPreviewUrl = masterEntityAttachmentPreviewUrl(payee.entity);
            return (
              <li key={`${payee.type}-${payee.id}`}>
                <MasterListRow
                  selected={isSelected}
                  className={cn(
                    !isSelected && "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-orange-300/80 hover:bg-orange-50/30"
                  )}
                  onClick={() => onSelectPayee(payee)}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <EntityFileAttachmentHover
                          fileUrl={attachmentPreviewUrl}
                          triggerClassName="inline-flex shrink-0 rounded-full"
                        >
                          <ResolvedEntityAvatar
                            className="h-8 w-8 text-xs"
                            companyId={payee.entity?.companyId ?? company?.id}
                            src={attachmentPreviewUrl ?? undefined}
                            alt={payee.name}
                            fallbackSlot={<Icon className="h-4 w-4 text-muted-foreground" />}
                          />
                        </EntityFileAttachmentHover>
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
                </MasterListRow>
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
