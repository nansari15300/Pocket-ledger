'use client';

/**
 * Thin route — Party/Bank jaisa turant open.
 * Heavy gallery UI alag chunk (dynamic).
 */
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

function GalleryPageLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-muted-foreground">Loading gallery...</p>
      </div>
    </div>
  );
}

const GalleryPageContent = dynamic(
  () =>
    import('@/components/gallery/GalleryPageClient').then((m) => m.GalleryPageContent),
  {
    ssr: false,
    loading: () => <GalleryPageLoading />,
  }
);

export default function GalleryPage() {
  return (
    // Wrap useSearchParams consumer in Suspense to satisfy static prerender in production build.
    <Suspense fallback={<GalleryPageLoading />}>
      <GalleryPageContent />
    </Suspense>
  );
}
