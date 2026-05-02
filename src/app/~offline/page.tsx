/**
 * Document navigation offline fallback (`sw.ts` fallbacks.entries).
 * User ko blank error ke bajaye short message — data tab bhi SQLite pe ho sakta hai jab app shell cache se khule.
 */
export default function OfflineFallbackPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg font-semibold text-foreground">No internet connection</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Open Pocket Ledger online once so this device can cache the app. After that, local companies and SQLite data can work offline.
      </p>
    </div>
  );
}
