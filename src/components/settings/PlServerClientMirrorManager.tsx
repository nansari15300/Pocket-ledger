"use client";

import { useEffect, useRef } from "react";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { mirrorPlServerSharedCompaniesToLocalSqlite } from "@/lib/plServerClientCompanyMirror";

/** Gate token add par registry shell SQLite me — full ledger login/open par alag se pull. */
export function PlServerClientMirrorManager() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!shouldFetchPlServerAccessContext()) return;
    if (ranRef.current) return;
    ranRef.current = true;
    void mirrorPlServerSharedCompaniesToLocalSqlite({ pullFullLedger: false }).catch(() => undefined);
  }, []);

  return null;
}
