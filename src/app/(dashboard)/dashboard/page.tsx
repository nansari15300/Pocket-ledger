'use client';

/**
 * Thin route entry — baaki sidebar pages jaisa turant open.
 * Heavy dashboard UI alag chunk me (dynamic) taaki route compile/parse block na kare.
 */
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

function DashboardPageLoading() {
  return (
    // Loading shell: `min-h-screen`/`100vh` Windows taskbar overlap — dvh = visible viewport (Electron static app)
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading dashboard...</div>
    </div>
  );
}

const DashboardPageContent = dynamic(
  () =>
    import('@/components/dashboard/DashboardPageClient').then((m) => m.DashboardPageContent),
  {
    ssr: false,
    loading: () => <DashboardPageLoading />,
  }
);

export default function DashboardPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<DashboardPageLoading />}>
      <DashboardPageContent />
    </Suspense>
  );
}
