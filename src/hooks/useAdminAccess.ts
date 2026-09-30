"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./useAuth";
import { canAccess, type Role } from "@/utils/rbac";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";

export function useAdminAccess(allowed: Array<Role>) {
  const { user, customUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isAccessGranted, setIsAccessGranted] = useState<boolean | null>(null);

  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || customUser?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email, customUser?.email]);

  useEffect(() => {
    if (authLoading) return;

    const roleOk = Boolean(customUser?.isActive && canAccess(customUser.role, allowed));
    const emailOk = allowed.includes("SuperAdmin") && isSuperAdminByEmail;

    if (roleOk || emailOk) {
      setIsAccessGranted(true);
      return;
    }

    router.replace("/not-authorized");
  }, [authLoading, customUser, router, allowed, isSuperAdminByEmail]);

  if (authLoading || isAccessGranted === null) {
    return { user: null, loading: true };
  }

  return { user: customUser, loading: false };
}
