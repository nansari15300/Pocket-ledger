"use client";

/**
 * Background attachment IndexedDB/cache prefetch — header me patli horizontal progress (0–100).
 * `null` = strip band — koi active prefetch nahi.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type Ctx = {
  headerAttachmentPercent: number | null;
  setHeaderAttachmentPercent: (v: number | null) => void;
};

const EmbeddedAttachmentPrefetchContext = createContext<Ctx | null>(null);

export function EmbeddedAttachmentPrefetchProvider({ children }: { children: React.ReactNode }) {
  const [headerAttachmentPercent, setHeaderAttachmentPercentState] = useState<number | null>(null);
  const setHeaderAttachmentPercent = useCallback((v: number | null) => {
    setHeaderAttachmentPercentState(v);
  }, []);
  const value = useMemo(
    () => ({ headerAttachmentPercent, setHeaderAttachmentPercent }),
    [headerAttachmentPercent, setHeaderAttachmentPercent],
  );
  return (
    <EmbeddedAttachmentPrefetchContext.Provider value={value}>{children}</EmbeddedAttachmentPrefetchContext.Provider>
  );
}

export function useEmbeddedAttachmentPrefetch(): Ctx {
  const c = useContext(EmbeddedAttachmentPrefetchContext);
  if (!c) {
    return { headerAttachmentPercent: null, setHeaderAttachmentPercent: () => {} };
  }
  return c;
}
