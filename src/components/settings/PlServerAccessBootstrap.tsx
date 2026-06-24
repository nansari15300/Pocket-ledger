"use client";

import { useEffect } from "react";
import { refreshPlServerAccessContext, shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";

/** Remote server client: load token → allowed company ids before company picker. */
export function PlServerAccessBootstrap() {
  useEffect(() => {
    if (!shouldFetchPlServerAccessContext()) return;
    void refreshPlServerAccessContext();
  }, []);
  return null;
}
