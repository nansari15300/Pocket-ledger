
"use client";

import { useState, useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { firestore as db } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { AppUser } from "@/app/(admin)/admin/users/page";
import type { Company } from "@/app/(admin)/admin/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Filter, XCircle, Users, Dot } from "lucide-react";
import { RoleSelector } from "./RoleSelector";
import type { Role } from "@/utils/rbac";
import { logActivity } from "@/hooks/useFirestore";
import { getPlan } from "@/config/plans";
import { formatGB } from "@/lib/storageUsageClient";
import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";


const getInitials = (name: string) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};


interface UserDetailsProps {
    user: AppUser;
    currentUser: AppUser;
    allUsers: AppUser[];
    onUpdate: (updatedUser: AppUser) => void;
    ownedCompanies: Company[];
    sharedCompanies: Company[];
    isOnline?: boolean;
}

export function UserDetails({ user, currentUser, allUsers, onUpdate, ownedCompanies, sharedCompanies, isOnline }: UserDetailsProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const { toast } = useToast();
    
    const [ownedFilters, setOwnedFilters] = useState<Record<string, string>>({});
    const [sharedFilters, setSharedFilters] = useState<Record<string, string>>({});
    const [activeOwnedFilter, setActiveOwnedFilter] = useState<string | null>(null);
    const [activeSharedFilter, setActiveSharedFilter] = useState<string | null>(null);
    
    const userMap = useMemo(() => {
        const map = new Map<string, string>();
        allUsers.forEach(u => map.set(u.id, u.displayName || u.email));
        return map;
    }, [allUsers]);

    const onChangeRole = async (uid: string, role: Role) => {
        if (currentUser?.role !== 'SuperAdmin') return;
        setIsUpdating(true);
        try {
            await updateDoc(doc(db, 'users', uid), { role });
            await logActivity({ byUserId: currentUser?.id, action: 'USER_ROLE_UPDATE', meta: { targetUserId: uid, oldRole: user.role, newRole: role }, companyId: currentUser?.companyId ?? null })
            onUpdate({ ...user, role });
            toast({ title: "Success", description: "User role updated." });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update role." });
        } finally {
            setIsUpdating(false);
        }
    }
    
    const renderHeaderWithFilter = (key: string, label: string, filterState: Record<string, string>, setFilterState: Function, setActiveFilterState: Function, isNumeric = false) => {
        const isFiltered = !!filterState[key];
        return (
          <TableHead className="p-0">
            <div className={cn("flex items-center gap-1 font-bold px-2 py-3 text-black", isFiltered && "text-red-600", isNumeric ? "justify-end" : "justify-start")}>
              <span>{label}</span>
              <Popover onOpenChange={(open) => !open && setActiveFilterState(null)}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setActiveFilterState(key)}>
                    <Filter className={cn('h-4 w-4', isFiltered && 'text-red-600')} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-1 w-48" onOpenAutoFocus={(e) => e.preventDefault()} onPointerDownOutside={(e) => { e.preventDefault(); setActiveFilterState(null); }}>
                  <Input
                    placeholder={`Filter ${label}...`}
                    value={filterState[key] || ''}
                    onChange={(e) => setFilterState((prev:any) => ({...prev, [key]: e.target.value}))}
                    onKeyDown={(e) => { if (e.key === 'Enter') setActiveFilterState(null) }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </TableHead>
        );
      };

    const CompanyTable = ({ title, companies, filters, setFilters, setActiveFilter, isOwnedTable = false } : any) => {
        const filteredCompanies = useMemo(() => {
            return companies.filter((c: Company) => {
                return Object.entries(filters).every(([key, value]) => {
                    if (!value) return true;
                    const lowerValue = String(value).toLowerCase();

                    let cellValue: string;
                    switch(key) {
                        case 'createdAt': cellValue = c.createdAt ? (typeof c.createdAt?.toDate === 'function' ? c.createdAt.toDate().toLocaleDateString() : new Date(c.createdAt?.seconds ? c.createdAt.seconds * 1000 : c.createdAt).toLocaleDateString()) : ''; break;
                        case 'name': cellValue = c.name; break;
                        case 'id': cellValue = c.id; break;
                        case 'owner': cellValue = c.ownerId; break;
                        case 'sharedWith': 
                            cellValue = (c.sharedWith || []).map((u: any) => userMap.get(u.id) || u.name || u.email).join(', ');
                            break;
                        default: return true;
                    }
                    return cellValue.toLowerCase().includes(lowerValue);
                });
            });
        }, [companies, filters, userMap]);

        return (
            <div className="space-y-2">
                <h4 className="font-semibold text-base">{title} ({filteredCompanies.length})</h4>
                <div className="border rounded-lg">
                    <ScrollArea className="h-64">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {renderHeaderWithFilter('createdAt', 'Created Date', filters, setFilters, setActiveFilter)}
                                {renderHeaderWithFilter('name', 'Company Name', filters, setFilters, setActiveFilter)}
                                {renderHeaderWithFilter('id', 'Company ID', filters, setFilters, setActiveFilter)}
                                <TableHead className="font-bold px-2 py-3 text-black">Plan</TableHead>
                                <TableHead className="font-bold px-2 py-3 text-black text-right">Attachments</TableHead>
                                <TableHead className="font-bold px-2 py-3 text-black text-right">Storage</TableHead>
                                {!isOwnedTable && renderHeaderWithFilter('owner', 'Owner', filters, setFilters, setActiveFilter)}
                                {isOwnedTable && renderHeaderWithFilter('sharedWith', 'Shared With', filters, setFilters, setActiveFilter)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCompanies.map((c: Company) => (
                                <TableRow key={c.id}>
                                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                        {c.createdAt
                                            ? (typeof (c.createdAt as any)?.toDate === 'function'
                                                ? (c.createdAt as any).toDate().toLocaleDateString()
                                                : new Date((c.createdAt as any)?.seconds ? (c.createdAt as any).seconds * 1000 : (c.createdAt as any)).toLocaleDateString())
                                            : '—'}
                                    </TableCell>
                                    <TableCell>{c.name}</TableCell>
                                    <TableCell className="font-mono text-xs">{c.id}</TableCell>
                                    <TableCell>
                                        {(() => {
                                            const plan = getPlan((c.planId as any) || undefined);
                                            return plan?.name ?? (c.planId ?? '—');
                                        })()}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                        {(() => {
                                            const plan = getPlan((c.planId as any) || undefined);
                                            const maxAttGB = (plan?.entitlements?.maxAttachmentsGB as number) ?? 0;
                                            const used = Number(c.attachmentsUsedBytes ?? 0) / 1e9;
                                            const free = Math.max(0, maxAttGB - used);
                                            return maxAttGB > 0 ? `${formatGB(c.attachmentsUsedBytes ?? 0)} / ${free.toFixed(2)} free` : '—';
                                        })()}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                        {(() => {
                                            const plan = getPlan((c.planId as any) || undefined);
                                            const maxStorGB = (plan?.entitlements?.maxStorageGB as number) ?? 0;
                                            const used = Number(c.storageUsedBytes ?? 0) / 1e9;
                                            const free = Math.max(0, maxStorGB - used);
                                            return maxStorGB > 0 ? `${formatGB(c.storageUsedBytes ?? 0)} / ${free.toFixed(2)} free` : '—';
                                        })()}
                                    </TableCell>
                                     {!isOwnedTable && (
                                        <TableCell>{userMap.get(c.ownerId) || c.ownerId}</TableCell>
                                    )}
                                    {isOwnedTable && (
                                        <TableCell>
                                            {(c.sharedWith || []).length > 0 ? (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="sm" className="h-8">
                                                            <Users className="mr-2 h-4 w-4"/>
                                                            {(c.sharedWith || []).length} User(s)
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                        <DropdownMenuLabel>Shared with</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        {(c.sharedWith || []).map((sw: any, i: number) => (
                                                            <DropdownMenuItem key={i}>
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold">{userMap.get(sw.id) || sw.name || sw.email}</span>
                                                                    <span className="text-xs text-muted-foreground">{sw.email}</span>
                                                                </div>
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            ): (
                                                <span className="text-xs text-muted-foreground">Not shared</span>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                   </ScrollArea>
                </div>
            </div>
        )
    }

    return (
        <Card className="h-full relative">
             {isUpdating && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            )}
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                     <Avatar className="h-16 w-16 text-xl">
                        <AvatarImage src={(user as any).photoURL} alt={user.displayName} />
                        <AvatarFallback>{getInitials(user.displayName || user.email)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle className="flex items-center gap-2">
                          {user.displayName || user.email}
                          <Badge variant={isOnline ? "default" : "secondary"} className={cn("text-xs", isOnline ? "bg-green-500 hover:bg-green-600" : "bg-gray-100 text-gray-600")}>
                            {isOnline ? "Online" : "Offline"}
                          </Badge>
                        </CardTitle>
                        <CardDescription>ID: {user.id}</CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <Label>Email</Label>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="space-y-2">
                    <Label>Role</Label>
                    <RoleSelector
                        value={user.role}
                        onChange={(value) => onChangeRole(user.id, value as Role)}
                        disabled={currentUser?.role !== 'SuperAdmin'}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Status</Label>
                     <div className="flex items-center gap-2">
                        <Switch checked={user.isActive !== false} disabled />
                        <span>{user.isActive !== false ? "Active" : "Inactive"}</span>
                     </div>
                </div>
                 <div className="space-y-4 md:col-span-3">
                    {ownedCompanies.length > 0 && (
                        <CompanyTable title="Owned by User" companies={ownedCompanies} filters={ownedFilters} setFilters={setOwnedFilters} setActiveFilter={setActiveOwnedFilter} isOwnedTable={true}/>
                    )}
                     {sharedCompanies.length > 0 && (
                        <CompanyTable title="Shared With User" companies={sharedCompanies} filters={sharedFilters} setFilters={setSharedFilters} setActiveFilter={setActiveSharedFilter} />
                    )}
                    {ownedCompanies.length === 0 && sharedCompanies.length === 0 && (
                         <div>
                            <h4 className="font-semibold text-base">Company Affiliations</h4>
                            <p className="text-sm text-muted-foreground mt-2">Not assigned to any company.</p>
                         </div>
                    )}
                </div>
          </CardContent>
        </Card>
    )
}

    