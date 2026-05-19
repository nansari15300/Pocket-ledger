
"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { useCompany } from "@/hooks/useCompany";

type User = {
    id: string;
    email?: string | null;
    name?: string | null;
    photoURL?: string | null;
    role?: string;
};

type UseFor = {
    in: string[];
    out: string[];
}

type SpecialAccountAccessControlProps = {
  users: User[];
  useFor: UseFor;
  onUseForChange: (newUseFor: UseFor) => void;
};

const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
};

export function SpecialAccountAccessControl({
  users,
  useFor,
  onUseForChange,
}: SpecialAccountAccessControlProps) {
    
  const { company } = useCompany();

  const handleCheckChange = (userId: string, type: 'in' | 'out', checked: boolean) => {
    const currentList = useFor?.[type] || [];
    let newList: string[];

    if (checked) {
      if (!currentList.includes(userId)) {
          newList = [...currentList, userId];
      } else {
          newList = currentList;
      }
    } else {
      newList = currentList.filter(id => id !== userId);
    }
    
    onUseForChange({ ...useFor, [type]: newList });
  };
  
  // Parent green panel ke saath table border/bg — `globals.css` `.pl-master-special-account-table`
  return (
    <div className="pl-master-special-account-table overflow-hidden rounded-lg border">
      <ScrollArea className="h-64">
        <Table>
          <TableHeader className="sticky top-0 z-10 backdrop-blur">
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Payment In</TableHead>
              <TableHead className="text-center">Payment Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
                const isOwner = user.id === company?.ownerId;
                const paymentInId = `payment-in-${user.id}`;
                const paymentOutId = `payment-out-${user.id}`;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                         <Avatar className="h-8 w-8">
                            <AvatarImage src={user.photoURL || undefined} alt={user.name || user.email || ''} />
                            <AvatarFallback>{getInitials(user.name || user.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell className="text-center">
                       <Checkbox
                        id={paymentInId}
                        checked={isOwner || (useFor?.in || []).includes(user.id)}
                        onCheckedChange={(checked) => handleCheckChange(user.id, 'in', !!checked)}
                        disabled={isOwner}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        id={paymentOutId}
                        checked={isOwner || (useFor?.out || []).includes(user.id)}
                        onCheckedChange={(checked) => handleCheckChange(user.id, 'out', !!checked)}
                        disabled={isOwner}
                      />
                    </TableCell>
                  </TableRow>
                )
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
