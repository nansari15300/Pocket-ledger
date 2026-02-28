
"use client";

import { useState, useMemo } from "react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import PermissionsManager from "@/components/admin/PermissionsManager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PermissionGroups, type PermissionGroup } from "@/lib/permissions";
import { ScrollArea } from "@/components/ui/scroll-area";


function GlobalSettingsPage() {
  useAdminAccess(['SuperAdmin']);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeGroup, setActiveGroup] = useState<PermissionGroup>(PermissionGroups[0]);

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return PermissionGroups;
    return PermissionGroups.filter(group => 
        group.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8 h-full">
      <div className="flex flex-col gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Global Settings</CardTitle>
                <CardDescription>Manage system-wide configurations.</CardDescription>
            </CardHeader>
             <CardContent>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search permission groups..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardContent className="p-2">
                 <ScrollArea className="h-[calc(100vh-24rem)]">
                    {filteredGroups.map(group => (
                        <Button
                            key={group.title}
                            variant={activeGroup.title === group.title ? "secondary" : "ghost"}
                            className="w-full justify-start gap-3"
                            onClick={() => setActiveGroup(group)}
                        >
                            <Fingerprint className="h-5 w-5" />
                            <span>{group.title}</span>
                        </Button>
                    ))}
                 </ScrollArea>
            </CardContent>
        </Card>
      </div>
      <div>
        <Card className="h-full">
            <CardContent className="p-6">
                 {activeGroup ? (
                    <PermissionsManager selectedGroup={activeGroup} />
                 ) : (
                    <p>Select a group to manage permissions.</p>
                 )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default GlobalSettingsPage;


