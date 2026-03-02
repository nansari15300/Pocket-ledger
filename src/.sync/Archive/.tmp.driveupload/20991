"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { useLivePlans, getPlanFromPlans } from "./useLivePlans";
import { registerDeviceAndCheckLimit, replaceMyOtherDevicesAndRegister, getOrCreateDeviceId, clearKickedFlag } from "@/lib/deviceLimitClient";

const runCheckRef = { current: (() => {}) as () => void };
const hadDeviceDocRef = { current: false };

export function useDeviceLimit() {
  const { companyId, company } = useCompany();
  const { user } = useAuth();
  const livePlans = useLivePlans();

  const [result, setResult] = useState<{
    allowed: boolean;
    count: number;
    limit: number;
    singleDeviceOnly?: boolean;
    replaceOffer?: boolean;
    noPermissionNewDevice?: boolean;
    wasKicked?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!companyId || !user?.uid || !company) {
      setResult(null);
      return;
    }

    const plan = getPlanFromPlans(livePlans, company.planId as any);
    const hasMultiDeviceSync = plan.entitlements.hasMultiDeviceSync === true;
    const planMaxDevices = Math.max(1, Number(plan.entitlements.maxDevices) || 1);
    const maxDevices = hasMultiDeviceSync ? planMaxDevices : 1;
    const isOwner = !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));
    const userCanUseMultiDevice = company?.userCanUseMultiDevice !== false;

    let cancelled = false;
    hadDeviceDocRef.current = false;
    const runCheck = () => {
      if (cancelled) return;
      registerDeviceAndCheckLimit(companyId, user!.uid, maxDevices, true, { userCanUseMultiDevice, isOwner })
        .then((r) => {
          if (!cancelled) setResult({ allowed: r.allowed, count: r.count, limit: r.limit, singleDeviceOnly: r.singleDeviceOnly, replaceOffer: r.replaceOffer, noPermissionNewDevice: r.noPermissionNewDevice, wasKicked: r.wasKicked });
        })
        .catch(() => {
          if (!cancelled) setResult({ allowed: true, count: 0, limit: maxDevices });
        });
    };

    runCheckRef.current = runCheck;
    runCheck();
    const interval = setInterval(runCheck, 45 * 1000);

    const deviceId = getOrCreateDeviceId();
    if (deviceId) {
      const deviceRef = doc(firestore, "companies", companyId, "devices", deviceId);
      const unsubDevice = onSnapshot(deviceRef, (snap) => {
        if (cancelled) return;
        const exists = snap.exists();
        if (hadDeviceDocRef.current && !exists) runCheckRef.current?.();
        hadDeviceDocRef.current = exists;
      });
      return () => {
        cancelled = true;
        clearInterval(interval);
        unsubDevice();
      };
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [companyId, user?.uid, company?.planId, company?.ownerId, company?.ownerEmail, company?.userCanUseMultiDevice, livePlans, company]);

  const refreshDeviceCheck = useCallback(() => {
    runCheckRef.current?.();
  }, []);

  const clearKickedAndRefresh = useCallback(async () => {
    if (!companyId) return;
    await clearKickedFlag(companyId);
    runCheckRef.current?.();
  }, [companyId]);

  const performReplaceAndRefresh = useCallback(async () => {
    if (!companyId || !user?.uid) return;
    await replaceMyOtherDevicesAndRegister(companyId, user.uid);
    runCheckRef.current?.();
  }, [companyId, user?.uid]);

  // No logout/listener: device exchange only. Old device stays logged in and will see "slot full" on next check.

  return useMemo(
    () => ({
      deviceLimitReached: result !== null && !result.allowed,
      singleDeviceOnly: result?.singleDeviceOnly === true,
      replaceOffer: result?.replaceOffer === true,
      noPermissionNewDevice: result?.noPermissionNewDevice === true,
      wasKicked: result?.wasKicked === true,
      deviceCount: result?.count ?? 0,
      maxDevices: result?.limit ?? 1,
      loading: companyId && user && company && result === null,
      refreshDeviceCheck,
      clearKickedAndRefresh,
      performReplaceAndRefresh,
    }),
    [result, companyId, user, company, refreshDeviceCheck, clearKickedAndRefresh, performReplaceAndRefresh]
  );
}
