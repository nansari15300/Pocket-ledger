'use client';

/**
 * Thin route entry — heavy dashboard UI alag chunk; import fail (dev HMR) par retry, hamesha "Loading…" mat atkao.
 */
import { Suspense, useCallback, useEffect, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';

function DashboardPageLoading({ slowHint }: { slowHint?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-4">
      <div className="text-center text-muted-foreground">Loading dashboard...</div>
      {slowHint ? (
        <p className="max-w-sm text-center text-xs text-muted-foreground/80">
          Agar 30s se zyada ruke: Ctrl+Shift+R (hard refresh) ya dev server restart.
        </p>
      ) : null}
    </div>
  );
}

function DashboardChunkLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4">
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Dashboard load nahi hua (aksar dev chunk / HMR). Hard refresh Ctrl+Shift+R try karo, phir Retry.
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry load dashboard
      </Button>
    </div>
  );
}

function DashboardPageContentLoader() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slowHint, setSlowHint] = useState(false);
  const [Content, setContent] = useState<ComponentType | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const runLoad = useCallback(() => {
    setPhase('loading');
    setSlowHint(false);
    setContent(null);
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlowHint(true);
    }, 12_000);

    import('@/components/dashboard/DashboardPageClient')
      .then((mod) => {
        if (cancelled) return;
        setContent(() => mod.DashboardPageContent);
        setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) setPhase('error');
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, []);

  useEffect(() => {
    return runLoad();
  }, [loadKey, runLoad]);

  if (phase === 'error') {
    return <DashboardChunkLoadError onRetry={() => setLoadKey((k) => k + 1)} />;
  }
  if (phase !== 'ready' || !Content) {
    return <DashboardPageLoading slowHint={slowHint} />;
  }
  return <Content />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageLoading />}>
      <DashboardPageContentLoader />
    </Suspense>
  );
}
