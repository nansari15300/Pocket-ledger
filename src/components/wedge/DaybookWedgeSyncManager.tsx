"use client";



import { useEffect, useRef } from "react";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

import { useDaybookWedgeSnapshot } from "@wedge/daybook/sync/useDaybookWedgeSnapshot";

import {

  invalidateDaybookWedgePushCache,

  pushDaybookWedgeSnapshot,

} from "@wedge/shared/sync/pushSnapshotToNative";



export function DaybookWedgeSyncManager() {

  const snapshot = useDaybookWedgeSnapshot();

  const prevCompanyIdRef = useRef<string | null>(null);



  useEffect(() => {

    if (!isCapacitorNativeApp()) return;

    const onCompanySwitched = () => invalidateDaybookWedgePushCache();

    window.addEventListener("pl-company-switched", onCompanySwitched);

    return () => window.removeEventListener("pl-company-switched", onCompanySwitched);

  }, []);



  useEffect(() => {

    if (!isCapacitorNativeApp() || !snapshot) return;

    const companyChanged = prevCompanyIdRef.current !== snapshot.companyId;

    prevCompanyIdRef.current = snapshot.companyId;

    void pushDaybookWedgeSnapshot(snapshot, { force: companyChanged });

  }, [snapshot]);



  return null;

}

