'use client';

import { useEffect } from 'react';

/**
 * Ledger shell idle: heavy sidebar pages pehle se load —
 * Dashboard / Gallery / Reports click pe compile wait kam (Party/Bank jaisa).
 */
export function PrefetchDashboardChunk() {
  useEffect(() => {
    let cancelled = false;
    const preload = () => {
      if (cancelled) return;
      void import('@/components/dashboard/DashboardPageClient');
      void import('@/components/gallery/GalleryPageClient');
      void import('@/components/reports/ReportList');
      void import('@/components/reports/ReportDetails');
    };

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(preload, { timeout: 3000 });
    } else {
      timeoutHandle = setTimeout(preload, 1500);
    }

    return () => {
      cancelled = true;
      if (idleHandle != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null) clearTimeout(timeoutHandle);
    };
  }, []);
  return null;
}
