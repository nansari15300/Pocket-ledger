"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type LoanFilterState = { search: string; status: string };

export function LoanFilters({
  value,
  onChange,
}: {
  value: LoanFilterState;
  onChange: (next: LoanFilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="Search name, number, lender…"
        className="h-9 max-w-sm"
      />
      <Select value={value.status} onValueChange={(status) => onChange({ ...value, status })}>
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
