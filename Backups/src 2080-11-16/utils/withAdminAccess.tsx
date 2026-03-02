

"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import type { Role as AppUserRole } from "@/utils/rbac";
import { canAccess, type Role as AdminRole } from "@/utils/rbac";


export function withAdminAccess(
  Component: React.ComponentType<any>,
  allowedRoles: AdminRole[]
) {
  return function ProtectedPage(props: any) {
    const { customUser, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading) {
        if (!customUser || !canAccess(customUser.role as AdminRole, allowedRoles)) {
          router.push("/not-authorized");
        }
      }
    }, [customUser, loading, router, allowedRoles]);

    if (loading || !customUser || !canAccess(customUser.role as AdminRole, allowedRoles)) {
      return <LoadingSpinner />;
    }

    return <Component {...props} />;
  };
}
