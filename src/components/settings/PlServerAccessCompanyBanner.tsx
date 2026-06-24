"use client";

import { useEffect, useState } from "react";
import {
  getPlServerAccessLabel,
  getPlServerAllowedCompanyIds,
  PL_SERVER_ACCESS_CONTEXT_EVENT,
} from "@/lib/plServerAccessContext";

export function PlServerAccessCompanyBanner() {
  const [allowedCount, setAllowedCount] = useState(0);
  const [label, setLabel] = useState<string | null>(null);

  const sync = () => {
    const ids = getPlServerAllowedCompanyIds();
    setAllowedCount(ids?.length ?? 0);
    setLabel(getPlServerAccessLabel());
  };

  useEffect(() => {
    sync();
    const onCtx = () => sync();
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onCtx);
    return () => window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onCtx);
  }, []);

  if (allowedCount <= 0) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-950">
      Server access: <strong>{allowedCount}</strong> {allowedCount === 1 ? "company" : "companies"} allowed
      {label ? (
        <>
          {" "}
          (<span className="font-medium">{label}</span>)
        </>
      ) : null}
      . Other companies on this server are hidden.
    </div>
  );
}
