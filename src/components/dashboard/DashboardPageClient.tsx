'use client';

import dynamic from 'next/dynamic';

function DashboardPageContentLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <p>Loading dashboard…</p>
      <p className="max-w-md text-xs text-muted-foreground/80">
        Large companies / dev mode may take 10–30 seconds — please don&apos;t close the tab.
      </p>
          </div>
  );
}

const DashboardPageContentImpl = dynamic(
  () =>
    import('@/components/dashboard/DashboardPageContentImpl').then(
      (m) => m.DashboardPageContentImpl
    ),
  { ssr: false, loading: () => <DashboardPageContentLoading /> }
);

/** Lazy chunk — asli UI {@link DashboardPageContentImpl} me (Chrome “Page Unresponsive” kam). */
export function DashboardPageContent() {
  return <DashboardPageContentImpl />;
}
