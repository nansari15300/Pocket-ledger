"use client";

import { useCompany } from "@/hooks/useCompany";
import { ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CompanySwitcher() {
  const { company, companyId } = useCompany();

  // In a real app, you would fetch a list of companies
  // and have a function to switch between them.
  const companies = company ? [company] : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between">
          {company ? company.name : "Select Company"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        {companies.map((c) => (
          <DropdownMenuItem key={c.id}>
            <Check
              className={`mr-2 h-4 w-4 ${
                companyId === c.id ? "opacity-100" : "opacity-0"
              }`}
            />
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}