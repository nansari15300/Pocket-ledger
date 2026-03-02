
"use client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useCallback } from "react";

export function useResponsiveListLayout<T extends { id: string }>(
    pageKey: string
) {
  const isMobile = useIsMobile();
  const [selected, setSelectedState] = useState<T | null>(null);

  const setSelected = useCallback((item: T | null) => {
    if (typeof window !== 'undefined') {
      if (item) {
        localStorage.setItem(`selectedItemId_${pageKey}`, item.id);
      } else {
        localStorage.removeItem(`selectedItemId_${pageKey}`);
      }
    }
    setSelectedState(item);
  }, [pageKey]);

  return { isMobile, selected, setSelected };
}
