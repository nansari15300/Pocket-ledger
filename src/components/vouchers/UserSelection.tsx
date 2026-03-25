
"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import type { AppUser } from "@/types/admin";

type User = {
    id: string;
    email: string;
    name: string;
}

type UserSelectionProps = {
  users: User[];
  selectedUserIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  label: string;
};

export function UserSelection({
  users,
  selectedUserIds,
  onSelectionChange,
  label,
}: UserSelectionProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (userId: string) => {
    if (userId === "all") {
      const allSelected = selectedUserIds.length === users.length;
      onSelectionChange(allSelected ? [] : users.map(u => u.id));
    } else {
      const newSelection = selectedUserIds.includes(userId)
        ? selectedUserIds.filter((id) => id !== userId)
        : [...selectedUserIds, userId];
      onSelectionChange(newSelection);
    }
  };

  const displayValue = () => {
    if (selectedUserIds.length === 0) return `Select users for ${label}`;
    if (selectedUserIds.length === users.length) return "All users";
    if (selectedUserIds.length === 1) {
      const user = users.find(u => u.id === selectedUserIds[0]);
      return user?.name || user?.email || "1 user selected";
    }
    return `${selectedUserIds.length} users selected`;
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate">{displayValue()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-50">
          <Command>
            <CommandInput placeholder="Search users..." />
            <CommandList>
              <CommandEmpty>No users found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => handleSelect("all")}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedUserIds.length === users.length ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Select All
                </CommandItem>
                {users.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`${user.name} ${user.email}`}
                    onSelect={() => handleSelect(user.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedUserIds.includes(user.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
