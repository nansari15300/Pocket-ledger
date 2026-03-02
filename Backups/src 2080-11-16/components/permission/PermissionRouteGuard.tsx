"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import usePermissions from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import type { Permission } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ArrowLeft } from "lucide-react";

type PermissionRouteGuardProps = {
  permission?: Permission;
  /** Show page if user has ANY of these permissions (overrides `permission` when set) */
  permissionAny?: Permission[];
  children: React.ReactNode;
  /** Custom access denied message */
  deniedMessage?: string;
};

export function PermissionRouteGuard({
  permission,
  permissionAny,
  children,
  deniedMessage = "You do not have permission to access this page.",
}: PermissionRouteGuardProps) {
  const { can, role } = usePermissions();
  const { customUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    setIsChecking(false);
  }, [authLoading]);

  // Owner always has access
  if (role === "owner") {
    return <>{children}</>;
  }

  // Still loading permissions
  if (isChecking || authLoading) {
    return <LoadingSpinner />;
  }

  // Check permissions
  let hasAccess = false;
  if (permissionAny && permissionAny.length > 0) {
    hasAccess = permissionAny.some((p) => can(p));
  } else if (permission) {
    hasAccess = can(permission);
  } else {
    // No permission specified, allow access
    hasAccess = true;
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>{deniedMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please contact your company owner or an administrator if you believe you should have access to this page.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
              </Button>
              <Button onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
